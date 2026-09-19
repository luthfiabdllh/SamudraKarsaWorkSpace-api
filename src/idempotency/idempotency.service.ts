import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { idempotencyKeys } from '../database/schema/system';
import {
  IDEMPOTENCY_IN_FLIGHT_ATTEMPTS,
  IDEMPOTENCY_IN_FLIGHT_WAIT_MS,
  IDEMPOTENCY_TTL_HOURS,
} from './idempotency.constants';

/** Isi satu permintaan, sebagaimana dikenali tabelnya. */
export interface BeginInput {
  readonly key: string;
  /** `profiles.id`, atau `null` untuk rute yang tidak berautentikasi. */
  readonly profileId: string | null;
  readonly method: string;
  readonly path: string;
  /** SHA-256 dari isi permintaan. */
  readonly requestHash: string;
}

/**
 * Keputusan yang diambil sebelum handler berjalan.
 *
 * `proceed` adalah satu-satunya yang berarti "jalankan handler-nya". Tiga yang
 * lain berarti handler **tidak boleh berjalan**, dan masing-masing punya sebab
 * yang berbeda — itulah alasan hasilnya sebuah bentuk berjenis, bukan boolean
 * dengan pesan tambahan.
 */
export type BeginResult =
  | { readonly kind: 'proceed' }
  | {
      readonly kind: 'replay';
      readonly status: number;
      readonly body: unknown;
    }
  /** Kunci yang sama dipakai untuk isi yang berbeda. */
  | { readonly kind: 'mismatch' }
  /** Permintaan pertama belum selesai, dan menunggunya tidak membuahkan hasil. */
  | { readonly kind: 'in-flight' };

interface StoredRow {
  readonly key: string;
  readonly requestHash: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
  readonly expiresAt: Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Penyimpanan idempotensi (`PRD-REVAMP.md` §7.10).
 *
 * ## Yang disimpan, dan yang tidak
 *
 * Yang disimpan adalah **jawaban yang berhasil**, apa adanya. Percobaan ulang
 * menerimanya persis seperti permintaan pertama menerimanya — bukan disusun
 * ulang dari keadaan yang mungkin sudah berubah. Itu bedanya "hasil pertama"
 * dengan "hasil yang setara dengan hasil pertama", dan hanya yang pertama yang
 * benar-benar idempoten: kalau jawabannya disusun ulang, nomor dokumen yang
 * dikembalikan bisa berbeda dari yang sudah dibacakan klien ke orang lain.
 *
 * Percobaan yang **gagal** membebaskan kuncinya, bukan menyimpannya. Percobaan
 * ulang setelah gagal karena itu benar-benar mencoba lagi.
 *
 * Alasannya: kegagalan tidak bisa dibedakan menjadi sementara dan permanen dari
 * dalam sini. `500` karena database sesaat tidak terjangkau akan berhasil pada
 * percobaan berikutnya; kalau ia ikut disimpan, kunci itu mengunci kegagalan
 * itu selama dua puluh empat jam — dan yang dilihat pengguna adalah tombol yang
 * tidak pernah bisa berhasil meski masalahnya sudah lewat sepuluh menit lalu.
 * Sebaliknya `422` memang permanen untuk isi yang sama, tapi menyimpannya hanya
 * menghemat satu perjalanan pulang-pergi, bukan mencegah kerusakan. Yang
 * dikorbankan karena itu jauh lebih murah daripada yang didapat.
 *
 * ## Kenapa di database, bukan di memori
 *
 * Sama seperti `RateLimitService` (keputusan 43): di bentuk serverless, "di
 * memori" berarti "di salah satu dari sekian banyak instans yang mungkin
 * menangani permintaan berikutnya". Percobaan ulang akan mendarat di instans
 * lain, menemukan memori yang kosong, dan membuat dokumen kedua — persis yang
 * ingin dicegah.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Mengklaim kunci, atau menjelaskan mengapa handler tidak boleh berjalan.
   *
   * Tiga langkah, dan urutannya yang membuatnya benar di bawah permintaan
   * bersamaan:
   *
   * 1. Baca dulu. Kasus yang jauh paling sering adalah **permintaan ulang yang
   *    datang setelah yang pertama selesai** — dan itu terbaca selesai dalam
   *    satu query, tanpa menulis apa pun.
   * 2. Kalau barisnya belum ada, klaim dengan `INSERT ... ON CONFLICT DO
   *    NOTHING`. Kunci utama tabel yang memutuskan siapa menang, di database,
   *    tempat tidak ada balapan.
   * 3. Kalau barisnya ada tetapi sudah kedaluwarsa, ambil alih dengan `UPDATE`
   *    yang **dibatasi** `expires_at < now()`. Syarat itu yang membuat dua
   *    permintaan bersamaan tidak dua-duanya merasa berhasil mengambil alih.
   *
   * Setiap langkah yang kalah balapan berakhir di `interpret()`, yang membaca
   * ulang dan menjawab dari baris yang menang — bukan menebak.
   */
  async begin(input: BeginInput): Promise<BeginResult> {
    const existing = await this.read(input.key);

    if (existing !== null) {
      if (existing.expiresAt.getTime() > Date.now()) {
        return this.interpret(existing, input.requestHash);
      }

      const takenOver = await this.db
        .update(idempotencyKeys)
        .set(this.claimValues(input))
        .where(
          and(
            eq(idempotencyKeys.key, input.key),
            lt(idempotencyKeys.expiresAt, new Date()),
          ),
        )
        .returning({ key: idempotencyKeys.key });

      if (takenOver.length > 0) {
        return { kind: 'proceed' };
      }

      return this.interpret(await this.read(input.key), input.requestHash);
    }

    const claimed = await this.db
      .insert(idempotencyKeys)
      .values({ key: input.key, ...this.claimValues(input) })
      .onConflictDoNothing({ target: idempotencyKeys.key })
      .returning({ key: idempotencyKeys.key });

    if (claimed.length > 0) {
      return { kind: 'proceed' };
    }

    return this.interpret(await this.read(input.key), input.requestHash);
  }

