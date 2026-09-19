import {
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

interface AccessLogEntry {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
}

/**
 * Satu baris log per request, dalam JSON terstruktur (§11).
 *
 * Sengaja JSON, bukan teks bebas: log runtime Vercel di Hobby hanya bertahan
 * **1 jam** (keputusan 41), jadi satu-satunya cara membuatnya berguna adalah
 * memastikan ia bisa disaring mesin saat masih ada.
 *
 * `requestId` selalu ikut, sehingga satu request bisa dilacak melintasi
 * frontend → BFF → backend selama jam pertama itu.
 *
 * Ini **log teknis**, bukan log audit. Keduanya sengaja dipisah (§11): log
 * audit ditulis ke tabel permanen, dan ia mencatat perubahan **dan pembacaan**
 * data sensitif (keputusan 39) — sesuatu yang tidak pantas dititipkan pada log
 * yang menguap dalam satu jam.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.write(request, response.statusCode, startedAt);
        },
        error: (error: unknown) => {
          // Filter yang menyusun response error, tapi interceptor yang tahu
          // kapan requestnya berakhir. Statusnya diambil dari exception karena
          // `response.statusCode` belum tentu sudah disetel di titik ini.
          const status =
            error instanceof HttpException
              ? error.getStatus()
              : response.statusCode;
          this.write(request, status, startedAt);
        },
      }),
    );
  }

  private write(request: Request, status: number, startedAt: number): void {
    const entry: AccessLogEntry = {
      requestId: request.requestId ?? '-',
      method: request.method,
      path: request.originalUrl,
      status,
      durationMs: Date.now() - startedAt,
      ...(request.user ? { userId: request.user.id } : {}),
    };

    const line = JSON.stringify(entry);

    if (status >= 500) {
      this.logger.error(line);
    } else if (status >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
