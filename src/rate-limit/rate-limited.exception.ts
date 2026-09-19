import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * `429` yang membawa `Retry-After`.
 *
 * `PRD-REVAMP.md` §7.13 menuntut headernya, dan header tidak bisa dipasang dari
 * badan `HttpException` — `AllExceptionsFilter` hanya memetakan properti badan.
 * Karena itu kelas ini membawa angkanya, dan filter yang memasang headernya.
 * Itu tetap sejalan dengan aturan "hanya filter yang menyusun respons": yang
 * dilempar dari sini adalah datanya, bukan bentuk responsnya.
 */
export class RateLimitedException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    detail?: string,
  ) {
    super(
      {
        code: 'rate_limited',
        title: 'Terlalu banyak percobaan. Coba lagi nanti.',
        ...(detail === undefined ? {} : { detail }),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
