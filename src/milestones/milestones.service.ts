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
import { milestones } from '../database/schema/work';
import type { Actor } from '../policy/resource';
import type {
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/milestones.dto';
import type { WriteContext } from '../meetings/meetings.service';

@Injectable()
export class MilestonesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list(divisionId?: string) {
    const conditions: SQL[] = [isNull(milestones.deletedAt)];
    if (divisionId) {
      conditions.push(eq(milestones.divisionId, divisionId));
    }

    const rows = await this.db
      .select({
        id: milestones.id,
        name: milestones.name,
        startDate: milestones.startDate,
        endDate: milestones.endDate,
        picId: milestones.picId,
        priority: milestones.priority,
        status: milestones.status,
        progressPercentage: milestones.progressPercentage,
        divisionId: milestones.divisionId,
        version: milestones.version,
      })
      .from(milestones)
      .where(and(...conditions))
      .orderBy(desc(milestones.createdAt));

    return rows;
  }

  async findOne(id: string) {
    const row = await this.db
      .select()
      .from(milestones)
      .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!row) {
      throw new NotFoundException(`Milestone ${id} tidak ditemukan`);
    }

    return row;
  }

  async create(dto: CreateMilestoneDto, actor: Actor, context: WriteContext) {
    const [row] = await this.db
      .insert(milestones)
      .values({
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        picId: dto.picId,
        divisionId: dto.divisionId,
        priority: dto.priority,
        status: dto.status,
        progressPercentage: dto.progressPercentage,
        note: dto.note,
        workItemId: dto.workItemId,
      })
      .returning({ id: milestones.id, version: milestones.version });

    if (!row) throw new Error('Gagal membuat milestone');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'milestones',
      entityId: row.id,
      afterData: dto as unknown as Record<string, unknown>,
    });

    return row;
  }

  async update(
    id: string,
    dto: UpdateMilestoneDto,
    ifMatch: string | undefined,
    actor: Actor,
    context: WriteContext,
  ) {
    if (!ifMatch) {
      throw new PreconditionFailedException('Header If-Match diperlukan');
    }
    const version = parseInt(ifMatch, 10);

    const result = await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ version: milestones.version })
        .from(milestones)
        .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
        .limit(1)
        .then((res) => res[0]);

      if (!current) {
        throw new NotFoundException(`Milestone ${id} tidak ditemukan`);
      }
      if (current.version !== version) {
        throw new ConflictException('Data telah diubah pihak lain');
      }

      const updates: Record<string, unknown> = { ...dto, version: version + 1 };

      const [updated] = await tx
        .update(milestones)
        .set(updates as any)
        .where(eq(milestones.id, id))
        .returning({ version: milestones.version });

      await this.audit.record({
        ...context,
        action: 'update',
        entityType: 'milestones',
        entityId: id,
        afterData: dto as unknown as Record<string, unknown>,
      });

      return updated;
    });

    return result;
  }

  async remove(id: string, actor: Actor, context: WriteContext) {
    const current = await this.db
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Milestone ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(milestones)
        .set({ deletedAt: new Date() })
        .where(eq(milestones.id, id));

      await this.audit.record({
        ...context,
        action: 'delete',
        entityType: 'milestones',
        entityId: id,
      });
    });
  }
}
