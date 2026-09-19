import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import {
  priorityLevelEnum,
  requestStatusEnum,
  requestTypeEnum,
} from '../../database/schema/enums';

/**
 * Skema permintaan.
 *
 * ## Yang sengaja tidak ada di sini
 *
 * **`status` tidak bisa diisi, bahkan saat membuat.** Permintaan selalu lahir
 * `draft`, dan perpindahannya hanya lewat `POST /requests/{id}/transitions` yang
 * memeriksa state machine. Itu menutup lubang yang `sksks` miliki:
 * `enforce_request_status_rules` di sana hanya `BEFORE UPDATE`, sehingga
 * permintaan yang di-INSERT langsung dengan `status = 'done'` **melewati seluruh
 * syarat isinya** (`docs/INVENTARIS-ATURAN.md` §2, temuan #4).
 *
 * **`linkedWorkItemId` tidak bisa diisi.** Ia dihasilkan saat permintaan
 * **diajukan**, bukan saat disimpan sebagai draft (§5.2.4). Di `sksks`, trigger
 * `AFTER INSERT` membuat pekerjaannya tanpa memandang status — sehingga setiap
 * draft yang tidak jadi diajukan meninggalkan pekerjaan hantu.
 *
 * **`syncConflictAt`, `completedAt`, `version` tidak bisa diisi.** Ketiganya
 * bergerak lewat jalurnya sendiri: penandaan konflik, penyelesaian, dan
 * penguncian optimistis.
 *
 * **`requesterId` tidak bisa diisi.** Pemohonnya adalah orang yang mengirim
 * permintaan itu, dan membiarkannya disebutkan berarti mengizinkan seseorang
 * mengajukan permintaan atas nama orang lain.
 */

const tanggal = z.iso.date('Tanggal harus dalam bentuk YYYY-MM-DD.');

const teks = (maks: number) => z.string().trim().max(maks);

const judul = z
  .string()
  .trim()
  .min(3, 'Judul minimal 3 karakter.')
  .max(200, 'Judul maksimal 200 karakter.');

/**
 * Kolom tambahan per jenis permintaan.
 *
 * Empat belas jenis permintaan punya kebutuhan yang berbeda-beda — nomor
 * rekening untuk RAB, ukuran untuk desain — dan `extraFields` menampungnya
 * sebagai `jsonb` alih-alih empat belas tabel.
 *
 * **Bentuknya tidak divalidasi di sini**, dan itu disengaja: skema per jenis
 * adalah aturan isi, bukan aturan bentuk, dan tempatnya di `@samudrakarsa/shared`
 * supaya frontend memakai definisi yang sama persis. Yang dijaga di sini
 * hanyalah bahwa ia objek, bukan array atau skalar — supaya kolom `jsonb`-nya
 * tidak berisi sesuatu yang tidak bisa ditanyakan per kuncinya.
 */
const extraFields = z.record(z.string().max(60), z.unknown()).default({});

// ─────────────────────────────────────────────────────────────────────────────
// Membuat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mengajukan permintaan — **draft**, selalu.
 *
 * `targetDivisionId` **wajib**, tidak seperti `divisionId` pada pekerjaan.
 * Kolomnya `not null` dengan `on delete restrict`, dan alasannya disebut di
 * skema: permintaan tanpa divisi tujuan tidak berarti apa-apa. Pekerjaan boleh
 * belum punya divisi karena ia bisa dibuat untuk diri sendiri; permintaan
 * **selalu** ditujukan kepada seseorang.
 *
 * `periodId` opsional meski kolomnya wajib diisi pekerjaan — sama seperti
 * pekerjaan, yang memenuhinya service: kalau tidak diberikan, yang dipakai
 * adalah periode yang sedang aktif.
 */
