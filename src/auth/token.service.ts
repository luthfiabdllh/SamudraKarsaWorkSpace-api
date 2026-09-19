import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { refreshTokens } from '../database/schema/system';
import {
  REFRESH_REUSE_LEEWAY_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

/** Konteks permintaan yang ikut disimpan bersama token penyegar. */
export interface TokenContext {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

/** Token penyegar yang baru dibuat — token mentahnya hanya ada di sini. */
export interface IssuedRefreshToken {
  /** Yang dikirim ke klien. **Tidak pernah** disimpan di database. */
  readonly raw: string;
  readonly id: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

/** Kenapa sebuah penyegaran ditolak. Dipakai pemanggil untuk mencatat audit. */
export type RefreshFailure = 'unknown' | 'expired' | 'reuse';

/**
 * Hasil rotasi, sebagai **nilai kembalian** — bukan sebagai lemparan.
 *
 * Itu bukan gaya penulisan, melainkan syarat kebenaran. Pencabutan seluruh
 * keluarga terjadi di dalam transaksi yang sama dengan pemeriksaannya, dan
 * melempar di dalam transaksi akan **membatalkan** pencabutan itu saat rollback.
 * Akibatnya persis kebalikan dari yang diinginkan: pemakaian ulang terdeteksi,
 * dicatat, lalu tidak menghukum apa pun.
 *
 * Karena itu transaksi mengembalikan hasil, dan `rotateRefreshToken` melempar
 * setelah transaksinya commit.
 */
type RotateOutcome =
  | {
      readonly ok: true;
      readonly profileId: string;
      readonly token: IssuedRefreshToken;
    }
  | {
      readonly ok: false;
      readonly reason: RefreshFailure;
      readonly tokenId: string | null;
      readonly familyId: string | null;
    };

/**
 * Penolakan penyegaran yang membawa sebabnya untuk log, tanpa membocorkannya
 * ke respons.
 *
 * `reason` sengaja **bukan** bagian dari badan respons: membedakan "token tidak
 * dikenal" dari "token sudah dipakai" memberi tahu penyerang apakah salinannya
 * terdeteksi. Yang membacanya adalah `AuthService` untuk mencatat audit, dan
 * log.
 */
export class RefreshRejectedException extends UnauthorizedException {
  constructor(
    readonly reason: RefreshFailure,
    /** Baris token yang ditolak — dipakai `AuthService` untuk mencatat audit. */
    readonly tokenId: string | null = null,
    readonly familyId: string | null = null,
  ) {
    super({
      code: 'not_authenticated',
      title: 'Sesi tidak lagi berlaku. Silakan masuk kembali.',
    });
  }
}

/**
 * Menerbitkan dan memeriksa token.
 *
 * ## Access token hanya berisi `sub`
 *
 * `PRD-REVAMP.md` §7.8.7 menyebut isinya `sub`, `role`, `divisionId`,
 * `divisionRole`, `jti`. Yang dipakai di sini **hanya `sub`**, dan itu
 * penyimpangan yang disengaja dengan alasan yang menyangkut keamanan langsung.
 *
 * Klaim peran di dalam token adalah salinan keadaan pada saat token dibuat, dan
 * salinan itu berlaku sampai tokennya kedaluwarsa. Akibatnya:
 *
 * - Anggota yang **dinonaktifkan** tetap bisa memakai sistem sampai 15 menit,
 *   padahal §7.8.9 menuntut sesinya dicabut saat akun dinonaktifkan.
 * - Peran yang **diturunkan** tetap berlaku 15 menit — dan pencabutan wewenang
 *   yang butuh seperempat jam untuk berlaku bukan pencabutan wewenang.
 * - `mustChangePassword` yang **menyala** tidak terlihat sampai tokennya
 *   diganti, padahal seluruh maksud §7.8.6 adalah penanda itu segera berlaku.
 *
 * Karena itu verifier memuat aktornya dari database pada setiap permintaan
 * (`JwtAuthVerifier`). Harganya satu `SELECT` berindeks; yang dibeli adalah
 * keadaan yang selalu benar.
 *
 * `jti` juga tidak ada di sini. Ia berguna kalau ada daftar cabut access token,
 * dan tidak ada — yang ada adalah umur 15 menit, dan itu batas yang diterima
 * (lihat openapi `/auth/logout`).
 *
 * ## Refresh token: yang disimpan adalah hash-nya
 *
 * Kolom `refresh_tokens.token_hash` menyimpan **SHA-256 dari token mentah**,
 * dan token mentahnya tidak pernah ditulis ke database. §7.8.7 menyebut kolom
 * `jti`; yang dipakai di sini adalah hash, dan itu lebih kuat untuk tujuan yang
 * sama: isi tabel yang bocor tidak langsung memberi penyerang sesi siapa pun.
 *
 * SHA-256 **tanpa garam** sudah cukup di sini, dan itu berbeda dari password.
 * Tokennya dibangkitkan acak 256 bit, jadi tidak ada yang bisa ditebak; tanpa
 * garam pun pencariannya hanya bisa lewat tabel hash yang mustahil disiapkan.
 * Menambahkan garam justru akan membuat setiap baris harus dicoba satu per satu
 * saat pencarian — memperlambat jalur yang paling sering dilewati, demi
 * serangan yang tidak mungkin dilakukan.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Access token
  // ───────────────────────────────────────────────────────────────────────────

  async mintAccessToken(profileId: string): Promise<string> {
    // Rahasia, `audience`, `issuer`, dan umurnya dipasang sekali di
    // `AuthModule` (`JwtModule.registerAsync`) — bukan diulang di sini. Dua
    // tempat yang menyebutkan hal yang sama adalah dua tempat yang akan
    // berbeda, dan perbedaan pada `audience` menghasilkan token yang ditolak
    // sendiri oleh aplikasinya, tanpa error yang menunjuk ke sebabnya.
    return this.jwt.signAsync({ sub: profileId });
  }

  /**
   * Memeriksa access token dan mengembalikan `sub`-nya.
   *
   * `JwtService.verifyAsync` memeriksa tanda tangan, `aud`, `iss`, dan `exp`
   * terhadap konfigurasi modulnya. Tidak ada yang dilewati.
   */
  async readAccessToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);

      if (!payload.sub) {
        throw new Error('Access token tidak memuat sub');
      }

      return payload.sub;
    } catch (error) {
      this.logger.debug(
        `Access token ditolak: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException({
        code: 'not_authenticated',
        title: 'Permintaan ini memerlukan token yang sah',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Refresh token
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menerbitkan token penyegar pertama untuk sebuah sesi baru.
   *
   * `familyId` dibuat di sini dan **diwariskan** oleh setiap rotasi. Itu yang
   * membuat satu keluarga bisa dicabut seluruhnya saat ada pemakaian ulang.
   */
  async issueRefreshToken(
    profileId: string,
    context: TokenContext,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const raw = this.generateRawToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    const rows = await this.db
      .insert(refreshTokens)
      .values({
        profileId,
        tokenHash: this.hashToken(raw),
        familyId,
        expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      })
      .returning({ id: refreshTokens.id });

    const row = rows[0];

    if (!row) {
      // Tidak mungkin terjadi; `RETURNING` selalu mengembalikan baris yang baru
      // ditulis. Kalau toh terjadi, tidak ada token yang boleh diberikan —
      // klien yang memegang token tanpa baris di database adalah klien yang
      // tidak bisa dicabut.
      throw new Error('Token penyegar gagal disimpan');
    }

    return { raw, id: row.id, familyId, expiresAt };
  }

  /**
   * Memutar token penyegar: yang lama dicabut, yang baru diterbitkan.
   *
   * Seluruhnya di dalam **satu transaksi**. Kalau pencabutan yang lama berhasil
   * sementara penerbitan yang baru gagal, kliennya kehilangan sesinya tanpa
   * mendapat gantinya — dan itu terjadi pada setiap gangguan sesaat.
   *
   * Transaksinya mengembalikan hasil alih-alih melempar; alasannya ada di
   * `RotateOutcome`. Lemparannya terjadi setelah transaksi commit.
   */
  async rotateRefreshToken(
    raw: string,
    context: TokenContext,
  ): Promise<{ token: IssuedRefreshToken; profileId: string }> {
    const hash = this.hashToken(raw);

    const outcome = await this.db.transaction(
      async (tx): Promise<RotateOutcome> => {
        const rows = await tx
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, hash))
          .limit(1);

        const existing = rows[0];

        if (!existing) {
          return {
            ok: false,
            reason: 'unknown',
            tokenId: null,
            familyId: null,
          };
        }

        if (existing.revokedAt) {
          const ageMs = Date.now() - existing.revokedAt.getTime();

          if (ageMs > REFRESH_REUSE_LEEWAY_SECONDS * 1000) {
            // Dua pemegang token yang sama. Salah satunya menyalinnya dari yang
            // lain, dan tidak ada cara mengetahui yang mana — jadi seluruh
            // keluarganya dicabut. Ini satu-satunya tindakan yang tidak bisa
            // salah, dan harganya adalah pemilik sahnya harus masuk lagi.
            await tx
              .update(refreshTokens)
              .set({ revokedAt: sql`now()` })
              .where(
                and(
                  eq(refreshTokens.familyId, existing.familyId),
                  isNull(refreshTokens.revokedAt),
                ),
              );

            // Sengaja **tidak** melempar di sini: lemparan akan me-rollback
            // pencabutan yang baru saja ditulis di atas.
            return {
              ok: false,
              reason: 'reuse',
              tokenId: existing.id,
              familyId: existing.familyId,
            };
          }

          // Di dalam jeda tenggang: hampir pasti klien yang mencoba ulang karena
          // tidak menerima jawaban sebelumnya, bukan pencurian.
          return {
            ok: false,
            reason: 'expired',
            tokenId: existing.id,
            familyId: existing.familyId,
          };
        }

        if (existing.expiresAt.getTime() <= Date.now()) {
          return {
            ok: false,
            reason: 'expired',
            tokenId: existing.id,
            familyId: existing.familyId,
          };
        }

        const nextRaw = this.generateRawToken();
        const nextExpiresAt = new Date(
          Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
        );

        const created = await tx
          .insert(refreshTokens)
          .values({
            profileId: existing.profileId,
            tokenHash: this.hashToken(nextRaw),
            familyId: existing.familyId,
            expiresAt: nextExpiresAt,
            userAgent: context.userAgent,
            ipAddress: context.ipAddress,
          })
          .returning({ id: refreshTokens.id });

        const createdRow = created[0];

        if (!createdRow) {
          throw new Error('Token penyegar pengganti gagal disimpan');
        }

        // `replacedById` bukan sekadar jejak: ia yang membuat rantai rotasi bisa
        // dibaca urut saat menyelidiki sebuah insiden.
        await tx
          .update(refreshTokens)
          .set({ revokedAt: sql`now()`, replacedById: createdRow.id })
          .where(eq(refreshTokens.id, existing.id));

        return {
          ok: true,
          profileId: existing.profileId,
          token: {
            raw: nextRaw,
            id: createdRow.id,
            familyId: existing.familyId,
            expiresAt: nextExpiresAt,
          },
        };
      },
    );

    if (!outcome.ok) {
      if (outcome.reason === 'reuse') {
        this.logger.warn(
          `Pemakaian ulang token penyegar terdeteksi; keluarga ${outcome.familyId} dicabut`,
        );
      }

      throw new RefreshRejectedException(
        outcome.reason,
        outcome.tokenId,
        outcome.familyId,
      );
    }

    return { profileId: outcome.profileId, token: outcome.token };
  }

  /** Mencabut seluruh token penyegar milik satu profil. */
  async revokeAllForProfile(profileId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(refreshTokens.profileId, profileId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  /**
   * Mencabut satu keluarga token — dipakai saat keluar.
   *
   * Token yang tidak dikenal **tidak** menjadi error. Keluar dua kali, atau
   * keluar dengan token yang sudah dicabut, tetap berarti "sesi ini tidak
   * berlaku lagi" — dan itu sudah tercapai. Menjawab `401` di situ akan membuat
   * tombol keluar terlihat rusak justru pada keadaan yang paling wajar: sesi
   * yang sudah kedaluwarsa sendiri.
   */
  async revokeFamilyOf(rawToken: string): Promise<void> {
    const rows = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, this.hashToken(rawToken)))
      .limit(1);

    const row = rows[0];

    if (!row) {
      return;
    }

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(refreshTokens.familyId, row.familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  /**
   * Membuang token yang sudah kedaluwarsa dan yang dicabut lama.
   *
   * Belum dipanggil dari mana pun — tidak ada penjadwal di bentuk serverless —
   * tapi ditulis sekarang supaya tempatnya jelas: ini tugas terjadwal, bukan
   * sesuatu yang dijalankan pada setiap permintaan.
   *
   * Baris yang dicabut disimpan 30 hari lebih dulu. Menghapusnya langsung akan
   * membuang satu-satunya bukti bahwa pemakaian ulang pernah terdeteksi.
   */
  async deleteExpired(): Promise<number> {
    const rows = await this.db
      .delete(refreshTokens)
      .where(
        or(
          lt(refreshTokens.expiresAt, sql`now()`),
          lt(refreshTokens.revokedAt, sql`now() - interval '30 days'`),
        ),
      )
      .returning({ id: refreshTokens.id });

    return rows.length;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 32 bita acak dalam base64url — 43 karakter, semuanya aman di cookie dan di
   * header tanpa penyandian tambahan.
   *
   * `randomBytes` dari `node:crypto`, bukan `Math.random()`. Yang kedua dapat
   * diprediksi dari beberapa keluarannya, dan token yang dapat diprediksi
   * membatalkan seluruh mekanisme rotasi di atas.
   */
  private generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
