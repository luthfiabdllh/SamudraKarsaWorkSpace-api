import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AUTH_VERIFIER } from './auth-verifier';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { GoogleVerifierService } from './google-verifier.service';
import { JwtAuthVerifier } from './jwt-auth-verifier';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Modul auth.
 *
 * ## Perubahan dari versi sebelumnya
 *
 * Provider `AUTH_VERIFIER` dulu diisi `RejectingAuthVerifier`, yang menolak
 * semua permintaan. Itu memang yang benar selama verifikasi token belum ada —
 * backend yang tampak berjalan padahal terbuka lebih berbahaya daripada backend
 * yang jelas-jelas menolak — tetapi ia juga berarti tidak ada satu pun rute
 * terjaga yang bisa dipakai.
 *
 * Sekarang yang mengisi token itu adalah `JwtAuthVerifier`. Berkas lama sengaja
 * **tidak dihapus**: ia masih dipakai test, dan ia tetap satu-satunya jawaban
 * yang benar kalau `JWT_SECRET` dicurigai bocor dan seluruh sesi perlu
 * ditutup sementara. Menggantinya kembali adalah satu baris di bawah ini.
 *
 * ## Kenapa `JwtModule` dikonfigurasi di sini, bukan di `TokenService`
 *
 * Rahasianya, `audience`, `issuer`, dan umur tokennya ditetapkan **sekali** di
 * sini. `TokenService` lalu memanggil `signAsync`/`verifyAsync` tanpa
 * menyebutkannya lagi. Kalau nilainya ditulis di kedua tempat, keduanya bisa
 * berbeda — dan `audience` yang berbeda antara penanda tangan dan pemeriksa
 * menghasilkan token yang ditolak oleh aplikasi yang membuatnya sendiri, tanpa
 * error yang menunjuk ke sebabnya.
 *
 * ## Kenapa `@nestjs/jwt` ditahan di v11, bukan dinaikkan ke v12
 *
 * **Jangan naikkan tanpa mengubah bentuk modul proyek ini lebih dulu.**
 *
 * `@nestjs/jwt@12` menghapus build CommonJS-nya: `package.json`-nya bertipe
 * `module` dan peta `exports`-nya hanya punya kondisi `import`, tanpa `require`.
 * Proyek ini CJS — `package.json` di root tidak bertipe `module`, dan
 * `tsconfig.json` memakai `module: nodenext` tanpa itu. Akibatnya `require`
 * terhadap paket itu gagal, dan yang paling dulu terlihat adalah `npm run
 * test:e2e`, yang mati sebelum satu test pun berjalan:
 *
 * ```
 * Must use import to load ES Module: .../@nestjs/jwt/dist/index.js
 * ```
 *
 * Yang **tidak** hilang dengan menahannya di v11: apa pun selain itu. Keduanya
 * bergantung pada `jsonwebtoken@9.0.3` yang sama persis, dan v11.0.2 dirilis
 * Desember 2025 — bukan versi yang terbengkalai. Satu-satunya isi v12.0.0
 * adalah konversi ke ESM.
 *
 * Pilihan yang sengaja **tidak** diambil: mengubah proyek menjadi ESM. Itu
 * menyentuh `emitDecoratorMetadata`, entri `api/index.js` untuk Vercel, dan
 * seluruh cara impor — demi satu paket yang API-nya tidak berubah.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          audience: ACCESS_TOKEN_AUDIENCE,
          issuer: ACCESS_TOKEN_ISSUER,
        },
        verifyOptions: {
          audience: ACCESS_TOKEN_AUDIENCE,
          issuer: ACCESS_TOKEN_ISSUER,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    GoogleVerifierService,
    TokenService,
    AuthService,
    {
      provide: AUTH_VERIFIER,
      useClass: JwtAuthVerifier,
    },
  ],
  /**
   * `PasswordService` dan `TokenService` ikut diekspor sejak modul `profiles`
   * ada, dan bukan karena kelengkapan.
   *
   * Keduanya dibutuhkan di luar auth untuk dua hal yang **memang** bukan urusan
   * auth: `profiles` membuatkan password sementara (keputusan 10), dan ia harus
   * mencabut seluruh sesi seseorang saat orang itu dinonaktifkan atau
   * passwordnya diganti orang lain.
   *
   * Yang **tidak** dilakukan: menyalin logikanya. Penyalinan berarti dua
   * parameter argon2 yang bisa menyimpang, dan dua cara mencabut sesi yang bisa
   * berbeda satu sama lain — pada dua hal yang justru harus persis sama.
   */
  exports: [AUTH_VERIFIER, AuthService, PasswordService, TokenService],
})
export class AuthModule {}
