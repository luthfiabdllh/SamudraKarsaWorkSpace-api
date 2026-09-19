import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { PolicyBootCheck } from './policy.boot-check';

/**
 * Modul policy.
 *
 * `DiscoveryModule` diimpor karena `PolicyBootCheck` memerlukannya untuk
 * menelusuri seluruh controller di aplikasi — termasuk yang berada di modul
 * lain. Itu memang tujuannya: pemeriksaan ini harus melihat **semuanya**,
 * bukan hanya yang terdaftar di sini.
 *
 * `PolicyGuard` **tidak** didaftarkan sebagai provider di sini. Ia didaftarkan
 * di `AppModule` lewat `APP_GUARD` supaya berlaku global; kalau didaftarkan di
 * sini, ia hanya akan berlaku untuk modul ini.
 */
@Module({
  imports: [DiscoveryModule],
  providers: [PolicyBootCheck],
})
export class PolicyModule {}
