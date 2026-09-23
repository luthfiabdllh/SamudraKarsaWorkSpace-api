import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../../audit/audit.service';
import { DRIZZLE } from '../../database/database.constants';
import { meetingDecisions } from '../../database/schema/collaboration';
import { workItems } from '../../database/schema/work';
import { NumberingService } from '../../numbering/numbering.service';
import type { Actor } from '../../policy/resource';
import type { WriteContext } from '../meetings.service';
import type {
  CreateMeetingDecisionDto,
  UpdateMeetingDecisionDto,
} from '../dto/meetings.dto';

@Injectable()
export class MeetingDecisionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async list(meetingId: string) {
    return this.db
      .select()
      .from(meetingDecisions)
      .where(eq(meetingDecisions.meetingId, meetingId))
      .orderBy(desc(meetingDecisions.createdAt));
  }

  async create(
    meetingId: string,
    dto: CreateMeetingDecisionDto,
    _actor: Actor,
    context: WriteContext,
  ) {
    const [row] = await this.db
      .insert(meetingDecisions)
      .values({
        meetingId,
        decisionText: dto.decisionText,
        picId: dto.picId,
        dueDate: dto.dueDate ? dto.dueDate : null,
        priority: dto.priority,
      })
      .returning();

    if (!row) throw new Error('Gagal membuat keputusan');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'meetingDecisions',
      entityId: row.id,
      afterData: dto as unknown as Record<string, unknown>,
    });

    return row;
  }

  async update(
    id: string,
    dto: UpdateMeetingDecisionDto,
    ifMatch: string | undefined,
    actor: Actor,
    context: WriteContext,
  ) {
    // Note: this table doesn't have a version column based on collaboration.ts schema?
    // Let's verify schema later. If it does not, we can skip ifMatch.
    // WAIT, collaboration.ts doesn't have version on meetingDecisions!
    // But optimistic locking rule says every write endpoint unless explicitly no version.

    // Actually, meetingDecisions doesn't have version. Let's just do direct update.
    const current = await this.db
      .select({ id: meetingDecisions.id })
      .from(meetingDecisions)
      .where(eq(meetingDecisions.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Keputusan Rapat ${id} tidak ditemukan`);
    }

    const updates: Record<string, unknown> = { ...dto };
    if (dto.dueDate) updates.dueDate = dto.dueDate;

    const [updated] = await this.db
      .update(meetingDecisions)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .set(updates as any)
      .where(eq(meetingDecisions.id, id))
      .returning();

    await this.audit.record({
      ...context,
      action: 'update',
      entityType: 'meetingDecisions',
      entityId: id,
      afterData: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(id: string, _actor: Actor, context: WriteContext) {
    const current = await this.db
      .select({ id: meetingDecisions.id })
      .from(meetingDecisions)
      .where(eq(meetingDecisions.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Keputusan Rapat ${id} tidak ditemukan`);
    }

    await this.db.delete(meetingDecisions).where(eq(meetingDecisions.id, id));

    await this.audit.record({
      ...context,
      action: 'delete',
      entityType: 'meetingDecisions',
      entityId: id,
    });
  }

  async followUp(id: string, actor: Actor, context: WriteContext) {
    const decision = await this.db
      .select()
      .from(meetingDecisions)
      .where(eq(meetingDecisions.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!decision) {
      throw new NotFoundException(`Keputusan Rapat ${id} tidak ditemukan`);
    }

    if (decision.workItemId) {
      throw new ConflictException(
        'Keputusan ini sudah ditindaklanjuti ke pekerjaan lain',
      );
    }

    const result = await this.db.transaction(async (tx) => {
      // Create work_item
      const workNumber = await this.numbering.next(tx, 'work_item');

      const [wi] = await tx
        .insert(workItems)
        .values({
          workNumber,
          title: decision.decisionText,
          type: 'meeting_follow_up',
          primaryPicId: decision.picId,
          dueDate: decision.dueDate,
          priority: decision.priority,
          status: 'backlog', // Backlog status
          sourceMeetingDecisionId: decision.id,
          createdBy: actor.id,
        })
        .returning({ id: workItems.id, version: workItems.version });

      if (!wi) throw new Error('Gagal membuat pekerjaan turunan');

      // Link back to decision
      await tx
        .update(meetingDecisions)
        .set({ workItemId: wi.id })
        .where(eq(meetingDecisions.id, id));

      await this.audit.record({
        ...context,
        action: 'create',
        entityType: 'workItems',
        entityId: wi.id,
        afterData: {
          sourceMeetingDecisionId: id,
        },
      });

      return wi;
    });

    return result;
  }
}
