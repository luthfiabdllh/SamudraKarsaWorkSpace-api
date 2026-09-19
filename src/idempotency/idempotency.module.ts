import { Global, Module } from '@nestjs/common';

import { IdempotencyService } from './idempotency.service';

/**
 * `@Global()` karena interceptor-nya dipasang sekali di `AppModule` tetapi
 * melayani setiap modul fitur — dan modul fitur yang harus mengimpornya satu
 * per satu adalah modul yang akan melewatkannya.
 *
 * Modulnya sendiri kecil: hanya service-nya. Interceptor-nya **tidak**
 * didaftarkan di sini, melainkan sebagai `APP_INTERCEPTOR` di `AppModule` —
 * bersama tiga `APP_*` lainnya, supaya seluruh hal yang berlaku untuk setiap
 * rute terbaca di satu tempat (`PRD-BACKEND.md` §7.1).
 */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
