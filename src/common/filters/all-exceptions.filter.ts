import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { RateLimitedException } from '../../rate-limit/rate-limited.exception';

/**
 * Bentuk RFC 7807 yang dipakai seluruh API (§7.5).
 *
 * Dikirim dengan `Content-Type: application/problem+json`.
 */
interface ProblemDetails {
  /** URI yang menunjuk ke penjelasan jenis masalah ini. */
  type: string;
  /** Ringkasan singkat dan stabil — boleh ditampilkan ke pengguna. */
  title: string;
  status: number;
  /** Penjelasan khusus kejadian ini. Tidak pernah memuat detail internal. */
  detail?: string;
  /** Path request yang gagal. */
  instance?: string;
  requestId?: string;
  /** Kode mesin yang stabil, untuk dipetakan frontend. */
  code?: string;
  /** Rincian per-field, hanya untuk kegagalan validasi. */
  errors?: unknown;
}

interface HttpExceptionBody {
  code?: unknown;
  title?: unknown;
  detail?: unknown;
  message?: unknown;
  errors?: unknown;
}

/**
 * Satu-satunya tempat error berubah menjadi response (§7.5).
 *
 * Terdaftar global lewat `APP_FILTER`, jadi tidak ada controller yang boleh
 * menyusun bentuk error sendiri. Kalau sebuah controller menangani errornya
 * sendiri, bentuk RFC 7807-nya akan menyimpang — dan frontend hanya bisa
 * mengandalkan bentuk yang seragam.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problem = this.toProblemDetails(exception, request);

    // `Retry-After` dipasang dari sini, bukan dari tempat exceptionnya dilempar
    // — lihat `RateLimitedException`. Header hanya bisa dipasang pada respons,
    // dan hanya filter ini yang memegang respons.
    if (exception instanceof RateLimitedException) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    // Hanya error 5xx yang dicatat. 4xx adalah kesalahan pemanggil dan akan
    // membanjiri log kalau ikut dicatat — sementara log hanya bertahan 1 jam
    // (keputusan 41), jadi isinya harus yang benar-benar berguna.
    // Dibandingkan sebagai angka, bukan sebagai anggota enum: `getStatus()`
    // mengembalikan `number`, dan membandingkan `number` dengan anggota enum
    // justru hal yang diperingatkan `no-unsafe-enum-comparison`. 500 sama
    // dengan `HttpStatus.INTERNAL_SERVER_ERROR`.
    if (problem.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${problem.status} [${problem.requestId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblemDetails(
    exception: unknown,
    request: Request,
  ): ProblemDetails {
    const base = {
      instance: request.originalUrl,
      requestId: request.requestId,
      type: this.typeUri('about:blank'),
    };

    if (exception instanceof ZodError) {
      // Seharusnya tidak sampai ke sini — ZodValidationPipe sudah mengubahnya
      // menjadi UnprocessableEntityException. Ini jaring pengaman kalau ada yang
      // lupa, dan bentuknya sengaja dibuat **sama persis** dengan yang dihasilkan
      // pipe: 422, `errors[].field`. Jaring pengaman yang bentuknya berbeda dari
      // jalur normalnya justru menambah satu bentuk lagi yang harus ditangani
      // frontend — kebalikan dari gunanya.
      return {
        ...base,
        type: this.typeUri('validation-failed'),
        title: 'Data yang dikirim tidak valid',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'validation_failed',
        errors: exception.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      return { ...base, ...this.fromHttpException(exception) };
    }

    // Apa pun yang tidak dikenali adalah bug kita, bukan kesalahan pemanggil.
    // Pesannya sengaja tidak diteruskan supaya detail internal tidak bocor.
    return {
      ...base,
      type: this.typeUri('internal_error'),
      title: 'Terjadi kesalahan di sisi server',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
    };
  }

  private fromHttpException(
    exception: HttpException,
  ): Omit<ProblemDetails, 'instance' | 'requestId' | 'type'> {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { status, title: body };
    }

    const raw = body as HttpExceptionBody;

    // BadRequestException yang dilempar ZodValidationPipe membawa `title` dan
    // `errors` miliknya sendiri — itu yang dipakai, bukan pesan bawaan NestJS.
    const title =
      typeof raw.title === 'string'
        ? raw.title
        : typeof raw.message === 'string'
          ? raw.message
          : exception.message;

    return {
      status,
      title,
      ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
      ...(typeof raw.code === 'string' ? { code: raw.code } : {}),
      ...(raw.errors !== undefined ? { errors: raw.errors } : {}),
    };
  }

  /**
   * Keputusan 38 — memakai domain Vercel gratis. Kalau proyeknya pindah, hanya
   * `API_PUBLIC_URL` yang berubah; tidak ada yang perlu ditulis ulang.
   */
  private typeUri(slug: string): string {
    const baseUrl =
      this.config.get<string>('API_PUBLIC_URL') ?? 'https://api.invalid';
    return `${baseUrl.replace(/\/+$/, '')}/problems/${slug}`;
  }
}
