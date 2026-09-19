import { Module } from '@nestjs/common';

import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

/**
 * Modul data acuan organisasi — Fase 3 (`PRD-BACKEND.md` §12).
 *
 * Tidak ada `imports` di sini, dan itu bukan kelalaian: `DatabaseModule` dan
 * `AuditModule` sama-sama `@Global()`, sehingga `DRIZZLE` dan `AuditService`
 * sudah tersedia tanpa daftar impor. Modul yang mengimpornya satu per satu
 * adalah modul yang akan melewatkannya — alasan yang sama dengan `@Global()`
 * pada `AuditModule` itu sendiri.
 *
 * `PolicyGuard` tidak didaftarkan di sini. Ia `APP_GUARD` di `AppModule`, jadi
 * sudah berlaku untuk setiap rute di controller ini secara bawaan. Karena itu
 * pula tidak ada satu pun rute di sini yang perlu menyebut "dijaga" — yang
 * perlu disebut justru `@Policy`-nya, dan `PolicyBootCheck` menolak menyalakan
 * aplikasi kalau ada yang lupa.
 */
@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
