import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Maksimal percobaan */
  limit: number;
  /** Jendela waktu dalam detik */
  window: number;
}

/**
 * Menimpa pengaturan batas laju bawaan untuk rute tertentu.
 *
 * Tanpa ini, rute pembacaan (GET) mendapat jatah 300/menit,
 * sedangkan penulisan mendapat jatah 100/menit.
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
