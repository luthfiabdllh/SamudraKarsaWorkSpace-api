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
import { announcements } from '../database/schema/collaboration';
import type { Actor } from '../policy/resource';
import type {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto';
import type { WriteContext } from '../meetings/meetings.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list(divisionId?: string) {
    const conditions: SQL[] = [isNull(announcements.deletedAt)];
    if (divisionId) {
      conditions.push(eq(announcements.divisionId, divisionId));
    }

    const rows = await this.db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        pinned: announcements.pinned,
        divisionId: announcements.divisionId,
        periodId: announcements.periodId,
        version: announcements.version,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(and(...conditions))
      // Prioritaskan pinned terlebih dahulu, lalu diurutkan berdasarkan terbaru
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt));

    return rows;
  }

  async findOne(id: string) {
    const row = await this.db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!row) {
      throw new NotFoundException(`Pengumuman ${id} tidak ditemukan`);
    }

    return row;
  }

  async create(
    dto: CreateAnnouncementDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const [row] = await this.db
      .insert(announcements)
      .values({
        title: dto.title,
        body: dto.body,
        pinned: dto.pinned,
        divisionId: dto.divisionId,
        createdBy: actor.id,
      })
      .returning({ id: announcements.id, version: announcements.version });

    if (!row) throw new Error('Gagal membuat pengumuman');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'announcements',
      entityId: row.id,
      afterData: {
        title: dto.title,
      },
    });

    return row;
  }

  async update(
    id: string,
    dto: UpdateAnnouncementDto,
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
        .select({ version: announcements.version })
        .from(announcements)
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .limit(1)
        .then((res) => res[0]);

      if (!current) {
        throw new NotFoundException(`Pengumuman ${id} tidak ditemukan`);
      }
      if (current.version !== version) {
        throw new ConflictException('Data telah diubah pihak lain');
      }

      const updates = { ...dto, version: version + 1 };

      const [updated] = await tx
        .update(announcements)
        .set(updates)
        .where(eq(announcements.id, id))
        .returning({ version: announcements.version });

      await this.audit.record({
        ...context,
        action: 'update',
        entityType: 'announcements',
        entityId: id,
        afterData: dto as Record<string, unknown>,
      });

      return updated;
    });

    return result;
  }

  async remove(id: string, context: WriteContext) {
    const current = await this.db
      .select({ id: announcements.id })
      .from(announcements)
      .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Pengumuman ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(announcements)
        .set({ deletedAt: new Date() })
        .where(eq(announcements.id, id));

      await this.audit.record({
        ...context,
        action: 'delete',
        entityType: 'announcements',
        entityId: id,
      });
    });
  }
}
