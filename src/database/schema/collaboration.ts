import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import {
  calendarEventTypeEnum,
  meetingTypeEnum,
  notificationKindEnum,
  priorityLevelEnum,
  rsvpStatusEnum,
  workStatusEnum,
} from './enums';
import {
  clusters,
  divisions,
  periods,
  profiles,
  subunits,
} from './organization';
import { workItems } from './work';

/**
 * Kolaborasi — rapat, kalender, pengumuman, komentar, lampiran, notifikasi.
 *
 * ## Rapat dan kalender adalah dua hal yang berbeda
 *
 * `sksks` memisahkannya dengan sadar, dan pemisahan itu dipertahankan — berkas
 * migrasi kalender menyebutkannya sendiri: `meetings` untuk **notulensi dan
 * keputusan rapat yang sudah terjadi**, `calendar_events` untuk **penjadwalan
 * agenda yang akan datang**, lengkap dengan pengulangan, peserta, dan RSVP.
 *
 * Menggabungkannya menjadi satu tabel akan memaksa setiap agenda terjadwal
 * memiliki kolom notulen yang kosong, dan setiap rapat yang sudah lewat
 * memiliki kolom RSVP yang tidak pernah diisi. Yang menyatukan keduanya adalah
 * satu kolom: `calendar_events.linked_meeting_id`.
 */

export const meetings = pgTable(
  'meetings',
  {
    id: primaryId(),

    title: text('title').notNull(),
    meetingType: meetingTypeEnum('meeting_type')
      .notNull()
      .default('division_meeting'),

    heldAt: timestamp('held_at', { withTimezone: true }).notNull(),
    locationOrMedia: text('location_or_media'),

    leaderId: uuid('leader_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    divisionId: uuid('division_id').references(() => divisions.id, {
      onDelete: 'set null',
    }),

    agenda: text('agenda'),
    summary: text('summary'),

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
    index('meetings_held_at_idx').on(t.heldAt),
    index('meetings_division_idx').on(t.divisionId),
    index('meetings_period_idx').on(t.periodId),
  ],
);

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.profileId] }),
    index('meeting_participants_profile_idx').on(t.profileId),
  ],
);

/**
 * Keputusan rapat.
 *
 * **Statusnya memakai `work_status` yang sama dengan pekerjaan.** Bukan enum
 * sendiri — di `sksks` pun keduanya memakai `global_status`, dan itu memang
 * benar: keputusan rapat adalah pekerjaan yang belum diangkat menjadi
 * pekerjaan. Ia punya status yang sama, prioritas yang sama, dan tenggat yang
 * sama.
 *
 * `work_item_id` diisi saat keputusan itu **ditindaklanjuti** menjadi pekerjaan
 * nyata (tipe `meeting_follow_up`), dan dari sisi sebaliknya
 * `work_items.source_meeting_decision_id` menunjuk balik ke sini. Keduanya
 * `on delete set null`: memutus tautannya tidak boleh menghapus salah satu
 * pihaknya — keputusan rapat tetap keputusan meski pekerjaannya dibatalkan.
 */
