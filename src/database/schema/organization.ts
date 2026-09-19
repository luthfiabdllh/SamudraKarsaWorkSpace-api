import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import {
  kknPhaseEnum,
  memberStatusEnum,
  programStatusEnum,
  roleEnum,
} from './enums';

/**
 * Organisasi, identitas, dan program.
 *
 * Urutannya penting: berkas ini mendefinisikan tabel yang **dirujuk** tabel
 * lain, jadi ia dibaca lebih dulu saat menelusuri skema.
 */

/**
 * Periode KKN — keputusan 20.
 *
 * `sksks` menyimpan periode sebagai **satu baris di `system_settings`** berisi
 * `'2026-12-19' → '2027-02-06'`. Akibatnya periode hanya bisa ada satu, dan
 * tidak ada satu pun baris kerja yang bisa ditanyakan "ini periode mana?".
 * Keputusan 20 meminta kolom periode justru supaya pertanyaan itu terjawab.
 *
 * Dibuat sebagai **tabel**, bukan kolom teks, karena dua alasan:
 *
 * - Kolom teks menyebar ke puluhan tabel dan setiap salah ketik menjadi
 *   periode baru yang tidak pernah ada. Foreign key menolaknya.
 * - Tanggal mulai dan selesai hanya ditulis **sekali** di sini. Kalau ia
 *   tersebar, mengubah tanggalnya berarti memperbarui setiap baris.
 *
 * `phase` memakai enum yang sudah ada dari `sksks` — `pre_kkn`, `kkn`,
 * `post_kkn` — karena pembagian itu memang sudah dipakai.
 */
export const periods = pgTable(
  'periods',
  {
    id: primaryId(),

    /** `KKN-2026-2027` — dipakai manusia, dan unik. */
    code: text('code').notNull(),
    name: text('name').notNull(),

    startsOn: timestamp('starts_on', { withTimezone: true }).notNull(),
    endsOn: timestamp('ends_on', { withTimezone: true }).notNull(),

    phase: kknPhaseEnum('phase').notNull().default('kkn'),

    /**
     * Hanya satu periode yang aktif. Dijaga **partial unique index**, bukan
     * pemeriksaan aplikasi: dua periode aktif sekaligus berarti dua periode
     * yang sama-sama mengaku berlaku, dan itu tidak boleh bisa terjadi.
     */
    isActive: boolean('is_active').notNull().default(false),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('periods_code_key').on(t.code),
    uniqueIndex('periods_active_key')
      .on(t.isActive)
      .where(sql`is_active`),
  ],
);

export const divisions = pgTable(
  'divisions',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('divisions_code_key').on(t.code)],
);

export const clusters = pgTable(
  'clusters',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('clusters_code_key').on(t.code)],
);

/**
 * `village_name` sengaja tetap apa adanya — nama desa tidak diterjemahkan
 * (keputusan 47).
 */
export const subunits = pgTable(
  'subunits',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    villageName: text('village_name'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('subunits_code_key').on(t.code)],
);

/**
 * Identitas anggota.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`id` bukan lagi `auth.users.id`.** `sksks` menyerahkan identitas ke
 * Supabase Auth dan hanya menyimpan sisanya di sini. Sistem baru memiliki
 * autentikasinya sendiri (Google OAuth + argon2id), jadi `profiles` berdiri
 * sendiri dan menyimpan `password_hash`-nya.
 *
 * **Peran menjadi array.** `sksks` menyimpan peran di dua kolom — `app_role`
 * dan `profiles.division_role` — sehingga seseorang bisa menjadi co-owner
 * **dan** kepala divisi sekaligus. Satu kolom tidak bisa menyimpan keduanya,
 * dan menyimpannya sebagai satu nilai berarti membuang salah satunya. Di sini
 * keduanya muat: `roles = {co_owner, division_head}` dengan `division_id`
 * menunjuk divisi yang dipimpinnya.
 *
 * `division_deputy` tetap disimpan meskipun wewenangnya untuk sekarang sama
 * dengan `division_head` (keputusan 46) — justru itu gunanya, supaya pemisahan
 * wewenang nanti tidak menuntut migrasi data.
 *
 * **Kolom privilege tidak pernah bisa ditulis dari endpoint profil-diri.**
 * `roles`, `division_id`, `status`, dan `is_kormasit` hanya boleh diubah
 * lewat endpoint admin. Di `sksks` keempatnya bisa diubah sendiri dari console
 * browser (§5.1.1) — dan itu temuan paling serius di seluruh inventaris.
 *
 * ## Kenapa tidak ada `deleted_at`
 *
 * Anggota tidak dihapus, melainkan **dinonaktifkan** (`status = 'inactive'`).
 * Barisnya harus tetap ada karena ia dirujuk pekerjaan, surat, dan catatan
 * audit lama — menghapusnya akan memutus riwayat yang justru harus utuh.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: primaryId(),

    /** Selalu huruf kecil. Normalisasi dilakukan saat menulis, bukan saat membaca. */
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    nickname: text('nickname'),
    photoUrl: text('photo_url'),
    phone: text('phone'),

    facultyMajor: text('faculty_major'),
    batchYear: text('batch_year'),

    // ── Autentikasi ──────────────────────────────────────────────────────

    /**
     * Hash argon2id. **Nullable**, karena anggota yang diundang belum punya
     * password sampai owner menetapkan yang sementara.
     */
    passwordHash: text('password_hash'),

    /**
     * Subjek Google. Nullable dan unik **bila terisi** (§7.8.2).
     *
     * Partial unique index, bukan `unique` biasa: banyak baris berisi `NULL`
     * tidak saling bertabrakan di PostgreSQL, tetapi ketergantungan pada
     * perilaku itu tidak perlu — indeks parsial menyatakannya terang-terangan.
     */
    googleSub: text('google_sub'),

    /** Keputusan 10 — menutup seluruh endpoint kecuali ganti password. */
    mustChangePassword: boolean('must_change_password')
      .notNull()
      .default(false),

    // ── Keanggotaan ──────────────────────────────────────────────────────

    roles: roleEnum('roles').array().notNull().default(['member']),
    status: memberStatusEnum('status').notNull().default('invited'),

    divisionId: uuid('division_id').references(() => divisions.id, {
      onDelete: 'set null',
    }),
    clusterId: uuid('cluster_id').references(() => clusters.id, {
      onDelete: 'set null',
    }),
    subunitId: uuid('subunit_id').references(() => subunits.id, {
      onDelete: 'set null',
    }),

    /** Sebutan jabatan resmi — tidak diterjemahkan (keputusan 47). */
    teamRole: text('team_role'),
    isKormasit: boolean('is_kormasit').notNull().default(false),

    // ── Profil diri ──────────────────────────────────────────────────────

    socialLinks: jsonb('social_links').notNull().default({}),
    skills: text('skills').array().notNull().default([]),
    hobbies: text('hobbies').array().notNull().default([]),
    availabilityNote: text('availability_note'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),

    version: version(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('profiles_email_key').on(t.email),
    uniqueIndex('profiles_google_sub_key')
      .on(t.googleSub)
      .where(sql`google_sub is not null`),
    index('profiles_status_idx').on(t.status),
    index('profiles_division_idx').on(t.divisionId),
    // GIN supaya "siapa saja yang punya peran X" tidak memindai seluruh tabel.
    index('profiles_roles_idx').using('gin', t.roles),
  ],
);

