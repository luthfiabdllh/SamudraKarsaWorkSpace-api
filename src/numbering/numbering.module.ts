import { Global, Module } from '@nestjs/common';

import { NumberingService } from './numbering.service';

/**
 * Penomoran dokumen tanpa celah (§8.2).
 *
 * `@Global()` supaya seluruh modul yang memproduksi nomor dokumen berurutan
 * dapat menginjeksi NumberingService.
 */
@Global()
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}

