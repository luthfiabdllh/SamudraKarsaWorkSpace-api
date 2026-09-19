import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { readBearerToken } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import type { AuthVerifier } from './auth-verifier';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * Verifier sungguhan: access token JWT, lalu aktornya dimuat dari database.
 *
 * ## Kenapa aktornya dimuat ulang, bukan dibaca dari isi token
 *
 * Tokennya hanya berisi `sub` (lihat `TokenService`). Peran, status, dan
 * `mustChangePassword` dibaca dari baris `profiles` **pada setiap permintaan**,
 * sehingga ketiganya selalu keadaan sekarang:
 *
 * - anggota yang dinonaktifkan kehilangan akses pada permintaan berikutnya,
 *   bukan lima belas menit kemudian
 * - peran yang diturunkan berlaku seketika
 * - `mustChangePassword` yang menyala langsung menutup seluruh endpoint, yang
 *   memang seluruh maksud penanda itu (§7.8.6)
 *
 * Harganya satu `SELECT` berindeks pada primary key per permintaan.
 *
 * ## Yang tidak boleh dilakukannya
 *
 * `AuthVerifier` mensyaratkan **melempar**, tidak pernah mengembalikan `null`.
 * Verifier yang mengembalikan `null` akan diperlakukan pemanggilnya sebagai
 * aktor yang sah, dan itu berarti rute terbuka — karena itu `loadActor()`
 * mengembalikan `null` dan penerjemahannya menjadi `UnauthorizedException`
 * terjadi di sini, di satu tempat.
 */
@Injectable()
export class JwtAuthVerifier implements AuthVerifier {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async verify(request: Request): Promise<AuthenticatedUser> {
    const token = readBearerToken(request);

    if (token === null) {
      throw this.unauthorised();
    }

    // Melempar sendiri kalau tanda tangannya, `aud`, `iss`, atau `exp`-nya
    // tidak sah — tidak ada pemeriksaan yang perlu diulang di sini.
    const profileId = await this.tokens.readAccessToken(token);

    const actor = await this.auth.loadActor(profileId);

    if (actor === null) {
      // Dua sebab, satu jawaban: profilnya sudah tidak ada, atau statusnya
      // `inactive`. Membedakannya tidak menolong pemanggil mana pun yang sah,
      // dan yang pertama hampir selalu berarti barisnya dihapus.
      throw this.unauthorised();
    }

    return actor;
  }

  private unauthorised(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'not_authenticated',
      title: 'Permintaan ini memerlukan token yang sah',
      detail: 'Masuk kembali untuk mendapatkan token baru.',
    });
  }
}
