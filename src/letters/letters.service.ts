import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { letters } from '../database/schema/letters';
import { profiles } from '../database/schema/organization';
import { NumberingService } from '../numbering/numbering.service';
import { canEditLetter, type Actor } from '../policy/resource';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateLetterDto,
  ListLettersQueryDto,
  TransitionLetterDto,
  UpdateLetterDto,
} from './dto/letters.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class LettersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly numbering: NumberingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  async list(query: ListLettersQueryDto) {
    const conditions: SQL[] = [isNull(letters.deletedAt)];

    if (query.status) {
      conditions.push(eq(letters.status, query.status));
    }
    if (query.direction) {
      conditions.push(eq(letters.direction, query.direction));
    }
    if (query.periodId) {
      conditions.push(eq(letters.periodId, query.periodId));
    }
    if (query.picId) {
      conditions.push(eq(letters.picId, query.picId));
    }
    if (query.cursor) {
      conditions.push(gt(letters.createdAt, this.cursorDate()));
    }

    return this.db
      .select({
        id: letters.id,
        letterNumber: letters.letterNumber,
        direction: letters.direction,
        letterKind: letters.letterKind,
        subject: letters.subject,
        status: letters.status,
        letterDate: letters.letterDate,
        dueDate: letters.dueDate,
        picId: letters.picId,
        picName: profiles.fullName,
        periodId: letters.periodId,
        createdAt: letters.createdAt,
      })
      .from(letters)
      .leftJoin(profiles, eq(letters.picId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(letters.createdAt))
      .limit(query.limit);
  }

  async detail(id: string, actor: Actor) {
    const row = await this.findOne(id);

    const edges = await this.workflow.availableFor(
      TRANSITION_ENTITY.letter,
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

  async create(dto: CreateLetterDto, context: WriteContext) {
    const created = await this.db.transaction(async (tx) => {
      const periodId = dto.periodId ?? null;

      const letterNumber = await this.numbering.next(tx, 'letter', {
        variant: dto.letterKind,
      });

      const rows = await tx
        .insert(letters)
        .values({
          letterNumber,
          letterKind: dto.letterKind.trim().toUpperCase(),
          direction: dto.direction ?? 'outbound',
          subject: dto.subject,
          senderRecipient: dto.senderRecipient ?? null,
          institution: dto.institution ?? null,
          letterDate: dto.letterDate ?? null,
          dueDate: dto.dueDate ?? null,
          picId: dto.picId ?? null,
          signerName: dto.signerName ?? null,
          note: dto.note ?? null,
          programId: dto.programId ?? null,
          requestId: dto.requestId ?? null,
          periodId,
          requesterId: context.actorId,
          status: 'submitted',
          version: 1,
        })
        .returning();

      return rows[0]!;
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'letter.created',
      entityType: 'letter',
      entityId: created.id,
      afterData: created,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateLetterDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);

    this.assertAllowed(canEditLetter(actor, row));
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(letters)
      .set({
        ...dto,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(letters.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'letter.updated',
      entityType: 'letter',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  async transition(
    id: string,
    dto: TransitionLetterDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);

    this.assertAllowed(canEditLetter(actor, row));

    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.letter,
      row.status,
      dto.to,
      actor.roles,
      row,
    );

    const updated = await this.db
      .update(letters)
      .set({ status: dto.to, version: row.version + 1, updatedAt: new Date() })
      .where(eq(letters.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'letter.transitioned',
      entityType: 'letter',
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  async remove(id: string, context: WriteContext) {
    const row = await this.findOne(id);

    await this.db
      .update(letters)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(letters.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'letter.deleted',
      entityType: 'letter',
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
      .from(letters)
      .where(and(eq(letters.id, id), isNull(letters.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException(`Surat ${id} tidak ditemukan.`);
    return row;
  }

  private assertAllowed(result: ReturnType<typeof canEditLetter>) {
    if (result.effect === 'deny') {
      // 404, bukan 403 — §7.3
      throw new NotFoundException('Surat tidak ditemukan.');
    }
  }

  private assertVersion(current: number, ifMatch: string | null) {
    if (ifMatch === null) {
      throw new PreconditionFailedException(
        'Header If-Match wajib disertakan untuk mengubah surat.',
      );
    }
    const expected = Number(ifMatch.replace(/"/g, ''));
    if (expected !== current) {
      throw new ConflictException(
        'Versi tidak cocok. Data sudah diubah orang lain — muat ulang lalu coba lagi.',
      );
    }
  }

  private cursorDate(): Date {
    // Cursor sederhana: implementasi penuh menggunakan keyed cursor
    return new Date(0);
  }
}
