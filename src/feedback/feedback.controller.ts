import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';
import type { WriteContext } from '../meetings/meetings.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  private actor(req: Request): AuthenticatedUser {
    const actor = req.user;
    if (!actor) throw new Error('Aktor tidak ditemukan.');
    return actor;
  }

  private context(req: Request): WriteContext {
    return {
      actorId: this.actor(req).id,
      requestId: (req.headers['x-request-id'] as string) || null,
      ipAddress: clientIp(req),
    };
  }

  @Get()
  @Policy('evaluation:read')
  list(@Query('periodId') periodId: string | undefined, @Req() req: Request) {
    return this.feedback.list(periodId, this.actor(req));
  }

  @Post()
  @Policy('evaluation:write')
  create(@Body() dto: CreateFeedbackDto, @Req() req: Request) {
    return this.feedback.create(dto, this.actor(req), this.context(req));
  }
}
