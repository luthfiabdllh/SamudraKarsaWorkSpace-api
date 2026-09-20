import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { evaluationVisibilityEnum } from '../../database/schema/enums';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const VISIBILITY = evaluationVisibilityEnum.enumValues;

// ─────────────────────────────────────────────────────────────────────────────
// Feedback
// ─────────────────────────────────────────────────────────────────────────────

export const CreateFeedbackSchema = z.object({
  category: z.string().optional(),
  visibility: z.enum(VISIBILITY).optional(),
  targetNote: z.string().nullable().optional(),
  message: z.string().min(1, 'Pesan tidak boleh kosong'),
  isPrivate: z.boolean().optional(),
});

@ZodDto(CreateFeedbackSchema)
export class CreateFeedbackDto {
  declare category?: string;
  declare visibility?: (typeof VISIBILITY)[number];
  declare targetNote?: string | null;
  declare message: string;
  declare isPrivate?: boolean;
}
