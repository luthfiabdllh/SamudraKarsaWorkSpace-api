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
import { contentItems } from '../database/schema/content';
import { profiles } from '../database/schema/organization';
import { canEditContent, type Actor } from '../policy/resource';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateContentDto,
  ListContentQueryDto,
  TransitionContentDto,
  UpdateContentDto,
} from './dto/content.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class ContentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar konten publikasi.
   *
   * Bacaan terbuka untuk semua anggota aktif (`content:read` di guard), tapi bisa
   * difilter per platform, periode, PIC, dan status.
   */
  async list(query: ListContentQueryDto) {
    const conditions: SQL[] = [isNull(contentItems.deletedAt)];
    if (query.status) conditions.push(eq(contentItems.status, query.status));
    if (query.periodId)
      conditions.push(eq(contentItems.periodId, query.periodId));
    if (query.picId) conditions.push(eq(contentItems.picId, query.picId));
    if (query.platform)
      conditions.push(eq(contentItems.platform, query.platform));

    return this.db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        platform: contentItems.platform,
        plannedDate: contentItems.plannedDate,
        status: contentItems.status,
        picId: contentItems.picId,
        picName: profiles.fullName,
        periodId: contentItems.periodId,
        publishedUrl: contentItems.publishedUrl,
        createdAt: contentItems.createdAt,
        version: contentItems.version,
      })
      .from(contentItems)
      .leftJoin(profiles, eq(contentItems.picId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(contentItems.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  /**
   * Detail konten, lengkap dengan transisi yang tersedia berdasarkan role aktor.
   */
  async detail(id: string, actor: Actor) {
    const row = await this.findOne(id);

    const edges = await this.workflow.availableFor(
      TRANSITION_ENTITY.content,
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
   * Membuat rencana konten baru.
   */
  async create(dto: CreateContentDto, context: WriteContext) {
    const rows = await this.db
      .insert(contentItems)
      .values({
        title: dto.title,
        platform: dto.platform ?? null,
        plannedDate: dto.plannedDate ?? null,
        picId: dto.picId ?? null,
        brief: dto.brief ?? null,
        programId: dto.programId ?? null,
        periodId: dto.periodId ?? null,
        createdBy: context.actorId,
        status: 'idea',
        version: 1,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'content.created',
      entityType: TRANSITION_ENTITY.content,
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  /**
   * Mengubah detail konten.
   * Memeriksa wewenang via `canEditContent` dan melakukan optimistic locking via `If-Match`.
   */
  async update(
    id: string,
    dto: UpdateContentDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditContent(actor, { ...row, divisionCode: null }));
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(contentItems)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(contentItems.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'content.updated',
      entityType: TRANSITION_ENTITY.content,
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  /**
   * Memindahkan status konten.
   * Diperiksa oleh WorkflowService untuk validitas state machine.
   */
  async transition(
    id: string,
    dto: TransitionContentDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditContent(actor, { ...row, divisionCode: null }));

    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.content,
      row.status,
      dto.to,
      actor.roles,
      row,
    );

    const updated = await this.db
      .update(contentItems)
      .set({ status: dto.to, version: row.version + 1, updatedAt: new Date() })
      .where(eq(contentItems.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'content.transitioned',
      entityType: TRANSITION_ENTITY.content,
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  /**
   * Menghapus secara soft-delete.
   */
  async remove(id: string, context: WriteContext) {
    const row = await this.findOne(id);
    await this.db
      .update(contentItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(contentItems.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'content.deleted',
      entityType: TRANSITION_ENTITY.content,
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
      .from(contentItems)
      .where(and(eq(contentItems.id, id), isNull(contentItems.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Konten ${id} tidak ditemukan.`);
    return row;
  }

  private assertAllowed(result: ReturnType<typeof canEditContent>) {
    if (result.effect === 'deny') {
      throw new NotFoundException('Konten tidak ditemukan.'); // 404, bukan 403
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
