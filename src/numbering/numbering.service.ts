import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import {
  DOCUMENT_NUMBER_FORMATS,
  documentCounters,
  formatDocumentNumber,
  normalizeDocumentVariant,
} from '../database/schema/counters';
import type { documentTypeEnum } from '../database/schema/enums';

export type DocumentType = (typeof documentTypeEnum.enumValues)[number];

/**
 * Sesuatu yang bisa dipakai untuk menulis — database atau transaksi.
 *
 * Diperlukan karena `next()` **wajib** berjalan di dalam transaksi yang sama
 * dengan INSERT dokumennya. Kalau tipenya hanya `NodePgDatabase`, pemanggil
 * yang sudah memegang `tx` tidak bisa meneruskannya tanpa pemaksaan tipe — dan
 * pemaksaan tipe di sinilah yang akan menyembunyikan kesalahan yang paling
 * mahal di berkas ini: penomoran di luar transaksi.
 */
type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

export type DbExecutor = NodePgDatabase | Transaction;

/**
 * Penomoran dokumen tanpa celah (`PRD-BACKEND.md` §8.2).
 *
 * ## Masalah yang dipecahkan
 *
 * `sksks` memakai `sequence` PostgreSQL lewat `nextval()` di dalam `DEFAULT`
 * kolomnya. `nextval()` mengambil angka **sebelum** barisnya tersimpan, jadi
 * setiap INSERT yang gagal — validasi, constraint, transaksi yang bergulung
 * balik — membakar satu nomor tanpa meninggalkan baris. Setelah beberapa bulan,
 * `WI-2026-00041` berdampingan dengan `WI-2026-00039` tanpa ada `WI-2026-00040`
 * di mana pun. Untuk nomor internal itu mengganggu; untuk nomor surat yang
 * dikirim ke instansi luar, "surat nomor 40 hilang" adalah pertanyaan yang harus
 * dijawab seseorang.
 *
 * ## Bentuk penggantinya, dan kenapa bukan `SELECT ... FOR UPDATE`
 *
 * Satu baris penghitung per `(jenis, varian, tahun)`, dinaikkan lewat satu
 * pernyataan `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. PostgreSQL
 * mengunci baris penghitungnya sampai transaksi selesai, sehingga dua
 * permintaan bersamaan tidak bisa mendapat angka yang sama — persis seperti
 * `SELECT ... FOR UPDATE` yang dijanjikan `PRD-BACKEND.md` §8.2.
 *
 * Yang membuatnya lebih baik daripada dua pernyataan terpisah adalah **tidak
 * adanya celah di antara keduanya**. Dengan `SELECT ... FOR UPDATE` lalu
 * `UPDATE`, ada satu saat ketika baris penghitungnya sudah dikunci tetapi
 * angkanya belum naik; satu pernyataan tidak punya saat itu.
 *
 * Yang membuatnya tanpa celah sama sekali adalah **transaksinya**. Kenaikan
 * penghitung dan INSERT dokumennya berjalan bersama, sehingga kegagalan
 * dokumennya ikut membatalkan kenaikannya.
 *
 * ## Kenapa `next()` menerima `tx`, bukan mengambil koneksinya sendiri
 *
 * Kalau metode ini membuka transaksinya sendiri, ia akan mengunci baris
 * penghitung, menaikkannya, commit, lalu mengembalikan nomornya — dan
 * dokumennya disimpan setelahnya oleh pemanggil. Setiap kegagalan penyimpanan
 * setelah titik itu meninggalkan nomor terpakai tanpa dokumen: **celahnya
 * kembali**, kali ini lebih jarang dan karena itu lebih sulit ditemukan.
 *
 * Tipe parameternya memaksa hal itu: `tx` tidak bisa diperoleh dari dalam sini,
 * jadi pemanggil yang lupa berada di dalam transaksi akan gagal saat kompilasi,
 * bukan saat ada surat yang nomornya hilang.
 */
