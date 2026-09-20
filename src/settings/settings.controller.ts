import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import { UpdateSettingDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Policy('settings:read') // Semua anggota aktif bisa membaca pengaturan global
  list() {
    return this.settingsService.list();
  }

  @Patch(':key')
  @Policy('settings:write') // Hanya owner/co-owner yang bisa mengubah pengaturan
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @Req() request: Request,
  ) {
    const actor = request.user as AuthenticatedUser;
    const context = {
      actorId: actor.id,
      requestId: request.requestId ?? null,
      ipAddress: clientIp(request),
    };

    return this.settingsService.update(key, dto.value, context);
  }
}
