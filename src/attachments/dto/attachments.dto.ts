import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Lampiran (Attachments)
// ─────────────────────────────────────────────────────────────────────────────

export const RequestPresignedUrlSchema = z.object({
  entityType: z.string().min(1, 'Entity type tidak boleh kosong'),
  entityId: z.string().uuid('Entity ID tidak valid'),
  fileName: z.string().min(1, 'File name tidak boleh kosong'),
  mimeType: z.string().optional(),
  fileSize: z.number().int().min(1).optional(),
});

@ZodDto(RequestPresignedUrlSchema)
export class RequestPresignedUrlDto {
  declare entityType: string;
  declare entityId: string;
  declare fileName: string;
  declare mimeType?: string;
  declare fileSize?: number;
}
