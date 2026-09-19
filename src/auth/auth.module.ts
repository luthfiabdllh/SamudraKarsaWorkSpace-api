import { Global, Module } from '@nestjs/common';

import { AUTH_VERIFIER } from './auth-verifier';
import { RejectingAuthVerifier } from './rejecting-auth-verifier';

/**
 * Modul auth.
 *
 * Untuk sekarang ia hanya menyediakan satu hal: `AuthVerifier` yang menolak
 * semua. Itu cukup membuat `PolicyGuard` berfungsi dan tertutup.
 *
 * `@Global()` dipakai karena `PolicyGuard` terdaftar di akar aplikasi dan
 * membutuhkan token ini — tanpa global, setiap modul yang punya controller
 * harus mengimpor `AuthModule`, dan itu persis jenis kerepotan yang membuat
 * orang menonaktifkan guard-nya.
 *
 * FASE 2 LANJUTAN: provider `AUTH_VERIFIER` diganti implementasi JWT asli.
 * Tidak ada berkas lain yang perlu berubah.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH_VERIFIER,
      useClass: RejectingAuthVerifier,
    },
  ],
  exports: [AUTH_VERIFIER],
})
export class AuthModule {}
