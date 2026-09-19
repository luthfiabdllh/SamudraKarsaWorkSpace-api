import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DRIZZLE, PG_POOL } from './database.constants';

/**
 * Satu-satunya koneksi database.
 *
 * **`max: 1` disengaja.** Bentuk serverless berarti banyak instans fungsi yang
 * hidup sebentar-sebentar; kalau setiap instans membuka kolam sendiri, jumlah
 * koneksinya meledak dan Postgres kehabisan slot. Satu koneksi per instans,
 * dan **pooler Supabase** yang menggabungkannya (§7.19.2).
 *
 * **Soal prepared statement:** pooler Supabase berjalan di mode transaksi, dan
 * mode itu tidak mempertahankan prepared statement antar-query. Driver
 * `node-postgres` memakai query berparameter biasa, bukan prepared statement
 * bernama — jadi aman. Yang **tidak** aman adalah memanggil `.prepare()` pada
 * query Drizzle di lingkungan ini.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool =>
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: 1,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 5_000,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): NodePgDatabase => drizzle(pool),
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Di serverless ini jarang terpakai — instansnya dimatikan paksa platform.
   * Tapi saat dijalankan lokal, tanpa ini `npm run start:dev` akan menggantung
   * di proses yang tidak pernah berhenti karena koneksinya masih terbuka.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    this.logger.log('Kolam koneksi database ditutup.');
  }
}
