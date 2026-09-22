import { Global, Module } from '@nestjs/common';

import { WorkflowService } from './workflow.service';

/**
 * State machine sebagai data.
 *
 * `@Global()` supaya semua modul yang memiliki transisi status
 * (work-items, requests, content, creative, logistics, partners, letters, request-sync)
 * dapat menginjeksi WorkflowService secara konsisten.
 */
@Global()
@Module({
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

