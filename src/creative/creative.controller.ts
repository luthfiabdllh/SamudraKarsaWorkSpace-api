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
  CreateCreativeDto,
  ListCreativeQueryDto,
  TransitionCreativeDto,
  UpdateCreativeDto,
} from './dto/creative.dto';
import { CreativeService, type WriteContext } from './creative.service';

@Controller('creative')
export class CreativeController {
  constructor(private readonly creative: CreativeService) {}

  @Get()
  @Policy('creative:read')
  list(@Query() query: ListCreativeQueryDto) {
    return this.creative.list(query);
  }

  @Get(':id')
  @Policy('creative:read')
  detail(@Param('id') id: string, @Req() req: Request) {
    return this.creative.detail(id, this.actor(req));
  }

  @Post()
  @Policy('creative:write')
  create(@Body() dto: CreateCreativeDto, @Req() req: Request) {
    return this.creative.create(dto, this.context(req));
  }

  @Patch(':id')
  @Policy('creative:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCreativeDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.creative.update(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('creative:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionCreativeDto,
    @Req() req: Request,
  ) {
    return this.creative.transition(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/revisions')
  @HttpCode(HttpStatus.OK)
  @Policy('creative:write')
  addRevision(@Param('id') id: string, @Req() req: Request) {
    return this.creative.addRevision(id, this.actor(req), this.context(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('creative:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.creative.remove(id, this.context(req));
  }

  private context(req: Request): WriteContext {
    return {
      actorId: this.actor(req).id,
      requestId: req.requestId ?? null,
      ipAddress: clientIp(req),
    };
  }

  private actor(req: Request): AuthenticatedUser {
    const actor = req.user;
    if (!actor) throw new Error('Aktor tidak ditemukan.');
    return actor;
  }
}
