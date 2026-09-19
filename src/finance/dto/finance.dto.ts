import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import {
  budgetStatusEnum,
  transactionTypeEnum,
} from '../../database/schema/enums';

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata
// ─────────────────────────────────────────────────────────────────────────────

const BUDGET_STATUS = budgetStatusEnum.enumValues;
const TRANSACTION_TYPE = transactionTypeEnum.enumValues;

// ─────────────────────────────────────────────────────────────────────────────
// Anggaran (RAB)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateBudgetSchema = z.object({
  title: z.string().trim().min(1),
  divisionId: z.string().uuid().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  subunitId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),
});

@ZodDto(CreateBudgetSchema)
export class CreateBudgetDto {
  declare title: string;
  declare divisionId?: string | null;
  declare programId?: string | null;
  declare subunitId?: string | null;
  declare periodId?: string | null;
}

export const UpdateBudgetSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    divisionId: z.string().uuid().optional().nullable(),
    programId: z.string().uuid().optional().nullable(),
    subunitId: z.string().uuid().optional().nullable(),
    reviewNote: z.string().trim().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateBudgetSchema)
export class UpdateBudgetDto {
  declare title?: string;
  declare divisionId?: string | null;
  declare programId?: string | null;
  declare subunitId?: string | null;
  declare reviewNote?: string | null;
}

export const TransitionBudgetSchema = z.object({
  to: z.enum(BUDGET_STATUS),
  reviewNote: z.string().trim().optional().nullable(),
});

@ZodDto(TransitionBudgetSchema)
export class TransitionBudgetDto {
  declare to: (typeof BUDGET_STATUS)[number];
  declare reviewNote?: string | null;
}

export const ListBudgetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(BUDGET_STATUS).optional(),
  divisionId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
});

@ZodDto(ListBudgetsQuerySchema)
export class ListBudgetsQueryDto {
  declare limit: number;
  declare offset: number;
  declare status?: (typeof BUDGET_STATUS)[number];
  declare divisionId?: string;
  declare periodId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rincian anggaran (budget_items)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateBudgetItemSchema = z.object({
  label: z.string().trim().min(1),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Jumlah harus berupa angka positif.')
    .default('1'),
  unit: z.string().trim().optional().nullable(),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Harga harus berupa angka positif.')
    .default('0'),
  plannedTotal: z.string().regex(/^\d+(\.\d{1,2})?$/),
  sortOrder: z.number().int().default(0),
});

@ZodDto(CreateBudgetItemSchema)
export class CreateBudgetItemDto {
  declare label: string;
  declare quantity: string;
  declare unit?: string | null;
  declare unitPrice: string;
  declare plannedTotal: string;
  declare sortOrder: number;
}

export const UpdateBudgetItemSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    quantity: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    unit: z.string().trim().optional().nullable(),
    unitPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    realizedTotal: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateBudgetItemSchema)
export class UpdateBudgetItemDto {
  declare label?: string;
  declare quantity?: string;
  declare unit?: string | null;
  declare unitPrice?: string;
  declare realizedTotal?: string;
  declare sortOrder?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaksi
// ─────────────────────────────────────────────────────────────────────────────

export const CreateTransactionSchema = z.object({
  transactionType: z.enum(TRANSACTION_TYPE),
  category: z.string().trim().min(1),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Jumlah harus berupa angka positif.'),
  transactionDate: z
    .string()
    .date('Format tanggal harus YYYY-MM-DD.')
    .optional(),

  picId: z.string().uuid().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  budgetId: z.string().uuid().optional().nullable(),
  periodId: z.string().uuid().optional().nullable(),

  counterparty: z.string().trim().optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),
  proofUrl: z.string().url('URL bukti tidak valid.').optional().nullable(),
});

@ZodDto(CreateTransactionSchema)
export class CreateTransactionDto {
  declare transactionType: (typeof TRANSACTION_TYPE)[number];
  declare category: string;
  declare amount: string;
  declare transactionDate?: string;
  declare picId?: string | null;
  declare programId?: string | null;
  declare budgetId?: string | null;
  declare periodId?: string | null;
  declare counterparty?: string | null;
  declare paymentMethod?: string | null;
  declare proofUrl?: string | null;
}

export const UpdateTransactionSchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    transactionDate: z.string().date().optional(),
    picId: z.string().uuid().optional().nullable(),
    programId: z.string().uuid().optional().nullable(),
    budgetId: z.string().uuid().optional().nullable(),
    counterparty: z.string().trim().optional().nullable(),
    paymentMethod: z.string().trim().optional().nullable(),
    proofUrl: z.string().url().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Setidaknya satu medan harus dikirim.',
  });

@ZodDto(UpdateTransactionSchema)
export class UpdateTransactionDto {
  declare category?: string;
  declare amount?: string;
  declare transactionDate?: string;
  declare picId?: string | null;
  declare programId?: string | null;
  declare budgetId?: string | null;
  declare counterparty?: string | null;
  declare paymentMethod?: string | null;
  declare proofUrl?: string | null;
}

export const ListTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  transactionType: z.enum(TRANSACTION_TYPE).optional(),
  budgetId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
  verified: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

@ZodDto(ListTransactionsQuerySchema)
export class ListTransactionsQueryDto {
  declare limit: number;
  declare offset: number;
  declare transactionType?: (typeof TRANSACTION_TYPE)[number];
  declare budgetId?: string;
  declare periodId?: string;
  declare verified?: boolean;
}
