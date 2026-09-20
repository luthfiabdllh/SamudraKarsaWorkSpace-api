import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Pengumuman
// ─────────────────────────────────────────────────────────────────────────────

export const CreateAnnouncementSchema = z.object({
  title: z.string().min(1, 'Judul pengumuman tidak boleh kosong'),
  body: z.string().min(1, 'Isi pengumuman tidak boleh kosong'),
  pinned: z.boolean().optional(),
  divisionId: z.string().uuid().nullable().optional(),
});

export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial();

@ZodDto(CreateAnnouncementSchema)
export class CreateAnnouncementDto {
  declare title: string;
  declare body: string;
  declare pinned?: boolean;
  declare divisionId?: string | null;
}

@ZodDto(UpdateAnnouncementSchema)
export class UpdateAnnouncementDto {
  declare title?: string;
  declare body?: string;
  declare pinned?: boolean;
  declare divisionId?: string | null;
}
