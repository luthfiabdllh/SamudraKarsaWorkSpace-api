import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { creativeRequests } from '../database/schema/content';
import { profiles } from '../database/schema/organization';
import { canEditCreative, type Actor } from '../policy/resource';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateCreativeDto,
  ListCreativeQueryDto,
  TransitionCreativeDto,
  UpdateCreativeDto,
} from './dto/creative.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class CreativeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar permintaan kreatif.
   *
   * Pembacaan terbuka lebar (`creative:read` di guard), tapi bisa disaring
   * per peminta, PIC, periode, dan status.
   */
  async list(query: ListCreativeQueryDto) {
    const conditions: SQL[] = [isNull(creativeRequests.deletedAt)];
    if (query.status)
      conditions.push(eq(creativeRequests.status, query.status));
    if (query.periodId)
      conditions.push(eq(creativeRequests.periodId, query.periodId));
    if (query.picId) conditions.push(eq(creativeRequests.picId, query.picId));
    if (query.requestId)
      conditions.push(eq(creativeRequests.requestId, query.requestId));

    return this.db
      .select({
        id: creativeRequests.id,
        title: creativeRequests.title,
        creativeKind: creativeRequests.creativeKind,
        status: creativeRequests.status,
        dueDate: creativeRequests.dueDate,
        requesterId: creativeRequests.requesterId,
        requesterName: profiles.fullName,
        picId: creativeRequests.picId,
        periodId: creativeRequests.periodId,
        requestId: creativeRequests.requestId,
        revisionCount: creativeRequests.revisionCount,
        createdAt: creativeRequests.createdAt,
        version: creativeRequests.version,
      })
      .from(creativeRequests)
      .leftJoin(profiles, eq(creativeRequests.requesterId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(creativeRequests.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  /**
   * Detail permintaan kreatif, mencakup transisi status yang sah untuk aktor ini.
   */
  async detail(id: string, actor: Actor) {
    const row = await this.findOne(id);

    const edges = await this.workflow.availableFor(
      TRANSITION_ENTITY.creative,
      row.status,
      actor.roles,
    );

    return {
      ...row,
      availableTransitions: edges.map((e) => e.to),
      transitionRequirements: Object.fromEntries(
        edges
          .filter((e) => e.requiredFields.length > 0)
          .map((e) => [e.to, [...e.requiredFields]]),
      ),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tulis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mengajukan permintaan kreatif baru.
   */
  async create(dto: CreateCreativeDto, context: WriteContext) {
    const rows = await this.db
      .insert(creativeRequests)
      .values({
        title: dto.title,
        creativeKind: dto.creativeKind,
        requesterId: dto.requesterId ?? context.actorId, // fallback ke pembuat
        picId: dto.picId ?? null,
        brief: dto.brief ?? null,
        specNote: dto.specNote ?? null,
        referenceUrl: dto.referenceUrl ?? null,
        dueDate: dto.dueDate ?? null,
        requestId: dto.requestId ?? null,
        periodId: dto.periodId ?? null,
        status: 'request_received',
        revisionCount: 0,
        version: 1,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'creative.created',
      entityType: TRANSITION_ENTITY.creative,
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  /**
   * Mengubah isian permintaan kreatif (PIC, brief, dsb).
   * Wewenang dijaga `canEditCreative` di resource.ts, Optimistic Locking aktif.
   */
  async update(
    id: string,
    dto: UpdateCreativeDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditCreative(actor, { ...row, divisionCode: null }));
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(creativeRequests)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(creativeRequests.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'creative.updated',
      entityType: TRANSITION_ENTITY.creative,
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  /**
   * Berpindah status melalui state machine.
   */
  async transition(
    id: string,
    dto: TransitionCreativeDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditCreative(actor, { ...row, divisionCode: null }));

    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.creative,
      row.status,
      dto.to,
      actor.roles,
      row,
    );

    const updated = await this.db
      .update(creativeRequests)
      .set({ status: dto.to, version: row.version + 1, updatedAt: new Date() })
      .where(eq(creativeRequests.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'creative.transitioned',
      entityType: TRANSITION_ENTITY.creative,
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  /**
   * Menambah jumlah revisi.
   * `revisionCount` dinaikkan atomik dari database, aman dari race condition.
   */
  async addRevision(id: string, actor: Actor, context: WriteContext) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditCreative(actor, { ...row, divisionCode: null }));

    const updated = await this.db
      .update(creativeRequests)
      .set({
        revisionCount: sql`${creativeRequests.revisionCount} + 1`,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(creativeRequests.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'creative.revision_added',
      entityType: TRANSITION_ENTITY.creative,
      entityId: id,
      beforeData: { revisionCount: row.revisionCount },
      afterData: { revisionCount: updated[0]!.revisionCount },
    });

    return updated[0];
  }

  /**
   * Menghapus soft-delete baris ini.
   */
  async remove(id: string, context: WriteContext) {
    const row = await this.findOne(id);
    await this.db
      .update(creativeRequests)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(creativeRequests.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'creative.deleted',
      entityType: TRANSITION_ENTITY.creative,
      entityId: id,
      beforeData: row,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pembantu
  // ───────────────────────────────────────────────────────────────────────────

  private async findOne(id: string) {
    const rows = await this.db
      .select()
      .from(creativeRequests)
      .where(
        and(eq(creativeRequests.id, id), isNull(creativeRequests.deletedAt)),
      )
      .limit(1);
    const row = rows[0];
    if (!row)
      throw new NotFoundException(`Permintaan kreatif ${id} tidak ditemukan.`);
    return row;
  }

  private assertAllowed(result: ReturnType<typeof canEditCreative>) {
    if (result.effect === 'deny') {
      throw new NotFoundException('Tidak ditemukan.'); // 404
    }
  }

  private assertVersion(current: number, ifMatch: string | null) {
    if (ifMatch === null) {
      throw new PreconditionFailedException(
        'Header If-Match wajib disertakan untuk mengubah baris ini.',
      );
    }
    const expected = Number(ifMatch.replace(/"/g, ''));
    if (expected !== current) {
      throw new ConflictException(
        'Versi tidak cocok. Data telah diubah oleh orang lain.',
      );
    }
  }
}
