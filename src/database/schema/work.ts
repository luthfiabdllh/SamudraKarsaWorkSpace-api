import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import { meetingDecisions } from './collaboration';
import {
  priorityLevelEnum,
  requestStatusEnum,
  requestTypeEnum,
  workItemTypeEnum,
  workStatusEnum,
} from './enums';
import {
  clusters,
  divisions,
  periods,
  profiles,
  programs,
  subunits,
} from './organization';

/**
 * Domain kerja — pekerjaan dan permintaan.
 *
 * Keduanya saling menunjuk: permintaan yang diterima melahirkan pekerjaan, dan
 * pekerjaan itu tahu permintaan mana asalnya. Karena itu keduanya berada di
 * satu berkas — memisahkannya berarti dua berkas yang saling mengimpor.
 */

/**
 * Pekerjaan.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`work_number` tidak lagi dihasilkan `nextval()`.** `sksks` memakai sequence,
 * dan sequence memberi celah setiap kali transaksi bergulung balik — sedangkan
 * nomor pekerjaan adalah nomor dokumen yang orang rujuk. Sekarang dihasilkan
 * tabel penghitung di dalam transaksi yang sama dengan INSERT-nya
 * (`PRD-BACKEND.md` §8.2). Kolomnya sendiri tidak berubah; yang berubah cara
 * mengisinya.
 *
 * **`global_status` menjadi `status`.** Kata "global" tidak lagi menerangkan
 * apa pun sekarang namanya `work_status` (§14.3 Kosakata Enum).
 *
 * **`phase` dibuang.** Fase KKN (`pre_kkn`/`kkn`/`post_kkn`) adalah sifat
 * **periode**, bukan sifat pekerjaan — dan sekarang ada tabel `periods` yang
 * menyimpannya. Menyimpannya di sini juga berarti dua tempat yang bisa berbeda,
 * dan tidak ada aturan mana yang menang.
 *
 * **`source_evaluation_id` dibuang.** Kolomnya ada di `sksks` tanpa menunjuk
 * tabel apa pun — tidak ada tabel evaluasi di seluruh skema. Kolom yang tidak
 * bisa menunjuk ke mana-mana hanya menimbulkan pertanyaan tanpa jawaban.
 *
 * **Dua kolom asal lainnya tetap ada, dan sekarang acuannya ditulis di
 * tempatnya.** `source_request_id` dan `source_meeting_decision_id`
 * dideklarasikan di `sksks` **tanpa** acuan, lalu diberi foreign key menyusul
 * lewat `ALTER TABLE` di bagian bawah berkas migrasinya. Di sini keduanya
 * ditulis lengkap di kolomnya masing-masing, karena acuan yang berada jauh dari
 * kolomnya adalah acuan yang mudah terlewat saat kolomnya dibaca.
 *
 * ## Yang ditambahkan
 *
 * - `period_id` — keputusan 20, supaya pekerjaan bisa ditanyakan "periode mana"
 * - `hold_reason` — keputusan 48, wajib diisi kalau `status = 'on_hold'`
 * - `sync_conflict_at` / `sync_conflict_note` — keputusan 49
 * - `version` — optimistic locking (§7.16)
 */
