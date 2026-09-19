import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';

const CREATIVE_STATUS = [
  'request_received',
  'brief',
  'queued',
  'production',
  'draft',
  'review',
  'revision',
  'final',
  'done',
] as const;

export const CreateCreativeSchema = z.object({
  title: z.string().trim().min(1),
  creativeKind: z.string().trim().min(1),
  requesterId: z.string().uuid().optional().nullable(),
  picId: z.string().uuid().optional().nullable(),
  brief: z.string().trim().optional().nullable(),
  specNote: z.string().trim().optional().nullable(),
  referenceUrl: z.string().url().optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  requestId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
});

@ZodDto(CreateCreativeSchema)
export class CreateCreativeDto {
  declare title: string;
  declare creativeKind: string;
  declare requesterId?: string | null;
  declare picId?: string | null;
  declare brief?: string | null;
  declare specNote?: string | null;
  declare referenceUrl?: string | null;
  declare dueDate?: string | null;
  declare requestId?: string | null;
  declare periodId?: string | null;
}

export const UpdateCreativeSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    creativeKind: z.string().trim().min(1).optional(),
    picId: z.string().uuid().optional().nullable(),
    brief: z.string().trim().optional().nullable(),
    specNote: z.string().trim().optional().nullable(),
    referenceUrl: z.string().url().optional().nullable(),
    dueDate: z.string().date().optional().nullable(),
    finalFileUrl: z.string().url().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateCreativeSchema)
export class UpdateCreativeDto {
  declare title?: string;
  declare creativeKind?: string;
  declare picId?: string | null;
  declare brief?: string | null;
  declare specNote?: string | null;
  declare referenceUrl?: string | null;
  declare dueDate?: string | null;
  declare requestId?: string | null;
}

export const TransitionCreativeSchema = z.object({
  to: z.enum(CREATIVE_STATUS),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionCreativeSchema)
export class TransitionCreativeDto {
  declare to: (typeof CREATIVE_STATUS)[number];
  declare note?: string | null;
  declare finalFileUrl?: string | null;
}

export const ListCreativeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(CREATIVE_STATUS).optional(),
  periodId: z.string().uuid().optional(),
  picId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
});

@ZodDto(ListCreativeQuerySchema)
export class ListCreativeQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof CREATIVE_STATUS)[number];
  declare periodId?: string;
  declare picId?: string;
  declare requestId?: string;
}
