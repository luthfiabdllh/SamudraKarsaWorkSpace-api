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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateMeetingDto,
  SetMeetingParticipantsDto,
  UpdateMeetingDto,
} from './dto/meetings.dto';
import { MeetingsService, type WriteContext } from './meetings.service';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

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
  list(@Query('periodId') periodId?: string) {
    return this.meetings.list(periodId);
  }

  @Post()
  @Policy('collaboration:write')
  create(@Body() dto: CreateMeetingDto, @Req() req: Request) {
    return this.meetings.create(dto, this.actor(req), this.context(req));
  }

  @Get(':id')
  @Policy('collaboration:read')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.meetings.findOne(id, this.actor(req), this.context(req));
  }

  @Patch(':id')
  @Policy('collaboration:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.meetings.update(
      id,
      dto,
      ifMatch,
      this.actor(req),
      this.context(req),
    );
  }

  @Put(':id/participants')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('collaboration:write')
  setParticipants(
    @Param('id') id: string,
    @Body() dto: SetMeetingParticipantsDto,
    @Req() req: Request,
  ) {
    return this.meetings.setParticipants(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('collaboration:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.meetings.remove(id, this.actor(req), this.context(req));
  }
}
