import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Notifikasi
// ─────────────────────────────────────────────────────────────────────────────

export const ListNotificationsQuerySchema = z.object({
  since: z.string().datetime().optional(),
});

@ZodDto(ListNotificationsQuerySchema)
export class ListNotificationsQueryDto {
  declare since?: string;
}
