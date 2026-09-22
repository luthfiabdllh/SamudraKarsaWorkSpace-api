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
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestones.dto';
import { MilestonesService } from './milestones.service';
import type { WriteContext } from '../meetings/meetings.service';

@Controller('milestones')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

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
  @Policy('work-item:read')
  list(@Query('divisionId') divisionId?: string) {
    return this.milestones.list(divisionId);
  }

  @Post()
  @Policy('work-item:write')
  create(@Body() dto: CreateMilestoneDto, @Req() req: Request) {
    return this.milestones.create(dto, this.actor(req), this.context(req));
  }

  @Get(':id')
  @Policy('work-item:read')
  findOne(@Param('id') id: string) {
    return this.milestones.findOne(id);
  }

  @Patch(':id')
  @Policy('work-item:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMilestoneDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.milestones.update(
      id,
      dto,
      ifMatch,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('work-item:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.milestones.remove(id, this.actor(req), this.context(req));
  }
}
