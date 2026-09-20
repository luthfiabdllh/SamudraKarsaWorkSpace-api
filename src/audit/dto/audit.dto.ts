import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

export const ListAuditSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  entityType: z.string().trim().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().optional(),
});

@ZodDto(ListAuditSchema)
export class ListAuditDto {
  declare limit?: number;
  declare offset?: number;
  declare entityType?: string;
  declare entityId?: string;
  declare actorId?: string;
  declare action?: string;
}
