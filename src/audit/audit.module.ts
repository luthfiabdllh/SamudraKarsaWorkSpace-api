import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * `@Global()` karena audit dipakai dari mana saja, dan modul yang harus
 * mengimpornya satu per satu adalah modul yang akan melewatkannya.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
