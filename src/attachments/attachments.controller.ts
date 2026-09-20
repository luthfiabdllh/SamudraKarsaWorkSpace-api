import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import { RequestPresignedUrlDto } from './dto/attachments.dto';
import { AttachmentsService } from './attachments.service';
import type { WriteContext } from '../meetings/meetings.service';

@Controller('v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

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
  list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.attachments.listByEntity(entityType, entityId);
  }

  @Post('upload-url')
  @Policy('collaboration:write')
  getUploadUrl(@Body() dto: RequestPresignedUrlDto, @Req() req: Request) {
    return this.attachments.getUploadUrl(
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Get(':id/download-url')
  @Policy('collaboration:read')
  getDownloadUrl(@Param('id') id: string, @Req() req: Request) {
    return this.attachments.getDownloadUrl(
      id,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('collaboration:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.attachments.remove(id, this.actor(req), this.context(req));
  }
}