export const workItems = pgTable(
  'work_items',
  {
    id: primaryId(),

    /** `WI-2026-00001` — dihasilkan tabel penghitung, bukan sequence. */
    workNumber: text('work_number').notNull(),

    title: text('title').notNull(),
    type: workItemTypeEnum('type').notNull().default('task'),
    description: text('description'),

    primaryPicId: uuid('primary_pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    divisionId: uuid('division_id').references(() => divisions.id, {
      onDelete: 'set null',
    }),
    clusterId: uuid('cluster_id').references(() => clusters.id, {
      onDelete: 'set null',
    }),
    subunitId: uuid('subunit_id').references(() => subunits.id, {
      onDelete: 'set null',
    }),
    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),

    /** Keputusan 20 — pekerjaan selalu milik satu periode KKN. */
    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    priority: priorityLevelEnum('priority').notNull().default('medium'),
    status: workStatusEnum('status').notNull().default('draft'),

    /**
     * Status tambahan milik modul pemakainya — teks bebas, bukan enum.
     *
     * Dipertahankan dari `sksks` karena ia memecahkan masalah nyata: satu
     * divisi kadang perlu menandai tahap yang hanya berarti bagi divisinya
     * sendiri. Ia **tidak** menggantikan `status`, dan tidak pernah dipakai
     * untuk menentukan hak akses.
     */
    moduleStatus: text('module_status'),

    startDate: date('start_date'),
    dueDate: date('due_date'),
    progressPercentage: integer('progress_percentage').notNull().default(0),

    blockerReason: text('blocker_reason'),
    assistanceNeeded: text('assistance_needed'),

    /** Wajib diisi saat status menjadi `done`, seperti di `sksks`. */
    completionSummary: text('completion_summary'),

    /**
     * Wajib diisi saat status menjadi `on_hold` (keputusan 48).
     *
     * Di `sksks` `on_hold` dipasang trigger dengan nilai karangan. Kolom ini
     * yang membuatnya berbeda: menahan pekerjaan menuntut penjelasan, dan itu
     * yang membedakan "tertahan karena sesuatu" dari "tidak ada yang
     * mengerjakan".
     */
    holdReason: text('hold_reason'),

    // ── Asal-usul ────────────────────────────────────────────────────────

    sourceRequestId: uuid('source_request_id').references(
      (): AnyPgColumn => requests.id,
      { onDelete: 'set null' },
    ),
    sourceMeetingDecisionId: uuid('source_meeting_decision_id').references(
      (): AnyPgColumn => meetingDecisions.id,
      { onDelete: 'set null' },
    ),

    // ── Sinkronisasi dua arah (keputusan 49) ─────────────────────────────

    /**
     * Menyala saat pekerjaan ini dan permintaan asalnya tidak lagi sepakat.
     * Selama terisi, transisi status **ditolak** — konflik harus diselesaikan
     * lebih dulu, bukan dilewati.
     */
    syncConflictAt: timestamp('sync_conflict_at', { withTimezone: true }),
    syncConflictNote: text('sync_conflict_note'),

    // ── Pengulangan ──────────────────────────────────────────────────────

    isRecurring: boolean('is_recurring').notNull().default(false),
    recurrenceRule: text('recurrence_rule'),

    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('work_items_number_key').on(t.workNumber),
    index('work_items_status_idx').on(t.status),
    index('work_items_division_idx').on(t.divisionId),
    index('work_items_pic_idx').on(t.primaryPicId),
    index('work_items_period_idx').on(t.periodId),
    index('work_items_source_request_idx').on(t.sourceRequestId),
    check(
      'work_items_progress_range',
      sql`progress_percentage between 0 and 100`,
    ),
    check(
      'work_items_hold_reason_required',
      sql`status <> 'on_hold' or (hold_reason is not null and hold_reason <> '')`,
    ),
    check(
      'work_items_completion_summary_required',
      sql`status <> 'done' or (completion_summary is not null and completion_summary <> '')`,
    ),
  ],
);

/**
 * Permintaan lintas divisi.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`request_type` menjadi `type`.** Nama tabelnya sudah `requests`; mengulang
 * kata "request" di nama kolomnya tidak menambah keterangan apa pun, dan
 * `work_items` memang sudah memakai `type`.
 *
 * **`status` tetap `status`,** tetapi nilainya kini memakai `request_status`
 * yang baru — `perlu_klarifikasi` menjadi `need_clarification` dan berdiri
 * sendiri, tidak pernah dipetakan ke `need_review` (temuan #5).
 *
 * **`linked_work_item_id` tetap ada,** tetapi tidak lagi diisi oleh trigger.
 * Pekerjaan terhubung dibuat saat permintaan **diajukan**, bukan saat disimpan
 * sebagai draft (temuan #7), dan pembuatannya dilakukan lapisan aplikasi di
 * dalam satu transaksi bersama perubahan statusnya (temuan #16).
 */
