import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_columns';
import { roleEnum } from './enums';
import { profiles } from './organization';

/**
 * Sistem — audit, versi, sesi, idempotensi, transisi status, batas laju.
 *
 * ## Kenapa berkas ini berbeda dari yang lain
 *
 * Seluruh berkas skema lain menggambarkan **pekerjaan organisasi**: apa yang
 * dikerjakan, oleh siapa, dengan uang berapa. Berkas ini menggambarkan
 * **sistemnya sendiri** — bagaimana perubahan dicatat, bagaimana sesi dijaga,
 * bagaimana permintaan yang terkirim dua kali tidak dikerjakan dua kali.
 *
 * Di `sksks`, sebagian besar isi berkas ini dikerjakan **trigger**:
 * `log_activity`, `save_record_version`, dan pemeriksaan soft delete menempel
 * pada delapan tabel dan berjalan tanpa bisa dilewati. Di sistem baru tidak ada
 * trigger yang menulis catatan audit — seluruhnya dikerjakan lapisan aplikasi.
 *
 * Akibatnya perlu disebut terus terang: **satu aksi pengguna berhenti menjadi
 * enam penulisan database otomatis**, dan perpindahan itu memindahkan tanggung
 * jawab dari database ke kode. Yang menjaganya bukan lagi skema, melainkan
 * satu tempat di aplikasi yang menulis catatan audit — dan karena itu tempat
 * itu harus tunggal.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Catatan audit.
 *
 * ## Tabel yang hanya ditambah
 *
 * Tidak ada `updated_at`, tidak ada `deleted_at`, tidak ada `version`. Catatan
 * audit yang bisa diubah bukan catatan audit. Karena itu pula pencabutan hak
 * tulis untuk klien dipertahankan di sistem baru: di `sksks`, fungsi
 * `log_activity` dicabut dari `public` supaya klien tidak bisa menulis catatan
 * audit sendiri — dan pencabutan itu harus tetap ada sebagai aturan di lapisan
 * API.
 *
 * ## Pembacaan ikut dicatat (keputusan 39)
 *
 * `sksks` hanya mencatat **perubahan** (temuan #12). Keputusan 39 meminta
 * pembacaan keuangan, persuratan, dan masukan privat ikut tercatat — karena
 * pertanyaan "siapa yang sudah melihat data ini" tidak bisa dijawab oleh
 * catatan yang hanya berisi perubahan.
 *
 * Konsekuensinya nyata dan sudah diperhitungkan: satu pembacaan daftar
 * transaksi menjadi satu penulisan tambahan. Karena itu `action` menyimpan
 * `read` sebagai nilai yang setara dengan `create`/`update`/`delete`, dan
 * penyaringnya ada di indeks — bukan di pemindaian seluruh tabel.
 *
 * ## Kenapa `action` teks, bukan enum
 *
 * Berbeda dari `notification_kind`, yang jenisnya dipilih frontend untuk
 * menentukan ikon. `action` dibaca oleh **penyaring dan laporan**, dan
 * jumlahnya bertambah setiap kali modul baru masuk — dua puluh tiga modul
 * direncanakan. Enum yang harus dimigrasikan setiap kali ada aksi baru akan
 * membuat orang memakai aksi yang sudah ada untuk hal yang bukan itu, dan
 * catatan audit yang memakai kata yang salah lebih buruk daripada catatan
 * audit yang kosong. Daftar nilai yang sah tetap ada — di paket
 * `@samudrakarsa/shared`, satu tempat untuk penulis dan pembacanya.
 *
 * `before_data`/`after_data` nullable: satu operasi bisa punya keduanya
 * (perubahan), hanya `after` (pembuatan), hanya `before` (penghapusan), atau
 * tidak keduanya (pembacaan).
 */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: primaryId(),

    actorId: uuid('actor_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    action: text('action').notNull(),

    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),

    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),

    /**
     * Konteks permintaan — diisi dari middleware, bukan dari isi permintaan.
     * `request_id` yang sama juga dikembalikan ke klien sebagai header, supaya
     * satu aksi yang dilaporkan pengguna bisa dicari langsung.
     */
    requestId: text('request_id'),
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('activity_logs_entity_idx').on(t.entityType, t.entityId),
    index('activity_logs_created_idx').on(t.createdAt),
    index('activity_logs_actor_idx').on(t.actorId, t.createdAt),
    index('activity_logs_action_idx').on(t.action),
  ],
);

