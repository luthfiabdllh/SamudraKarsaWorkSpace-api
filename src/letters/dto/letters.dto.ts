import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { letterDirectionEnum, letterStatusEnum } from '../../database/schema/enums';

const LETTER_DIRECTION = letterDirectionEnum.enumValues;
const LETTER_STATUS = letterStatusEnum.enumValues;

export const CreateLetterSchema = z.object({
  letterKind: z.string().trim().min(1).max(20),
  direction: z.enum(LETTER_DIRECTION).default('outbound'),
  subject: z.string().trim().min(1),
  senderRecipient: z.string().trim().optional().nullable(),
  institution: z.string().trim().optional().nullable(),
  letterDate: z.string().date('Format tanggal harus YYYY-MM-DD.').optional().nullable(),
  dueDate: z.string().date('Format tanggal harus YYYY-MM-DD.').optional().nullable(),
  picId: z.string().uuid().optional().nullable(),
  signerName: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  requestId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
});

@ZodDto(CreateLetterSchema)
export class CreateLetterDto {
  declare letterKind: string;
  declare direction: (typeof LETTER_DIRECTION)[number];
  declare subject: string;
  declare senderRecipient?: string | null;
  declare institution?: string | null;
  declare letterDate?: string | null;
  declare dueDate?: string | null;
  declare picId?: string | null;
  declare signerName?: string | null;
  declare note?: string | null;
  declare programId?: string | null;
  declare requestId?: string | null;
  declare periodId?: string | null;
}

export const UpdateLetterSchema = z
  .object({
    subject: z.string().trim().min(1).optional(),
    senderRecipient: z.string().trim().optional().nullable(),
    institution: z.string().trim().optional().nullable(),
    letterDate: z.string().date().optional().nullable(),
    dueDate: z.string().date().optional().nullable(),
    picId: z.string().uuid().optional().nullable(),
    signerName: z.string().trim().optional().nullable(),
    note: z.string().trim().optional().nullable(),
    programId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateLetterSchema)
export class UpdateLetterDto {
  declare subject?: string;
  declare senderRecipient?: string | null;
  declare institution?: string | null;
  declare letterDate?: string | null;
  declare dueDate?: string | null;
  declare picId?: string | null;
  declare signerName?: string | null;
  declare note?: string | null;
  declare programId?: string | null;
}

export const TransitionLetterSchema = z.object({
  to: z.enum(LETTER_STATUS),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionLetterSchema)
export class TransitionLetterDto {
  declare to: (typeof LETTER_STATUS)[number];
  declare note?: string | null;
}

export const ListLettersQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LETTER_STATUS).optional(),
  direction: z.enum(LETTER_DIRECTION).optional(),
  periodId: z.string().uuid().optional(),
  picId: z.string().uuid().optional(),
});

@ZodDto(ListLettersQuerySchema)
export class ListLettersQueryDto {
  declare cursor?: string;
  declare limit: number;
  declare status?: (typeof LETTER_STATUS)[number];
  declare direction?: (typeof LETTER_DIRECTION)[number];
  declare periodId?: string;
  declare picId?: string;
}