export const meetingDecisions = pgTable(
  'meeting_decisions',
  {
    id: primaryId(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),

    decisionText: text('decision_text').notNull(),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    dueDate: date('due_date'),

    priority: priorityLevelEnum('priority').notNull().default('medium'),
    status: workStatusEnum('status').notNull().default('draft'),

    workItemId: uuid('work_item_id').references(() => workItems.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('meeting_decisions_meeting_idx').on(t.meetingId),
    index('meeting_decisions_status_idx').on(t.status),
  ],
);

/**
 * Agenda terjadwal — sumber Kalender Besar.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`visibility` dan `status` tetap teks**, dengan alasan yang sama seperti
 * `transactions.status`: keduanya teks bebas di sana, tidak pernah diperiksa
 * kode mana pun, dan nilainya hanya berubah ejaan (`'semua'` → `'all'`,
 * `'terjadwal'` → `'scheduled'`).
 *
 * **`timezone` dipertahankan sebagai kolom.** Terlihat berlebihan untuk
 * organisasi yang seluruh kegiatannya di satu zona waktu — tetapi waktunya
 * disimpan `timestamptz`, dan `timestamptz` **tidak menyimpan zona waktu asal**,
 * hanya titik waktunya. Tanpa kolom ini, agenda yang dibuat dalam WIB akan
 * ditampilkan dalam zona waktu apa pun yang dipakai peramban pembacanya, dan
 * rapat pukul 19.00 WIB akan terlihat pukul 12.00 bagi anggota yang sedang di
 * luar negeri. Nilai bawaannya tetap `Asia/Jakarta`.
 *
 * **`is_cancelled` dipertahankan, terpisah dari `status`.** Agenda yang
 * dibatalkan tetap harus terlihat di kalender sebagai bekas — itulah bedanya
 * dibatalkan dengan dihapus.
 */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: primaryId(),

    title: text('title').notNull(),
    eventType: calendarEventTypeEnum('event_type').notNull().default('other'),

    organizerId: uuid('organizer_id').references(() => profiles.id, {
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

    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),

    /** IANA, mis. `Asia/Jakarta`. Lihat catatan di atas. */
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    allDay: boolean('all_day').notNull().default(false),

    location: text('location'),
    meetingLink: text('meeting_link'),
    agenda: text('agenda'),

    visibility: text('visibility').notNull().default('all'),

    // ── Pengulangan ──────────────────────────────────────────────────────

    /**
     * Aturan pengulangan (RFC 5545 RRULE), dan tanggal berakhirnya.
     *
     * Satu baris per kejadian, dihubungkan `recurrence_parent_id`. Baris induk
     * adalah kejadian pertama; `recurrence_parent_id` menunjuk ke sana, bukan
     * ke kejadian sebelumnya — sehingga membatalkan seluruh deret cukup dengan
     * satu pemeriksaan pada induknya.
     */
    recurrenceRule: text('recurrence_rule'),
    recurrenceEndDate: date('recurrence_end_date'),
    recurrenceParentId: uuid('recurrence_parent_id').references(
      (): AnyPgColumn => calendarEvents.id,
      { onDelete: 'cascade' },
    ),

    isCancelled: boolean('is_cancelled').notNull().default(false),

    linkedWorkItemId: uuid('linked_work_item_id').references(
      () => workItems.id,
      { onDelete: 'set null' },
    ),
    linkedMeetingId: uuid('linked_meeting_id').references(() => meetings.id, {
      onDelete: 'set null',
    }),

    status: text('status').notNull().default('scheduled'),

    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    version: version(),
    ...hidingColumns(),
    ...timestamps(),
  },
  (t) => [
    index('calendar_events_start_idx').on(t.startAt),
    index('calendar_events_division_idx').on(t.divisionId),
    index('calendar_events_parent_idx').on(t.recurrenceParentId),
    // Agenda yang dibatalkan tidak pernah ditampilkan; indeks parsial membuat
    // daftar agenda mendatang tidak memindai baris yang sudah tidak berlaku.
    index('calendar_events_active_idx')
      .on(t.startAt)
      .where(sql`not is_cancelled`),
  ],
);

/**
 * Peserta agenda, dengan RSVP.
 *
 * `profile_id` **nullable** karena peserta bisa orang luar yang tidak punya
 * akun — `external_name` dan `external_email` yang mengisinya.
 *
 * Karena itu `unique (event_id, profile_id)` di `sksks` tidak cukup: di
 * PostgreSQL, banyak baris berisi `NULL` tidak saling bertabrakan, sehingga
 * satu agenda bisa punya sepuluh peserta luar bernama beda — yang memang
 * diinginkan — tetapi **tidak** bisa mencegah orang yang sama diundang dua kali
 * kalau salah satunya lewat `profile_id` dan satu lagi lewat nama luar. Yang
 * bisa dijaga skema hanyalah paruh pertamanya: satu orang dalam, satu undangan.
 * Indeksnya dibuat parsial untuk tepat itu.
 */
