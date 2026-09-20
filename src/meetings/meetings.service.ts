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
import {
  meetings,
  meetingParticipants,
} from '../database/schema/collaboration';
import { profiles } from '../database/schema/organization';
import type { Actor } from '../policy/resource';
import type {
  CreateMeetingDto,
  SetMeetingParticipantsDto,
  UpdateMeetingDto,
} from './dto/meetings.dto';

export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class MeetingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list(periodId?: string) {
    const conditions: SQL[] = [isNull(meetings.deletedAt)];
    if (periodId) {
      conditions.push(eq(meetings.periodId, periodId));
    }

    const rows = await this.db
      .select({
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        heldAt: meetings.heldAt,
        locationOrMedia: meetings.locationOrMedia,
        divisionId: meetings.divisionId,
        periodId: meetings.periodId,
        createdAt: meetings.createdAt,
        version: meetings.version,
      })
      .from(meetings)
      .where(and(...conditions))
      .orderBy(desc(meetings.heldAt));

    return rows;
  }

  async findOne(id: string, actor: Actor, context: WriteContext) {
    const row = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!row) {
      throw new NotFoundException(`Rapat ${id} tidak ditemukan`);
    }

    // Ambil partisipan
    const participants = await this.db
      .select({
        profileId: profiles.id,
        fullName: profiles.fullName,
      })
      .from(meetingParticipants)
      .innerJoin(profiles, eq(profiles.id, meetingParticipants.profileId))
      .where(eq(meetingParticipants.meetingId, id));

    // Audit log karena membaca data yang mungkin sensitif
    await this.audit.record({
      ...context,
      action: 'read',
      entityType: 'meetings',
      entityId: id,
    });

    return { ...row, participants };
  }

  async create(dto: CreateMeetingDto, actor: Actor, context: WriteContext) {
    // Pada skenario nyata, periodId bisa didapat dari context aktif
    const [row] = await this.db
      .insert(meetings)
      .values({
        title: dto.title,
        meetingType: dto.meetingType,
        heldAt: new Date(dto.heldAt),
        locationOrMedia: dto.locationOrMedia,
        agenda: dto.agenda,
        summary: dto.summary,
        divisionId: dto.divisionId,
        createdBy: actor.id,
      })
      .returning({ id: meetings.id, version: meetings.version });

    if (!row) throw new Error('Gagal membuat pertemuan');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'meetings',
      entityId: row.id,
      afterData: {
        title: dto.title,
        meetingType: dto.meetingType,
      },
    });

    return row;
  }

  async update(
    id: string,
    dto: UpdateMeetingDto,
    ifMatch: string | undefined,
    _actor: Actor,
    context: WriteContext,
  ) {
    if (!ifMatch) {
      throw new PreconditionFailedException('Header If-Match diperlukan');
    }
    const version = parseInt(ifMatch, 10);

    const result = await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ version: meetings.version })
        .from(meetings)
        .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
        .limit(1)
        .then((res) => res[0]);

      if (!current) {
        throw new NotFoundException(`Rapat ${id} tidak ditemukan`);
      }
      if (current.version !== version) {
        throw new ConflictException('Data telah diubah pihak lain');
      }

      const updates: Record<string, any> = { ...dto, version: version + 1 };
      if (dto.heldAt) updates.heldAt = new Date(dto.heldAt);

      const [updated] = await tx
        .update(meetings)
        .set(updates)
        .where(eq(meetings.id, id))
        .returning({ version: meetings.version });

      await this.audit.record({
        ...context,
        action: 'update',
        entityType: 'meetings',
        entityId: id,
        afterData: dto as Record<string, unknown>,
      });

      return updated;
    });

    return result;
  }

  async setParticipants(
    id: string,
    dto: SetMeetingParticipantsDto,
    _actor: Actor,
    context: WriteContext,
  ) {
    const meeting = await this.db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!meeting) {
      throw new NotFoundException(`Rapat ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(meetingParticipants)
        .where(eq(meetingParticipants.meetingId, id));

      if (dto.profileIds.length > 0) {
        await tx.insert(meetingParticipants).values(
          dto.profileIds.map((profileId) => ({
            meetingId: id,
            profileId,
          })),
        );
      }

      await this.audit.record({
        ...context,
        action: 'update',
        entityType: 'meetings',
        entityId: id,
        afterData: {
          participants: dto.profileIds,
        },
      });
    });
  }

  async remove(id: string, _actor: Actor, context: WriteContext) {
    const current = await this.db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Rapat ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(meetings)
        .set({ deletedAt: new Date() })
        .where(eq(meetings.id, id));

      await this.audit.record({
        ...context,
        action: 'delete',
        entityType: 'meetings',
        entityId: id,
      });
    });
  }
}
