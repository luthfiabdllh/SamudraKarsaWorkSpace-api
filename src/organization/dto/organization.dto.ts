import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';

/**
 * Skema data acuan organisasi: periode, divisi, cluster, subunit.
 *
 * Keempatnya adalah tabel yang **dirujuk** puluhan tabel lain, sehingga
 * validasinya lebih ketat daripada tampaknya perlu. Nama divisi yang salah
 * ketik bisa diperbaiki; kode divisi yang salah bentuk menular ke setiap
 * pemeriksaan izin yang memakainya.
 */

/**
 * Kode unit organisasi — divisi, cluster, subunit.
 *
 * ## Kenapa hurufnya dinormalisasi jadi kecil
 *
 * `divisions.code` dibandingkan **secara harfiah** oleh aturan izin.
 * `resource.ts` menyimpan `FINANCE_DIVISION_CODE = 'sekbend'`, dan
 * `leadsDivisionOf()` menilai izin dengan `actor.divisionCodes.includes(...)`.
 * Nilai itu berasal dari kolom ini apa adanya, tanpa normalisasi di mana pun.
 *
 * Akibatnya divisi yang kodenya dibuat `SEKBEND` akan **mencabut akses keuangan
 * seluruh kepalanya** — tanpa error, tanpa catatan log, dan tanpa gejala yang
 * menunjuk ke sebabnya. Yang terlihat dari luar hanya "kepala Sekretaris &
 * Bendahara tidak bisa membuka halaman keuangan", dan tidak ada satu pun pesan
 * yang menghubungkannya dengan huruf besar-kecil di sebuah kolom kode.
 *
 * Indeks unik di database tidak menolong: ia case-sensitive, jadi `sekbend` dan
 * `SEKBEND` sama-sama boleh ada dan menjadi dua divisi yang berbeda.
 *
 * Karena itu normalisasinya dilakukan **saat menulis**, di sini — satu tempat
 * yang dilewati setiap penulisan, termasuk yang datang dari skrip dan dari
 * halaman admin nanti. Yang **tidak** dipilih adalah membandingkan
 * tanpa-memperhatikan-huruf di `resource.ts`: itu membetulkan satu pemakaian
 * sementara pemakaian berikutnya — laporan, ekspor, pencocokan antar divisi —
 * tetap rawan, dan setiap pemakaian baru harus ingat melakukannya.
 *
 * Masukannya menerima huruf besar dan mengubahnya, bukan menolaknya. Menolak
 * akan membuat pengisi formulir pertama mengetik `SEKBEND`, mendapat error yang
 * tidak menjelaskan akibatnya, lalu mengetik ulang hal yang sama.
 */
const orgCode = z
  .string()
  .trim()
  .min(2, 'Kode minimal 2 karakter.')
  .max(24, 'Kode maksimal 24 karakter.')
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value),
    'Kode hanya boleh berisi huruf, angka, dan tanda hubung.',
  );

/**
 * Kode periode — `KKN-2026-2027`.
 *
 * Huruf besarnya dipertahankan, berbeda dari kode unit di atas, dan itu bukan
 * ketidakkonsistenan: kode periode adalah **label yang dibaca manusia** dan
 * tidak dipakai satu pun pemeriksaan izin. Yang menentukan sebuah pemeriksaan
 * harus dinormalisasi adalah apakah nilainya pernah dibandingkan, bukan apakah
 * ia sebuah kode.
 */
const periodCode = z
  .string()
  .trim()
  .min(3, 'Kode periode minimal 3 karakter.')
  .max(32, 'Kode periode maksimal 32 karakter.')
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value),
    'Kode periode hanya boleh berisi huruf, angka, dan tanda hubung.',
  );

const nama = (maks: number) =>
  z.string().trim().min(2, 'Nama minimal 2 karakter.').max(maks);

/**
 * Tanggal periode.
 *
 * `z.iso.date()` — `2026-12-19` — bukan `datetime`. Periode KKN ditentukan
 * dalam hari, dan menerima jam berarti menerima dua nilai berbeda untuk hari
 * yang sama, yang lalu harus disamakan entah di mana.
 *
 * Akhirannya ditulis eksplisit (`T00:00:00.000Z`) alih-alih bersandar pada
 * `new Date('2026-12-19')`. Keduanya menghasilkan hal yang sama, tetapi yang
 * pertama tidak bergantung pada ingatan pembaca tentang spesifikasi tanggal
 * JavaScript — dan pada string tanpa zona, `new Date()` pernah berbeda antar
 * mesin.
 */