/**
 * Cuplikan versi baris.
 *
 * Di `sksks` tabel ini diisi trigger `save_record_version` yang berjalan pada
 * setiap pembaruan delapan tabel. Isinya adalah `to_jsonb(old)` — seluruh baris
 * sebelum perubahan.
 *
 * Bentuknya dipertahankan, dengan satu tambahan yang penting: **`version_number`
 * di sini berbeda dari kolom `version` pada tabelnya.** Kolom `version` adalah
 * penghitung untuk optimistic locking (§7.16) dan hanya bergerak saat penulisan
 * berhasil. `version_number` di sini adalah nomor urut cuplikan, dan ia harus
 * tetap berurutan meski ada penulisan yang gagal di antaranya — kalau tidak,
 * "kembalikan ke versi 5" bisa menunjuk baris yang berbeda dari yang dilihat
 * pengguna saat itu.
 */
export const recordVersions = pgTable(
  'record_versions',
  {
    id: primaryId(),

    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),

    versionNumber: integer('version_number').notNull(),
    snapshot: jsonb('snapshot').notNull(),

    changedBy: uuid('changed_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('record_versions_entity_version_key').on(
      t.entityType,
      t.entityId,
      t.versionNumber,
    ),
    index('record_versions_entity_idx').on(
      t.entityType,
      t.entityId,
      t.versionNumber,
    ),
    check('record_versions_number_positive', sql`version_number > 0`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Transisi status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transisi status yang sah — sebagai data.
 *
 * ## Masalah yang dipecahkan
 *
 * `sksks` tidak punya satu pun aturan transisi (temuan #3). Kolom status adalah
 * enum biasa, dan **nilai apa pun boleh berpindah ke nilai apa pun**: `draft`
 * bisa langsung menjadi `done` tanpa melewati satu pun syarat perjalanan. Yang
 * ada hanyalah pencatatan setelah kejadian (`work_item_status_history`), bukan
 * penolakan sebelum kejadian.
 *
 * ## Kenapa tabel, bukan konstanta di kode
 *
 * Aturan ini dibaca oleh **dua sisi**: backend untuk menolak, frontend untuk
 * menentukan tombol mana yang bisa ditekan. Kalau ia hidup di dua tempat, ia
 * akan berbeda — dan perbedaannya baru ketahuan saat ada yang menekan tombol
 * yang seharusnya tidak ada.
 *
 * Sebuah konstanta di paket bersama menyelesaikannya untuk keduanya, tetapi
 * menambah satu syarat: aturan yang berubah menuntut penerapan ulang di dua
 * tempat sekaligus. Sebagai tabel, ia dibaca dari satu sumber oleh keduanya,
 * dan perubahannya tidak menuntut deploy apa pun.
 *
 * Yang tetap ada di kode adalah **fungsi murni** yang mengevaluasi tabel ini
 * terhadap peran seorang aktor dan status baris saat ini. Tabel menyimpan
 * datanya; fungsi menyimpan logikanya.
 *
 * ## Kenapa statusnya teks
 *
 * `entity_type` menentukan enum mana yang berlaku: `work_item` memakai
 * `work_status`, `request` memakai `request_status`, `letter` memakai
 * `letter_status`. Tidak ada satu enum PostgreSQL yang bisa memuat nilai dari
 * beberapa enum sekaligus, jadi kolomnya harus teks.
 *
 * Yang menggantikan jaminan enum: foreign key tidak bisa, tetapi sebuah baris di
 * sini yang menyebut status yang tidak ada di enumnya tidak akan pernah cocok
 * dengan baris mana pun — sehingga efeknya adalah transisi yang tidak pernah
 * tersedia, bukan transisi yang salah. Itu gagal dengan cara yang aman, dan
 * pemeriksaan daftarnya ada di uji Fase 3.
 */
export const statusTransitions = pgTable(
  'status_transitions',
  {
    id: primaryId(),

    entityType: text('entity_type').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),

    /**
     * Peran yang boleh menjalankan transisi ini.
     *
     * Array, bukan satu nilai — sama alasannya dengan `profiles.roles`
     * (keputusan 52). Sebuah transisi sering boleh dijalankan lebih dari satu
     * peran: menerima permintaan boleh dilakukan kepala divisi **dan**
     * wakilnya.
     */
    allowedRoles: roleEnum('allowed_roles').array().notNull(),

    /**
     * Kolom yang harus terisi sebelum transisi ini sah.
     *
     * Data, bukan kode: `work_item` menuju `done` menuntut
     * `completion_summary`, menuju `on_hold` menuntut `hold_reason`
     * (keputusan 48). Menyimpannya sebagai daftar nama kolom membuat aturan
     * baru tidak menuntut perubahan skema.
     *
     * Ini **melengkapi**, bukan menggantikan, `check` constraint di tabelnya.
     * Constraint menjaga barisnya tetap benar apa pun jalur penulisannya;
     * kolom ini memberi tahu pengguna apa yang kurang **sebelum** ia mencoba.
     */
    requiredFields: text('required_fields').array().notNull().default([]),

    /** Urutan tampil di antarmuka. Tombol yang paling sering dipakai lebih dulu. */
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('status_transitions_edge_key').on(
      t.entityType,
      t.fromStatus,
      t.toStatus,
    ),
    index('status_transitions_lookup_idx').on(t.entityType, t.fromStatus),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Sesi & autentikasi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh token.
 *
 * ## Kenapa `token_hash`, bukan `token`
 *
 * Yang disimpan adalah hash-nya, dan token mentahnya hanya ada di tangan
 * pemiliknya. Kalau tabel ini bocor, isinya tidak bisa dipakai untuk masuk —
 * dan itu perbedaan antara satu insiden dan seluruh akun.
 *
 * Hashnya cukup dengan SHA-256, **bukan argon2id**: token ini 256 bit acak dari
 * pembangkit yang aman, bukan kata sandi yang ditebak manusia. Fungsi hash yang
 * lambat justru merugikan di sini, karena ia dijalankan pada setiap penyegaran
 * token.
 *
 * ## Rotasi
 *
 * `replaced_by_id` menunjuk token yang menggantikan baris ini saat rotasi.
 * Adanya kolom itu membuat **pemakaian ulang token yang sudah dirotasi** bisa
 * dikenali: token lama yang datang lagi berarti ada dua pemegangnya, dan seluruh
 * keluarga tokennya harus dicabut. Tanpa kolom ini, pemakaian ulang tidak bisa
 * dibedakan dari permintaan biasa.
 *
 * `revoked_at` dipakai untuk pencabutan, bukan penghapusan baris — supaya
 * pemakaian ulang setelah pencabutan tetap terlihat.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),

    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** SHA-256 dari token mentah. Token mentahnya tidak pernah disimpan. */
    tokenHash: text('token_hash').notNull(),

    /** Sesi yang sama bisa dikenali dan dicabut bersama. */
    familyId: uuid('family_id').notNull(),
    replacedById: uuid('replaced_by_id').references(
      (): AnyPgColumn => refreshTokens.id,
      { onDelete: 'set null' },
    ),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    index('refresh_tokens_profile_idx').on(t.profileId),
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Idempotensi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kunci idempotensi.
 *
 * Klien mengirim `Idempotency-Key` pada permintaan yang mengubah keadaan.
 * Backend menyimpan hasilnya di sini, dan permintaan berikutnya dengan kunci
 * yang sama **mengembalikan hasil yang sama** tanpa mengerjakannya lagi.
 *
 * ## Kenapa ini bukan kemewahan
 *
 * Di bentuk serverless, sebuah permintaan yang kehabisan waktu bisa saja tetap
 * selesai di sisi server sementara kliennya sudah menerima galat — lalu klien
 * mencobanya lagi. Untuk pembuatan pekerjaan, itu berarti dua pekerjaan. Untuk
 * transaksi keuangan, itu berarti uang keluar dua kali. Tidak ada cara
 * membedakan "belum dikerjakan" dari "sudah dikerjakan tapi jawabannya hilang"
 * tanpa menyimpan jawabannya.
 *
 * ## Bentuknya
 *
 * `request_hash` adalah sidik jari isi permintaan. Kalau kunci yang sama datang
 * dengan isi yang **berbeda**, itu bukan percobaan ulang melainkan
 * kesalahan pemakaian kunci — dan jawabannya `409`, bukan hasil yang lama.
 * Tanpa kolom itu, permintaan kedua yang berbeda isinya akan diam-diam
 * mendapat jawaban permintaan pertama.
 *
 * `response_body` disimpan apa adanya supaya percobaan ulang menerima jawaban
 * yang **persis** sama, bukan jawaban yang disusun ulang dari keadaan yang
 * mungkin sudah berubah.
 *
 * Barisnya kedaluwarsa dan dibersihkan berkala; `expires_at` yang menentukan,
 * bukan penghapusan segera — karena percobaan ulang datang dalam hitungan
 * detik, bukan jam.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    /** Kunci dari klien. Ia identitas barisnya — bukan `id` yang dibuat sendiri. */
    key: text('key').primaryKey(),

    profileId: uuid('profile_id').references(() => profiles.id, {
      onDelete: 'cascade',
    }),

    method: text('method').notNull(),
    path: text('path').notNull(),

    /** SHA-256 dari isi permintaan. Lihat catatan di atas. */
    requestHash: text('request_hash').notNull(),

    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idempotency_keys_expires_idx').on(t.expiresAt),
    index('idempotency_keys_profile_idx').on(t.profileId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Batas laju
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penghitung batas laju.
 *
 * ## Kenapa di database, bukan di memori
 *
 * Pembatas laju yang menyimpan hitungannya di memori proses bekerja baik pada
 * server tunggal yang hidup lama. Di bentuk serverless, setiap instans punya
 * memorinya sendiri, hidup sebentar, lalu mati — sehingga "lima percobaan per
 * menit" menjadi lima percobaan **per instans**, dan jumlah instansnya tidak
 * ada yang tahu. Penyerang tidak perlu mengalahkan pembatasnya; ia hanya perlu
 * memanggil cukup banyak instans.
 *
 * Karena itu hitungannya di database. Harganya satu penulisan per permintaan
 * yang dibatasi — dan karena itu **hanya jalur yang benar-benar perlu** yang
 * dibatasi: masuk, lupa kata sandi, dan pengiriman surel. Membatasi seluruh
 * API dengan cara ini akan menjadikan setiap pembacaan daftar sebagai penulisan.
 *
 * `bucket_key` adalah gabungan yang menentukan batasnya — misalnya
 * `login:email:nama@contoh.id` atau `login:ip:203.0.113.7`. Disimpan sebagai
 * satu teks, bukan tiga kolom, karena tiap jalur membatasi atas dasar yang
 * berbeda dan kolom tetap akan memaksa semua jalur memakai dasar yang sama.
 *
 * Satu baris per (kunci, jendela waktu), bukan satu baris per permintaan:
 * percobaan ketiga cukup menaikkan `count` baris yang sama.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    bucketKey: text('bucket_key').notNull(),

    /** Awal jendela waktunya, dibulatkan. Jendela tetap, bukan jendela bergulir. */
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),

    count: integer('count').notNull().default(0),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('rate_limit_counters_bucket_window_key').on(
      t.bucketKey,
      t.windowStart,
    ),
    index('rate_limit_counters_window_idx').on(t.windowStart),
    check('rate_limit_counters_count_not_negative', sql`count >= 0`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Ekspor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permintaan ekspor berkas.
 *
 * Dipertahankan dari `sksks` apa adanya, dengan satu perubahan: `status` tetap
 * teks tetapi nilainya menjadi `'processing'`/`'done'`/`'failed'` — di sana
 * hanya `'processing'` yang pernah ditulis, dan tidak ada kode yang pernah
 * mengubahnya.
 *
 * **Nama variabelnya `exportRequests`, bukan `exports`.** `exports` adalah nama
 * yang dicadangkan CommonJS di lingkup teratas sebuah modul, dan TypeScript
 * menolaknya dengan `TS2441` — bukan sebagai peringatan, melainkan sebagai
 * error yang menghentikan build. Nama **tabelnya tetap `exports`**, karena itu
 * yang sudah ada di `sksks` dan yang akan dibaca siapa pun yang membandingkan
 * kedua skema. Jangan "rapikan" nama variabel ini kembali menjadi `exports`.
 */
export const exportRequests = pgTable(
  'exports',
  {
    id: primaryId(),

    requestedBy: uuid('requested_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    exportKind: text('export_kind').notNull(),
    format: text('format').notNull(),
    filterSnapshot: jsonb('filter_snapshot'),

    filePath: text('file_path'),
    status: text('status').notNull().default('processing'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('exports_requested_by_idx').on(t.requestedBy, t.createdAt)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relasi
// ─────────────────────────────────────────────────────────────────────────────

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  actor: one(profiles, {
    fields: [activityLogs.actorId],
    references: [profiles.id],
  }),
}));

export const recordVersionsRelations = relations(recordVersions, ({ one }) => ({
  changedByProfile: one(profiles, {
    fields: [recordVersions.changedBy],
    references: [profiles.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  profile: one(profiles, {
    fields: [refreshTokens.profileId],
    references: [profiles.id],
  }),
}));

// `statusTransitions` dan `rateLimitCounters` sengaja tidak punya relasi:
// keduanya tabel konfigurasi dan penghitung, bukan baris milik seseorang.
// `idempotencyKeys` punya `profile_id`, tetapi barisnya dibaca berdasarkan
// kuncinya — bukan berdasarkan pemiliknya.
