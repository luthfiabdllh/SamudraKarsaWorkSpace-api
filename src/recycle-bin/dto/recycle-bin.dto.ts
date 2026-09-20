import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

export const HardDeleteSchema = z.object({
  password: z.string().min(1, 'Password diperlukan untuk menghapus permanen.'),
});

@ZodDto(HardDeleteSchema)
export class HardDeleteDto {
  declare password?: string;
}
