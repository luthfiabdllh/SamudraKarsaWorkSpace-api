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
  calendarEvents,
  calendarEventAttendees,
} from '../database/schema/collaboration';
import { profiles } from '../database/schema/organization';
import type { Actor } from '../policy/resource';
import type {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  UpdateRsvpDto,
} from './dto/calendar.dto';
import type { WriteContext } from '../meetings/meetings.service';

@Injectable()
export class CalendarService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list(divisionId?: string) {
    const conditions: SQL[] = [isNull(calendarEvents.deletedAt)];
    if (divisionId) {
      conditions.push(eq(calendarEvents.divisionId, divisionId));
    }

    const rows = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        eventType: calendarEvents.eventType,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        allDay: calendarEvents.allDay,
        location: calendarEvents.location,
        isCancelled: calendarEvents.isCancelled,
        version: calendarEvents.version,
        recurrenceRule: calendarEvents.recurrenceRule,
        recurrenceEndDate: calendarEvents.recurrenceEndDate,
        recurrenceParentId: calendarEvents.recurrenceParentId,
      })
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(desc(calendarEvents.startAt));

    return rows;
  }

  async findOne(id: string) {
    const row = await this.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!row) {
      throw new NotFoundException(`Agenda ${id} tidak ditemukan`);
    }

    const attendees = await this.db
      .select({
        profileId: calendarEventAttendees.profileId,
        externalName: calendarEventAttendees.externalName,
        rsvpStatus: calendarEventAttendees.rsvpStatus,
        isOptional: calendarEventAttendees.isOptional,
        fullName: profiles.fullName,
      })
      .from(calendarEventAttendees)
      .leftJoin(profiles, eq(profiles.id, calendarEventAttendees.profileId))
      .where(eq(calendarEventAttendees.eventId, id));

    return { ...row, attendees };
  }

  async create(
    dto: CreateCalendarEventDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const [row] = await this.db
      .insert(calendarEvents)
      .values({
        title: dto.title,
        eventType: dto.eventType,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        timezone: dto.timezone,
        allDay: dto.allDay,
        location: dto.location,
        meetingLink: dto.meetingLink,
        agenda: dto.agenda,
        visibility: dto.visibility,
        recurrenceRule: dto.recurrenceRule,
        recurrenceEndDate: dto.recurrenceEndDate ? dto.recurrenceEndDate : null,
        recurrenceParentId: dto.recurrenceParentId,
        divisionId: dto.divisionId,
        clusterId: dto.clusterId,
        subunitId: dto.subunitId,
        linkedWorkItemId: dto.linkedWorkItemId,
        linkedMeetingId: dto.linkedMeetingId,
        organizerId: actor.id,
        createdBy: actor.id,
      })
      .returning({ id: calendarEvents.id, version: calendarEvents.version });

    if (!row) throw new Error('Gagal membuat agenda');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'calendarEvents',
      entityId: row.id,
      afterData: {
        title: dto.title,
      },
    });

    return row;
  }

  async update(
    id: string,
    dto: UpdateCalendarEventDto,
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
        .select({ version: calendarEvents.version })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt)))
        .limit(1)
        .then((res) => res[0]);

      if (!current) {
        throw new NotFoundException(`Agenda ${id} tidak ditemukan`);
      }
      if (current.version !== version) {
        throw new ConflictException('Data telah diubah pihak lain');
      }

      const updates: Record<string, unknown> = { ...dto, version: version + 1 };
      if (dto.startAt) updates.startAt = new Date(dto.startAt);
      if (dto.endAt) updates.endAt = new Date(dto.endAt);
      if (dto.recurrenceEndDate)
        updates.recurrenceEndDate = new Date(dto.recurrenceEndDate);

      const [updated] = await tx
        .update(calendarEvents)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .set(updates as any)
        .where(eq(calendarEvents.id, id))
        .returning({ version: calendarEvents.version });

      await this.audit.record({
        ...context,
        action: 'update',
        entityType: 'calendarEvents',
        entityId: id,
        afterData: dto as unknown as Record<string, unknown>,
      });

      return updated;
    });

    return result;
  }

  async remove(id: string, context: WriteContext) {
    const current = await this.db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Agenda ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(calendarEvents)
        .set({ deletedAt: new Date() })
        .where(eq(calendarEvents.id, id));

      await this.audit.record({
        ...context,
        action: 'delete',
        entityType: 'calendarEvents',
        entityId: id,
      });
    });
  }

  // RSVP Management

  async setRsvp(
    id: string,
    profileId: string,
    dto: UpdateRsvpDto,
    context: WriteContext,
  ) {
    const event = await this.db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!event) {
      throw new NotFoundException(`Agenda ${id} tidak ditemukan`);
    }

    // Check if attendee exists
    const attendee = await this.db
      .select({ profileId: calendarEventAttendees.profileId })
      .from(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.eventId, id),
          eq(calendarEventAttendees.profileId, profileId),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    if (attendee) {
      await this.db
        .update(calendarEventAttendees)
        .set({
          rsvpStatus: dto.status,
          respondedAt: new Date(),
        })
        .where(
          and(
            eq(calendarEventAttendees.eventId, id),
            eq(calendarEventAttendees.profileId, profileId),
          ),
        );
    } else {
      await this.db.insert(calendarEventAttendees).values({
        eventId: id,
        profileId,
        rsvpStatus: dto.status,
        respondedAt: new Date(),
      });
    }

    await this.audit.record({
      ...context,
      action: 'update',
      entityType: 'calendarEventAttendees',
      entityId: `${id}-${profileId}`,
      afterData: dto as unknown as Record<string, unknown>,
    });
  }
}
