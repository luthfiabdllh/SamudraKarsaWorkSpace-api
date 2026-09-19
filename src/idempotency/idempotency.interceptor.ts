import {
  ConflictException,
  HttpStatus,
  Injectable,
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import {
  catchError,
  concatMap,
  from,
  map,
  of,
  switchMap,
  throwError,
  type Observable,
} from 'rxjs';

import {
  IDEMPOTENCY_KEY_HEADER,
  SKIP_IDEMPOTENCY_KEY,
} from '../common/constants';
import {
  IDEMPOTENCY_ERRORS,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} from './idempotency.constants';
import { IdempotencyService } from './idempotency.service';

/**
 * Metode yang mengubah keadaan.
 *
 * `GET`, `HEAD`, dan `OPTIONS` tidak diikutkan, dan itu bukan penyederhanaan:
 * ketiganya sudah idempoten menurut definisinya, jadi menyimpan jawabannya
 * hanya menambah baris tanpa mengubah perilaku apa pun. Kunci yang tetap
 * dikirim pada ketiganya **diabaikan**, bukan ditolak — menolaknya akan
 * membuat klien yang mengirim kunci pada setiap permintaan gagal pada
 * pembacaan, dan itu bukan kesalahan yang pantas dihukum.
 */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Idempotensi tulis (`PRD-REVAMP.md` §7.10).
 *
 * ## Kenapa interceptor, bukan pemeriksaan di setiap service
 *
 * Karena yang perlu dicegah bukan "service ini dipanggil dua kali", melainkan
 * "permintaan HTTP ini dikirim dua kali" — dan yang tahu tentang permintaan
 * HTTP hanyalah lapisan HTTP. Kalau pemeriksaannya ditaruh di service, setiap
 * service baru harus mengingatnya, dan yang lupa tidak akan ketahuan: ia
 * berjalan benar sampai jaringan di lokasi KKN putus di tengah unggahan.
 *
 * Interceptor global membuatnya berlaku untuk **setiap** operasi tulis yang
 * membawa kunci, tanpa ada satu pun tempat yang perlu ingat menambahkannya.
 * Kontrak OpenAPI sudah menyatakan `Idempotency-Key` pada setiap operasi
 * semacam itu, jadi tidak ada daftar rute yang perlu dijaga tetap sinkron.
 *
 * ## Yang tidak dilakukannya
 *
 * Ia **tidak menuntut** kuncinya. Klien yang tidak mengirim `Idempotency-Key`
 * berjalan persis seperti sebelumnya, dan itu disengaja: §7.10 menuntutnya
 * untuk operasi tertentu, tetapi menolak setiap penulisan tanpa kunci akan
 * mematahkan seluruh klien yang sudah ada demi perlindungan yang hanya berguna
 * pada jaringan yang buruk.
 *
 * Ia juga **tidak** menyimpan percobaan yang gagal — lihat `IdempotencyService`.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!this.applies(context)) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = readKey(request);

    if (key === null) {
      return next.handle();
    }

    const decision = await this.idempotency.begin({
      key,
      profileId: request.user?.id ?? null,
      method: request.method,
      path: request.originalUrl,
      requestHash: fingerprint(request),
    });

    if (decision.kind === 'mismatch') {
      throw mismatch();
    }

    if (decision.kind === 'in-flight') {
      throw inFlight();
    }

    if (decision.kind === 'replay') {
      // Cukup mengembalikan isinya. Status dan `Content-Type`-nya **tidak**
      // dipasang dari sini: keduanya ditetapkan NestJS dari metadata rutenya
      // setelah interceptor selesai, dan status itu tidak mungkin berbeda —
      // yang disimpan hanyalah jawaban yang berhasil, dan status sebuah rute
      // yang berhasil adalah status yang dideklarasikan rute itu.
      //
      // Memasangnya sendiri di sini justru akan **kalah**: `reply()` di adapter
      // Express memanggil `response.status()` sesudah interceptor selesai, jadi
      // nilai yang ditulis di sini akan tertimpa tanpa error apa pun.
      return of(decision.body);
    }

    const status = this.declaredStatus(context, request);

    return next.handle().pipe(
      // `concatMap`, bukan `tap`: jawabannya baru dikirim setelah hasilnya benar
      // tersimpan. Dengan `tap`, penyimpanannya berjalan tanpa ditunggu, dan
      // permintaan ulang yang datang sangat cepat akan menemukan barisnya ada
      // tetapi jawabannya belum tertulis — persis keadaan yang `awaitResponse`
      // ada untuk menutupi. Menutupinya lebih murah daripada menunggunya.
      concatMap((body: unknown) =>
        from(this.idempotency.complete(key, status, body)).pipe(
          map(() => body),
        ),
      ),
      catchError((error: unknown) =>
        from(this.idempotency.release(key)).pipe(
          switchMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private applies(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING_METHODS.has(request.method)) {
      return false;
    }

    const skipped = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_IDEMPOTENCY_KEY,
      [context.getHandler(), context.getClass()],
    );

    return skipped !== true;
  }

  /**
   * Status yang **akan** diberikan rute ini kalau handler-nya berhasil.
   *
   * Dibaca dari metadata, bukan dari `response.statusCode` — pada saat
   * interceptor berjalan, responsnya belum disusun, dan `statusCode` masih
   * nilai bawaan Express (`200`). Untuk `POST` yang tidak menulis `@HttpCode`,
   * nilai itu **salah**: yang benar `201`.
   *
   * Logikanya sengaja disalin dari `getStatusByMethod` milik NestJS, dan itu
   * satu-satunya tempat di modul ini yang menyalin perilaku internal
   * kerangka kerjanya. Alternatifnya — membaca `response.statusCode` setelah
   * handler selesai — tidak bisa dipakai, karena pada titik itu jawabannya
   * sudah dikirim ke klien, dan menyimpan statusnya yang benar tidak lagi
   * menolong siapa pun.
   */
  private declaredStatus(context: ExecutionContext, request: Request): number {
    const explicit = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );

    if (explicit !== undefined) {
      return explicit;
    }

    return request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
  }
}