const tanggal = z.iso
  .date('Tanggal harus dalam bentuk YYYY-MM-DD.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const sortOrder = z
  .int('Urutan harus bilangan bulat.')
  .min(0)
  .max(9999)
  .optional();

// ─────────────────────────────────────────────────────────────────────────────
// Periode
// ─────────────────────────────────────────────────────────────────────────────

export const CreatePeriodSchema = z.object({
  code: periodCode,
  name: nama(120),
  startsOn: tanggal,
  endsOn: tanggal,
  phase: z.enum(['pre_kkn', 'kkn', 'post_kkn']).default('kkn'),
});

@ZodDto(CreatePeriodSchema)
export class CreatePeriodDto {
  declare code: string;
  declare name: string;
  declare startsOn: Date;
  declare endsOn: Date;
  declare phase: 'pre_kkn' | 'kkn' | 'post_kkn';
}

export const UpdatePeriodSchema = z.object({
  code: periodCode.optional(),
  name: nama(120).optional(),
  startsOn: tanggal.optional(),
  endsOn: tanggal.optional(),
  phase: z.enum(['pre_kkn', 'kkn', 'post_kkn']).optional(),
});

@ZodDto(UpdatePeriodSchema)
export class UpdatePeriodDto {
  declare code?: string;
  declare name?: string;
  declare startsOn?: Date;
  declare endsOn?: Date;
  declare phase?: 'pre_kkn' | 'kkn' | 'post_kkn';
}

// ─────────────────────────────────────────────────────────────────────────────
// Divisi · Cluster · Subunit
// ─────────────────────────────────────────────────────────────────────────────

export const CreateDivisionSchema = z.object({
  code: orgCode,
  name: nama(120),
  icon: z.string().trim().max(64).nullish(),
  description: z.string().trim().max(2000).nullish(),
  sortOrder,
});

@ZodDto(CreateDivisionSchema)
export class CreateDivisionDto {
  declare code: string;
  declare name: string;
  declare icon?: string | null;
  declare description?: string | null;
  declare sortOrder?: number;
}

export const UpdateDivisionSchema = z.object({
  code: orgCode.optional(),
  name: nama(120).optional(),
  icon: z.string().trim().max(64).nullish(),
  description: z.string().trim().max(2000).nullish(),
  sortOrder,
});

@ZodDto(UpdateDivisionSchema)
export class UpdateDivisionDto {
  declare code?: string;
  declare name?: string;
  declare icon?: string | null;
  declare description?: string | null;
  declare sortOrder?: number;
}

export const CreateClusterSchema = z.object({
  code: orgCode,
  name: nama(120),
  sortOrder,
});

@ZodDto(CreateClusterSchema)
export class CreateClusterDto {
  declare code: string;
  declare name: string;
  declare sortOrder?: number;
}

export const UpdateClusterSchema = z.object({
  code: orgCode.optional(),
  name: nama(120).optional(),
  sortOrder,
});

@ZodDto(UpdateClusterSchema)
export class UpdateClusterDto {
  declare code?: string;
  declare name?: string;
  declare sortOrder?: number;
}

export const CreateSubunitSchema = z.object({
  code: orgCode,
  name: nama(120),
  villageName: z.string().trim().max(160).nullish(),
  sortOrder,
});

@ZodDto(CreateSubunitSchema)
export class CreateSubunitDto {
  declare code: string;
  declare name: string;
  declare villageName?: string | null;
  declare sortOrder?: number;
}

export const UpdateSubunitSchema = z.object({
  code: orgCode.optional(),
  name: nama(120).optional(),
  villageName: z.string().trim().max(160).nullish(),
  sortOrder,
});

@ZodDto(UpdateSubunitSchema)
export class UpdateSubunitDto {
  declare code?: string;
  declare name?: string;
  declare villageName?: string | null;
  declare sortOrder?: number;
}