export const requests = pgTable(
  'requests',
  {
    id: primaryId(),

    /** `REQ-2026-00001` — tabel penghitung, bukan sequence. */
    requestNumber: text('request_number').notNull(),

    requesterId: uuid('requester_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    requesterDivisionId: uuid('requester_division_id').references(
      () => divisions.id,
      { onDelete: 'set null' },
    ),

    /**
     * `restrict`, bukan `set null`: permintaan tanpa divisi tujuan tidak berarti
     * apa-apa, dan menghapus divisi yang masih punya permintaan berjalan adalah
     * kesalahan yang harus ditolak — bukan ditelan.
     */
    targetDivisionId: uuid('target_division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'restrict' }),

    type: requestTypeEnum('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),

    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),
    subunitId: uuid('subunit_id').references(() => subunits.id, {
      onDelete: 'set null',
    }),
    assignedPicId: uuid('assigned_pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    priority: priorityLevelEnum('priority').notNull().default('medium'),
    dueDate: date('due_date'),

    status: requestStatusEnum('status').notNull().default('draft'),

    /**
     * Kolom tambahan per jenis permintaan.
     *
     * Dipertahankan dari `sksks`. Empat belas jenis permintaan punya kebutuhan
     * yang berbeda-beda (nomor rekening untuk RAB, ukuran untuk desain), dan
     * membuat empat belas tabel untuk itu akan jauh lebih mahal daripada satu
     * kolom `jsonb` yang divalidasi skema Zod per jenis.
     */
    extraFields: jsonb('extra_fields').notNull().default({}),

    /** Wajib diisi saat status menjadi `need_clarification`. */
    clarificationNote: text('clarification_note'),
    /** Wajib diisi saat status menjadi `done`. */
    resultSummary: text('result_summary'),
    /** Wajib diisi saat status menjadi `on_hold` (keputusan 48). */
    holdReason: text('hold_reason'),

    linkedWorkItemId: uuid('linked_work_item_id').references(
      (): AnyPgColumn => workItems.id,
      { onDelete: 'set null' },
    ),

    /** Keputusan 49 — lihat catatan pada `work_items.sync_conflict_at`. */
    syncConflictAt: timestamp('sync_conflict_at', { withTimezone: true }),
    syncConflictNote: text('sync_conflict_note'),

    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('requests_number_key').on(t.requestNumber),
    index('requests_status_idx').on(t.status),
    index('requests_target_division_idx').on(t.targetDivisionId),
    index('requests_requester_idx').on(t.requesterId),
    index('requests_pic_idx').on(t.assignedPicId),
    index('requests_period_idx').on(t.periodId),
    check(
      'requests_clarification_note_required',
      sql`status <> 'need_clarification' or (clarification_note is not null and clarification_note <> '')`,
    ),
    check(
      'requests_result_summary_required',
      sql`status <> 'done' or (result_summary is not null and result_summary <> '')`,
    ),
    check(
      'requests_hold_reason_required',
      sql`status <> 'on_hold' or (hold_reason is not null and hold_reason <> '')`,
    ),
  ],
);

/**
 * Pekerjaan yang dikerjakan bersama.
 *
 * Kunci gabungan — seseorang tidak bisa ditugaskan dua kali pada pekerjaan yang
 * sama. Di `sksks` tabel ini ada di grup RLS "open collaboration" tetapi
 * policy DELETE-nya ditimpa migrasi berikutnya, sehingga **urutan pemuatan
 * berkas** menentukan siapa yang boleh menghapus (temuan #18). Sekarang policy
 * hanya ada di satu tempat: matriks di backend.
 */
export const workItemAssignees = pgTable(
  'work_item_assignees',
  {
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.profileId] })],
);

export const workItemChecklists = pgTable(
  'work_item_checklists',
  {
    id: primaryId(),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('work_item_checklists_item_idx').on(t.workItemId)],
);

/**
 * Pekerjaan yang menghalangi pekerjaan lain.
 *
 * `check (work_item_id <> depends_on_id)` dipertahankan dari `sksks` — sebuah
 * pekerjaan tidak bisa menghalangi dirinya sendiri. Yang **tidak** dijaga di
 * sini adalah rantai melingkar (A menunggu B, B menunggu A): PostgreSQL tidak
 * bisa menyatakannya sebagai constraint, dan pemeriksaannya ada di aplikasi.
 */