/**
 * Membaca kunci dari header.
 *
 * Mengembalikan `null` kalau headernya tidak ada — bukan kesalahan, karena
 * mengirim kunci memang tidak diwajibkan.
 *
 * Bentuk yang **ada** tetapi tidak bisa dipakai selalu ditolak, dengan alasan
 * yang sama seperti `parseIfMatch` (§7.16): header yang salah bentuk lalu
 * diabaikan berarti setiap penulisan berjalan **tanpa** perlindungan, sementara
 * pemanggilnya mengira sudah memakainya. Diam-diam mengabaikannya adalah
 * keadaan yang paling berbahaya — pengaman yang tampak terpasang.
 */
function readKey(request: Request): string | null {
  const raw: unknown = request.headers[IDEMPOTENCY_KEY_HEADER];

  if (raw === undefined) {
    return null;
  }

  // Dikirim dua kali berarti kliennya mengirim sesuatu yang tidak pernah kita
  // minta. Ditolak, bukan dipilihkan salah satunya: memilih berarti menebak
  // kunci mana yang dimaksud, dan menebak salah berarti mengembalikan jawaban
  // permintaan yang berbeda.
  if (typeof raw !== 'string') {
    throw unreadable('Header Idempotency-Key terkirim lebih dari sekali.');
  }

  const value = raw.trim();

  if (value === '') {
    return null;
  }

  if (value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw unreadable(
      `Header Idempotency-Key maksimal ${IDEMPOTENCY_KEY_MAX_LENGTH} karakter.`,
    );
  }

  return value;
}

/**
 * Sidik jari isi permintaan.
 *
 * Metode dan path ikut, bukan hanya body — supaya kunci yang sama yang dipakai
 * pada dua rute berbeda terbaca sebagai pemakaian ulang yang keliru, bukan
 * sebagai percobaan ulang. `DELETE` yang tidak berbadan pun tetap punya sidik
 * jari yang berbeda dari `POST` ke path yang sama.
 *
 * **Yang tidak ikut: `If-Match`.** Itu disengaja, dan bukan kelalaian.
 * Percobaan ulang yang lazim terjadi setelah klien memuat ulang halaman:
 * percobaan pertama berhasil, versinya naik, klien membaca versi baru, lalu
 * mengirim ulang dengan kunci yang sama dan `If-Match` yang **berbeda**. Kalau
 * header itu ikut dihitung, percobaan ulang itu akan dibaca sebagai
 * "kunci dipakai untuk hal lain" dan dijawab `409` — padahal justru inilah
 * percobaan ulang yang ingin dilindungi.
 *
 * Urutan kunci di dalam body ikut memengaruhi hasilnya, karena `JSON.stringify`
 * mempertahankannya. Dua permintaan dengan isi yang sama tetapi urutan tulis
 * yang berbeda karena itu terbaca sebagai berbeda. Akibatnya hanya `409`, bukan
 * data yang salah — dan klien yang mengirim ulang biasanya menulis ulang byte
 * yang sama.
 */
function fingerprint(request: Request): string {
  const body: unknown = (request as { body?: unknown }).body;

  return createHash('sha256')
    .update(request.method)
    .update('\n')
    .update(request.originalUrl)
    .update('\n')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
}

function mismatch(): ConflictException {
  return new ConflictException({
    code: IDEMPOTENCY_ERRORS.mismatch,
    title: 'Kunci idempotensi itu sudah dipakai untuk permintaan yang berbeda.',
    detail:
      'Isi permintaan ini berbeda dari permintaan pertama yang memakai kunci ' +
      'yang sama. Pakai kunci baru untuk operasi yang baru, atau kirim ulang ' +
      'isi yang persis sama kalau ini memang percobaan ulang.',
  });
}

function inFlight(): ConflictException {
  return new ConflictException({
    code: IDEMPOTENCY_ERRORS.inFlight,
    title: 'Permintaan dengan kunci itu sedang diproses.',
    detail:
      'Permintaan pertama dengan kunci ini belum selesai. Tunggu sebentar ' +
      'lalu kirim ulang dengan kunci yang sama — jawabannya akan dikembalikan ' +
      'tanpa menjalankan operasinya dua kali.',
  });
}

function unreadable(detail: string): BadRequestException {
  return new BadRequestException({
    code: IDEMPOTENCY_ERRORS.unreadable,
    title: 'Header Idempotency-Key tidak bisa dipakai.',
    detail,
  });
}
