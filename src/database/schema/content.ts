import { relations } from 'drizzle-orm';
import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import { contentStatusEnum, creativeStatusEnum } from './enums';
import { periods, programs, profiles } from './organization';
import { requests } from './work';

/**
 * Konten publikasi (Humas) dan permintaan kreatif (Media Kreatif).
 *
 * Keduanya diletakkan bersama karena keduanya menggambarkan hal yang sama dari
 * dua sisi: `content_items` adalah apa yang akan terbit, `creative_requests`
 * adalah permintaan bahan untuk menerbitkannya. Satu konten sering melahirkan
 * satu permintaan kreatif, dan memisahkannya ke dua berkas berarti hubungan itu
 * tidak terlihat di tempat ia dibaca.
 */

/**
 * Rencana konten.
 *
 * `platform` tetap **teks bebas, bukan enum**. Platform media baru muncul lebih
 * cepat daripada migrasi enum dijalankan, dan platform yang belum ada di enum
 * tidak boleh menghalangi pencatatan — sementara nilai enum yang salah lebih
 * mahal diperbaiki daripada teks yang belum diandalkan.
 */
export const contentItems = pgTable(
  'content_items',
  {
    id: primaryId(),

    title: text('title').notNull(),
    platform: text('platform'),
    plannedDate: date('planned_date'),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    brief: text('brief'),

    status: contentStatusEnum('status').notNull().default('idea'),

    /** Diisi saat status menjadi `published` — bukan saat dibuat. */
    publishedUrl: text('published_url'),

    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),
    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    index('content_items_status_idx').on(t.status),
    index('content_items_period_idx').on(t.periodId),
    index('content_items_pic_idx').on(t.picId),
  ],
);

/**
 * Permintaan kreatif — desain, video, dokumentasi.
 *
 * `revision_count` adalah satu-satunya angka di modul ini yang **naik** dan
 * tidak pernah turun. Ia dipertahankan sebagai kolom dan bukan dihitung dari
 * riwayat, karena `sksks` tidak menyimpan riwayat revisi sama sekali: yang ada
 * hanya jumlahnya. Menghitungnya dari riwayat menuntut riwayat itu ada lebih
 * dulu — dan itu pekerjaan Fase 4, bukan Fase 1.
 */
export const creativeRequests = pgTable(
  'creative_requests',
  {
    id: primaryId(),

    /** Permintaan umum yang melahirkan permintaan kreatif ini, bila ada. */
    requestId: uuid('request_id').references(() => requests.id, {
      onDelete: 'set null',
    }),

    title: text('title').notNull(),
    creativeKind: text('creative_kind').notNull(),

    requesterId: uuid('requester_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    brief: text('brief'),
    specNote: text('spec_note'),
    referenceUrl: text('reference_url'),
    dueDate: date('due_date'),

    revisionCount: integer('revision_count').notNull().default(0),

    finalFileUrl: text('final_file_url'),

    status: creativeStatusEnum('status').notNull().default('request_received'),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    index('creative_requests_status_idx').on(t.status),
    index('creative_requests_request_idx').on(t.requestId),
    index('creative_requests_pic_idx').on(t.picId),
    index('creative_requests_period_idx').on(t.periodId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const contentItemsRelations = relations(contentItems, ({ one }) => ({
  pic: one(profiles, {
    fields: [contentItems.picId],
    references: [profiles.id],
  }),
  program: one(programs, {
    fields: [contentItems.programId],
    references: [programs.id],
  }),
  period: one(periods, {
    fields: [contentItems.periodId],
    references: [periods.id],
  }),
}));

export const creativeRequestsRelations = relations(
  creativeRequests,
  ({ one }) => ({
    request: one(requests, {
      fields: [creativeRequests.requestId],
      references: [requests.id],
    }),
    requester: one(profiles, {
      fields: [creativeRequests.requesterId],
      references: [profiles.id],
    }),
    pic: one(profiles, {
      fields: [creativeRequests.picId],
      references: [profiles.id],
    }),
    period: one(periods, {
      fields: [creativeRequests.periodId],
      references: [periods.id],
    }),
  }),
);