/**
 * Pengaturan sistem sebagai `jsonb` berkunci — pola ini dipertahankan dari
 * `sksks` (§12).
 */
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Program kerja.
 *
 * `program_number` kini **dihasilkan** sistem dengan format `PRG-YYYY-#####`
 * (keputusan 51). Di `sksks` kolom ini wajib diisi dan unik, tetapi tidak ada
 * satu pun kode yang menghasilkannya (temuan #3) — jadi aturannya hilang dan
 * manusia yang harus mengarang nomor unik.
 *
 * Seluruh kolom naratif dipertahankan apa adanya; yang berubah hanya nama
 * kolom dan bahasa nilainya (keputusan 47).
 */
export const programs = pgTable(
  'programs',
  {
    id: primaryId(),
    programNumber: text('program_number').notNull(),
    name: text('name').notNull(),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),
    clusterId: uuid('cluster_id').references(() => clusters.id, {
      onDelete: 'set null',
    }),
    subunitId: uuid('subunit_id').references(() => subunits.id, {
      onDelete: 'set null',
    }),
    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    background: text('background'),
    problemStatement: text('problem_statement'),
    potential: text('potential'),
    researchFindings: text('research_findings'),
    goals: text('goals'),
    targets: text('targets'),
    stakeholders: text('stakeholders'),
    actionPlan: text('action_plan'),
    scheduleNote: text('schedule_note'),
    outputTarget: text('output_target'),
    itemNeeds: text('item_needs'),

    budgetPlan: numeric('budget_plan', { precision: 14, scale: 2 }).default(
      '0',
    ),
    budgetRealization: numeric('budget_realization', {
      precision: 14,
      scale: 2,
    }).default('0'),

    status: programStatusEnum('status').notNull().default('idea'),
    progressPercentage: integer('progress_percentage').notNull().default(0),

    realizationNote: text('realization_note'),
    evaluationNote: text('evaluation_note'),
    impactNote: text('impact_note'),
    followUpNote: text('follow_up_note'),

    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('programs_number_key').on(t.programNumber),
    index('programs_status_idx').on(t.status),
    index('programs_period_idx').on(t.periodId),
  ],
);

/**
 * Keanggotaan program.
 *
 * Kunci utamanya gabungan — seseorang tidak bisa menjadi anggota program yang
 * sama dua kali. `sksks` sudah benar di sini dan dipertahankan.
 */
export const programMembers = pgTable(
  'program_members',
  {
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    roleNote: text('role_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.programId, t.profileId] })],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi — dipakai untuk query bertingkat, bukan untuk membuat foreign key
// ─────────────────────────────────────────────────────────────────────────────

export const programsRelations = relations(programs, ({ one, many }) => ({
  period: one(periods, {
    fields: [programs.periodId],
    references: [periods.id],
  }),
  cluster: one(clusters, {
    fields: [programs.clusterId],
    references: [clusters.id],
  }),
  subunit: one(subunits, {
    fields: [programs.subunitId],
    references: [subunits.id],
  }),
  pic: one(profiles, { fields: [programs.picId], references: [profiles.id] }),
  members: many(programMembers),
}));

export const programMembersRelations = relations(programMembers, ({ one }) => ({
  program: one(programs, {
    fields: [programMembers.programId],
    references: [programs.id],
  }),
  profile: one(profiles, {
    fields: [programMembers.profileId],
    references: [profiles.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  division: one(divisions, {
    fields: [profiles.divisionId],
    references: [divisions.id],
  }),
  cluster: one(clusters, {
    fields: [profiles.clusterId],
    references: [clusters.id],
  }),
  subunit: one(subunits, {
    fields: [profiles.subunitId],
    references: [subunits.id],
  }),
  programs: many(programMembers),
}));
