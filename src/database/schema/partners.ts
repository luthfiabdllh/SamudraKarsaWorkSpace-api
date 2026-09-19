import { relations } from 'drizzle-orm';
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import { partnerStatusEnum } from './enums';
import { periods, programs, profiles } from './organization';

/**
 * Sponsorship — mitra, tindak lanjut, dan kontraprestasi.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`status` pada `sponsor_benefits` tetap teks.** Sama alasannya dengan
 * `transactions.status`: `sksks` menyimpannya sebagai teks dengan nilai bawaan
 * `'belum_dipenuhi'` dan tidak pernah memeriksanya. Yang berubah hanya nilainya
 * → `'not_fulfilled'`.
 *
 * **`target_support` dan `agreed_value` boleh kosong, `fund_received` tidak.**
 * Itu sudah benar di `sksks` dan dipertahankan: nilai yang **diharapkan** dari
 * seorang calon mitra memang belum ada saat ia baru masuk daftar, sedangkan
 * dana yang sudah masuk adalah fakta yang selalu punya angka — nol pun angka.
 */

export const partners = pgTable(
  'partners',
  {
    id: primaryId(),

    name: text('name').notNull(),
    category: text('category'),
    industry: text('industry'),

    contactPerson: text('contact_person'),
    contactInfo: text('contact_info'),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    relationChannel: text('relation_channel'),

    lastContactAt: date('last_contact_at'),
    nextFollowUpAt: date('next_follow_up_at'),

    targetSupport: numeric('target_support', { precision: 14, scale: 2 }),
    agreedValue: numeric('agreed_value', { precision: 14, scale: 2 }),
    fundReceived: numeric('fund_received', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    inKindSupport: text('in_kind_support'),

    proposalUrl: text('proposal_url'),
    coverLetterUrl: text('cover_letter_url'),
    mouUrl: text('mou_url'),

    status: partnerStatusEnum('status').notNull().default('prospect'),
    fulfillmentStatus: text('fulfillment_status'),

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
    index('partners_status_idx').on(t.status),
    index('partners_pic_idx').on(t.picId),
    index('partners_period_idx').on(t.periodId),
    index('partners_next_follow_up_idx').on(t.nextFollowUpAt),
  ],
);

/**
 * Catatan tindak lanjut.
 *
 * Hanya ditambah, tidak pernah diubah — karena itu tidak ada `updated_at` dan
 * tidak ada `version`. Sebuah catatan tindak lanjut yang bisa diedit berhenti
 * menjadi catatan dan mulai menjadi klaim.
 */
export const partnerFollowups = pgTable(
  'partner_followups',
  {
    id: primaryId(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    followupNote: text('followup_note').notNull(),
    followedUpBy: uuid('followed_up_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    followedUpAt: timestamp('followed_up_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('partner_followups_partner_idx').on(t.partnerId)],
);

/**
 * Kontraprestasi — imbalan yang dijanjikan ke mitra.
 *
 * Punya tenggat sendiri dan status sendiri, terpisah dari status mitranya.
 * Itu disengaja dan dipertahankan: sebuah mitra bisa berstatus `contract_signed`
 * sementara kontraprestasinya belum ditunaikan sama sekali — dan justru
 * kombinasi itulah yang perlu terlihat, bukan yang perlu disembunyikan.
 */
export const sponsorBenefits = pgTable(
  'sponsor_benefits',
  {
    id: primaryId(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    benefitDescription: text('benefit_description').notNull(),
    deadline: date('deadline'),

    status: text('status').notNull().default('not_fulfilled'),
    proofUrl: text('proof_url'),

    ...timestamps(),
  },
  (t) => [
    index('sponsor_benefits_partner_idx').on(t.partnerId),
    index('sponsor_benefits_status_idx').on(t.status),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const partnersRelations = relations(partners, ({ one, many }) => ({
  pic: one(profiles, { fields: [partners.picId], references: [profiles.id] }),
  program: one(programs, {
    fields: [partners.programId],
    references: [programs.id],
  }),
  period: one(periods, {
    fields: [partners.periodId],
    references: [periods.id],
  }),
  followups: many(partnerFollowups),
  benefits: many(sponsorBenefits),
}));

export const partnerFollowupsRelations = relations(
  partnerFollowups,
  ({ one }) => ({
    partner: one(partners, {
      fields: [partnerFollowups.partnerId],
      references: [partners.id],
    }),
    followedUpByProfile: one(profiles, {
      fields: [partnerFollowups.followedUpBy],
      references: [profiles.id],
    }),
  }),
);

export const sponsorBenefitsRelations = relations(
  sponsorBenefits,
  ({ one }) => ({
    partner: one(partners, {
      fields: [sponsorBenefits.partnerId],
      references: [partners.id],
    }),
  }),
);
