import { Module } from '@nestjs/common';

import { NumberingModule } from '../numbering/numbering.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LettersController } from './letters.controller';
import { LettersService } from './letters.service';

/**
 * Persuratan — modul Fase 4.
 *
 * Mengimpor `WorkflowModule` untuk state machine 9-status surat,
 * dan `NumberingModule` untuk penomoran `SRT-<JENIS>-YYYY-#####` tanpa celah.
 *
 * `AuditModule` dan `DatabaseModule` tidak diimpor karena keduanya `@Global()`.
 */
@Module({
  imports: [WorkflowModule, NumberingModule],
  controllers: [LettersController],
  providers: [LettersService],
})
export class LettersModule {}
