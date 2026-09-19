import { z } from 'zod';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const SHIPMENT_STATUS = ['processing', 'shipped', 'delivered', 'returned', 'cancelled'] as const;
const TRIP_STATUS = ['planned', 'ongoing', 'completed', 'cancelled'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pengiriman (Shipments)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateShipmentSchema = z.object({
  packageName: z.string().trim().min(1),
  contentNote: z.string().trim().optional().nullable(),
  weightKg: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  dimensionNote: z.string().trim().optional().nullable(),
  origin: z.string().trim().optional().nullable(),
  destination: z.string().trim().optional().nullable(),
  senderName: z.string().trim().optional().nullable(),
  recipientName: z.string().trim().optional().nullable(),
  expedition: z.string().trim().optional().nullable(),
  trackingNumber: z.string().trim().optional().nullable(),
  scheduledAt: z.string().date().optional().nullable(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
});

@ZodDto(CreateShipmentSchema)
export class CreateShipmentDto {
  declare packageName: string;
  declare contentNote?: string | null;
  declare weightKg?: string | null;
  declare dimensionNote?: string | null;
  declare origin?: string | null;
  declare destination?: string | null;
  declare senderName?: string | null;
  declare recipientName?: string | null;
  declare expedition?: string | null;
  declare trackingNumber?: string | null;
  declare scheduledAt?: string | null;
  declare cost?: string | null;
}

export const UpdateShipmentSchema = z
  .object({
    packageName: z.string().trim().min(1).optional(),
    contentNote: z.string().trim().optional().nullable(),
    weightKg: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
    dimensionNote: z.string().trim().optional().nullable(),
    origin: z.string().trim().optional().nullable(),
    destination: z.string().trim().optional().nullable(),
    senderName: z.string().trim().optional().nullable(),
    recipientName: z.string().trim().optional().nullable(),
    expedition: z.string().trim().optional().nullable(),
    trackingNumber: z.string().trim().optional().nullable(),
    scheduledAt: z.string().date().optional().nullable(),
    cost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
    packagingPhotoUrl: z.string().url().optional().nullable(),
    handoverProofUrl: z.string().url().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateShipmentSchema)
export class UpdateShipmentDto {
  declare packageName?: string;
  declare contentNote?: string | null;
  declare weightKg?: string | null;
  declare dimensionNote?: string | null;
  declare origin?: string | null;
  declare destination?: string | null;
  declare senderName?: string | null;
  declare recipientName?: string | null;
  declare expedition?: string | null;
  declare trackingNumber?: string | null;
  declare scheduledAt?: string | null;
  declare cost?: string | null;
  declare packagingPhotoUrl?: string | null;
  declare handoverProofUrl?: string | null;
}

export const TransitionShipmentSchema = z.object({
  to: z.enum(SHIPMENT_STATUS),
});

@ZodDto(TransitionShipmentSchema)
export class TransitionShipmentDto {
  declare to: (typeof SHIPMENT_STATUS)[number];
}

export const ListShipmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(SHIPMENT_STATUS).optional(),
});

@ZodDto(ListShipmentsQuerySchema)
export class ListShipmentsQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof SHIPMENT_STATUS)[number];
}

// ─────────────────────────────────────────────────────────────────────────────
// Perjalanan / Kendaraan (Trips)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateTripSchema = z.object({
  tripKind: z.string().trim().min(1),
  title: z.string().trim().min(1),
  scheduledAt: z.string().datetime().optional().nullable(),
  vehicleNote: z.string().trim().optional().nullable(),
  picId: z.string().uuid().optional().nullable(),
  passengerCount: z.number().int().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(CreateTripSchema)
export class CreateTripDto {
  declare tripKind: string;
  declare title: string;
  declare scheduledAt?: string | null;
  declare vehicleNote?: string | null;
  declare picId?: string | null;
  declare passengerCount?: number | null;
  declare note?: string | null;
}

export const UpdateTripSchema = z
  .object({
    tripKind: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    vehicleNote: z.string().trim().optional().nullable(),
    picId: z.string().uuid().optional().nullable(),
    passengerCount: z.number().int().optional().nullable(),
    note: z.string().trim().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateTripSchema)
export class UpdateTripDto {
  declare tripKind?: string;
  declare title?: string;
  declare scheduledAt?: string | null;
  declare vehicleNote?: string | null;
  declare picId?: string | null;
  declare passengerCount?: number | null;
  declare note?: string | null;
}

export const TransitionTripSchema = z.object({
  to: z.enum(TRIP_STATUS),
  note: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionTripSchema)
export class TransitionTripDto {
  declare to: (typeof TRIP_STATUS)[number];
  declare note?: string | null;
}

export const ListTripsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(TRIP_STATUS).optional(),
  picId: z.string().uuid().optional(),
});

@ZodDto(ListTripsQuerySchema)
export class ListTripsQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof TRIP_STATUS)[number];
  declare picId?: string;
}
