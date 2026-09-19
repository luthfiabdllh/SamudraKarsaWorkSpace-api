import { Module } from '@nestjs/common';

import { NumberingModule } from '../numbering/numbering.module';
import { RequestSyncModule } from '../request-sync/request-sync.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkReleaseService } from './work-release.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

/**
 * Pekerjaan — modul inti Fase 3.
 *
 * ## Yang diimpor, dan kenapa hanya tiga
 *
 * - `WorkflowModule` — aturan transisi, untuk `availableTransitions` dan
 *   pemeriksaan perpindahan status.
 * - `NumberingModule` — `WI-YYYY-#####` tanpa celah (§8.2).
 * - `RequestSyncModule` — sinkronisasi dua arah dengan permintaan asalnya
 *   (§5.2.3). Modul ketiga, bukan `RequestsModule`, supaya arah impornya tetap
 *   satu arah: `RequestsModule` → `WorkItemsModule` → `RequestSyncModule`.
 *   Lihat catatan panjangnya di `request-sync.module.ts`.
 *
 * `AuditModule` dan `DatabaseModule` **tidak** diimpor meski keduanya dipakai:
 * keduanya `@Global()`, dan mengimpornya kembali akan menyiratkan bahwa ada
 * sesuatu yang perlu dirakit di sini — padahal tidak ada.
 *
 * `ProfilesModule` juga tidak diimpor, meski modul ini membaca tabel `profiles`
 * (untuk memeriksa PIC-nya aktif, dan untuk mengambil namanya di daftar).
 * Membacanya langsung lewat Drizzle adalah yang benar di sini: yang dibutuhkan
 * hanyalah barisnya, bukan aturan apa pun tentang profil — dan mengimpor
 * `ProfilesModule` untuk itu akan menjadikan `WorkItemsService` bergantung pada
 * seluruh modul profil, termasuk `PasswordService`-nya.
 *
 * ## Yang diekspor, dan kenapa keduanya
 *
 * | Yang diekspor | Dipakai oleh |
 * |---|---|
 * | `WorkItemsService` | `RequestsModule` — membuat pekerjaan terhubung saat permintaan diajukan (§5.2.4) |
 * | `WorkReleaseService` | `ProfilesModule` — melepas PIC saat akun dinonaktifkan (§5.2.8) |
 *
 * `WorkItemsService` **kini** diekspor, dan itu berubah dari sebelumnya. Saat
 * modul ini berdiri sendiri, mengekspornya berarti membuka seluruh operasi
 * pekerjaan bagi siapa pun yang mengimpor modul ini, dan tidak ada yang
 * membutuhkannya. Sekarang ada yang membutuhkannya: permintaan yang diajukan
 * harus melahirkan pekerjaan, dan pekerjaan itu harus lahir lewat jalur yang
 * sama dengan pekerjaan lain — nomor, riwayat status awal, dan pemeriksaan PIC —
 * bukan lewat `INSERT` kedua yang hanya kebetulan menulis tabel yang sama.
 *
 * Yang dipakai `RequestsModule` dari sini hanyalah `createWithin`. Ia menerima
 * `tx` milik pemanggilnya, sehingga tidak ada transaksi bersarang — dan pada
 * `max: 1` koneksi, transaksi bersarang berarti permintaan yang menggantung
 * selamanya. Lihat catatan di `WorkItemsService.createWithin`.
 */
@Module({
  imports: [WorkflowModule, NumberingModule, RequestSyncModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService, WorkReleaseService],
  exports: [WorkItemsService, WorkReleaseService],
})
export class WorkItemsModule {}
