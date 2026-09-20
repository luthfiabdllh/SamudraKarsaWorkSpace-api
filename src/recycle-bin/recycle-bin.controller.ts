import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import { HardDeleteDto } from './dto/recycle-bin.dto';
import { RecycleBinService } from './recycle-bin.service';

@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly recycleBinService: RecycleBinService) {}

  @Get(':table')
  @Policy('member:admin')
  list(@Param('table') table: string) {
    return this.recycleBinService.list(table);
  }

  @Post(':table/:id/restore')
  @Policy('member:admin')
  restore(
    @Param('table') table: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    const actor = request.user as AuthenticatedUser;
    const context = {
      actorId: actor.id,
      requestId: request.requestId ?? null,
      ipAddress: clientIp(request),
    };

    return this.recycleBinService.restore(table, id, context);
  }

  @Delete(':table/:id')
  @Policy('member:admin')
  permanentlyDelete(
    @Param('table') table: string,
    @Param('id') id: string,
    @Body() dto: HardDeleteDto,
    @Req() request: Request,
  ) {
    const actor = request.user as AuthenticatedUser;
    const context = {
      actorId: actor.id,
      requestId: request.requestId ?? null,
      ipAddress: clientIp(request),
    };

    return this.recycleBinService.permanentlyDelete(
      table,
      id,
      dto.password!,
      context,
    );
  }
}
