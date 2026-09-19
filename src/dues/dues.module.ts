import { Module } from '@nestjs/common';

import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';

/** Iuran anggota — modul Fase 4. Akses sama ketatnya dengan `FinanceModule`. */
@Module({
  controllers: [DuesController],
  providers: [DuesService],
})
export class DuesModule {}
