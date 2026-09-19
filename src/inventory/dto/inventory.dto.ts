import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { inventoryMovementTypeEnum } from '../../database/schema/enums';

const MOVEMENT_TYPE = inventoryMovementTypeEnum.enumValues;

export const CreateInventoryItemSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
  initialStock: z.coerce.number().int().default(0),
  picId: z.string().uuid().optional().nullable(),
  divisionId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
  storageLocation: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(CreateInventoryItemSchema)
export class CreateInventoryItemDto {
  declare name: string;
  declare category?: string | null;
  declare unit?: string | null;
  declare initialStock: number;
  declare picId?: string | null;
  declare divisionId?: string | null;
  declare periodId?: string | null;
  declare storageLocation?: string | null;
  declare note?: string | null;
}

export const UpdateInventoryItemSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().optional().nullable(),
    unit: z.string().trim().optional().nullable(),
    picId: z.string().uuid().optional().nullable(),
    storageLocation: z.string().trim().optional().nullable(),
    note: z.string().trim().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Setidaknya satu medan harus dikirim.' });

@ZodDto(UpdateInventoryItemSchema)
export class UpdateInventoryItemDto {
  declare name?: string;
  declare category?: string | null;
  declare unit?: string | null;
  declare picId?: string | null;
  declare storageLocation?: string | null;
  declare note?: string | null;
}

export const AddMovementSchema = z.object({
  movementType: z.enum(MOVEMENT_TYPE),
  quantity: z.number().int().refine((q) => q !== 0, {
    message: 'Jumlah tidak boleh nol. Gunakan angka positif untuk masuk, negatif untuk keluar.',
  }),
  movementDate: z.string().datetime().optional(),
  movedBy: z.string().uuid().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(AddMovementSchema)
export class AddMovementDto {
  declare movementType: (typeof MOVEMENT_TYPE)[number];
  declare quantity: number;
  declare movementDate?: string;
  declare movedBy?: string | null;
  declare note?: string | null;
}

export const ListInventoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.string().trim().optional(),
  periodId: z.string().uuid().optional(),
  picId: z.string().uuid().optional(),
});

@ZodDto(ListInventoryQuerySchema)
export class ListInventoryQueryDto {
  declare limit: number;
  declare offset: number;
  declare category?: string;
  declare periodId?: string;
  declare picId?: string;
}
