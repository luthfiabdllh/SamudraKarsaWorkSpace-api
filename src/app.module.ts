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
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { AppConfigModule } from './config/config.module';
import { AuditModule } from './audit/audit.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { OrganizationModule } from './organization/organization.module';
import { PolicyGuard } from './policy/policy.guard';
import { PolicyModule } from './policy/policy.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RecycleBinModule } from './recycle-bin/recycle-bin.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { RequestsModule } from './requests/requests.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { LettersModule } from './letters/letters.module';
import { FinanceModule } from './finance/finance.module';
import { DuesModule } from './dues/dues.module';
import { ContentModule } from './content/content.module';
import { CreativeModule } from './creative/creative.module';
import { PartnersModule } from './partners/partners.module';
import { InventoryModule } from './inventory/inventory.module';
import { LogisticsModule } from './logistics/logistics.module';
import { StorageModule } from './storage/storage.module';
import { SwaggerModule } from './swagger/swagger.module';
import { MeetingsModule } from './meetings/meetings.module';
import { CalendarModule } from './calendar/calendar.module';
import { MilestonesModule } from './milestones/milestones.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { FeedbackModule } from './feedback/feedback.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { WorkflowModule } from './workflow/workflow.module';
import { NumberingModule } from './numbering/numbering.module';

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
 *
 * `IdempotencyInterceptor` adalah `APP_INTERCEPTOR` yang **kedua**, dan
 * urutannya penting: interceptor berjalan berurutan sesuai urutan
 * pendaftarannya. Logging didaftarkan lebih dulu supaya ia membungkus yang
 * lain — satu baris log tetap tercatat untuk permintaan yang ditolak karena
 * kuncinya dipakai ulang, dan justru penolakan itu yang paling perlu terlihat.
 * Kalau urutannya dibalik, penolakan idempotensi terjadi **di luar** logging
 * dan permintaan itu tidak meninggalkan jejak apa pun.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuditModule,
    RateLimitModule,
    IdempotencyModule,
    AuthModule,
    PolicyModule,
    HealthModule,
    OrganizationModule,
    ProfilesModule,
    WorkItemsModule,
    RecycleBinModule,
    ReportsModule,
    SettingsModule,
    RequestsModule,
    LettersModule,
    FinanceModule,
    DuesModule,
    ContentModule,
    CreativeModule,
    PartnersModule,
    InventoryModule,
    LogisticsModule,
    StorageModule,
    SwaggerModule,
    MeetingsModule,
    CalendarModule,
    MilestonesModule,
    AnnouncementsModule,
    FeedbackModule,
    NotificationsModule,
    AttachmentsModule,
    WorkflowModule,
    NumberingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PolicyGuard,
    },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
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
