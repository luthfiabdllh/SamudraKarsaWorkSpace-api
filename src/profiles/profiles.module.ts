import { Module } from '@nestjs/common';

import { WorkItemsModule } from '../work-items/work-items.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/**
 * Modul profil anggota — Fase 3 (`PRD-BACKEND.md` §12).
 *
 * ## Satu impor, dan kenapa arahnya begini
 *
 * `WorkItemsModule` diimpor untuk `WorkReleaseService`: menonaktifkan anggota
 * harus melepas pekerjaan **dan permintaan** yang dipimpinnya (§5.2.8), dan
 * keduanya bukan sesuatu yang boleh ditulis ulang di sini.
 *
 * Arahnya **satu arah**: `profiles` → `work-items`. `WorkItemsModule` tidak
 * mengimpor `ProfilesModule` dan tidak akan bisa, karena ia membaca tabel
 * `profiles` langsung lewat Drizzle saat memeriksa apakah seorang PIC masih
 * aktif. Kalau suatu saat modul itu butuh `ProfilesService` — bukan sekadar
 * tabelnya — ketergantungannya menjadi melingkar dan salah satu dari keduanya
 * harus dipecah. Yang benar saat itu adalah memindahkan aturan yang dibutuhkan
 * ke tempat ketiga, bukan menambahkan `forwardRef()`.
 *
 * `DatabaseModule`, `AuditModule`, dan `AuthModule` `@Global()`, sehingga
 * `PasswordService` dan `TokenService` sudah tersedia tanpa daftar impor.
 */
@Module({
  imports: [WorkItemsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
