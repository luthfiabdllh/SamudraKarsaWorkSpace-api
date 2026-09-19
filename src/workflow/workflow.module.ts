import { Module } from '@nestjs/common';

import { WorkflowService } from './workflow.service';

/**
 * State machine sebagai data.
 *
 * Tidak ada `imports`: `DatabaseModule` sudah `@Global()`, dan satu-satunya
 * ketergantungan modul ini adalah koneksi Drizzle. Menambahkan impor yang tidak
 * dibutuhkan hanya membuat graf modulnya terlihat lebih rumit daripada isinya.
 *
 * **Tidak `@Global()`.** Berbeda dari `DatabaseModule` dan `AuditModule` yang
 * dipakai hampir setiap modul, state machine hanya dibutuhkan modul yang punya
 * status berjalan — tiga atau empat dari dua puluh tiga. Modul global untuk
 * sesuatu yang dipakai segelintir modul menyembunyikan ketergantungan yang
 * nyata: berkas yang memakainya tidak lagi mengatakan bahwa ia memakainya.
 */
@Module({
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
