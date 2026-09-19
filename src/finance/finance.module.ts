import { Module } from '@nestjs/common';

import { NumberingModule } from '../numbering/numbering.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

/**
 * Keuangan — anggaran (RAB), rincian, dan transaksi kas.
 *
 * Akses paling ketat: hanya `owner`/`co_owner` + kepala Sekbend.
 * 404 untuk semua yang lain, bukan 403.
 */
@Module({
  imports: [NumberingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
