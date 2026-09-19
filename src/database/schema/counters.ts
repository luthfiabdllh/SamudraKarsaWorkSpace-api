import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { documentTypeEnum } from './enums';

/**
 * Penghitung nomor dokumen.
 *
 * ## Masalah yang dipecahkan
 *
 * `sksks` memberi setiap nomor dokumen sebuah `sequence`, dan memakai
 * `nextval()` di dalam `DEFAULT` kolom. Dua akibatnya, keduanya nyata:
 *
 * 1. **Nomornya bercelah.** `nextval()` mengambil angka **sebelum** barisnya
 *    tersimpan. Setiap INSERT yang gagal — validasi, constraint, transaksi yang
 *    bergulung balik — membakar satu nomor tanpa meninggalkan baris. Setelah
 *    beberapa bulan, `WI-2026-00041` bisa berdampingan dengan
 *    `WI-2026-00039` tanpa ada `WI-2026-00040` di mana pun. Untuk nomor
 *    internal itu mengganggu; untuk nomor surat yang dikirim ke instansi luar,
 *    "surat nomor 40 hilang" adalah pertanyaan yang harus dijawab seseorang.
 *
 * 2. **`program_number` tidak punya penghasil sama sekali** (temuan #3).
 *    Kolomnya `not null unique` tanpa `DEFAULT` dan tanpa trigger — jadi
 *    manusialah yang mengarang nomornya, dan aturannya tidak pernah ditulis di
 *    mana pun.
 *
 * ## Bentuk penggantinya
 *
 * Satu baris per `(jenis, varian, tahun)`. Angkanya dinaikkan **di dalam
 * transaksi yang sama** dengan INSERT dokumennya, lewat
 * `SELECT ... FOR UPDATE`, sehingga:
 *
 * - kalau INSERT-nya gagal, kenaikannya ikut bergulung balik — tidak ada celah;
 * - dua permintaan bersamaan tidak bisa mendapat angka yang sama, karena baris
 *   penghitungnya terkunci sampai transaksinya selesai.
 *
 * Drizzle mendukungnya tanpa `$queryRaw` lewat `.for('update')`, dan itu memang
 * salah satu alasan ORM ini dipilih (`PRD-BACKEND.md` §8.2).
 *
 * ## Kenapa `variant` ada, padahal hanya surat yang memakainya
 *
 * Nomor surat memuat jenis suratnya: `SRT-UND-2026-00001` dan
 * `SRT-SK-2026-00001` adalah dua deret yang berbeda, bukan satu deret dengan
 * lompatan. `sksks` memakai satu sequence untuk keduanya, sehingga nomor urut
 * tiap jenis melompat-lompat tanpa alasan yang bisa dijelaskan ke instansi yang
 * menerima suratnya (inventaris §1).
 *
 * Kolom ini kosong (`''`, bukan `NULL`) untuk jenis dokumen yang tidak punya
 * varian. Sengaja `''` dan bukan `NULL`: kolom `NULL` tidak ikut serta dalam
 * kunci utama, sehingga `('letter', NULL, 2026)` bisa tersimpan berkali-kali
 * dan setiap kali memulai deret baru dari satu.
 *
 * ## Kenapa `year` ada, padahal ia bisa dibaca dari `created_at`
 *
 * Karena yang menentukan deret adalah **tahun pada nomornya**, bukan tahun
 * baris penghitungnya dibuat. Keduanya sama hampir sepanjang waktu, dan
 * berbeda tepat pada saat yang paling merepotkan: surat yang disiapkan akhir
 * Desember dan bernomor tahun berikutnya. Menyimpan tahunnya sebagai kolom
 * membuat baris penghitungnya mengatakan hal yang sama dengan nomor yang
 * dihasilkannya.
 */
export const documentCounters = pgTable(
  'document_counters',
  {
    documentType: documentTypeEnum('document_type').notNull(),

    /** Jenis surat, huruf besar. `''` untuk jenis dokumen tanpa varian. */
    variant: text('variant').notNull().default(''),

    /** Tahun yang muncul di nomornya, bukan tahun baris ini dibuat. */
    year: integer('year').notNull(),

    /** Angka terakhir yang **terpakai**. Deret berikutnya adalah nilai ini + 1. */
    lastNumber: integer('last_number').notNull().default(0),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.documentType, t.variant, t.year] }),
    index('document_counters_year_idx').on(t.year),
    check('document_counters_year_sane', sql`year between 2000 and 2999`),
    check('document_counters_last_number_not_negative', sql`last_number >= 0`),
  ],
);

/**
 * Bentuk nomor tiap jenis dokumen.
 *
 * Disimpan sebagai **data di kode**, bukan sebagai tabel, karena nilainya
 * dipakai untuk membentuk string dan bukan untuk dibaca manusia. Yang dijaga
 * di sini hanyalah bahwa setiap `document_type` punya tepat satu bentuk —
 * `satisfies Record<DocumentType, ...>` membuat TypeScript menolak berkas ini
 * kalau ada jenis yang ditambahkan ke enum tanpa bentuk nomornya.
 *
 * `<JENIS>` pada surat **tetap bahasa Indonesia** (keputusan 47): nomor surat
 * adalah artefak organisasi yang dibaca instansi luar, bukan kosakata sistem.
 */
export const DOCUMENT_NUMBER_FORMATS = {
  work_item: { prefix: 'WI', width: 5 },
  request: { prefix: 'REQ', width: 5 },
  budget: { prefix: 'RAB', width: 5 },
  letter: { prefix: 'SRT', width: 5, usesVariant: true },
  inventory_item: { prefix: 'INV', width: 5 },
  program: { prefix: 'PRG', width: 5 },
} as const satisfies Record<
  (typeof documentTypeEnum.enumValues)[number],
  { prefix: string; width: number; usesVariant?: true }
>;

/**
 * Menyusun nomor dari bentuk di atas.
 *
 * `'SRT-UND-2026-00001'` atau `'WI-2026-00001'`. Fungsi murni — tidak menyentuh
 * database, dan karena itu bisa diuji tanpa satu pun koneksi.
 *
 * **Tidak ada cadangan `'UMUM'`.** `sksks` memakai cadangan itu untuk surat yang
 * jenisnya kosong, dan justru itulah masalahnya: nomornya tetap terbentuk,
 * sehingga surat tanpa jenis tidak pernah ketahuan. Di sini varian yang kosong
 * **dilempar sebagai galat**, dan `letters.letter_kind` memang `not null`.
 */
export function formatDocumentNumber(
  type: (typeof documentTypeEnum.enumValues)[number],
  year: number,
  sequence: number,
  variant?: string,
): string {
  const format = DOCUMENT_NUMBER_FORMATS[type];
  const parts: string[] = [format.prefix];

  if ('usesVariant' in format && format.usesVariant) {
    const normalized = (variant ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    if (normalized === '') {
      throw new Error(
        `Nomor ${format.prefix} menuntut varian (jenis), tetapi tidak ada yang diberikan.`,
      );
    }

    parts.push(normalized);
  }

  parts.push(String(year), String(sequence).padStart(format.width, '0'));

  return parts.join('-');
}
