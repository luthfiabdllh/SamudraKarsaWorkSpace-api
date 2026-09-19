import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Public } from '../common/decorators/public.decorator';
import { clientIp, readCookie } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { PENDING_PASSWORD_EXEMPT } from '../policy/matrix';
import { Policy } from '../policy/policy.decorator';
import { REFRESH_COOKIE_NAME } from './auth.constants';
import { AuthService, type AuthResult } from './auth.service';
import {
  ChangePasswordDto,
  GoogleLoginDto,
  PasswordLoginDto,
} from './dto/auth.dto';
import type { TokenContext } from './token.service';

/**
 * Bentuk jawaban `GET /auth/session`.
 *
 * `mustChangePasswordExempt` ikut dikirim supaya frontend tidak perlu menyalin
 * daftar policy yang sama. Dua salinan daftar adalah dua salinan yang suatu
 * saat menyimpang — dan yang menyimpang di sini berarti anggota terkunci di
 * luar sistem tanpa bisa mengganti passwordnya sendiri.
 */
export interface SessionResult {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly roles: readonly string[];
  readonly divisionCodes: readonly string[];
  readonly mustChangePassword: boolean;
  readonly mustChangePasswordExempt: readonly string[];
}

/**
 * Rute autentikasi.
 *
 * | Rute | Penjagaan | Alasan |
 * |---|---|---|
 * | `POST /auth/google` | `@Public()` | belum punya token — ini yang membuatnya |
 * | `POST /auth/login` | `@Public()` | sama |
 * | `POST /auth/refresh` | `@Public()` | yang dibawanya token penyegar, bukan access token |
 * | `GET /auth/session` | `auth:session` | butuh tahu siapa yang bertanya |
 * | `POST /auth/logout` | `auth:logout` | butuh tahu sesi siapa yang dicabut |
 * | `POST /auth/change-password` | `auth:change-password` | butuh tahu password siapa |
 *
 * Tiga yang publik termasuk enam rute `@Public()` yang direncanakan (§7.2).
 * Daftarnya pendek dengan sengaja: yang berbahaya bukan rute yang lupa dijaga —
 * `PolicyBootCheck` menangkapnya saat aplikasi menyala — melainkan `@Public()`
 * yang salah pasang, dan itu tidak menghasilkan error apa pun.
 *
 * ## Kenapa kelas DTO diimpor sebagai nilai, bukan sebagai tipe
 *
 * `GoogleLoginDto` dan kawan-kawan dipakai sebagai anotasi tipe **dan** harus
 * ada saat runtime. `ZodValidationPipe` menemukan skemanya lewat metadata yang
 * dipasang `@ZodDto` pada kelasnya, dan metadata itu dibaca dari
 * `design:paramtypes` — yang diisi `emitDecoratorMetadata` dengan referensi
 * kelasnya.
 *
 * Kalau impornya `import type`, TypeScript menghapusnya saat kompilasi,
 * `design:paramtypes` menjadi `Object`, pipe tidak menemukan skema, dan nilainya
 * **dilewatkan tanpa divalidasi**. Tidak ada error, tidak ada peringatan: hanya
 * rute yang diam-diam berhenti memeriksa masukannya.
 *
 * ## Kenapa keluar butuh token yang sah
 *
 * `POST /auth/logout` tidak publik meski secara teknis bisa saja. Yang dicabut
 * adalah keluarga token penyegar, dan pemegangnya sudah pasti bisa mencabutnya
 * sendiri — jadi menuntut access token tidak menambah keamanan apa pun.
 *
 * Yang ditambahkannya adalah kemampuan **membedakan sesi**: actor yang masuk
 * menentukan sesi siapa yang dicabut ketika token penyegarnya tidak ikut
 * terkirim. Tanpa itu, permintaan keluar tanpa token penyegar harus ditolak —
 * dan sesi yang token penyegarnya sudah hilang, justru sesi yang paling perlu
 * dicabut, menjadi tidak bisa ditutup.
 *
 * `auth:logout` juga ada di `PENDING_PASSWORD_EXEMPT`, dan pengecualian itu
 * hanya berarti kalau rutenya memang terjaga.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Publik
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Masuk dengan Google.
   *
   * Badan permintaannya berisi **ID token mentah** dari Google, bukan klaim
   * yang sudah diurai — lihat `GoogleLoginDto` dan `GoogleVerifierService`.
   */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Body() dto: GoogleLoginDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.loginWithGoogle(
      dto,
      contextOf(request),
      request.requestId ?? null,
    );
  }

  /** Masuk dengan password. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: PasswordLoginDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.loginWithPassword(
      dto,
      contextOf(request),
      request.requestId ?? null,
    );
  }

  /**
   * Memperbarui access token.
   *
   * Token penyegarnya dibaca dari **cookie**, bukan dari badan permintaan.
   * Cookie itu dipasang BFF sebagai `httpOnly`, sehingga ia tidak pernah
   * menyentuh JavaScript; menambahkan jalur lewat badan permintaan akan membuat
   * token paling sensitif di sistem ini punya dua rute — dan rute kedua itu
   * adalah rute yang isinya ikut tercatat di log permintaan.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request): Promise<AuthResult> {
    return this.auth.refresh(
      requireRefreshToken(request),
      contextOf(request),
      request.requestId ?? null,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Terjaga
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Siapa yang sedang masuk.
   *
   * Tetap boleh dipakai saat `mustChangePassword` menyala — ia ada di
   * `PENDING_PASSWORD_EXEMPT`. Tanpa pengecualian itu, frontend tidak akan
   * pernah tahu bahwa yang perlu ditampilkan adalah layar ganti password: ia
   * hanya menerima penolakan tanpa tahu sebabnya.
   */
  @Policy('auth:session')
  @Get('session')
  session(@CurrentActor() actor: AuthenticatedUser): SessionResult {
    return {
      id: actor.id,
      email: actor.email,
      // `?? null` karena medannya opsional di `AuthenticatedUser` — lihat
      // catatan di `express.d.ts`. Verifier yang mengisinya, jadi dalam praktik
      // nilainya selalu ada; yang opsional adalah **tipenya**, bukan datanya.
      fullName: actor.fullName ?? null,
      roles: actor.roles,
      divisionCodes: actor.divisionCodes,
      mustChangePassword: actor.mustChangePassword,
      mustChangePasswordExempt: PENDING_PASSWORD_EXEMPT,
    };
  }

  /**
   * Keluar.
   *
   * `204`, bukan `200`: tidak ada isi yang berguna untuk dikembalikan, dan
   * badan respons yang kosong adalah cara mengatakan itu.
   */
  @Policy('auth:logout')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentActor() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(
      readCookie(request, REFRESH_COOKIE_NAME),
      actor.id,
      request.requestId ?? null,
      clientIp(request),
    );
  }

  /**
   * Mengganti password sendiri.
   *
   * `204`, bukan `200`, dan itu bukan detail sepele: seluruh refresh token
   * profil dicabut — termasuk yang sedang dipakai memanggil rute ini. Klien
   * yang menerima `200` akan mengira sesinya masih hidup. `204` tanpa token
   * baru mengatakan yang sebenarnya: masuk lagi.
   */
  @Policy('auth:change-password')
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.changePassword(
      actor.id,
      dto,
      contextOf(request),
      request.requestId ?? null,
    );
  }
}

/** Konteks permintaan yang disimpan bersama token penyegar. */
function contextOf(request: Request): TokenContext {
  return {
    userAgent: request.headers['user-agent'] ?? null,
    ipAddress: clientIp(request),
  };
}

/**
 * Mengambil token penyegar dari cookie, atau menolak.
 *
 * `401`, bukan `422`: cookie yang tidak ada bukan isian yang salah, melainkan
 * bukti bahwa pemanggilnya tidak punya sesi. Frontend memperlakukan keduanya
 * berbeda — `422` disorot di form, `401` dialihkan ke halaman masuk — dan
 * menukar keduanya akan menghasilkan halaman masuk yang menampilkan kesalahan
 * validasi.
 */
function requireRefreshToken(request: Request): string {
  const token = readCookie(request, REFRESH_COOKIE_NAME);

  if (token === null) {
    throw new UnauthorizedException({
      code: 'not_authenticated',
      title: 'Tidak ada sesi yang bisa diperbarui. Silakan masuk kembali.',
    });
  }

  return token;
}
