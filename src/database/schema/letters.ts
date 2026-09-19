import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { hidingColumns, primaryId, timestamps, version } from './_columns';
import { letterDirectionEnum, letterStatusEnum } from './enums';
import { periods, programs, profiles } from './organization';
import { requests } from './work';

/**
 * Persuratan.
 *
 * ## Yang berubah dari `sksks`
 *
 * **`letter_number` menjadi `not null`.** Di `sksks` kolomnya nullable padahal
 * selalu diisi trigger (temuan #17) — dan kolom nullable yang selalu terisi
 * berarti setiap pembacaan harus menangani kemustahilan.
 *
 * **`letter_kind` menjadi `not null`.** Nomor surat memuat jenisnya
 * (`SRT-<JENIS>-YYYY-#####`), jadi trigger `sksks` menyediakan cadangan
 * `'UMUM'` untuk surat yang jenisnya kosong. Cadangan itu yang membuat jenis
 * surat bisa hilang tanpa ada yang menyadarinya: nomornya tetap terbentuk,
 * dan tidak ada lagi yang tahu jenisnya apa. Sekarang surat tanpa jenis
 * ditolak di lapisan validasi, bukan diberi jenis karangan.
 *
 * **Nomornya dihasilkan tabel penghitung per (jenis, periode)** — bukan satu
 * sequence untuk semua surat. `sksks` memakai sequence tunggal, sehingga
 * `SRT-SK-2026-00007` bisa berdampingan dengan `SRT-UND-2026-00008`, dan nomor
 * urut tiap jenis melompat-lompat tanpa alasan yang bisa dijelaskan.
 *
 * ## Yang belum ada di sini, dan memang belum seharusnya
 *
 * `sksks` **tidak punya satu pun validasi per status** untuk surat, padahal
 * `letter_status` berisi sembilan nilai. Inventaris §2 mencatatnya sebagai
 * pekerjaan Fase 3–4, bukan Fase 1: aturannya harus **ditulis**, bukan
 * disalin, dan tempatnya di paket `@samudrakarsa/shared` sebagai fungsi murni —
 * supaya tombol yang benar-benar bisa ditekan di layar dan pemeriksaan yang
 * sebenarnya dijalankan backend berasal dari satu definisi.
 *
 * Menambahkannya di sini sekarang berarti mengarang aturan, lalu
 * memberlakukannya sebelum ada yang menyetujuinya.
 */
export const letters = pgTable(
  'letters',
  {
    id: primaryId(),

    /** `SRT-<JENIS>-YYYY-#####` — `<JENIS>` tetap Indonesia (keputusan 47). */
    letterNumber: text('letter_number').notNull(),

    direction: letterDirectionEnum('direction').notNull().default('outbound'),

    /** Ikut menentukan `<JENIS>` pada nomor, dan karena itu tidak boleh kosong. */
    letterKind: text('letter_kind').notNull(),

    requesterId: uuid('requester_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    senderRecipient: text('sender_recipient'),
    institution: text('institution'),
    subject: text('subject').notNull(),

    letterDate: date('letter_date'),
    dueDate: date('due_date'),

    picId: uuid('pic_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    signerName: text('signer_name'),

    status: letterStatusEnum('status').notNull().default('submitted'),
    note: text('note'),

    programId: uuid('program_id').references(() => programs.id, {
      onDelete: 'set null',
    }),

    /**
     * Surat yang lahir dari permintaan berjenis `correspondence`. Satu arah:
     * permintaan tidak menunjuk balik ke suratnya, karena satu permintaan bisa
     * menghasilkan beberapa surat (undangan ke beberapa instansi).
     */
    requestId: uuid('request_id').references(() => requests.id, {
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
    uniqueIndex('letters_number_key').on(t.letterNumber),
    index('letters_status_idx').on(t.status),
    index('letters_period_idx').on(t.periodId),
    index('letters_program_idx').on(t.programId),
    index('letters_pic_idx').on(t.picId),
  ],
);

export const lettersRelations = relations(letters, ({ one }) => ({
  requester: one(profiles, {
    fields: [letters.requesterId],
    references: [profiles.id],
  }),
  pic: one(profiles, { fields: [letters.picId], references: [profiles.id] }),
  program: one(programs, {
    fields: [letters.programId],
    references: [programs.id],
  }),
  request: one(requests, {
    fields: [letters.requestId],
    references: [requests.id],
  }),
  period: one(periods, {
    fields: [letters.periodId],
    references: [periods.id],
  }),
}));
