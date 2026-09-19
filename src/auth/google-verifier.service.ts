import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import { LOGIN_FAILED_MESSAGE } from './auth.constants';
import { normalizeEmail } from './email';

/** Identitas Google yang **sudah diverifikasi**. */
export interface GoogleIdentity {
  /** Klaim `sub` — pengenal tetap, tidak berubah walau emailnya berubah. */
  readonly sub: string;
  /** Sudah dinormalisasi oleh `normalizeEmail`. */
  readonly email: string;
  readonly fullName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Memverifikasi **ID token** Google.
 *
 * ## Kenapa ID token, bukan klaim yang sudah diurai
 *
 * Versi awal `PRD-REVAMP.md` §7.8.3 menggambarkan BFF mengirim `email`,
 * `email_verified`, dan `sub` sebagai JSON biasa. Itu tidak bisa diverifikasi
 * apa pun: ketiganya adalah teks yang bisa ditulis siapa saja, sehingga
 * `POST /api/v1/auth/google` dengan
 * `{"email": "<email owner>", "emailVerified": true, "sub": "apa saja"}`
 * menghasilkan sesi owner — tanpa memerlukan satu kredensial pun.
 *
 * ID token adalah JWT yang **ditandatangani Google**. Ia membawa klaim yang
 * sama, tetapi kali ini klaimnya bisa diperiksa terhadap kunci publik Google.
 * Karena itu BFF tidak lagi mengurai apa pun: ia meneruskan `id_token` mentah
 * dari callback OAuth, dan backend yang memutuskan isinya benar.
 *
 * Pemeriksaan yang dijalankan `verifyIdToken` — kelimanya wajib, dan tidak ada
 * satu pun yang boleh dilewati:
 *
 * | # | Yang diperiksa | Kalau dilewati |
 * |---|---|---|
 * | 1 | Tanda tangan terhadap JWKS Google | Siapa pun bisa membuat token sendiri |
 * | 2 | `aud` = `GOOGLE_CLIENT_ID` kita | Token milik aplikasi Google lain diterima di sini |
 * | 3 | `iss` = `accounts.google.com` | Token dari penerbit lain diterima |
 * | 4 | `exp` belum lewat | Token lama yang bocor berlaku selamanya |
 * | 5 | `email_verified === true` | Email yang belum terverifikasi bisa dipakai mengklaim milik orang lain |
 *
 * Nomor 1–4 dikerjakan pustakanya; nomor 5 tetap milik kita, karena Google
 * mengizinkan `email_verified` bernilai `false` dan pustakanya tidak
 * memperlakukannya sebagai kegagalan.
 *
 * ## Kenapa `GOOGLE_CLIENT_SECRET` tidak ada di sini
 *
 * Rahasia klien dipakai untuk **menukar authorization code**, dan yang menukar
 * adalah BFF (keputusan 31). Sampai di sini tokennya sudah jadi; memverifikasinya
 * tidak menuntut rahasia apa pun — hanya kunci publik Google. Menyimpan rahasia
 * yang tidak dibutuhkan di server yang tidak memakainya adalah rahasia yang
 * bisa bocor tanpa satu pun hal yang didapat.
 */
@Injectable()
export class GoogleVerifierService {
  private readonly logger = new Logger(GoogleVerifierService.name);
  private readonly client = new OAuth2Client();
  private readonly audience: string;

  constructor(config: ConfigService) {
    this.audience = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Sebab aslinya masuk log — `Token used too late`, `Wrong recipient`,
      // `Invalid signature` — karena itulah yang membedakan token kedaluwarsa
      // dari percobaan pemalsuan, dan perbedaannya penting saat menyelidiki.
      //
      // Yang keluar ke pemanggil tetap satu pesan, sama persis dengan pesan
      // gagal login yang lain (`LOGIN_FAILED_MESSAGE`).
      this.logger.warn(
        `ID token Google ditolak: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw this.reject();
    }

    if (!payload?.sub || !payload.email) {
      this.logger.warn('ID token Google tidak memuat `sub` atau `email`');
      throw this.reject();
    }

    // `!== true` dan bukan `=== false`: klaim yang hilang sama berbahayanya
    // dengan klaim yang bernilai salah. Apa pun selain `true` berarti emailnya
    // belum terbukti milik pemegang token.
    if (payload.email_verified !== true) {
      this.logger.warn('ID token Google dengan email_verified bukan true');
      throw this.reject();
    }

    return {
      sub: payload.sub,
      email: normalizeEmail(payload.email),
      fullName: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
    };
  }

  private reject(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'login_failed',
      title: LOGIN_FAILED_MESSAGE,
    });
  }
}
