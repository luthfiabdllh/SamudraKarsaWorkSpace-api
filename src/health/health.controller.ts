import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { Public } from '../common/decorators/public.decorator';
import { DRIZZLE } from '../database/database.constants';

/**
 * Dua rute kesehatan, dan perbedaannya penting.
 *
 * - `GET /health` — **liveness**. Menjawab "prosesnya hidup". Tidak menyentuh
 *   database sama sekali, dan itu disengaja: kalau ia ikut memeriksa database,
 *   database yang sedang bermasalah akan membuat platform mengira *aplikasinya*
 *   yang mati, lalu me-restart-nya berulang-ulang tanpa menolong siapa pun.
 * - `GET /health/ready` — **readiness**. Menjawab "siap melayani". Di sinilah
 *   database diperiksa, dan kegagalannya dijawab `503`.
 *
 * Keduanya `@Public()` dan termasuk enam rute yang direncanakan di §7.2.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  @Public()
  @Get()
  live(): { status: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string; database: string }> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ready', database: 'ok' };
    } catch (error) {
      // Pesan aslinya tidak diteruskan ke pemanggil — ia bisa memuat host,
      // pengguna, dan nama database. Log yang menyimpannya, bukan responsnya.
      this.logger.error('Pemeriksaan kesiapan gagal', error as Error);

      throw new ServiceUnavailableException({
        code: 'not_ready',
        title: 'Layanan belum siap',
        detail: 'Koneksi database tidak tersedia.',
      });
    }
  }
}
