import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './env.schema';

/**
 * Konfigurasi global.
 *
 * `isGlobal: true` membuat `ConfigService` bisa disuntikkan di mana saja tanpa
 * setiap modul mengimpor ulang. Itu penting karena `AllExceptionsFilter`
 * membutuhkannya, dan filter terdaftar di akar aplikasi.
 *
 * `validate` menjalankan `envSchema` saat boot — lihat `env.schema.ts`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
