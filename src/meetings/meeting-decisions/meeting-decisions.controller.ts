import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../../common/http/request-context';
import type { AuthenticatedUser } from '../../common/types/express';
import { Policy } from '../../policy/policy.decorator';
import {
  CreateMeetingDecisionDto,
  UpdateMeetingDecisionDto,
} from '../dto/meetings.dto';
import { MeetingDecisionsService } from './meeting-decisions.service';
import type { WriteContext } from '../meetings.service';

@Controller('v1/meetings/:meetingId/decisions')
export class MeetingDecisionsController {
  constructor(private readonly decisions: MeetingDecisionsService) {}

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
  @Policy('collaboration:read')
  list(@Param('meetingId') meetingId: string) {
    return this.decisions.list(meetingId);
  }

  @Post()
  @Policy('collaboration:write')
  create(
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateMeetingDecisionDto,
    @Req() req: Request,
  ) {
    return this.decisions.create(
      meetingId,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Patch(':id')
  @Policy('collaboration:write')
  update(
    @Param('meetingId') meetingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDecisionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.decisions.update(
      id,
      dto,
      ifMatch,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('collaboration:delete')
  remove(
    @Param('meetingId') meetingId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.decisions.remove(id, this.actor(req), this.context(req));
  }

  @Post(':id/follow-up')
  @Policy('collaboration:write')
  followUp(
    @Param('meetingId') meetingId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.decisions.followUp(id, this.actor(req), this.context(req));
  }
}
