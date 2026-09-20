import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import { NotificationsService } from './notifications.service';

@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  private actor(req: Request): AuthenticatedUser {
    const actor = req.user;
    if (!actor) throw new Error('Aktor tidak ditemukan.');
    return actor;
  }

  @Get()
  @Policy('notification:read')
  list(@Query('since') since: string | undefined, @Req() req: Request) {
    // Array kosong akan dikembalikan jika tidak ada data dari service (stateless polling)
    return this.notifications.list(this.actor(req), since);
  }
}
