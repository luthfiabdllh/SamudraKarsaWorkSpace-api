import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { duesStatusEnum } from '../../database/schema/enums';

const DUES_STATUS = duesStatusEnum.enumValues;

export const CreateDuesSchema = z.object({
  profileId: z.string().uuid(),
  title: z.string().trim().min(1),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Nominal harus angka.'),
  dueDate: z
    .string()
    .date('Format tanggal harus YYYY-MM-DD.')
    .optional()
    .nullable(),
  periodId: z.string().uuid(),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(CreateDuesSchema)
export class CreateDuesDto {
  declare profileId: string;
  declare title: string;
  declare targetAmount: string;
  declare dueDate?: string | null;
  declare periodId: string;
  declare note?: string | null;
}

export const UpdateDuesSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    targetAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    dueDate: z.string().date().optional().nullable(),
    periodId: z.string().uuid().optional().nullable(),
    note: z.string().trim().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateDuesSchema)
export class UpdateDuesDto {
  declare title?: string;
  declare targetAmount?: string;
  declare dueDate?: string | null;
  declare periodId?: string | null;
  declare note?: string | null;
}

export const AddPaymentSchema = z.object({
  profileId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  paidAt: z.string().date().optional(),
  proofUrl: z.string().url().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(AddPaymentSchema)
export class AddPaymentDto {
  declare profileId: string;
  declare amount: string;
  declare paidAt?: string;
  declare proofUrl?: string | null;
  declare note?: string | null;
}

export const ListDuesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  periodId: z.string().uuid().optional(),
  status: z.enum(DUES_STATUS).optional(),
});

@ZodDto(ListDuesQuerySchema)
export class ListDuesQueryDto {
  declare limit: number;
  declare offset: number;
  declare periodId?: string;
  declare status?: (typeof DUES_STATUS)[number];
}
