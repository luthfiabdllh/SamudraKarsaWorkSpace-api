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
  AddMovementDto,
  CreateInventoryItemDto,
  ListInventoryQueryDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';
import { InventoryService, type WriteContext } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Policy('inventory:read')
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get(':id')
  @Policy('inventory:read')
  detail(@Param('id') id: string) {
    return this.inventory.detail(id);
  }

  @Post()
  @Policy('inventory:write')
  create(@Body() dto: CreateInventoryItemDto, @Req() req: Request) {
    return this.inventory.create(dto, this.context(req));
  }

  @Patch(':id')
  @Policy('inventory:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    return this.inventory.update(
      id,
      dto,
      ifMatch ?? null,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('inventory:delete')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.inventory.remove(id, this.context(req));
  }

  @Post(':id/movements')
  @Policy('inventory:write')
  addMovement(
    @Param('id') id: string,
    @Body() dto: AddMovementDto,
    @Req() req: Request,
  ) {
    return this.inventory.addMovement(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
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
    if (!actor) {
      throw new Error('Aktor tidak ditemukan — rute ini harus dijaga guard.');
    }
    return actor;
  }
}
