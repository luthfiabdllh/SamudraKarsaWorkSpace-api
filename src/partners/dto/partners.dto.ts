import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { partnerStatusEnum } from '../../database/schema/enums';

const PARTNER_STATUS = partnerStatusEnum.enumValues;

export const CreatePartnerSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().optional().nullable(),
  industry: z.string().trim().optional().nullable(),
  contactPerson: z.string().trim().optional().nullable(),
  contactInfo: z.string().trim().optional().nullable(),
  picId: z.string().uuid().optional().nullable(),
  relationChannel: z.string().trim().optional().nullable(),
  targetSupport: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  agreedValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  fundReceived: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  inKindSupport: z.string().trim().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
});

@ZodDto(CreatePartnerSchema)
export class CreatePartnerDto {
  declare name: string;
  declare category?: string | null;
  declare industry?: string | null;
  declare contactPerson?: string | null;
  declare contactInfo?: string | null;
  declare picId?: string | null;
  declare relationChannel?: string | null;
  declare targetSupport?: string | null;
  declare agreedValue?: string | null;
  declare fundReceived?: string;
  declare inKindSupport?: string | null;
  declare programId?: string | null;
  declare periodId?: string | null;
}

export const UpdatePartnerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().optional().nullable(),
    industry: z.string().trim().optional().nullable(),
    contactPerson: z.string().trim().optional().nullable(),
    contactInfo: z.string().trim().optional().nullable(),
    picId: z.string().uuid().optional().nullable(),
    relationChannel: z.string().trim().optional().nullable(),
    targetSupport: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
    agreedValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
    fundReceived: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    inKindSupport: z.string().trim().optional().nullable(),
    proposalUrl: z.string().url().optional().nullable(),
    coverLetterUrl: z.string().url().optional().nullable(),
    mouUrl: z.string().url().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Setidaknya satu medan harus dikirim.' });

@ZodDto(UpdatePartnerSchema)
export class UpdatePartnerDto {
  declare name?: string;
  declare category?: string | null;
  declare industry?: string | null;
  declare contactPerson?: string | null;
  declare contactInfo?: string | null;
  declare picId?: string | null;
  declare relationChannel?: string | null;
  declare targetSupport?: string | null;
  declare agreedValue?: string | null;
  declare fundReceived?: string;
  declare inKindSupport?: string | null;
  declare proposalUrl?: string | null;
  declare coverLetterUrl?: string | null;
  declare mouUrl?: string | null;
}

export const TransitionPartnerSchema = z.object({
  to: z.enum(PARTNER_STATUS),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionPartnerSchema)
export class TransitionPartnerDto {
  declare to: (typeof PARTNER_STATUS)[number];
  declare note?: string | null;
}

export const AddFollowupSchema = z.object({
  followupNote: z.string().trim().min(1),
});

@ZodDto(AddFollowupSchema)
export class AddFollowupDto {
  declare followupNote: string;
}

export const AddBenefitSchema = z.object({
  benefitDescription: z.string().trim().min(1),
  deadline: z.string().date().optional().nullable(),
  status: z.string().trim().optional(),
  proofUrl: z.string().url().optional().nullable(),
});

@ZodDto(AddBenefitSchema)
export class AddBenefitDto {
  declare benefitDescription: string;
  declare deadline?: string | null;
  declare status?: string;
  declare proofUrl?: string | null;
}

export const UpdateBenefitSchema = AddBenefitSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Setidaknya satu medan harus dikirim.' }
);

@ZodDto(UpdateBenefitSchema)
export class UpdateBenefitDto {
  declare benefitDescription?: string;
  declare deadline?: string | null;
  declare status?: string;
  declare proofUrl?: string | null;
}

export const ListPartnersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(PARTNER_STATUS).optional(),
  periodId: z.string().uuid().optional(),
  picId: z.string().uuid().optional(),
});

@ZodDto(ListPartnersQuerySchema)
export class ListPartnersQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof PARTNER_STATUS)[number];
  declare periodId?: string;
  declare picId?: string;
}