export const CreateRequestSchema = z.object({
  title: judul,
  type: z.enum(requestTypeEnum.enumValues, 'Jenis permintaan tidak dikenal.'),
  description: teks(5000).nullish(),

  targetDivisionId: z.uuid('Divisi tujuan tidak sah.'),
  programId: z.uuid('Program tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  assignedPicId: z.uuid('Penanggung jawab tidak sah.').nullish(),
  periodId: z.uuid('Periode tidak sah.').nullish(),

  priority: z.enum(priorityLevelEnum.enumValues).default('medium'),
  dueDate: tanggal.nullish(),

  extraFields,
});

@ZodDto(CreateRequestSchema)
export class CreateRequestDto {
  declare title: string;
  declare type: (typeof requestTypeEnum.enumValues)[number];
  declare description?: string | null;
  declare targetDivisionId: string;
  declare programId?: string | null;
  declare subunitId?: string | null;
  declare assignedPicId?: string | null;
  declare periodId?: string | null;
  declare priority: (typeof priorityLevelEnum.enumValues)[number];
  declare dueDate?: string | null;
  declare extraFields: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mengubah
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mengubah isi permintaan.
 *
 * Seluruh medannya opsional, dan yang tidak dikirim tidak disentuh — dijamin
 * service dengan menyusun `.set()` per medan, bukan dengan menyebar DTO apa
 * adanya.
 *
 * ## `clarificationNote`, `resultSummary`, dan `holdReason` ada di sini **dan**
 * di skema transisi
 *
 * Dengan alasan yang sama seperti pada pekerjaan: ketiganya adalah kolom yang
 * ditegakkan `check` constraint saat statusnya tertentu, dan memindahkan status
 * menjadi **dua permintaan** kalau kolomnya hanya ada di satu tempat. Dua
 * permintaan berarti satu keadaan di antaranya yang tidak sah — alasannya sudah
 * tersimpan, statusnya belum berubah — dan kalau yang kedua gagal, barisnya
 * tertinggal di keadaan itu.
 *
 * ## `targetDivisionId` boleh diubah, tetapi **hanya selama `draft`**
 *
 * Batas itu ditegakkan service, bukan di sini. Alasannya: divisi tujuan
 * menentukan **siapa yang boleh memindahkan statusnya** (`canTransitionRequest`
 * memakai divisi tujuan), sehingga memindahkannya setelah diajukan berarti
 * memindahkan wewenang atas baris itu — dari kepala divisi yang sedang
 * mengerjakannya kepada orang lain. Selama masih draft belum ada yang
 * mengerjakannya, jadi tidak ada wewenang yang berpindah.
 */
export const UpdateRequestSchema = z.object({
  title: judul.optional(),
  type: z.enum(requestTypeEnum.enumValues).optional(),
  description: teks(5000).nullish(),

  targetDivisionId: z.uuid('Divisi tujuan tidak sah.').optional(),
  programId: z.uuid('Program tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  assignedPicId: z.uuid('Penanggung jawab tidak sah.').nullish(),
  periodId: z.uuid('Periode tidak sah.').optional(),

  priority: z.enum(priorityLevelEnum.enumValues).optional(),
  dueDate: tanggal.nullish(),

  extraFields: z.record(z.string().max(60), z.unknown()).optional(),

  clarificationNote: teks(2000).nullish(),
  resultSummary: teks(5000).nullish(),
  holdReason: teks(2000).nullish(),
});

@ZodDto(UpdateRequestSchema)
export class UpdateRequestDto {
  declare title?: string;
  declare type?: (typeof requestTypeEnum.enumValues)[number];
  declare description?: string | null;
  declare targetDivisionId?: string;
  declare programId?: string | null;
  declare subunitId?: string | null;
  declare assignedPicId?: string | null;
  declare periodId?: string;
  declare priority?: (typeof priorityLevelEnum.enumValues)[number];
  declare dueDate?: string | null;
  declare extraFields?: Record<string, unknown>;
  declare clarificationNote?: string | null;
  declare resultSummary?: string | null;
  declare holdReason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transisi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memindahkan status permintaan.
 *
 * `to` menyatakan **tujuan**, bukan keadaan baru — lihat catatan yang sama di
 * `TransitionWorkItemSchema`. Perpindahannya yang diperiksa, bukan nilai yang
 * disetel.
 */
export const TransitionRequestSchema = z.object({
  to: z.enum(requestStatusEnum.enumValues, 'Status tujuan tidak dikenal.'),

  /** Catatan bebas, tersimpan di audit. Permintaan tidak punya tabel riwayat. */
  note: teks(1000).nullish(),

  clarificationNote: teks(2000).nullish(),
  resultSummary: teks(5000).nullish(),
  holdReason: teks(2000).nullish(),
});

@ZodDto(TransitionRequestSchema)
export class TransitionRequestDto {
  declare to: (typeof requestStatusEnum.enumValues)[number];
  declare note?: string | null;
  declare clarificationNote?: string | null;
  declare resultSummary?: string | null;
  declare holdReason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Penyelesaian konflik
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyelesaikan konflik sinkronisasi (keputusan 49).
 *
 * Yang dikirim adalah **satu nilai**: status permintaan yang dianggap benar.
 * Status pekerjaannya tidak ikut dipilih karena ia ditentukan peta — begitu
 * permintaannya `accepted`, pekerjaannya `approved`. Membiarkan keduanya
 * dipilih membuka kemungkinan memilih pasangan yang tidak ada di petanya, yaitu
 * memilih ketidaksepakatan yang baru.
 *
 * `note` **wajib**, dan bukan kelengkapan. Ini satu-satunya jalur yang menulis
 * status tanpa melewati state machine — dan tindakan yang melewati aturan harus
 * meninggalkan alasan mengapa ia melewatinya. Tanpa itu, satu-satunya cara
 * mengetahui kenapa sebuah status melompat adalah menebak.
 */
export const ResolveSyncConflictSchema = z.object({
  status: z.enum(requestStatusEnum.enumValues, 'Status tujuan tidak dikenal.'),
  note: z
    .string()
    .trim()
    .min(3, 'Alasan penyelesaian minimal 3 karakter.')
    .max(2000, 'Alasan penyelesaian maksimal 2000 karakter.'),

  /**
   * Kolom yang dituntut status yang dipilih, kalau barisnya belum memilikinya.
   *
   * Ketiganya bisa saja sudah terisi dari sebelumnya — dan kalau sudah, tidak
   * perlu dikirim ulang. Yang diperiksa service adalah **hasil akhirnya**,
   * bukan ada tidaknya medan di sini.
   */
  clarificationNote: teks(2000).nullish(),
  resultSummary: teks(5000).nullish(),
  holdReason: teks(2000).nullish(),
});

@ZodDto(ResolveSyncConflictSchema)
export class ResolveSyncConflictDto {
  declare status: (typeof requestStatusEnum.enumValues)[number];
  declare note: string;
  declare clarificationNote?: string | null;
  declare resultSummary?: string | null;
  declare holdReason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daftar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penyaring daftar permintaan.
 *
 * `withoutPic` adalah pasangan dari yang ada di daftar pekerjaan: penanggung
 * jawab permintaan yang akunnya dinonaktifkan dilepas (§5.2.8), dan tanpa
 * penyaring ini tidak ada satu layar pun yang bisa dipakai menemukannya.
 *
 * `targetDivisionId` **tidak dipasang otomatis**, mengikuti bacaan yang sama
 * dengan daftar pekerjaan: `request:read` di §7.9 terbuka untuk kelima peran,
 * dan permintaan lintas divisi justru inti fiturnya — menyembunyikan yang bukan
 * divisimu akan membuat kepala divisi tidak bisa melihat apa yang diminta
 * kepadanya kalau ia salah membaca penyaringnya sendiri.
 */
export const ListRequestsSchema = z.object({
  targetDivisionId: z.uuid('Divisi tujuan tidak sah.').optional(),
  requesterId: z.uuid('Pemohon tidak sah.').optional(),
  assignedPicId: z.uuid('Penanggung jawab tidak sah.').optional(),
  programId: z.uuid('Program tidak sah.').optional(),
  subunitId: z.uuid('Subunit tidak sah.').optional(),
  periodId: z.uuid('Periode tidak sah.').optional(),

  status: z.enum(requestStatusEnum.enumValues).optional(),
  type: z.enum(requestTypeEnum.enumValues).optional(),
  priority: z.enum(priorityLevelEnum.enumValues).optional(),

  /** Hanya yang belum punya penanggung jawab — lihat catatan di atas. */
  withoutPic: z.coerce.boolean().optional(),
  /** Hanya yang sedang berkonflik sinkronisasi (keputusan 49). */
  hasSyncConflict: z.coerce.boolean().optional(),

  /** Pencarian pada judul dan nomor permintaan. */
  q: z.string().trim().min(1).max(120).optional(),

  includeArchived: z.coerce.boolean().default(false),

  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@ZodDto(ListRequestsSchema)
export class ListRequestsDto {
  declare targetDivisionId?: string;
  declare requesterId?: string;
  declare assignedPicId?: string;
  declare programId?: string;
  declare subunitId?: string;
  declare periodId?: string;
  declare status?: (typeof requestStatusEnum.enumValues)[number];
  declare type?: (typeof requestTypeEnum.enumValues)[number];
  declare priority?: (typeof priorityLevelEnum.enumValues)[number];
  declare withoutPic?: boolean;
  declare hasSyncConflict?: boolean;
  declare q?: string;
  declare includeArchived: boolean;
  declare limit: number;
  declare offset: number;
}