export const calendarEventAttendees = pgTable(
  'calendar_event_attendees',
  {
    id: primaryId(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),

    profileId: uuid('profile_id').references(() => profiles.id, {
      onDelete: 'cascade',
    }),
    externalName: text('external_name'),
    externalEmail: text('external_email'),

    isOptional: boolean('is_optional').notNull().default(false),
    rsvpStatus: rsvpStatusEnum('rsvp_status').notNull().default('no_response'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('calendar_event_attendees_unique_member')
      .on(t.eventId, t.profileId)
      .where(sql`profile_id is not null`),
    index('calendar_event_attendees_event_idx').on(t.eventId),
    index('calendar_event_attendees_profile_idx').on(t.profileId),
    // Salah satu dari keduanya harus ada: peserta adalah anggota, atau orang
    // luar yang punya nama. Baris tanpa keduanya tidak menggambarkan siapa pun.
    check(
      'calendar_event_attendees_identity_required',
      sql`profile_id is not null or external_name is not null`,
    ),
  ],
);

export const announcements = pgTable(
  'announcements',
  {
    id: primaryId(),

    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),

    divisionId: uuid('division_id').references(() => divisions.id, {
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
    index('announcements_created_at_idx').on(t.createdAt),
    index('announcements_division_idx').on(t.divisionId),
  ],
);

/**
 * Komentar pada entitas apa pun.
 *
 * ## `entity_type` + `entity_id` — dan apa yang tidak dijaganya
 *
 * Pasangan ini menunjuk ke tabel mana pun, dan **tidak bisa** punya foreign key
 * karena PostgreSQL tidak punya acuan polimorfik. Konsekuensinya nyata:
 *
 * - Komentar yatim tidak tertolak database. Menghapus sebuah pekerjaan tidak
 *   menghapus komentarnya, dan tidak ada yang memberi tahu.
 * - `entity_type` yang salah ketik membuat komentarnya tidak muncul di mana pun
 *   — tanpa galat, tanpa peringatan.
 *
 * Yang membuat ini bisa diterima, dan bukan kelalaian: **tidak ada yang benar-
 * benar dihapus di sistem ini.** Penyembunyian memakai `deleted_at` dan
 * `archived_at`, dan barisnya tetap ada — jadi komentarnya tetap menunjuk baris
 * yang benar. Penghapusan keras hanya terjadi lewat pembersihan recycle bin,
 * dan di situlah komentar anaknya ikut dibersihkan, oleh lapisan aplikasi.
 *
 * Nilai `entity_type` yang sah adalah daftar tertutup di paket
 * `@samudrakarsa/shared`, dipakai bersama oleh penulis dan pembacanya.
 *
 * `mentioned_profile_ids` dipertahankan dan diberi indeks GIN: dengan trigger
 * yang hilang, pertanyaan "komentar mana yang menyebut saya" harus bisa
 * dijawab query, bukan pemindaian teks. Daftar ini diisi lapisan aplikasi saat
 * menulis, dari penguraian isi komentar.
 */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),

    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),

    authorId: uuid('author_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),

    mentionedProfileIds: uuid('mentioned_profile_ids')
      .array()
      .notNull()
      .default([]),

    ...hidingColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('comments_entity_idx').on(t.entityType, t.entityId),
    index('comments_mentions_idx').using('gin', t.mentionedProfileIds),
  ],
);

