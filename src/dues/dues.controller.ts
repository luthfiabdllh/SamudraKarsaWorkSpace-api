import {
  Body,
  Controller,
  Delete,
  Get,
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
  AddPaymentDto,
  CreateDuesDto,
  ListDuesQueryDto,
  UpdateDuesDto,
} from './dto/dues.dto';
import { DuesService, type WriteContext } from './dues.service';

@Controller('dues')
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @Get()
  @Policy('finance:read')
  list(@Query() query: ListDuesQueryDto, @Req() req: Request) {
    return this.dues.list(query, this.actor(req));
  }

  @Get(':id')
  @Policy('finance:read')
  getOne(@Param('id') id: string, @Req() req: Request) {
    return this.dues.getOne(id, this.actor(req));
  }

  @Post()
  @Policy('finance:write')
  create(@Body() dto: CreateDuesDto, @Req() req: Request) {
    return this.dues.create(dto, this.actor(req), this.context(req));
  }

  @Patch(':id')
  @Policy('finance:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDuesDto,
    @Req() req: Request,
  ) {
    return this.dues.update(id, dto, this.actor(req), this.context(req));
  }

  @Post(':id/payments')
  @Policy('finance:write')
  addPayment(
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
    @Req() req: Request,
  ) {
    return this.dues.addPayment(id, dto, this.actor(req), this.context(req));
  }

  @Patch(':id/payments/:paymentId/verify')
  @HttpCode(HttpStatus.OK)
  @Policy('finance:write')
  verifyPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Req() req: Request,
  ) {
    return this.dues.verifyPayment(id, paymentId, this.actor(req), this.context(req));
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('finance:write')
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Req() req: Request,
  ) {
    return this.dues.removePayment(id, paymentId, this.actor(req), this.context(req));
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
