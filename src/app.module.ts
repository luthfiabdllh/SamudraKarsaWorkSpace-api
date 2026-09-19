import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { PolicyGuard } from './policy/policy.guard';
import { PolicyModule } from './policy/policy.module';

/**
 * Akar aplikasi.
 *
 * Empat provider `APP_*` di bawah ini adalah inti dari sifat "tidak bisa
 * dilewati" (`PRD-BACKEND.md` §7.1). Masing-masing berlaku **global secara
 * bawaan**, bukan ditambahkan per rute:
 *
 * - `APP_GUARD` — tidak ada rute yang terbuka kecuali ditandai `@Public()`
 * - `APP_PIPE` — tidak ada input yang masuk tanpa divalidasi
 * - `APP_FILTER` — tidak ada error yang keluar dengan bentuk selain RFC 7807
 * - `APP_INTERCEPTOR` — setiap request meninggalkan satu baris log
 *
 * Ketergantungan pada disiplin untuk hal-hal ini adalah persis yang dihapus
 * oleh revamp ini (R3).
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    PolicyModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  /**
   * Middleware didaftarkan lewat consumer, bukan `app.use()`, supaya ia ikut
   * terlihat di grafik modul Nest dan konsisten dengan sisa aplikasi.
   *
   * Path-nya `'*path'`, **bukan `'*'`**. Express 5 memakai path-to-regexp v8,
   * yang tidak lagi menerima tanda bintang telanjang: `'*'` menghasilkan
   * peringatan `LegacyRouteConverter` lalu dikonversi otomatis. Bentuk bernama
   * seperti ini yang benar, dan menghilangkan ketergantungan pada konversi
   * otomatis yang suatu saat akan dihapus.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
