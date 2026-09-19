import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId } from './_columns';
import { evaluationVisibilityEnum } from './enums';
import { periods, profiles } from './organization';

/**
 * PSDM — kegiatan internal dan masukan anggota.
 *
 * Tidak satu pun dari keduanya punya `version`. `version` dipasang di tabel yang
 * **memang diedit berdua** (§7.16), dan dua tabel ini bukan: `internal_activities`
 * ditulis sekali oleh pencatatnya, dan `feedback` — kalau bisa diedit — berhenti
 * menjadi masukan dan mulai menjadi opini yang dirapikan.
 *
 * Yang satu punya `deleted_at` dan yang satu tidak, dan perbedaannya disengaja
 * — lihat catatan pada masing-masing tabel.
 */

/**
 * Kegiatan internal — rapat internal, evaluasi divisi, kegiatan PSDM lain.
 *
 * Berbeda dari `meetings`, tabel ini tidak punya peserta, keputusan, maupun
 * notulen. Ia ada untuk kegiatan yang cukup dicatat keberadaannya: berapa lama,
 * berapa orang, apa hasilnya. Memaksanya masuk ke `meetings` berarti setiap
 * rapat internal kecil menuntut daftar hadir dan notulen yang tidak akan pernah
 * dibaca siapa pun.
 */
export const internalActivities = pgTable(
  'internal_activities',
  {
    id: primaryId(),

    title: text('title').notNull(),
    activityKind: text('activity_kind').notNull(),

    heldAt: timestamp('held_at', { withTimezone: true }),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    participantCount: integer('participant_count'),

    summary: text('summary'),
    followUpNote: text('follow_up_note'),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    /**
     * `on delete set null`, bukan `cascade` seperti di `sksks` (yang tidak
     * menyebutkan apa pun, sehingga bawaannya `no action`). Baris kegiatannya
     * harus tetap ada meski pencatatnya sudah tidak menjadi anggota — kalau
     * tidak, riwayat kegiatan ikut terhapus bersama orangnya.
     */
    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    ...hidingColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('internal_activities_held_at_idx').on(t.heldAt),
    index('internal_activities_period_idx').on(t.periodId),
  ],
);

/**
 * Masukan, kritik, dan saran anggota.
 *
 * ## Kenapa tidak ada `deleted_at`
 *
 * `sksks` memberi tabel ini `is_private` dan **tidak** memberi `deleted_at` —
 * dan itu dipertahankan dengan sadar. Masukan yang bisa dihapus oleh orang yang
 * dikritik bukan masukan. Yang ada sebagai gantinya adalah `is_private`: ia
 * membatasi **siapa yang boleh membaca**, bukan menghapus isinya dari dunia.
 *
 * `visibility` menentukan apakah nama penulisnya ikut terlihat
 * (`anonymous`/`named`) — itu pun dipertahankan dari `sksks`, karena
 * anonimitas yang hanya dijanjikan di UI adalah anonimitas yang bocor pada
 * `curl` pertama.
 *
 * `author_id` nullable dan `on delete set null`: masukan anonim memang tidak
 * menunjuk siapa pun, dan masukan bernama yang penulisnya keluar dari
 * kepengurusan tidak boleh ikut hilang. `target_note` tetap teks bebas — yang
 * dikritik bisa orang, divisi, atau kebijakan, dan tidak semuanya punya baris
 * di tabel.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: primaryId(),

    category: text('category').notNull().default('criticism_suggestion'),

    visibility: evaluationVisibilityEnum('visibility')
      .notNull()
      .default('named'),

    authorId: uuid('author_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    targetNote: text('target_note'),

    message: text('message').notNull(),
    isPrivate: boolean('is_private').notNull().default(false),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('feedback_private_idx').on(t.isPrivate),
    index('feedback_period_idx').on(t.periodId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const internalActivitiesRelations = relations(
  internalActivities,
  ({ one }) => ({
    pic: one(profiles, {
      fields: [internalActivities.picId],
      references: [profiles.id],
    }),
    createdByProfile: one(profiles, {
      fields: [internalActivities.createdBy],
      references: [profiles.id],
    }),
    period: one(periods, {
      fields: [internalActivities.periodId],
      references: [periods.id],
    }),
  }),
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  author: one(profiles, {
    fields: [feedback.authorId],
    references: [profiles.id],
  }),
  period: one(periods, {
    fields: [feedback.periodId],
    references: [periods.id],
  }),
}));