/**
 * Lampiran berkas.
 *
 * `storage_path` adalah kunci objek di penyimpanan (Cloudflare R2 di sistem
 * baru), **bukan** URL. Itu disengaja: URL yang disimpan akan basi saat
 * kebijakan aksesnya berubah atau saat domainnya berganti, sedangkan kuncinya
 * tetap. URL yang bisa dipakai dibangkitkan saat dibaca, berlaku sebentar, dan
 * hanya untuk yang berhak.
 *
 * `file_size` memakai `bigint`. Berkas terbesar yang diizinkan jauh di bawah
 * batas bilangan bulat aman JavaScript, jadi modenya `number` — bukan karena
 * ukurannya tidak akan pernah besar, tetapi karena nilai di atas
 * `Number.MAX_SAFE_INTEGER` berarti 8 petabyte, dan berkas sebesar itu bukan
 * masalah yang perlu dipecahkan skema ini.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: primaryId(),

    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),

    fileName: text('file_name').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type'),
    fileSize: bigint('file_size', { mode: 'number' }),

    uploadedBy: uuid('uploaded_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    ...hidingColumns(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attachments_entity_idx').on(t.entityType, t.entityId),
    uniqueIndex('attachments_storage_path_key').on(t.storagePath),
  ],
);

/**
 * Notifikasi.
 *
 * `kind` menjadi enum — lihat catatan pada `notification_kind`.
 *
 * `read_at` nullable, bukan `is_read` boolean: kapan dibacanya adalah
 * keterangan yang hilang begitu ia disimpan sebagai boolean, dan notifikasi
 * yang menumpuk berhari-hari adalah hal yang ingin bisa dibedakan dari yang
 * dibaca sekilas.
 *
 * **Tidak ada `deleted_at`.** Notifikasi dihapus keras saat pembersihan, dan
 * itu disengaja: recycle bin berisi notifikasi hanya akan menjadi tempat sampah
 * yang tidak pernah dibuka. `sksks` juga tidak memberinya `deleted_at`.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),

    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    body: text('body'),

    entityType: text('entity_type'),
    entityId: uuid('entity_id'),

    kind: notificationKindEnum('kind').notNull().default('info'),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientId, t.readAt),
    index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  leader: one(profiles, {
    fields: [meetings.leaderId],
    references: [profiles.id],
  }),
  division: one(divisions, {
    fields: [meetings.divisionId],
    references: [divisions.id],
  }),
  period: one(periods, {
    fields: [meetings.periodId],
    references: [periods.id],
  }),
  participants: many(meetingParticipants),
  decisions: many(meetingDecisions),
}));

export const meetingParticipantsRelations = relations(
  meetingParticipants,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingParticipants.meetingId],
      references: [meetings.id],
    }),
    profile: one(profiles, {
      fields: [meetingParticipants.profileId],
      references: [profiles.id],
    }),
  }),
);

export const meetingDecisionsRelations = relations(
  meetingDecisions,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingDecisions.meetingId],
      references: [meetings.id],
    }),
    pic: one(profiles, {
      fields: [meetingDecisions.picId],
      references: [profiles.id],
    }),
    workItem: one(workItems, {
      fields: [meetingDecisions.workItemId],
      references: [workItems.id],
    }),
  }),
);

export const calendarEventsRelations = relations(
  calendarEvents,
  ({ one, many }) => ({
    organizer: one(profiles, {
      fields: [calendarEvents.organizerId],
      references: [profiles.id],
    }),
    division: one(divisions, {
      fields: [calendarEvents.divisionId],
      references: [divisions.id],
    }),
    parent: one(calendarEvents, {
      fields: [calendarEvents.recurrenceParentId],
      references: [calendarEvents.id],
      relationName: 'recurrence',
    }),
    linkedWorkItem: one(workItems, {
      fields: [calendarEvents.linkedWorkItemId],
      references: [workItems.id],
    }),
    linkedMeeting: one(meetings, {
      fields: [calendarEvents.linkedMeetingId],
      references: [meetings.id],
    }),
    attendees: many(calendarEventAttendees),
  }),
);

export const calendarEventAttendeesRelations = relations(
  calendarEventAttendees,
  ({ one }) => ({
    event: one(calendarEvents, {
      fields: [calendarEventAttendees.eventId],
      references: [calendarEvents.id],
    }),
    profile: one(profiles, {
      fields: [calendarEventAttendees.profileId],
      references: [profiles.id],
    }),
  }),
);

export const announcementsRelations = relations(announcements, ({ one }) => ({
  division: one(divisions, {
    fields: [announcements.divisionId],
    references: [divisions.id],
  }),
  period: one(periods, {
    fields: [announcements.periodId],
    references: [periods.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(profiles, {
    fields: [comments.authorId],
    references: [profiles.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(profiles, {
    fields: [notifications.recipientId],
    references: [profiles.id],
  }),
}));

// `attachments` tidak punya relasi: `uploaded_by` menunjuk profil, tetapi
// lampiran hampir selalu dibaca sebagai daftar berkas milik satu entitas —
// `(entity_type, entity_id)` — bukan sebagai baris yang perlu profilnya.