export const workItemDependencies = pgTable(
  'work_item_dependencies',
  {
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    dependsOnId: uuid('depends_on_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workItemId, t.dependsOnId] }),
    check('work_item_dependencies_no_self', sql`work_item_id <> depends_on_id`),
  ],
);

/**
 * Riwayat perubahan status pekerjaan.
 *
 * `from_status` nullable karena baris pertama tidak punya asal — pekerjaan
 * lahir langsung pada status awalnya.
 */
export const workItemStatusHistory = pgTable(
  'work_item_status_history',
  {
    id: primaryId(),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    fromStatus: workStatusEnum('from_status'),
    toStatus: workStatusEnum('to_status').notNull(),
    note: text('note'),
    changedBy: uuid('changed_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('work_item_status_history_item_idx').on(t.workItemId)],
);

/**
 * Tonggak — titik pada garis waktu KKN.
 *
 * Status dan prioritasnya memakai enum yang sama dengan pekerjaan
 * (`work_status`, `priority_level`), karena di `sksks` pun begitu: sebuah
 * tonggak punya status yang sama, prioritas yang sama, dan bisa tertahan
 * dengan alasan yang sama seperti pekerjaan biasa.
 *
 * ## `phase` dibuang, sama seperti pada `work_items`
 *
 * `sksks` menyimpan fase KKN (`pre_kkn`/`kkn`/`post_kkn`) di sini **dan** di
 * `work_items`. Di sistem baru fase adalah sifat **periode**: satu periode
 * memiliki satu fase, dan tonggak menunjuk periodenya. Jadi pre-KKN, KKN, dan
 * pasca-KKN adalah tiga baris `periods`, dan hanya satu yang aktif pada satu
 * waktu — dijaga `periods_active_key`.
 *
 * Menyimpannya di sini juga berarti tonggak dan pekerjaan induknya bisa
 * berbeda fase tanpa ada aturan mana yang menang.
 *
 * `work_item_id` **nullable**: tonggak boleh berdiri sendiri sebagai penanda
 * jadwal, tanpa pekerjaan yang menaunginya.
 */
export const milestones = pgTable(
  'milestones',
  {
    id: primaryId(),

    workItemId: uuid('work_item_id').references(() => workItems.id, {
      onDelete: 'cascade',
    }),

    name: text('name').notNull(),

    startDate: date('start_date'),
    endDate: date('end_date'),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    divisionId: uuid('division_id').references(() => divisions.id, {
      onDelete: 'set null',
    }),
    periodId: uuid('period_id').references(() => periods.id, {
      onDelete: 'restrict',
    }),

    priority: priorityLevelEnum('priority').notNull().default('medium'),
    status: workStatusEnum('status').notNull().default('draft'),
    progressPercentage: integer('progress_percentage').notNull().default(0),

    note: text('note'),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    index('milestones_work_item_idx').on(t.workItemId),
    index('milestones_period_idx').on(t.periodId),
    index('milestones_status_idx').on(t.status),
    check(
      'milestones_progress_range',
      sql`progress_percentage between 0 and 100`,
    ),
    check(
      'milestones_dates_ordered',
      sql`end_date is null or start_date is null or end_date >= start_date`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const workItemsRelations = relations(workItems, ({ one, many }) => ({
  primaryPic: one(profiles, {
    fields: [workItems.primaryPicId],
    references: [profiles.id],
  }),
  division: one(divisions, {
    fields: [workItems.divisionId],
    references: [divisions.id],
  }),
  program: one(programs, {
    fields: [workItems.programId],
    references: [programs.id],
  }),
  period: one(periods, {
    fields: [workItems.periodId],
    references: [periods.id],
  }),
  sourceRequest: one(requests, {
    fields: [workItems.sourceRequestId],
    references: [requests.id],
  }),
  assignees: many(workItemAssignees),
  checklists: many(workItemChecklists),
  statusHistory: many(workItemStatusHistory),
  milestones: many(milestones),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  workItem: one(workItems, {
    fields: [milestones.workItemId],
    references: [workItems.id],
  }),
  pic: one(profiles, { fields: [milestones.picId], references: [profiles.id] }),
  division: one(divisions, {
    fields: [milestones.divisionId],
    references: [divisions.id],
  }),
  period: one(periods, {
    fields: [milestones.periodId],
    references: [periods.id],
  }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  requester: one(profiles, {
    fields: [requests.requesterId],
    references: [profiles.id],
  }),
  targetDivision: one(divisions, {
    fields: [requests.targetDivisionId],
    references: [divisions.id],
  }),
  assignedPic: one(profiles, {
    fields: [requests.assignedPicId],
    references: [profiles.id],
  }),
  linkedWorkItem: one(workItems, {
    fields: [requests.linkedWorkItemId],
    references: [workItems.id],
  }),
}));

export const workItemAssigneesRelations = relations(
  workItemAssignees,
  ({ one }) => ({
    workItem: one(workItems, {
      fields: [workItemAssignees.workItemId],
      references: [workItems.id],
    }),
    profile: one(profiles, {
      fields: [workItemAssignees.profileId],
      references: [profiles.id],
    }),
  }),
);
