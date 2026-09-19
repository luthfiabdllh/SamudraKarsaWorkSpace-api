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
  CreateShipmentDto,
  CreateTripDto,
  ListShipmentsQueryDto,
  ListTripsQueryDto,
  TransitionShipmentDto,
  TransitionTripDto,
  UpdateShipmentDto,
  UpdateTripDto,
} from './dto/logistics.dto';
import { LogisticsService, type WriteContext } from './logistics.service';

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Shipments (Pengiriman)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('shipments')
  @Policy('logistics:read')
  listShipments(@Query() query: ListShipmentsQueryDto) {
    return this.logistics.listShipments(query);
  }

  @Get('shipments/:id')
  @Policy('logistics:read')
  detailShipment(@Param('id') id: string) {
    return this.logistics.detailShipment(id);
  }

  @Post('shipments')
  @Policy('logistics:write')
  createShipment(@Body() dto: CreateShipmentDto, @Req() req: Request) {
    return this.logistics.createShipment(dto, this.context(req));
  }

  @Patch('shipments/:id')
  @Policy('logistics:write')
  updateShipment(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
    @Req() req: Request,
  ) {
    return this.logistics.updateShipment(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Post('shipments/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('logistics:write')
  transitionShipment(
    @Param('id') id: string,
    @Body() dto: TransitionShipmentDto,
    @Req() req: Request,
  ) {
    return this.logistics.transitionShipment(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete('shipments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('logistics:delete')
  removeShipment(@Param('id') id: string, @Req() req: Request) {
    return this.logistics.removeShipment(id, this.context(req));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Trips (Perjalanan / Peminjaman Kendaraan)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('trips')
  @Policy('logistics:read')
  listTrips(@Query() query: ListTripsQueryDto) {
    return this.logistics.listTrips(query);
  }

  @Get('trips/:id')
  @Policy('logistics:read')
  detailTrip(@Param('id') id: string) {
    return this.logistics.detailTrip(id);
  }

  @Post('trips')
  @Policy('logistics:write')
  createTrip(@Body() dto: CreateTripDto, @Req() req: Request) {
    return this.logistics.createTrip(dto, this.context(req));
  }

  @Patch('trips/:id')
  @Policy('logistics:write')
  updateTrip(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
    @Req() req: Request,
  ) {
    return this.logistics.updateTrip(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Post('trips/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('logistics:write')
  transitionTrip(
    @Param('id') id: string,
    @Body() dto: TransitionTripDto,
    @Req() req: Request,
  ) {
    return this.logistics.transitionTrip(
      id,
      dto,
      this.actor(req),
      this.context(req),
    );
  }

  @Delete('trips/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('logistics:delete')
  removeTrip(@Param('id') id: string, @Req() req: Request) {
    return this.logistics.removeTrip(id, this.context(req));
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
