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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto';
import { AnnouncementsService } from './announcements.service';
import type { WriteContext } from '../meetings/meetings.service';

@Controller('v1/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

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
    return this.announcements.list(divisionId);
  }

  @Post()
  @Policy('announcement:write')
  create(@Body() dto: CreateAnnouncementDto, @Req() req: Request) {
    return this.announcements.create(dto, this.actor(req), this.context(req));
  }

  @Get(':id')
  @Policy('collaboration:read')
  findOne(@Param('id') id: string) {
    return this.announcements.findOne(id);
  }

  @Patch(':id')
  @Policy('announcement:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.announcements.update(
      id,
      dto,
      ifMatch,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('announcement:write')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.announcements.remove(id, this.context(req));
  }
}
