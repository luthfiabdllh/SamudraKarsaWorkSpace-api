import { Module } from '@nestjs/common';

import { NumberingModule } from '../numbering/numbering.module';
import { RequestSyncModule } from '../request-sync/request-sync.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/**
 * Permintaan lintas divisi — modul inti Fase 3.
 *
 * ## Yang diimpor, dan kenapa keempatnya
 *
 * - `WorkflowModule` — aturan transisi permintaan, dibaca dari
 *   `status_transitions` seperti pada pekerjaan. Aturan alurnya tidak ditulis di
 *   sini meski ia yang paling tahu kapan pekerjaannya dibuat: alur yang hidup di
 *   dua tempat akan berbeda, dan yang berbeda akan menjadi yang tidak dipercaya
 *   keduanya.
 * - `NumberingModule` — `REQ-YYYY-#####` tanpa celah (§8.2).
 * - `WorkItemsModule` — `createWithin`, untuk melahirkan pekerjaan terhubung
 *   saat permintaan diajukan (§5.2.4).
 * - `RequestSyncModule` — sinkronisasi arah permintaan → pekerjaan, dan
 *   penyelesaian konflik (keputusan 49).
 *
 * `AuditModule` dan `DatabaseModule` tidak diimpor karena keduanya `@Global()`.
 *
 * ## Arah impornya, dan kenapa tidak melingkar
 *
 * ```
 * RequestsModule ──▶ WorkItemsModule ──▶ RequestSyncModule
 *        └──────────────────────────────────────▶┘
 * ```
 *
 * `WorkItemsModule` **tidak** mengimpor `RequestsModule` meski keduanya
 * bersinggungan: pekerjaan yang dipindahkan menyampaikan statusnya kepada
 * permintaan asalnya, dan itu dikerjakan `RequestSyncModule` — modul ketiga yang
 * memang milik keduanya. Kalau kode itu tinggal di sini, `WorkItemsModule` harus
 * mengimpor modul ini, dan lingkarannya nyata: modul ini mengimpor modul itu
 * untuk membuat pekerjaan, modul itu mengimpor modul ini untuk menyinkronkan
 * permintaan.
 *
 * Lingkaran modul dipecahkan dengan `forwardRef()`, dan itu **tidak** dipakai di
 * sini — alasannya sama dengan yang tertulis di `profiles.module.ts`:
 * `forwardRef()` menyembunyikan lingkaran yang nyata alih-alih menghapusnya.
 * Yang dipakai adalah memindahkan yang dipakai bersama ke tempat ketiga, dan
 * hasilnya grafnya bisa dibaca dalam satu baris di atas.
 */
@Module({
  imports: [
    WorkflowModule,
    NumberingModule,
    WorkItemsModule,
    RequestSyncModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
