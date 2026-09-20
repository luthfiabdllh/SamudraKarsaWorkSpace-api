import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { priorityLevelEnum, workStatusEnum } from '../../database/schema/enums';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_LEVEL = priorityLevelEnum.enumValues;
const WORK_STATUS = workStatusEnum.enumValues;

// ─────────────────────────────────────────────────────────────────────────────
// Milestones
// ─────────────────────────────────────────────────────────────────────────────

export const CreateMilestoneSchema = z.object({
  name: z.string().min(1, 'Nama milestone tidak boleh kosong'),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  picId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  priority: z.enum(PRIORITY_LEVEL).optional(),
  status: z.enum(WORK_STATUS).optional(),
  progressPercentage: z.number().int().min(0).max(100).optional(),
  note: z.string().nullable().optional(),
  workItemId: z.string().uuid().nullable().optional(),
});

export const UpdateMilestoneSchema = CreateMilestoneSchema.partial();

@ZodDto(CreateMilestoneSchema)
export class CreateMilestoneDto {
  declare name: string;
  declare startDate?: string | null;
  declare endDate?: string | null;
  declare picId?: string | null;
  declare divisionId?: string | null;
  declare priority?: (typeof PRIORITY_LEVEL)[number];
  declare status?: (typeof WORK_STATUS)[number];
  declare progressPercentage?: number;
  declare note?: string | null;
  declare workItemId?: string | null;
}

@ZodDto(UpdateMilestoneSchema)
export class UpdateMilestoneDto {
  declare name?: string;
  declare startDate?: string | null;
  declare endDate?: string | null;
  declare picId?: string | null;
  declare divisionId?: string | null;
  declare priority?: (typeof PRIORITY_LEVEL)[number];
  declare status?: (typeof WORK_STATUS)[number];
  declare progressPercentage?: number;
  declare note?: string | null;
  declare workItemId?: string | null;
}
