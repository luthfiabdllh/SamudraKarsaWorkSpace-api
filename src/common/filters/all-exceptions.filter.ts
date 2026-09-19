import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { RateLimitedException } from '../../rate-limit/rate-limited.exception';

/**
 * Bentuk RFC 7807 yang dipakai seluruh API (§7.5).
 *
 * Dikirim dengan `Content-Type: application/problem+json`.
 */
interface ProblemDetails {
  /** URI yang menunjuk ke penjelasan jenis masalah ini. */
  type: string;
  /** Ringkasan singkat dan stabil — boleh ditampilkan ke pengguna. */
  title: string;
  status: number;
  /** Penjelasan khusus kejadian ini. Tidak pernah memuat detail internal. */
  detail?: string;
  /** Path request yang gagal. */
  instance?: string;
  requestId?: string;
  /** Kode mesin yang stabil, untuk dipetakan frontend. */
  code?: string;
  /** Rincian per-field, hanya untuk kegagalan validasi. */
  errors?: unknown;
}

interface HttpExceptionBody {
  code?: unknown;
  title?: unknown;
  detail?: unknown;
  message?: unknown;
  errors?: unknown;
}

/**
 * `foreign_key_violation` menurut PostgreSQL.
 *
 * SQLSTATE-nya ditulis apa adanya, bukan sebagai konstanta dari paket `pg`.
 * Filter ini berada di lapisan HTTP dan sengaja tidak mengimpor apa pun dari
 * lapisan database: yang diperiksanya hanyalah **bentuk** sebuah error yang
 * datang dari bawah, bukan jenis kelasnya. Import itu akan mengikat keduanya,
 * dan ketergantungan yang tidak nyata lebih baik terlihat sebagai
 * ketergantungan yang tidak nyata.
 */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Apakah error ini pelanggaran foreign key.
 *
 * Diperiksa secara struktural — `code` bertipe `unknown` diambil dari objek
 * yang belum tentu error. `instanceof` tidak bisa dipakai di sini karena
 * `pg` melempar kelasnya sendiri lewat `pg-protocol`, dan filter ini tidak
 * mengenalnya.
 */
function isForeignKeyViolation(exception: unknown): boolean {
  return sqlState(exception) === FOREIGN_KEY_VIOLATION;
}

function sqlState(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }

  const code: unknown = (exception as { code?: unknown }).code;

  return typeof code === 'string' ? code : null;
}

/**
 * Nama constraint yang dilanggar — **hanya untuk log**.
 *
 * Lihat catatan di `toProblemDetails`: nama ini menyebut tabel dan kolom, jadi
 * ia tidak pernah ikut ke jawaban.
 */
function constraintName(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }

  const constraint: unknown = (exception as { constraint?: unknown })
    .constraint;

  return typeof constraint === 'string' ? constraint : null;
}

