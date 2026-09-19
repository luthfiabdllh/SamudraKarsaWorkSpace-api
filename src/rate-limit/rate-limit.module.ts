import { Global, Module } from '@nestjs/common';

import { RateLimitService } from './rate-limit.service';

/**
 * `@Global()` dengan alasan yang sama seperti `AuditModule`: pembatas laju
 * dipasang di banyak tempat, dan modul yang harus mengimpornya satu per satu
 * adalah modul yang akan melewatkannya.
 */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