  /**
   * Menyimpan jawabannya.
   *
   * Kegagalannya **ditelan**, dengan alasan yang sama seperti `AuditService`
   * dan `RateLimitService.reset`: operasinya sudah berhasil. Melempar dari sini
   * berarti menjawab gagal untuk permintaan yang dokumennya sudah terbuat —
   * dan pengguna akan mengulanginya, membuat dokumen kedua, tepat karena kita
   * memberi tahu bahwa yang pertama tidak jadi. Yang hilang kalau ini gagal
   * hanyalah perlindungan percobaan ulang berikutnya, dan itu kerugian yang
   * lebih kecil sekaligus tercatat di log.
   */
  async complete(key: string, status: number, body: unknown): Promise<void> {
    try {
      await this.db
        .update(idempotencyKeys)
        .set({ responseStatus: status, responseBody: body ?? null })
        .where(eq(idempotencyKeys.key, key));
    } catch (error) {
      this.logger.error(
        `Gagal menyimpan hasil idempotensi untuk kunci ${key}`,
        error as Error,
      );
    }
  }

  /**
   * Membebaskan kunci setelah handler gagal, supaya percobaan ulang benar-benar
   * mencoba lagi — lihat catatan "yang disimpan, dan yang tidak" di atas.
   *
   * `DELETE`, bukan mengosongkan `response_status`. Baris yang tertinggal dengan
   * `response_status` kosong akan terbaca sebagai "sedang dikerjakan" oleh
   * `awaitResponse`, dan percobaan ulang berikutnya akan menunggu enam ratus
   * milidetik untuk jawaban yang tidak akan pernah datang.
   */
  async release(key: string): Promise<void> {
    try {
      await this.db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    } catch (error) {
      this.logger.error(
        `Gagal membebaskan kunci idempotensi ${key}`,
        error as Error,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pembacaan
  // ───────────────────────────────────────────────────────────────────────────

  private async read(key: string): Promise<StoredRow | null> {
    const rows = await this.db
      .select({
        key: idempotencyKeys.key,
        requestHash: idempotencyKeys.requestHash,
        responseStatus: idempotencyKeys.responseStatus,
        responseBody: idempotencyKeys.responseBody,
        expiresAt: idempotencyKeys.expiresAt,
      })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Menjawab dari baris yang dipegang pihak lain.
   *
   * `row` bisa `null` di sini meski beberapa baris sebelumnya tidak: barisnya
   * hanya bisa lenyap kalau ada pembersih kedaluwarsa yang berjalan bersamaan.
   * Permintaan itu lalu berjalan **tanpa** perlindungan — dan itu diteruskan
   * apa adanya alih-alih digagalkan, karena menolak permintaan yang sah demi
   * kejadian yang belum pernah terjadi adalah pertukaran yang salah arah.
   * Kejadiannya dicatat supaya tidak hilang sama sekali.
   */
  private async interpret(
    row: StoredRow | null,
    requestHash: string,
  ): Promise<BeginResult> {
    if (row === null) {
      this.logger.warn(
        'Baris kunci idempotensi lenyap antara klaim dan pembacaan ulang; ' +
          'permintaan ini berjalan tanpa perlindungan percobaan ulang.',
      );
      return { kind: 'proceed' };
    }

    // Isi yang berbeda dengan kunci yang sama bukan percobaan ulang, melainkan
    // klien yang memakai ulang kuncinya untuk hal lain. Menjawab dengan hasil
    // lama berarti memberinya dokumen yang tidak pernah ia minta.
    if (row.requestHash !== requestHash) {
      return { kind: 'mismatch' };
    }

    const stored = await this.awaitResponse(row.key);

    return stored === null
      ? { kind: 'in-flight' }
      : { kind: 'replay', status: stored.status, body: stored.body };
  }

  /**
   * Menunggu jawaban yang belum tersimpan, dalam batas yang pendek.
   *
   * Yang ditunggu adalah tombol yang tertekan dua kali: permintaan kedua
   * menemukan barisnya sudah ada tetapi jawabannya belum ditulis, dan tanpa
   * penantian ini ia akan dijawab `409` — padahal permintaan pertama sedang
   * berhasil. Pengguna yang menekan dua kali lalu melihat pesan kesalahan untuk
   * operasi yang sesungguhnya berhasil, dan itu persis kebingungan yang §7.10
   * ingin hilangkan.
   *
   * Tungguannya sengaja tidak diperpanjang sampai tak terbatas. Di serverless,
   * menahan permintaan berarti menahan satu koneksi database — dan kolamnya
   * berisi **satu** koneksi (`DatabaseModule`). Penantian yang panjang bukan
   * memperlambat satu permintaan, melainkan seluruh instans.
   */
  private async awaitResponse(
    key: string,
  ): Promise<{ status: number; body: unknown } | null> {
    for (let attempt = 0; attempt < IDEMPOTENCY_IN_FLIGHT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(IDEMPOTENCY_IN_FLIGHT_WAIT_MS);
      }

      const row = await this.read(key);

      if (row === null) {
        return null;
      }

      if (row.responseStatus !== null) {
        return { status: row.responseStatus, body: row.responseBody };
      }
    }

    return null;
  }

  /**
   * Nilai yang ditulis saat sebuah kunci diklaim.
   *
   * `responseStatus` dan `responseBody` direset ke `null` — dan itu bukan
   * kehati-hatian berlebih: `responseStatus` yang terisi adalah **tanda bahwa
   * jawabannya sudah siap**, jadi mengambil alih baris yang kedaluwarsa tanpa
   * mengosongkannya akan membuat permintaan berikutnya menerima jawaban dari
   * dua puluh empat jam yang lalu tanpa pernah menjalankan handler-nya.
   */
  private claimValues(input: BeginInput) {
    return {
      profileId: input.profileId,
      method: input.method,
      path: input.path,
      requestHash: input.requestHash,
      responseStatus: null,
      responseBody: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
    };
  }
}
