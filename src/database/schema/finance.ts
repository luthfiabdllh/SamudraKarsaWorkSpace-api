import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, timestamps, hidingColumns, version } from './_columns';
import { budgetStatusEnum, duesStatusEnum, transactionTypeEnum } from './enums';
import {
  divisions,
  periods,
  programs,
  profiles,
  subunits,
} from './organization';

/**
 * Keuangan — iuran anggota, anggaran, dan transaksi.
 *
 * ## Kenapa satu berkas
 *
 * `transactions` menunjuk `budgets`, `budget_items` menunjuk `budgets`, dan
 * ketiganya dipakai bersama oleh laporan yang sama. Memisahkannya ke tiga
 * berkas berarti tiga berkas yang saling mengimpor untuk satu laporan.
 *
 * ## Modul ini yang paling berubah tingkat keterbukaannya
 *
 * Di `sksks` kelima tabel keuangan berada di grup RLS "open collaboration" yang
 * sama dengan tabel tugas — **setiap anggota aktif bisa membacanya** (temuan
 * #2). `PRD-REVAMP.md` meminta owner dan co-owner saja, dengan **404** untuk
 * yang lain. Perubahan tingkat keterbukaan itu tidak terlihat sama sekali di
 * berkas ini: skema tidak menyimpan siapa yang boleh membaca apa. Yang menyimpan
 * itu adalah matriks izin di `src/policy/`, dan justru karena itu ia harus
 * disebut di sini — tabel yang tidak berubah bisa berubah artinya sepenuhnya
 * hanya karena barisnya berpindah di matriks.
 */

/**
 * Iuran wajib anggota.
 *
 * ## Yang berubah dari `sksks`
 *
 * **Satu baris per (anggota, periode).** `sksks` memberi `profile_id` sebuah
 * `unique` tunggal, sehingga seorang anggota hanya punya **satu** baris iuran
 * seumur hidupnya. Itu terlihat benar selama hanya ada satu periode KKN, dan
 * menjadi salah begitu ada periode kedua: iuran periode lama dan periode baru
 * akan bertabrakan di baris yang sama, dan tidak ada cara membedakan mana yang
 * sudah lunas.
 *
 * Keputusan 20 meminta periode menjadi kolom justru untuk pertanyaan seperti
 * ini. Kuncinya sekarang `(profile_id, period_id)`.
 *
 * **`target_amount` tidak lagi punya nilai bawaan 4.000.000 di sini.** Nilainya
 * berasal dari `system_settings` saat barisnya dibuat (`sksks` melakukannya
 * lewat trigger, dengan cadangan 4.000.000 kalau kuncinya tidak ada). Nilai
 * bawaan yang tertulis di skema membuat perubahan nominal iuran menuntut
 * migrasi, padahal itu keputusan organisasi yang berubah tiap tahun.
 *
 * `paid_amount` dan `status` **disimpan meskipun keduanya bisa dihitung** dari
 * `member_payments`. Alasannya sama dengan `budget_items.planned_total`: daftar
 * iuran seluruh anggota adalah layar yang paling sering dibuka bendahara, dan
 * menghitungnya lewat agregat berarti satu join dan satu pengelompokan pada
 * setiap pembukaan. Keduanya diisi aplikasi di dalam transaksi yang sama dengan
 * pembayarannya — sehingga tidak ada saat di mana angkanya berbeda dari
 * baris-barisnya.
 */
export const memberDues = pgTable(
  'member_dues',
  {
    id: primaryId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),

    targetAmount: numeric('target_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    status: duesStatusEnum('status').notNull().default('unpaid'),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('member_dues_member_period_key').on(t.profileId, t.periodId),
    index('member_dues_status_idx').on(t.status),
    index('member_dues_period_idx').on(t.periodId),
    check('member_dues_amounts_not_negative', sql`paid_amount >= 0`),
  ],
);

/**
 * Pembayaran iuran.
 *
 * Beberapa baris per iuran — iuran boleh dicicil, dan itu memang cara kerjanya.
 * `status = 'installment'` pada baris induknya diturunkan dari jumlah baris di
 * sini, bukan diketik manual.
 *
 * `amount > 0` adalah satu-satunya pemeriksaan yang **disalin** dari `sksks`,
 * dan disalin apa adanya: pembayaran bernilai nol atau negatif selalu berarti
 * salah input, dan tidak ada alur yang membutuhkannya.
 */
