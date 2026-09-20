import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import {
  calendarEventTypeEnum,
  rsvpStatusEnum,
} from '../../database/schema/enums';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const CALENDAR_EVENT_TYPE = calendarEventTypeEnum.enumValues;
const RSVP_STATUS = rsvpStatusEnum.enumValues;

// ─────────────────────────────────────────────────────────────────────────────
// Kalender (Event)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateCalendarEventSchema = z.object({
  title: z.string().min(1, 'Judul tidak boleh kosong'),
  eventType: z.enum(CALENDAR_EVENT_TYPE).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().nullable().optional(),
  meetingLink: z.string().nullable().optional(),
  agenda: z.string().nullable().optional(),
  visibility: z.string().optional(),

  recurrenceRule: z.string().nullable().optional(),
  recurrenceEndDate: z.string().date().nullable().optional(),
  recurrenceParentId: z.string().uuid().nullable().optional(),

  divisionId: z.string().uuid().nullable().optional(),
  clusterId: z.string().uuid().nullable().optional(),
  subunitId: z.string().uuid().nullable().optional(),

  linkedWorkItemId: z.string().uuid().nullable().optional(),
  linkedMeetingId: z.string().uuid().nullable().optional(),
});

export const UpdateCalendarEventSchema =
  CreateCalendarEventSchema.partial().extend({
    isCancelled: z.boolean().optional(),
  });

@ZodDto(CreateCalendarEventSchema)
export class CreateCalendarEventDto {
  declare title: string;
  declare eventType?: (typeof CALENDAR_EVENT_TYPE)[number];
  declare startAt: string;
  declare endAt: string;
  declare timezone?: string;
  declare allDay?: boolean;
  declare location?: string | null;
  declare meetingLink?: string | null;
  declare agenda?: string | null;
  declare visibility?: string;

  declare recurrenceRule?: string | null;
  declare recurrenceEndDate?: string | null;
  declare recurrenceParentId?: string | null;

  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;

  declare linkedWorkItemId?: string | null;
  declare linkedMeetingId?: string | null;
}

@ZodDto(UpdateCalendarEventSchema)
export class UpdateCalendarEventDto {
  declare title?: string;
  declare eventType?: (typeof CALENDAR_EVENT_TYPE)[number];
  declare startAt?: string;
  declare endAt?: string;
  declare timezone?: string;
  declare allDay?: boolean;
  declare location?: string | null;
  declare meetingLink?: string | null;
  declare agenda?: string | null;
  declare visibility?: string;

  declare recurrenceRule?: string | null;
  declare recurrenceEndDate?: string | null;
  declare recurrenceParentId?: string | null;

  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;

  declare linkedWorkItemId?: string | null;
  declare linkedMeetingId?: string | null;

  declare isCancelled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kalender RSVP (Event Attendees)
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateRsvpSchema = z.object({
  status: z.enum(RSVP_STATUS),
  note: z.string().nullable().optional(),
});

@ZodDto(UpdateRsvpSchema)
export class UpdateRsvpDto {
  declare status: (typeof RSVP_STATUS)[number];
  declare note?: string | null;
}
