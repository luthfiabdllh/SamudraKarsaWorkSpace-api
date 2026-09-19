import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { rateLimitCounters } from '../database/schema/system';

/** Hasil satu pemeriksaan. */
export interface RateLimitResult {
  readonly allowed: boolean;
  /** Sisa jatah di jendela ini, tidak pernah negatif. */
  readonly remaining: number;
  /** Saat jendela ini berakhir — dipakai untuk header `Retry-After`. */
  readonly resetAt: Date;
}

/**
 * Pembatas laju berbasis database — jendela tetap, satu baris per jendela.
 *
 * ## Kenapa di database, bukan di memori
 *
 * Di bentuk serverless, "di memori" berarti "di salah satu dari sekian banyak
 * instans yang mungkin menangani permintaan berikutnya". Penyerang yang
 * mengirim sepuluh percobaan login akan menyebarnya ke instans yang berbeda,
 * dan setiap instans akan menghitungnya sebagai yang pertama. Pembatas yang
 * hanya berlaku setempat bukan pembatas.
 *
 * `rate_limit_counters` sudah ada sejak migrasi 0002 dengan bentuk yang persis
 * dibutuhkan: kunci unik pada `(bucket_key, window_start)`.
 *
 * ## Kenapa jendela tetap
 *
 * Jendela bergulir lebih halus, tapi menuntut menyimpan setiap cap waktu
 * percobaan. Jendela tetap hanya menyimpan satu bilangan bulat per jendela, dan
 * kelemahannya — penyerang bisa mengirim 2× batas di perbatasan dua jendela —
 * tidak berarti apa-apa di sini, karena yang dibatasi bukan bandwidth melainkan
 * jumlah tebakan password, dan menebak password menuntut argon2 memverifikasi
 * setiap tebakan.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Menaikkan penghitung lalu memutuskan.
   *
   * **Menaikkan lebih dulu, memutuskan kemudian** — bukan sebaliknya. Urutan itu
   * yang membuat percobaan yang ditolak pun tetap tercatat: kalau pemeriksaan
   * dilakukan sebelum kenaikan, permintaan yang ditolak tidak akan menambah
   * apa pun, dan batasnya tidak pernah tercapai.
   */
  async consume(
    bucketKey: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStartMs = Math.floor(now / windowMs) * windowMs;

    const count = await this.increment(bucketKey, new Date(windowStartMs));

    const resetAt = new Date(windowStartMs + windowMs);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  /**
   * Mengosongkan penghitung di jendela yang sedang berjalan.
   *
   * Dipakai setelah percobaan yang **berhasil**. Penghitung ini ada untuk
   * menahan tebakan yang salah; begitu tebakannya benar, tidak ada lagi yang
   * perlu ditahan — dan membiarkan hitungannya naik berarti lima login berhasil
   * dari satu alamat IP mengunci seluruh jaringan di belakang alamat itu.
   *
   * Kegagalannya ditelan dengan alasan yang sama seperti `AuditService`:
   * penghitung yang tidak berhasil dikosongkan hanya membuat pengguna menunggu
   * lebih lama, sedangkan menggagalkan login yang passwordnya sudah terbukti
   * benar adalah kerugian yang nyata.
   */
  async reset(bucketKey: string, windowSeconds: number): Promise<void> {
    const windowMs = windowSeconds * 1000;
    const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;

    try {
      await this.db
        .update(rateLimitCounters)
        .set({ count: 0, updatedAt: sql`now()` })
        .where(
          and(
            eq(rateLimitCounters.bucketKey, bucketKey),
            eq(rateLimitCounters.windowStart, new Date(windowStartMs)),
          ),
        );
    } catch (error) {
      this.logger.error(
        `Gagal mengosongkan penghitung batas laju untuk ${bucketKey}`,
        error as Error,
      );
    }
  }

  private async increment(
    bucketKey: string,
    windowStart: Date,
  ): Promise<number> {
    // Satu pernyataan, bukan "baca lalu tulis".
    //
    // Membaca jumlahnya lalu menulisnya kembali akan kehilangan percobaan setiap
    // kali dua permintaan datang bersamaan — dan permintaan yang datang
    // bersamaan justru ciri khas percobaan brute force. `ON CONFLICT DO UPDATE`
    // membuat kenaikannya atomik di sisi database, tempat tidak ada balapan.
    const rows = await this.db
      .insert(rateLimitCounters)
      .values({ bucketKey, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitCounters.bucketKey, rateLimitCounters.windowStart],
        set: {
          count: sql`${rateLimitCounters.count} + 1`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ count: rateLimitCounters.count });

    const row = rows[0];

    // Tidak mungkin terjadi: `RETURNING` selalu mengembalikan baris yang baru
    // saja ditulis. Kalau toh terjadi, **menolak** adalah jawaban yang benar —
    // membiarkan permintaan lewat karena penghitungnya tidak terbaca akan
    // membuat pembatas ini bisa dimatikan dengan membuatnya gagal.
    if (!row) {
      this.logger.error(
        `Penghitung batas laju tidak mengembalikan baris untuk ${bucketKey}`,
      );
      return Number.MAX_SAFE_INTEGER;
    }

    return row.count;
  }
}
