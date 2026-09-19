import { Module } from '@nestjs/common';

import { WorkflowModule } from '../workflow/workflow.module';
import { RequestSyncService } from './request-sync.service';

/**
 * Sinkronisasi dua arah permintaan ↔ pekerjaan (§5.2.3, keputusan 49).
 *
 * ## Kenapa modul tersendiri, bukan bagian dari salah satunya
 *
 * Karena `WorkItemsService` dan `RequestsService` **sama-sama** membutuhkannya:
 * yang satu menyampaikan perpindahan statusnya ke permintaan asalnya, yang lain
 * menyampaikannya ke pekerjaan terhubungnya. Menaruhnya di salah satu modul
 * berarti modul itu harus diimpor oleh yang lain — dan modul permintaan memang
 * sudah mengimpor modul pekerjaan untuk membuat pekerjaan terhubung saat
 * diajukan (§5.2.4). Hasilnya lingkaran.
 *
 * Lingkaran modul di repo ini dipecahkan dengan **memindahkan yang dipakai
 * bersama ke tempat ketiga**, bukan dengan `forwardRef()`. Yang ketiga ini
 * memang bukan milik siapa pun: ia tidak punya tabel, tidak punya endpoint, dan
 * tidak bisa dipanggil dari luar kedua modul itu.
 *
 * ## `WorkflowModule` diimpor, `DatabaseModule` tidak
 *
 * `DatabaseModule` sudah `@Global()`, jadi mengimpornya ulang hanya menambah
 * baris. `WorkflowModule` **tidak** global — dan itu benar: modul ini benar-benar
 * membacanya (untuk memeriksa apakah sebuah perpindahan ada di aturan alurnya),
 * sehingga ketergantungannya harus terlihat di berkas ini.
 */
@Module({
  imports: [WorkflowModule],
  providers: [RequestSyncService],
  exports: [RequestSyncService],
})
export class RequestSyncModule {}
