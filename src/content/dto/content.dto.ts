import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

const CONTENT_STATUS = [
  'idea',
  'brief',
  'copywriting',
  'visual_request',
  'production',
  'review',
  'scheduled',
  'published',
  'evaluation',
] as const;

export const CreateContentSchema = z.object({
  title: z.string().trim().min(1),
  platform: z.string().trim().optional().nullable(),
  plannedDate: z.string().date().optional().nullable(),
  picId: z.string().uuid().optional().nullable(),
  brief: z.string().trim().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
});

@ZodDto(CreateContentSchema)
export class CreateContentDto {
  declare title: string;
  declare platform?: string | null;
  declare plannedDate?: string | null;
  declare picId?: string | null;
  declare brief?: string | null;
  declare programId?: string | null;
  declare periodId?: string | null;
}

export const UpdateContentSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    platform: z.string().trim().optional().nullable(),
    plannedDate: z.string().date().optional().nullable(),
    picId: z.string().uuid().optional().nullable(),
    brief: z.string().trim().optional().nullable(),
    publishedUrl: z.string().url().optional().nullable(),
    programId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateContentSchema)
export class UpdateContentDto {
  declare title?: string;
  declare platform?: string | null;
  declare plannedDate?: string | null;
  declare picId?: string | null;
  declare brief?: string | null;
  declare publishedUrl?: string | null;
  declare programId?: string | null;
}

export const TransitionContentSchema = z.object({
  to: z.enum(CONTENT_STATUS),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionContentSchema)
export class TransitionContentDto {
  declare to: (typeof CONTENT_STATUS)[number];
  declare note?: string | null;
}

export const ListContentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(CONTENT_STATUS).optional(),
  periodId: z.string().uuid().optional(),
  platform: z.string().trim().optional(),
  picId: z.string().uuid().optional(),
});

@ZodDto(ListContentQuerySchema)
export class ListContentQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof CONTENT_STATUS)[number];
  declare periodId?: string;
  declare platform?: string;
  declare picId?: string;
}
