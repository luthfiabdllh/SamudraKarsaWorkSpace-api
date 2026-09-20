import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';
import { RateLimitedException } from './rate-limited.exception';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Periksa apakah rute ini ditimpa batas khusus (seperti ekspor)
    const customLimit = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Ambil default limit jika tidak ada (Write: 100/menit, Read: 300/menit)
    // POST, PUT, PATCH, DELETE dianggap write
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const defaultLimit = isWrite ? 100 : 300;
    const defaultWindow = 60;

    const limit = customLimit?.limit ?? defaultLimit;
    const windowSeconds = customLimit?.window ?? defaultWindow;

    const actor = request.user;
    const identifier = actor ? `user:${actor.id}` : `ip:${clientIp(request)}`;
    const bucketKey = `global:${identifier}`;

    const result = await this.rateLimitService.consume(
      bucketKey,
      limit,
      windowSeconds,
    );

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      );
      throw new RateLimitedException(retryAfterSeconds);
    }

    return true;
  }
}
