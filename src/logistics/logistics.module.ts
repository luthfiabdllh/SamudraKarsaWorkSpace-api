import { Module } from '@nestjs/common';

import { WorkflowModule } from '../workflow/workflow.module';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

/**
 * Peminjaman Logistik — modul Fase 4.
 *
 * Mengimpor `WorkflowModule` untuk state machine (8 status logistik).
 */
@Module({
  imports: [WorkflowModule],
  controllers: [LogisticsController],
  providers: [LogisticsService],
})
export class LogisticsModule {}
