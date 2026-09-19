import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { budgetItems, budgets, transactions } from '../database/schema/finance';
import {
  NumberingService,
  type DbExecutor,
} from '../numbering/numbering.service';
import { canReadFinance, type Actor } from '../policy/resource';
import type {
  CreateBudgetDto,
  CreateBudgetItemDto,
  CreateTransactionDto,
  ListBudgetsQueryDto,
  ListTransactionsQueryDto,
  TransitionBudgetDto,
  UpdateBudgetDto,
  UpdateBudgetItemDto,
  UpdateTransactionDto,
} from './dto/finance.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  // ─── Guard keuangan ────────────────────────────────────────────────────────

  /**
   * Memeriksa akses keuangan dan melempar **404** kalau ditolak.
   *
   * 404, bukan 403: §7.3 — aktor yang ditolak tidak boleh tahu bahwa data itu
   * ada. Ini berlaku untuk seluruh modul keuangan.
   */
  assertFinanceAccess(actor: Actor): void {
    const result = canReadFinance(actor);
    if (result.effect === 'deny') {
      throw new NotFoundException('Tidak ditemukan.');
    }
  }

  // ─── Anggaran (RAB) ────────────────────────────────────────────────────────

  async listBudgets(query: ListBudgetsQueryDto, actor: Actor) {
    this.assertFinanceAccess(actor);

    const conditions: SQL[] = [isNull(budgets.deletedAt)];
    if (query.status) conditions.push(eq(budgets.status, query.status));
    if (query.divisionId)
      conditions.push(eq(budgets.divisionId, query.divisionId));
    if (query.periodId) conditions.push(eq(budgets.periodId, query.periodId));

    return this.db
      .select()
      .from(budgets)
      .where(and(...conditions))
      .limit(query.limit)
      .offset(query.offset);
  }

  async getBudget(id: string, actor: Actor) {
    this.assertFinanceAccess(actor);

    const rows = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
      .limit(1);

    const budget = rows[0];
    if (!budget) throw new NotFoundException(`Anggaran ${id} tidak ditemukan.`);

    const items = await this.db
      .select()
      .from(budgetItems)
      .where(eq(budgetItems.budgetId, id))
      .orderBy(budgetItems.sortOrder);

    return { ...budget, items };
  }

  async createBudget(dto: CreateBudgetDto, actor: Actor, context: WriteContext) {
    this.assertFinanceAccess(actor);

    const created = await this.db.transaction(async (tx) => {
      const budgetNumber = await this.numbering.next(tx, 'budget');

      const rows = await tx
        .insert(budgets)
        .values({
          budgetNumber,
          title: dto.title,
          divisionId: dto.divisionId ?? null,
          programId: dto.programId ?? null,
          subunitId: dto.subunitId ?? null,
          periodId: dto.periodId ?? null,
          requestedBy: context.actorId,
          status: 'draft',
          version: 1,
        })
        .returning();

      return rows[0]!;
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget.created',
      entityType: 'budget',
      entityId: created.id,
      afterData: created,
    });

    return created;
  }

  async updateBudget(
    id: string,
    dto: UpdateBudgetDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    const row = await this.findBudget(id);
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(budgets)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(budgets.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget.updated',
      entityType: 'budget',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  async transitionBudget(
    id: string,
    dto: TransitionBudgetDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    const row = await this.findBudget(id);

    const updated = await this.db
      .update(budgets)
      .set({
        status: dto.to,
        reviewNote: dto.reviewNote ?? null,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(budgets.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget.transitioned',
      entityType: 'budget',
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  async removeBudget(id: string, actor: Actor, context: WriteContext) {
    this.assertFinanceAccess(actor);
    const row = await this.findBudget(id);

    await this.db
      .update(budgets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(budgets.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget.deleted',
      entityType: 'budget',
      entityId: id,
      beforeData: row,
    });
  }

  // ─── Rincian anggaran ──────────────────────────────────────────────────────

  async addBudgetItem(
    budgetId: string,
    dto: CreateBudgetItemDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    await this.findBudget(budgetId);

    const rows = await this.db
      .insert(budgetItems)
      .values({
        budgetId,
        label: dto.label,
        quantity: dto.quantity,
        unit: dto.unit ?? null,
        unitPrice: dto.unitPrice,
        plannedTotal: dto.plannedTotal,
        realizedTotal: '0',
        sortOrder: dto.sortOrder,
      })
      .returning();

    await this.updateBudgetTotals(budgetId);

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget_item.added',
      entityType: 'budget_item',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async updateBudgetItem(
    budgetId: string,
    itemId: string,
    dto: UpdateBudgetItemDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    await this.findBudget(budgetId);

    const rows = await this.db
      .update(budgetItems)
      .set(dto)
      .where(and(eq(budgetItems.id, itemId), eq(budgetItems.budgetId, budgetId)))
      .returning();

    if (!rows[0])
      throw new NotFoundException(`Rincian anggaran ${itemId} tidak ditemukan.`);

    await this.updateBudgetTotals(budgetId);

    return rows[0];
  }

  async removeBudgetItem(
    budgetId: string,
    itemId: string,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    await this.findBudget(budgetId);

    const deleted = await this.db
      .delete(budgetItems)
      .where(and(eq(budgetItems.id, itemId), eq(budgetItems.budgetId, budgetId)))
      .returning();

    if (!deleted[0])
      throw new NotFoundException(`Rincian anggaran ${itemId} tidak ditemukan.`);

    await this.updateBudgetTotals(budgetId);

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.budget_item.deleted',
      entityType: 'budget_item',
      entityId: itemId,
      beforeData: deleted[0],
    });
  }

  private async updateBudgetTotals(budgetId: string) {
    const items = await this.db
      .select()
      .from(budgetItems)
      .where(eq(budgetItems.budgetId, budgetId));

    const totalPlanned = items
      .reduce((sum, i) => sum + parseFloat(i.plannedTotal), 0)
      .toFixed(2);
    const totalRealized = items
      .reduce((sum, i) => sum + parseFloat(i.realizedTotal), 0)
      .toFixed(2);

    await this.db
      .update(budgets)
      .set({ totalPlanned, totalRealized, updatedAt: new Date() })
      .where(eq(budgets.id, budgetId));
  }

  // ─── Transaksi ─────────────────────────────────────────────────────────────

  async listTransactions(query: ListTransactionsQueryDto, actor: Actor) {
    this.assertFinanceAccess(actor);

    const conditions: SQL[] = [isNull(transactions.deletedAt)];
    if (query.transactionType)
      conditions.push(eq(transactions.transactionType, query.transactionType));
    if (query.budgetId) conditions.push(eq(transactions.budgetId, query.budgetId));
    if (query.periodId) conditions.push(eq(transactions.periodId, query.periodId));
    if (query.verified !== undefined)
      conditions.push(eq(transactions.verified, query.verified));

    return this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .limit(query.limit)
      .offset(query.offset);
  }

  async getTransaction(id: string, actor: Actor) {
    this.assertFinanceAccess(actor);
    return this.findTransaction(id);
  }

  async createTransaction(
    dto: CreateTransactionDto,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);

    const rows = await this.db
      .insert(transactions)
      .values({
        transactionType: dto.transactionType,
        category: dto.category,
        amount: dto.amount,
        transactionDate: dto.transactionDate ?? new Date().toISOString().slice(0, 10),
        picId: dto.picId ?? null,
        programId: dto.programId ?? null,
        budgetId: dto.budgetId ?? null,
        periodId: dto.periodId ?? null,
        counterparty: dto.counterparty ?? null,
        paymentMethod: dto.paymentMethod ?? null,
        proofUrl: dto.proofUrl ?? null,
        status: 'recorded',
        version: 1,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.transaction.created',
      entityType: 'transaction',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async updateTransaction(
    id: string,
    dto: UpdateTransactionDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    const row = await this.findTransaction(id);
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(transactions)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.transaction.updated',
      entityType: 'transaction',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  async verifyTransaction(
    id: string,
    actor: Actor,
    context: WriteContext,
  ) {
    this.assertFinanceAccess(actor);
    const row = await this.findTransaction(id);

    const updated = await this.db
      .update(transactions)
      .set({
        verified: true,
        verifiedBy: context.actorId,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.transaction.verified',
      entityType: 'transaction',
      entityId: id,
    });

    return updated[0];
  }

  async removeTransaction(id: string, actor: Actor, context: WriteContext) {
    this.assertFinanceAccess(actor);
    const row = await this.findTransaction(id);

    await this.db
      .update(transactions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(transactions.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'finance.transaction.deleted',
      entityType: 'transaction',
      entityId: id,
      beforeData: row,
    });
  }

  // ─── Pembantu ──────────────────────────────────────────────────────────────

  private async findBudget(id: string) {
    const rows = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Anggaran ${id} tidak ditemukan.`);
    return row;
  }

  private async findTransaction(id: string) {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Transaksi ${id} tidak ditemukan.`);
    return row;
  }

  private assertVersion(current: number, ifMatch: string | null) {
    if (ifMatch === null) {
      throw new PreconditionFailedException(
        'Header If-Match wajib disertakan untuk mengubah data ini.',
      );
    }
    const expected = Number(ifMatch.replace(/"/g, ''));
    if (expected !== current) {
      throw new ConflictException(
        'Versi tidak cocok. Data sudah diubah orang lain — muat ulang lalu coba lagi.',
      );
    }
  }
}
