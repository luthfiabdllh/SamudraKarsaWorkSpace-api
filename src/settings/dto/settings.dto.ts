import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

export const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

@ZodDto(UpdateSettingSchema)
export class UpdateSettingDto {
  declare value: unknown;
}