export const memberPayments = pgTable(
  'member_payments',
  {
    id: primaryId(),
    memberDuesId: uuid('member_dues_id')
      .notNull()
      .references(() => memberDues.id, { onDelete: 'cascade' }),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    paidAt: date('paid_at').notNull().defaultNow(),

    proofUrl: text('proof_url'),

    /**
     * Verifikasi dua langkah seperti di `sksks`: bendahara menandai, dan
     * tercatat siapa yang menandai. `verified_by` sengaja tidak
     * `on delete set null` di `sksks` — di sini dikembalikan ke `set null`,
     * karena menghapus akun bendahara tidak boleh menghapus catatan bahwa
     * pembayarannya **sudah** diverifikasi.
     */
    verified: boolean('verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    note: text('note'),

    ...timestamps(),
  },
  (t) => [
    index('member_payments_dues_idx').on(t.memberDuesId),
    index('member_payments_verified_idx').on(t.verified),
    check('member_payments_amount_positive', sql`amount > 0`),
  ],
);

/**
 * Anggaran (RAB).
 *
 * `budget_number` kini dihasilkan tabel penghitung (`RAB-YYYY-#####`), bukan
 * `DEFAULT` kolom yang memanggil `nextval()` — lihat catatan pada
 * `work_items.work_number`.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: primaryId(),

    /** `RAB-YYYY-#####` */
    budgetNumber: text('budget_number').notNull(),

    title: text('title').notNull(),

    divisionId: uuid('division_id').references(() => divisions.id, {
      onDelete: 'set null',
    }),
    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),
    subunitId: uuid('subunit_id').references(() => subunits.id, {
      onDelete: 'set null',
    }),
    requestedBy: uuid('requested_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    totalPlanned: numeric('total_planned', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    totalRealized: numeric('total_realized', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    status: budgetStatusEnum('status').notNull().default('draft'),
    reviewNote: text('review_note'),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('budgets_number_key').on(t.budgetNumber),
    index('budgets_status_idx').on(t.status),
    index('budgets_division_idx').on(t.divisionId),
    index('budgets_program_idx').on(t.programId),
    index('budgets_period_idx').on(t.periodId),
  ],
);

/**
 * Rincian anggaran.
 *
 * `planned_total` dan `realized_total` **disimpan**, meskipun keduanya bisa
 * dihitung dari `quantity × unit_price`. Itu disengaja dan dipertahankan dari
 * `sksks`: harga satuan sering berubah setelah persetujuan, sedangkan angka
 * yang disetujui harus tetap seperti saat disetujui. Baris yang dihitung ulang
 * akan diam-diam mengubah RAB yang sudah ditandatangani.
 *
 * Konsekuensinya: keduanya harus diisi aplikasi saat menulis, dan hubungan
 * `planned_total = quantity × unit_price` hanya berlaku pada saat baris itu
 * dibuat — bukan sebagai constraint.
 */
export const budgetItems = pgTable(
  'budget_items',
  {
    id: primaryId(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),

    label: text('label').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 })
      .notNull()
      .default('1'),
    unit: text('unit'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    plannedTotal: numeric('planned_total', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    realizedTotal: numeric('realized_total', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('budget_items_budget_idx').on(t.budgetId)],
);

/**
 * Transaksi kas.
 *
 * **`status` tetap `text`, bukan enum.** `sksks` mendefinisikannya sebagai teks
 * dengan nilai bawaan `'tercatat'`, dan tidak ada satu pun tempat di seluruh
 * kode yang memeriksanya. Mengubahnya menjadi enum sekarang berarti
 * menetapkan kosakata untuk sesuatu yang belum pernah dipakai sebagai kosakata
 * — dan enum yang salah lebih mahal diperbaiki daripada teks yang belum
 * diandalkan.
 *
 * Yang berubah hanyalah nilainya: `'tercatat'` → `'recorded'`.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: primaryId(),

    transactionType: transactionTypeEnum('transaction_type').notNull(),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),

    transactionDate: date('transaction_date').notNull().defaultNow(),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),
    budgetId: uuid('budget_id').references(() => budgets.id, {
      onDelete: 'set null',
    }),

    counterparty: text('counterparty'),
    paymentMethod: text('payment_method'),
    proofUrl: text('proof_url'),

    status: text('status').notNull().default('recorded'),

    verified: boolean('verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    index('transactions_date_idx').on(t.transactionDate),
    index('transactions_type_idx').on(t.transactionType),
    index('transactions_budget_idx').on(t.budgetId),
    index('transactions_period_idx').on(t.periodId),
    index('transactions_verified_idx').on(t.verified),
    check('transactions_amount_positive', sql`amount > 0`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const memberDuesRelations = relations(memberDues, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [memberDues.profileId],
    references: [profiles.id],
  }),
  period: one(periods, {
    fields: [memberDues.periodId],
    references: [periods.id],
  }),
  payments: many(memberPayments),
}));

export const memberPaymentsRelations = relations(memberPayments, ({ one }) => ({
  dues: one(memberDues, {
    fields: [memberPayments.memberDuesId],
    references: [memberDues.id],
  }),
  verifiedByProfile: one(profiles, {
    fields: [memberPayments.verifiedBy],
    references: [profiles.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one, many }) => ({
  division: one(divisions, {
    fields: [budgets.divisionId],
    references: [divisions.id],
  }),
  program: one(programs, {
    fields: [budgets.programId],
    references: [programs.id],
  }),
  requestedByProfile: one(profiles, {
    fields: [budgets.requestedBy],
    references: [profiles.id],
  }),
  period: one(periods, {
    fields: [budgets.periodId],
    references: [periods.id],
  }),
  items: many(budgetItems),
}));

export const budgetItemsRelations = relations(budgetItems, ({ one }) => ({
  budget: one(budgets, {
    fields: [budgetItems.budgetId],
    references: [budgets.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  pic: one(profiles, {
    fields: [transactions.picId],
    references: [profiles.id],
  }),
  program: one(programs, {
    fields: [transactions.programId],
    references: [programs.id],
  }),
  budget: one(budgets, {
    fields: [transactions.budgetId],
    references: [budgets.id],
  }),
  period: one(periods, {
    fields: [transactions.periodId],
    references: [periods.id],
  }),
}));
