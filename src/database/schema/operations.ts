import { relations } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import { inventoryMovementTypeEnum } from './enums';
import { periods, programs, profiles } from './organization';

/**
 * Operasional — inventaris, pengiriman, dan perjalanan.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`item_code` memuat tahun.** `sksks` menghasilkannya sebagai `INV-#####`
 * lewat trigger — tanpa tahun, dan tidak pernah di-reset. Empat nomor lain di
 * sistem ini memuat tahun; inventaris satu-satunya yang tidak, dan itu bukan
 * pilihan melainkan kebetulan penulisan (inventaris §1). Sekarang
 * `INV-YYYY-#####` dari tabel penghitung yang sama.
 *
 * Konsekuensinya nyata dan perlu diketahui: kode inventaris yang sudah ditempel
 * di barang akan berbeda bentuknya dari kode baru. Karena itu perubahannya
 * hanya berlaku untuk barang yang didaftarkan setelah sistem baru berjalan —
 * `item_code` yang sudah ada tetap dipakai apa adanya, dan kolomnya tidak
 * dihasilkan ulang.
 *
 * **`status` pada `shipments` dan `trips` tetap teks**, dengan alasan yang sama
 * seperti `transactions.status`.
 */

/**
 * Barang inventaris.
 *
 * `quantity` dan `stock` adalah dua angka yang berbeda dan keduanya
 * dipertahankan: `quantity` adalah jumlah yang **dimiliki**, `stock` adalah
 * jumlah yang **ada di gudang saat ini**. Sebuah barang bisa dimiliki sepuluh
 * dan tersedia dua, karena delapan sedang dipinjam. Menggabungkannya menjadi
 * satu angka menghapus justru pertanyaan yang paling sering ditanyakan.
 *
 * Yang tidak dijaga skema: bahwa `stock` konsisten dengan
 * `inventory_movements`. Itu pemeriksaan lintas-baris yang tidak bisa
 * dinyatakan sebagai constraint, dan tempatnya di fungsi murni Fase 3.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),

    /** `INV-YYYY-#####` — lihat catatan di atas. */
    itemCode: text('item_code').notNull(),

    name: text('name').notNull(),
    category: text('category'),

    quantity: integer('quantity').notNull().default(0),
    stock: integer('stock').notNull().default(0),

    conditionNote: text('condition_note'),
    sourceNote: text('source_note'),
    location: text('location'),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    programId: uuid('program_id').references(() => programs.id, {
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
    uniqueIndex('inventory_items_code_key').on(t.itemCode),
    index('inventory_items_category_idx').on(t.category),
    index('inventory_items_pic_idx').on(t.picId),
  ],
);

/**
 * Pergerakan barang.
 *
 * Hanya ditambah, tidak pernah diubah — sama seperti `partner_followups`, dan
 * karena alasan yang lebih kuat: baris di sini adalah bukti dari mana angka
 * `stock` berasal. Kalau ia bisa diedit, `stock` kehilangan asalnya.
 *
 * `quantity` **bertanda**: positif untuk masuk, negatif untuk keluar. `sksks`
 * sudah memakainya begitu dan itu dipertahankan, karena
 * `stock = sum(quantity)` menjadi benar tanpa perlu memetakan tiap jenis
 * pergerakan menjadi tanda — pemetaan itu satu tempat lagi yang bisa lupa
 * diperbarui saat jenis pergerakan baru ditambahkan.
 */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: primaryId(),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),

    movementType: inventoryMovementTypeEnum('movement_type').notNull(),
    quantity: integer('quantity').notNull(),

    movedBy: uuid('moved_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('inventory_movements_item_idx').on(t.inventoryItemId)],
);

export const shipments = pgTable(
  'shipments',
  {
    id: primaryId(),

    packageName: text('package_name').notNull(),
    contentNote: text('content_note'),
    weightKg: numeric('weight_kg', { precision: 8, scale: 2 }),
    dimensionNote: text('dimension_note'),

    origin: text('origin'),
    destination: text('destination'),
    senderName: text('sender_name'),
    recipientName: text('recipient_name'),

    expedition: text('expedition'),
    trackingNumber: text('tracking_number'),
    scheduledAt: date('scheduled_at'),
    cost: numeric('cost', { precision: 14, scale: 2 }),

    status: text('status').notNull().default('processing'),

    packagingPhotoUrl: text('packaging_photo_url'),
    handoverProofUrl: text('handover_proof_url'),

    ...hidingColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('shipments_status_idx').on(t.status)],
);

export const trips = pgTable(
  'trips',
  {
    id: primaryId(),

    tripKind: text('trip_kind').notNull(),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),

    vehicleNote: text('vehicle_note'),
    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    passengerCount: integer('passenger_count'),

    status: text('status').notNull().default('planned'),
    note: text('note'),

    ...hidingColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('trips_status_idx').on(t.status)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const inventoryItemsRelations = relations(
  inventoryItems,
  ({ one, many }) => ({
    pic: one(profiles, {
      fields: [inventoryItems.picId],
      references: [profiles.id],
    }),
    program: one(programs, {
      fields: [inventoryItems.programId],
      references: [programs.id],
    }),
    period: one(periods, {
      fields: [inventoryItems.periodId],
      references: [periods.id],
    }),
    movements: many(inventoryMovements),
  }),
);

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    item: one(inventoryItems, {
      fields: [inventoryMovements.inventoryItemId],
      references: [inventoryItems.id],
    }),
    movedByProfile: one(profiles, {
      fields: [inventoryMovements.movedBy],
      references: [profiles.id],
    }),
  }),
);

export const tripsRelations = relations(trips, ({ one }) => ({
  pic: one(profiles, { fields: [trips.picId], references: [profiles.id] }),
}));
