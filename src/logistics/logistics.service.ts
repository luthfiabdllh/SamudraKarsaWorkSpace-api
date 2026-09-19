import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { shipments, trips } from '../database/schema/operations';
import { profiles } from '../database/schema/organization';
import { canEditLogistics, type Actor } from '../policy/resource';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateShipmentDto,
  CreateTripDto,
  ListShipmentsQueryDto,
  ListTripsQueryDto,
  TransitionShipmentDto,
  TransitionTripDto,
  UpdateShipmentDto,
  UpdateTripDto,
} from './dto/logistics.dto';

export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class LogisticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Shipments (Pengiriman)
  // ───────────────────────────────────────────────────────────────────────────

  async listShipments(query: ListShipmentsQueryDto) {
    const conditions: SQL[] = [isNull(shipments.deletedAt)];
    if (query.status) conditions.push(eq(shipments.status, query.status));

    return this.db
      .select({
        id: shipments.id,
        packageName: shipments.packageName,
        contentNote: shipments.contentNote,
        weightKg: shipments.weightKg,
        dimensionNote: shipments.dimensionNote,
        origin: shipments.origin,
        destination: shipments.destination,
        senderName: shipments.senderName,
        recipientName: shipments.recipientName,
        expedition: shipments.expedition,
        trackingNumber: shipments.trackingNumber,
        scheduledAt: shipments.scheduledAt,
        cost: shipments.cost,
        status: shipments.status,
        createdAt: shipments.createdAt,
      })
      .from(shipments)
      .where(and(...conditions))
      .orderBy(desc(shipments.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async detailShipment(id: string) {
    const rows = await this.db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)))
      .limit(1);
    
    if (!rows[0]) throw new NotFoundException('Pengiriman tidak ditemukan.');
    return rows[0];
  }

  async createShipment(dto: CreateShipmentDto, context: WriteContext) {
    const rows = await this.db
      .insert(shipments)
      .values({
        packageName: dto.packageName,
        contentNote: dto.contentNote ?? null,
        weightKg: dto.weightKg ?? null,
        dimensionNote: dto.dimensionNote ?? null,
        origin: dto.origin ?? null,
        destination: dto.destination ?? null,
        senderName: dto.senderName ?? null,
        recipientName: dto.recipientName ?? null,
        expedition: dto.expedition ?? null,
        trackingNumber: dto.trackingNumber ?? null,
        scheduledAt: dto.scheduledAt ?? null,
        cost: dto.cost ?? null,
        status: 'processing',
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.shipment.created',
      entityType: 'shipment',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async updateShipment(
    id: string,
    dto: UpdateShipmentDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.detailShipment(id);
    
    // Check permission - no specific PIC or division for shipment, but we'll use a dummy item 
    // to reuse the same logic for owner/division lead check (without picId)
    this.assertAllowed(canEditLogistics(actor, { id, picId: null, divisionCode: null }));

    const updated = await this.db
      .update(shipments)
      .set({ ...dto })
      .where(eq(shipments.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.shipment.updated',
      entityType: 'shipment',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  async transitionShipment(
    id: string,
    dto: TransitionShipmentDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.detailShipment(id);
    this.assertAllowed(canEditLogistics(actor, { id, picId: null, divisionCode: null }));

    const updated = await this.db
      .update(shipments)
      .set({ status: dto.to })
      .where(eq(shipments.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.shipment.transitioned',
      entityType: 'shipment',
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  async removeShipment(id: string, context: WriteContext) {
    const row = await this.detailShipment(id);
    await this.db
      .update(shipments)
      .set({ deletedAt: new Date() })
      .where(eq(shipments.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.shipment.deleted',
      entityType: 'shipment',
      entityId: id,
      beforeData: row,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Trips (Perjalanan / Peminjaman Kendaraan)
  // ───────────────────────────────────────────────────────────────────────────

  async listTrips(query: ListTripsQueryDto) {
    const conditions: SQL[] = [isNull(trips.deletedAt)];
    if (query.status) conditions.push(eq(trips.status, query.status));
    if (query.picId) conditions.push(eq(trips.picId, query.picId));

    return this.db
      .select({
        id: trips.id,
        tripKind: trips.tripKind,
        title: trips.title,
        scheduledAt: trips.scheduledAt,
        vehicleNote: trips.vehicleNote,
        picId: trips.picId,
        picName: profiles.fullName,
        passengerCount: trips.passengerCount,
        status: trips.status,
        note: trips.note,
        createdAt: trips.createdAt,
      })
      .from(trips)
      .leftJoin(profiles, eq(trips.picId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async detailTrip(id: string) {
    const rows = await this.db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), isNull(trips.deletedAt)))
      .limit(1);
    
    if (!rows[0]) throw new NotFoundException('Perjalanan tidak ditemukan.');
    return rows[0];
  }

  async createTrip(dto: CreateTripDto, context: WriteContext) {
    const rows = await this.db
      .insert(trips)
      .values({
        tripKind: dto.tripKind,
        title: dto.title,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        vehicleNote: dto.vehicleNote ?? null,
        picId: dto.picId ?? null,
        passengerCount: dto.passengerCount ?? null,
        note: dto.note ?? null,
        status: 'planned',
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.trip.created',
      entityType: 'trip',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async updateTrip(
    id: string,
    dto: UpdateTripDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.detailTrip(id);
    this.assertAllowed(canEditLogistics(actor, { id, picId: row.picId, divisionCode: null }));

    const updated = await this.db
      .update(trips)
      .set({ 
        ...dto, 
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined 
      })
      .where(eq(trips.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.trip.updated',
      entityType: 'trip',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  async transitionTrip(
    id: string,
    dto: TransitionTripDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.detailTrip(id);
    this.assertAllowed(canEditLogistics(actor, { id, picId: row.picId, divisionCode: null }));

    const updated = await this.db
      .update(trips)
      .set({ status: dto.to, note: dto.note ?? row.note })
      .where(eq(trips.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.trip.transitioned',
      entityType: 'trip',
      entityId: id,
      beforeData: { status: row.status, note: row.note },
      afterData: { status: dto.to, note: dto.note ?? row.note },
    });

    return updated[0];
  }

  async removeTrip(id: string, context: WriteContext) {
    const row = await this.detailTrip(id);
    await this.db
      .update(trips)
      .set({ deletedAt: new Date() })
      .where(eq(trips.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'logistics.trip.deleted',
      entityType: 'trip',
      entityId: id,
      beforeData: row,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pembantu
  // ───────────────────────────────────────────────────────────────────────────

  private assertAllowed(result: ReturnType<typeof canEditLogistics>) {
    if (result.effect === 'deny') {
      throw new NotFoundException('Tidak ditemukan.'); // 404, bukan 403
    }
  }
}
