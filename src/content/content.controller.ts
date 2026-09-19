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
  CreateContentDto,
  ListContentQueryDto,
  TransitionContentDto,
  UpdateContentDto,
} from './dto/content.dto';
import { ContentService, type WriteContext } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Policy('content:read')
  list(@Query() query: ListContentQueryDto) {
    return this.content.list(query);
  }

  @Get(':id')
  @Policy('content:read')
  detail(@Param('id') id: string, @Req() req: Request) {
    return this.content.detail(id, this.actor(req));
  }

  @Post()
  @Policy('content:write')
  create(@Body() dto: CreateContentDto, @Req() req: Request) {
    return this.content.create(dto, this.context(req));
  }

  @Patch(':id')
  @Policy('content:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.content.update(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('content:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionContentDto,
    @Req() req: Request,
  ) {
    return this.content.transition(id, dto, this.actor(req), this.context(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('content:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.content.remove(id, this.context(req));
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
