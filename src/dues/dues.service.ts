import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { memberDues, memberPayments } from '../database/schema/finance';
import { canReadFinance, type Actor } from '../policy/resource';
import type {
  AddPaymentDto,
  CreateDuesDto,
  ListDuesQueryDto,
  UpdateDuesDto,
} from './dto/dues.dto';

export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class DuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  private assertAccess(actor: Actor): void {
    if (canReadFinance(actor).effect === 'deny') {
      throw new NotFoundException('Tidak ditemukan.');
    }
  }

  // ─── CRUD iuran ────────────────────────────────────────────────────────────

  async list(query: ListDuesQueryDto, actor: Actor) {
    this.assertAccess(actor);

    const conditions: SQL[] = [];
    if (query.periodId)
      conditions.push(eq(memberDues.periodId, query.periodId));
    if (query.status) conditions.push(eq(memberDues.status, query.status));

    return this.db
      .select()
      .from(memberDues)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(query.limit)
      .offset(query.offset);
  }

  async getOne(id: string, actor: Actor) {
    this.assertAccess(actor);
    const dues = await this.findOne(id);
    const payments = await this.db
      .select()
      .from(memberPayments)
      .where(eq(memberPayments.memberDuesId, id))
      .orderBy(memberPayments.paidAt);
    return { ...dues, payments };
  }

  async create(dto: CreateDuesDto, actor: Actor, context: WriteContext) {
    this.assertAccess(actor);

    // Cegah duplikat (profile, period)
    if (dto.periodId) {
      const existing = await this.db
        .select({ id: memberDues.id })
        .from(memberDues)
        .where(
          and(
            eq(memberDues.profileId, dto.profileId),
            eq(memberDues.periodId, dto.periodId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        throw new ConflictException(
          'Anggota ini sudah mempunyai baris iuran untuk periode tersebut.',
        );
      }
    }

    const rows = await this.db
      .insert(memberDues)
      .values({
        profileId: dto.profileId,
        periodId: dto.periodId,
        targetAmount: dto.targetAmount,
        status: 'unpaid',
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'dues.created',
      entityType: 'dues',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async update(
    id: string,
    dto: UpdateDuesDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertAccess(actor);
    const row = await this.findOne(id);

    const updated = await this.db
      .update(memberDues)
      .set({ targetAmount: dto.targetAmount, updatedAt: new Date() })
      .where(eq(memberDues.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'dues.updated',
      entityType: 'dues',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  // ─── Pembayaran ────────────────────────────────────────────────────────────

  async addPayment(
    duesId: string,
    dto: AddPaymentDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertAccess(actor);
    const dues = await this.findOne(duesId);

    const payment = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(memberPayments)
        .values({
          memberDuesId: duesId,
          amount: dto.amount,
          paidAt: dto.paidAt ?? new Date().toISOString().slice(0, 10),
          proofUrl: dto.proofUrl ?? null,
          note: dto.note ?? null,
          verified: false,
        })
        .returning();

      await this.recalcDues(tx, duesId, dues.targetAmount);
      return rows[0]!;
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'payment.added',
      entityType: 'payment',
      entityId: payment.id,
      afterData: payment,
    });

    return payment;
  }

  async verifyPayment(
    duesId: string,
    paymentId: string,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertAccess(actor);
    await this.findOne(duesId);

    const rows = await this.db
      .update(memberPayments)
      .set({
        verified: true,
        verifiedBy: context.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberPayments.id, paymentId),
          eq(memberPayments.memberDuesId, duesId),
        ),
      )
      .returning();

    if (!rows[0])
      throw new NotFoundException(`Pembayaran ${paymentId} tidak ditemukan.`);

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'payment.verified',
      entityType: 'payment',
      entityId: paymentId,
    });

    return rows[0];
  }

  async removePayment(
    duesId: string,
    paymentId: string,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertAccess(actor);
    const dues = await this.findOne(duesId);

    let row: any;
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(memberPayments)
        .where(
          and(
            eq(memberPayments.id, paymentId),
            eq(memberPayments.memberDuesId, duesId),
          ),
        )
        .returning();

      if (!deleted[0])
        throw new NotFoundException(`Pembayaran ${paymentId} tidak ditemukan.`);

      row = deleted[0];

      await this.recalcDues(tx, duesId, dues.targetAmount);
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'payment.deleted',
      entityType: 'payment',
      entityId: paymentId,
      beforeData: row as Record<string, unknown>,
    });
  }

  // ─── Pembantu ──────────────────────────────────────────────────────────────

  private async findOne(id: string) {
    const rows = await this.db
      .select()
      .from(memberDues)
      .where(eq(memberDues.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Iuran ${id} tidak ditemukan.`);
    return row;
  }

  /**
   * Menghitung ulang `paid_amount` dan `status` iuran dari semua pembayaran
   * yang ada, **di dalam transaksi milik pemanggil**.
   *
   * Status otomatis:
   * - `paid_amount >= target_amount` → `paid`
   * - `paid_amount > 0` → `installment`
   * - else → `unpaid`
   */
  private async recalcDues(
    tx: NodePgDatabase,
    duesId: string,
    targetAmount: string,
  ) {
    const payments = await tx
      .select({ amount: memberPayments.amount })
      .from(memberPayments)
      .where(eq(memberPayments.memberDuesId, duesId));

    const paidAmount = payments
      .reduce((s, p) => s + parseFloat(p.amount), 0)
      .toFixed(2);

    const target = parseFloat(targetAmount);
    const paid = parseFloat(paidAmount);

    const status =
      paid >= target && target > 0
        ? 'paid'
        : paid > 0
          ? 'installment'
          : 'unpaid';

    await tx
      .update(memberDues)
      .set({ paidAmount, status, updatedAt: new Date() })
      .where(eq(memberDues.id, duesId));
  }
}
