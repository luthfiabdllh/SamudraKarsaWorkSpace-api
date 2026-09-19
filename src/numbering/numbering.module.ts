import { Module } from '@nestjs/common';

import { NumberingService } from './numbering.service';

/**
 * Penomoran dokumen tanpa celah (§8.2).
 *
 * **Tidak `@Global()`.** Hanya modul yang membuat dokumen bernomor yang
 * membutuhkannya — pekerjaan, permintaan, surat, RAB, inventaris, program.
 * Modul lain yang mengimpornya akan terlihat aneh di graf, dan itulah gunanya:
 * ketergantungan yang tidak nyata sebaiknya terlihat sebagai ketergantungan
 * yang tidak nyata.
 */
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
