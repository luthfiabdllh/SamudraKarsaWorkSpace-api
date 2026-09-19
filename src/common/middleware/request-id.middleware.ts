import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../constants';

const MAX_LENGTH = 128;

/**
 * Memastikan setiap request punya `X-Request-Id`, lalu mengembalikannya di
 * response.
 *
 * Id dari klien diteruskan apa adanya kalau bentuknya masuk akal — itulah yang
 * membuat satu request bisa ditelusuri melintasi frontend, BFF, dan backend.
 * Kalau tidak ada atau mencurigakan, kita membuat sendiri.
 *
 * Batas panjangnya bukan kehati-hatian berlebihan: header ini ikut masuk ke
 * setiap baris log, dan tanpa batas ia bisa dipakai untuk membanjiri log.
 *
 * **Batas yang perlu diketahui:** log runtime Vercel di Hobby hanya bertahan
 * **1 jam** (keputusan 41). Request ID tetap benar, tapi kalau masalahnya baru
 * dilaporkan besok, ia tidak menolong.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    const requestId =
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      candidate.length <= MAX_LENGTH
        ? candidate
        : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
