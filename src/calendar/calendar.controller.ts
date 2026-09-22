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
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  UpdateRsvpDto,
} from './dto/calendar.dto';
import { CalendarService } from './calendar.service';
import type { WriteContext } from '../meetings/meetings.service';

@Controller('calendar/events')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

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
  list(@Query('divisionId') divisionId?: string) {
    return this.calendar.list(divisionId);
  }

  @Post()
  @Policy('collaboration:write')
  create(@Body() dto: CreateCalendarEventDto, @Req() req: Request) {
    return this.calendar.create(dto, this.actor(req), this.context(req));
  }

  @Get(':id')
  @Policy('collaboration:read')
  findOne(@Param('id') id: string) {
    return this.calendar.findOne(id);
  }

  @Patch(':id')
  @Policy('collaboration:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.calendar.update(
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
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.calendar.remove(id, this.context(req));
  }

  @Put(':id/attendees/:profileId/rsvp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('collaboration:write')
  setRsvp(
    @Param('id') id: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateRsvpDto,
    @Req() req: Request,
  ) {
    // Di dunia nyata, ini idealnya dicek: actor hanya boleh update rsvp dirinya sendiri,
    // atau admin bisa update rsvp siapa saja. Untuk Phase 5 ini disederhanakan.
    return this.calendar.setRsvp(id, profileId, dto, this.context(req));
  }
}
