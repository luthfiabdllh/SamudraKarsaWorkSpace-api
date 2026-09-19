import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Potongan kolom yang berulang di hampir setiap tabel.
 *
 * Semuanya **fungsi**, bukan objek bersama. Ini bukan gaya penulisan: Drizzle
 * menyimpan keadaan di dalam objek kolom, dan satu objek yang dipakai di dua
 * tabel berarti dua tabel berbagi satu keadaan. Fungsi memastikan setiap tabel
 * mendapat kolomnya sendiri.
 *
 * ## Soal `updated_at`
 *
 * Nilainya diisi aplikasi (`$onUpdate`), **dan** dijaga trigger di database.
 * Dua-duanya disengaja: jalur aplikasi membuat nilai itu benar tanpa satu pun
 * query tambahan, sedangkan trigger menutup perubahan yang tidak lewat
 * aplikasi — migrasi, perbaikan manual, atau skrip. Tanpa trigger, `updated_at`
 * akan diam-diam basi pada setiap perubahan yang bukan dari NestJS.
 *
 * ## Yang **tidak** ada di sini
 *
 * Acuan ke tabel lain (`references`) sengaja tidak dibungkus helper. Drizzle
 * menurunkan foreign key dari objek kolom yang dirujuk, dan helper yang
 * menerima kolom sebagai parameter menghalangi penurunan itu — hasilnya
 * `drizzle-kit` tidak melihat kuncinya sama sekali. Ditulis langsung di setiap
 * tabel, meskipun berulang.
 */

/** `created_at` — tidak pernah berubah setelah baris dibuat. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** `updated_at` — diisi aplikasi dan dijaga trigger. */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Keduanya sekaligus, dipakai sebagai `...timestamps()`. */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Kunci utama.
 *
 * `gen_random_uuid()` ada di PostgreSQL 13+ tanpa ekstensi tambahan — jadi
 * tidak perlu `uuid-ossp`. `sksks` sudah memakainya, dan pilihan itu
 * dipertahankan.
 */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/**
 * Dua mekanisme penyembunyian, dipisahkan dengan tegas (§14.2).
 *
 * `deleted_at` — sampah, ada di recycle bin, bisa dipulihkan.
 * `archived_at` — disembunyikan dari daftar aktif, tetapi bukan sampah.
 *
 * Keduanya **tidak pernah** dipakai bersamaan untuk hal yang sama. `sksks`
 * punya tiga mekanisme yang tumpang tindih; yang ketiga — nilai status
 * `diarsipkan` — sudah dibuang dari enum.
 */
export const hidingColumns = () => ({
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Optimistic locking (§7.16).
 *
 * Klien mengirim `If-Match` berisi versi yang dibacanya; backend menolak
 * dengan 409 kalau versinya sudah bergerak. Kolom ini yang membuat dua orang
 * mengedit baris yang sama tidak saling menimpa tanpa sadar.
 *
 * Dipasang di tabel yang **bisa diedit bersamaan** — bukan di mana-mana.
 * Tabel yang hanya ditambah dan dibaca tidak butuh, dan menambahkannya berarti
 * satu pembaruan baris di setiap penulisan.
 */
export const version = () => integer('version').notNull().default(1);