@Injectable()
export class NumberingService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Nomor berikutnya, misalnya `WI-2026-00001`.
   *
   * **Harus dipanggil di dalam transaksi** yang sama dengan penyimpanan
   * dokumennya. Lihat catatan di kepala berkas.
   *
   * `year` diambil dari parameter kalau diberikan. Itu bukan kelengkapan:
   * surat yang disiapkan akhir Desember sering bernomor tahun berikutnya
   * (lihat `documentCounters.year`), dan pemanggilnyalah yang tahu tahun mana
   * yang benar untuk dokumennya.
   */
  async next(
    tx: DbExecutor,
    type: DocumentType,
    options: { variant?: string; year?: number } = {},
  ): Promise<string> {
    const format = DOCUMENT_NUMBER_FORMATS[type];

    // Varian dinormalkan **sebelum** dipakai sebagai kunci, bukan hanya sebelum
    // dicetak. Kalau tidak, `'und'` dan `'UND'` akan membuat dua baris
    // penghitung untuk satu deret yang sama — dan dua deret surat undangan yang
    // masing-masing mulai dari satu adalah persis kekacauan yang hendak
    // dihindari. Normalisasi itu milik `normalizeDocumentVariant`, yang juga
    // dipakai `formatDocumentNumber`, sehingga kuncinya dan nomornya tidak bisa
    // berbeda pendapat.
    const variant =
      'usesVariant' in format && format.usesVariant
        ? normalizeDocumentVariant(options.variant, format.prefix)
        : '';

    const year = options.year ?? currentYearInJakarta();

    const rows = await tx
      .insert(documentCounters)
      .values({ documentType: type, variant, year, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [
          documentCounters.documentType,
          documentCounters.variant,
          documentCounters.year,
        ],
        // `document_counters.last_number` disebut lengkap, bukan sebagai
        // `last_number` telanjang: di dalam `ON CONFLICT DO UPDATE`, nama
        // kolom telanjang bisa berarti nilai **baru** yang sedang diusulkan,
        // sedangkan yang diinginkan adalah nilai **lama** yang tersimpan.
        // Menuliskannya lengkap menghilangkan keraguan itu.
        set: {
          lastNumber: sql`${documentCounters.lastNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ lastNumber: documentCounters.lastNumber });

    const row = rows[0];

    if (!row) {
      // Tidak bisa terjadi: `INSERT ... ON CONFLICT` selalu mengembalikan satu
      // baris. Kalau toh terjadi, yang benar adalah berhenti — melanjutkan
      // dengan nomor karangan akan menghasilkan dua dokumen bernomor sama, dan
      // itu baru ketahuan saat ada yang merujuknya.
      throw new Error(
        `Penghitung ${type}/${variant || '-'}/${year} tidak mengembalikan nomor.`,
      );
    }

    return formatDocumentNumber(type, year, row.lastNumber, variant);
  }
}

/**
 * Tahun yang sedang berlaku **menurut zona waktu organisasi**.
 *
 * Bukan `new Date().getFullYear()`, dan perbedaannya nyata: server berjalan di
 * UTC, sedangkan organisasinya di Asia/Jakarta (WIB, UTC+7). Pada 1 Januari
 * pukul 06.00 WIB, UTC masih 31 Desember pukul 23.00 — sehingga
 * `getFullYear()` mengembalikan tahun yang **sudah lewat** untuk dokumen
 * pertama tahun baru. Satu dokumen bernomor tahun lama di awal setiap tahun,
 * dan tidak ada yang tahu sampai ada yang mencocokkan nomor surat dengan
 * tanggalnya.
 *
 * Zona waktunya ditulis di sini, bukan dibaca dari `system_settings`, karena
 * penomoran dokumen adalah hal yang harus tetap benar meski tabel setelannya
 * belum terisi — dan setelan yang salah tidak boleh membuat nomor surat salah
 * tahun.
 */
function currentYearInJakarta(): number {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).format(new Date());

  return Number(formatted);
}
