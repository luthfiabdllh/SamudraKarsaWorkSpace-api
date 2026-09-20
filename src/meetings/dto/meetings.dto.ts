import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import {
  meetingTypeEnum,
  priorityLevelEnum,
  workStatusEnum,
} from '../../database/schema/enums';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const MEETING_TYPE = meetingTypeEnum.enumValues;
const PRIORITY_LEVEL = priorityLevelEnum.enumValues;
const WORK_STATUS = workStatusEnum.enumValues;

// ─────────────────────────────────────────────────────────────────────────────
// Rapat
// ─────────────────────────────────────────────────────────────────────────────

export const CreateMeetingSchema = z.object({
  title: z.string().min(1, 'Judul rapat tidak boleh kosong'),
  meetingType: z.enum(MEETING_TYPE),
  heldAt: z.string().datetime({ message: 'Waktu pelaksanaan tidak valid' }),
  locationOrMedia: z.string().nullable().optional(),
  agenda: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  divisionId: z.string().uuid('ID Divisi tidak valid').nullable().optional(),
});

export const UpdateMeetingSchema = CreateMeetingSchema.partial();

@ZodDto(CreateMeetingSchema)
export class CreateMeetingDto {
  declare title: string;
  declare meetingType: (typeof MEETING_TYPE)[number];
  declare heldAt: string;
  declare locationOrMedia?: string | null;
  declare agenda?: string | null;
  declare summary?: string | null;
  declare divisionId?: string | null;
}

@ZodDto(UpdateMeetingSchema)
export class UpdateMeetingDto {
  declare title?: string;
  declare meetingType?: (typeof MEETING_TYPE)[number];
  declare heldAt?: string;
  declare locationOrMedia?: string | null;
  declare agenda?: string | null;
  declare summary?: string | null;
  declare divisionId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Partisipan Rapat
// ─────────────────────────────────────────────────────────────────────────────

export const SetMeetingParticipantsSchema = z.object({
  profileIds: z.array(z.string().uuid('ID Profil tidak valid')),
});

@ZodDto(SetMeetingParticipantsSchema)
export class SetMeetingParticipantsDto {
  declare profileIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Keputusan Rapat
// ─────────────────────────────────────────────────────────────────────────────

export const CreateMeetingDecisionSchema = z.object({
  decisionText: z.string().min(1, 'Keputusan tidak boleh kosong'),
  picId: z.string().uuid('ID PIC tidak valid').nullable().optional(),
  dueDate: z.string().date('Tanggal tenggat tidak valid').nullable().optional(),
  priority: z.enum(PRIORITY_LEVEL).optional(),
});

export const UpdateMeetingDecisionSchema =
  CreateMeetingDecisionSchema.partial().extend({
    status: z.enum(WORK_STATUS).optional(),
  });

@ZodDto(CreateMeetingDecisionSchema)
export class CreateMeetingDecisionDto {
  declare decisionText: string;
  declare picId?: string | null;
  declare dueDate?: string | null;
  declare priority?: (typeof PRIORITY_LEVEL)[number];
}

@ZodDto(UpdateMeetingDecisionSchema)
export class UpdateMeetingDecisionDto {
  declare decisionText?: string;
  declare picId?: string | null;
  declare dueDate?: string | null;
  declare priority?: (typeof PRIORITY_LEVEL)[number];
  declare status?: (typeof WORK_STATUS)[number];
}
