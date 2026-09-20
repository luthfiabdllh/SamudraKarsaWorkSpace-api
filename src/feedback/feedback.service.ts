import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { feedback } from '../database/schema/internal';
import type { Actor } from '../policy/resource';
import type { CreateFeedbackDto } from './dto/feedback.dto';
import type { WriteContext } from '../meetings/meetings.service';

@Injectable()
export class FeedbackService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list(periodId: string | undefined, actor: Actor) {
    const conditions: SQL[] = [];
    if (periodId) {
      conditions.push(eq(feedback.periodId, periodId));
    }

    const rows = await this.db
      .select({
        id: feedback.id,
        category: feedback.category,
        visibility: feedback.visibility,
        targetNote: feedback.targetNote,
        message: feedback.message,
        isPrivate: feedback.isPrivate,
        periodId: feedback.periodId,
        authorId: feedback.authorId,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(feedback.createdAt));

    const isPrivileged =
      actor.roles.includes('owner') || actor.roles.includes('co_owner');

    // Anonimkan feedback jika tidak private atau aktor tidak memiliki akses
    return rows
      .map((row) => {
        if (row.isPrivate && !isPrivileged && row.authorId !== actor.id) {
          // Hanya yang berhak dan penulisnya sendiri yang boleh lihat jika isPrivate = true
          return null;
        }

        const mapped = { ...row };

        // Jika visibility = anonymous dan aktor bukan owner/co-owner, sembunyikan author
        if (row.visibility === 'anonymous' && !isPrivileged) {
          mapped.authorId = null;
        }

        return mapped;
      })
      .filter(Boolean); // Buang yang null (dihapus karena hak akses)
  }

  async create(dto: CreateFeedbackDto, actor: Actor, context: WriteContext) {
    const [row] = await this.db
      .insert(feedback)
      .values({
        category: dto.category,
        visibility: dto.visibility,
        targetNote: dto.targetNote,
        message: dto.message,
        isPrivate: dto.isPrivate,
        authorId: actor.id, // Selalu di-enforce menggunakan aktor saat ini
      })
      .returning({ id: feedback.id });

    if (!row) throw new Error('Gagal membuat feedback');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'feedback',
      entityId: row.id,
      afterData: {
        category: dto.category,
        isPrivate: dto.isPrivate,
        visibility: dto.visibility,
      },
    });

    return row;
  }
}