/**
 * Satu-satunya tempat error berubah menjadi response (§7.5).
 *
 * Terdaftar global lewat `APP_FILTER`, jadi tidak ada controller yang boleh
 * menyusun bentuk error sendiri. Kalau sebuah controller menangani errornya
 * sendiri, bentuk RFC 7807-nya akan menyimpang — dan frontend hanya bisa
 * mengandalkan bentuk yang seragam.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problem = this.toProblemDetails(exception, request);

    // `Retry-After` dipasang dari sini, bukan dari tempat exceptionnya dilempar
    // — lihat `RateLimitedException`. Header hanya bisa dipasang pada respons,
    // dan hanya filter ini yang memegang respons.
    if (exception instanceof RateLimitedException) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    // Hanya error 5xx yang dicatat. 4xx adalah kesalahan pemanggil dan akan
    // membanjiri log kalau ikut dicatat — sementara log hanya bertahan 1 jam
    // (keputusan 41), jadi isinya harus yang benar-benar berguna.
    // Dibandingkan sebagai angka, bukan sebagai anggota enum: `getStatus()`
    // mengembalikan `number`, dan membandingkan `number` dengan anggota enum
    // justru hal yang diperingatkan `no-unsafe-enum-comparison`. 500 sama
    // dengan `HttpStatus.INTERNAL_SERVER_ERROR`.
    if (problem.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${problem.status} [${problem.requestId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblemDetails(
    exception: unknown,
    request: Request,
  ): ProblemDetails {
    const base = {
      instance: request.originalUrl,
      requestId: request.requestId,
      type: this.typeUri('about:blank'),
    };

    if (exception instanceof ZodError) {
      // Seharusnya tidak sampai ke sini — ZodValidationPipe sudah mengubahnya
      // menjadi UnprocessableEntityException. Ini jaring pengaman kalau ada yang
      // lupa, dan bentuknya sengaja dibuat **sama persis** dengan yang dihasilkan
      // pipe: 422, `errors[].field`. Jaring pengaman yang bentuknya berbeda dari
      // jalur normalnya justru menambah satu bentuk lagi yang harus ditangani
      // frontend — kebalikan dari gunanya.
      return {
        ...base,
        type: this.typeUri('validation-failed'),
        title: 'Data yang dikirim tidak valid',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'validation_failed',
        errors: exception.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      };
    }

    if (isForeignKeyViolation(exception)) {
      /**
       * Rujukan ke baris yang tidak ada — `422`, bukan `500`.
       *
       * ## Kenapa ini ada di filter, bukan di setiap service
       *
       * Hampir setiap tabel di sistem ini punya kolom yang menunjuk tabel lain,
       * dan memeriksa keberadaan setiap rujukan sebelum menulis berarti satu
       * query tambahan per rujukan — enam pada satu pembuatan pekerjaan — untuk
       * menanyakan sesuatu yang **sudah** diperiksa database, dengan cara yang
       * lebih dapat dipercaya daripada pemeriksaan kita sendiri.
       *
       * Yang salah bukan pemeriksaannya, melainkan **jawabannya**: tanpa cabang
       * ini, `divisionId` yang salah ketik menghasilkan `500` — "terjadi
       * kesalahan di sisi server" untuk kesalahan yang sepenuhnya ada di sisi
       * pemanggil. `500` juga membuatnya tercatat sebagai bug kita di log,
       * sehingga kegagalan pemanggil membanjiri satu-satunya tempat bug kita
       * terlihat.
       *
       * ## Kenapa nama constraint-nya tidak dikirim ke klien
       *
       * `detail` sengaja tidak memuatnya meski `pg` menyediakannya
       * (`error.constraint`, misalnya `work_items_period_id_periods_id_fk`).
       * Nama itu menyebut skema tabel dan kolom kepada siapa pun yang bisa
       * mengirim satu id palsu — dan yang ia dapatkan hanyalah pengetahuan
       * tentang struktur internal. Nama itu tetap dicatat ke log, karena di
       * sanalah tempatnya berguna: yang membacanya adalah yang bisa memperbaiki
       * pesan validasinya.
       */
      this.logger.warn(
        `Rujukan tidak ditemukan pada ${request.method} ${request.originalUrl} ` +
          `[${request.requestId ?? '-'}]: ${constraintName(exception) ?? 'tanpa nama constraint'}`,
      );

      return {
        ...base,
        type: this.typeUri('reference-not-found'),
        title: 'Ada rujukan yang tidak ditemukan',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'reference_not_found',
        detail:
          'Salah satu id yang dikirim menunjuk data yang tidak ada. ' +
          'Periksa kembali id divisi, periode, program, atau anggota yang dipakai.',
      };
    }

    if (exception instanceof HttpException) {
      return { ...base, ...this.fromHttpException(exception) };
    }

    // Apa pun yang tidak dikenali adalah bug kita, bukan kesalahan pemanggil.
    // Pesannya sengaja tidak diteruskan supaya detail internal tidak bocor.
    return {
      ...base,
      type: this.typeUri('internal_error'),
      title: 'Terjadi kesalahan di sisi server',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
    };
  }

  private fromHttpException(
    exception: HttpException,
  ): Omit<ProblemDetails, 'instance' | 'requestId' | 'type'> {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { status, title: body };
    }

    const raw = body as HttpExceptionBody;

    // BadRequestException yang dilempar ZodValidationPipe membawa `title` dan
    // `errors` miliknya sendiri — itu yang dipakai, bukan pesan bawaan NestJS.
    const title =
      typeof raw.title === 'string'
        ? raw.title
        : typeof raw.message === 'string'
          ? raw.message
          : exception.message;

    return {
      status,
      title,
      ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
      ...(typeof raw.code === 'string' ? { code: raw.code } : {}),
      ...(raw.errors !== undefined ? { errors: raw.errors } : {}),
    };
  }

  /**
   * Keputusan 38 — memakai domain Vercel gratis. Kalau proyeknya pindah, hanya
   * `API_PUBLIC_URL` yang berubah; tidak ada yang perlu ditulis ulang.
   */
  private typeUri(slug: string): string {
    const baseUrl =
      this.config.get<string>('API_PUBLIC_URL') ?? 'https://api.invalid';
    return `${baseUrl.replace(/\/+$/, '')}/problems/${slug}`;
  }
}
