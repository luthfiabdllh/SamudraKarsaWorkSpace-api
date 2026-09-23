import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import {
  priorityLevelEnum,
  workItemTypeEnum,
  workStatusEnum,
} from '../../database/schema/enums';

/**
 * Skema pekerjaan.
 *
 * ## Yang sengaja tidak ada di sini
 *
 * **`status` tidak bisa diisi, bahkan saat membuat.** Pekerjaan selalu lahir
 * `draft`, dan perpindahannya hanya lewat `POST /work-items/{id}/transitions`
 * yang memeriksa state machine.
 *
 * Itu menutup lubang yang `sksks` miliki: `enforce_request_status_rules` di
 * sana hanya `BEFORE UPDATE`, sehingga permintaan yang di-INSERT langsung
 * dengan `status = 'done'` **melewati seluruh syarat isinya**
 * (`docs/INVENTARIS-ATURAN.md` §2, temuan #4). Pekerjaan di sana memakai
 * `BEFORE INSERT OR UPDATE` dan tidak punya lubang itu — di sini keduanya
 * ditutup dengan cara yang sama: kolomnya tidak ada di DTO mana pun, sehingga
 * tidak ada jalur penulisan yang bisa melewatinya.
 *
 * **`workNumber` tidak bisa diisi.** Ia dihasilkan `NumberingService` di dalam
 * transaksi yang sama dengan INSERT-nya (§8.2). Membiarkannya diisi manusia
 * berarti mengembalikan masalah yang baru saja dihapus: kolom wajib-unik yang
 * diisi tebakan.
 *
 * **`completedAt`, `syncConflictAt`, `version` tidak bisa diisi.** Ketiganya
 * bergerak lewat jalurnya sendiri — transisi, penyelesaian konflik, dan
 * penguncian optimistis. `PATCH` yang bisa menulisnya berarti ada dua jalan
 * menuju satu kolom, dengan aturan yang berbeda di masing-masing jalan.
 *
 * ## `moduleStatus` ada, dan itu disengaja
 *
 * Teks bebas milik divisi, dipertahankan dari `sksks` karena ia memecahkan
 * masalah nyata: satu divisi kadang perlu menandai tahap yang hanya berarti bagi
 * divisinya sendiri. Ia **tidak** menggantikan `status` dan tidak pernah dipakai
 * menentukan hak akses — kalau suatu saat ia dipakai untuk itu, ia berubah
 * menjadi status kedua yang tidak dijaga state machine.
 */

/**
 * Tanggal tanpa jam, dalam bentuk yang diterima kolom `date`.
 *
 * `z.iso.date()` menghasilkan `2026-12-19`, dan itu **persis** yang diharapkan
 * kolom `date` PostgreSQL — bukan `Date`. Transformasi ke `Date` seperti pada
 * periode justru salah di sini: `periods.starts_on` bertipe `timestamp`,
 * sedangkan `work_items.start_date` bertipe `date`, dan mengirim `Date` ke
 * kolom `date` memaksa konversi zona waktu yang bisa menggeser harinya satu
 * hari ke belakang untuk tenggat yang jatuh tengah malam WIB.
 */
const tanggal = z.iso.date('Tanggal harus dalam bentuk YYYY-MM-DD.');

const teks = (maks: number) => z.string().trim().max(maks);

const judul = z
  .string()
  .trim()
  .min(3, 'Judul minimal 3 karakter.')
  .max(200, 'Judul maksimal 200 karakter.');

const persentase = z
  .int('Progres harus bilangan bulat.')
  .min(0, 'Progres tidak boleh negatif.')
  .max(100, 'Progres maksimal 100.');

// ─────────────────────────────────────────────────────────────────────────────
// Membuat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Membuat pekerjaan.
 *
 * `periodId` **opsional meski kolomnya wajib diisi**. Keputusan 20 menyatakan
 * setiap pekerjaan milik satu periode, dan yang memenuhinya bukan DTO ini
 * melainkan service: kalau `periodId` tidak diberikan, yang dipakai adalah
 * periode yang sedang aktif. Menuntutnya di sini akan memaksa setiap klien
 * memuat periode aktif lebih dulu hanya untuk membuat satu tugas — dan klien
 * yang lupa akan mendapat `422` untuk sesuatu yang jawabannya sudah diketahui
 * server.
 *
 * Kalau **tidak ada** periode aktif dan `periodId` juga tidak diberikan,
 * pembuatannya ditolak. Pekerjaan tanpa periode tidak bisa ditanyakan "periode
 * mana", dan itu pertanyaan pertama yang diajukan setiap laporan.
 */
export const CreateWorkItemSchema = z.object({
  title: judul,
  type: z.enum(workItemTypeEnum.enumValues).default('task'),
  description: teks(5000).nullish(),

  primaryPicId: z.uuid('PIC tidak sah.').nullish(),
  divisionId: z.uuid('Divisi tidak sah.').nullish(),
  clusterId: z.uuid('Cluster tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  programId: z.uuid('Program tidak sah.').nullish(),
  periodId: z.uuid('Periode tidak sah.').nullish(),

  priority: z.enum(priorityLevelEnum.enumValues).default('medium'),
  moduleStatus: teks(60).nullish(),

  /**
   * Penerima tugas selain PIC — isi `work_item_assignees`.
   *
   * Ada karena `canEditWorkItem` menyebutnya: yang boleh mengubah sebuah
   * pekerjaan adalah orang yang membuatnya, yang memimpinnya, **dan yang
   * mengerjakannya**. Tanpa jalur penulisan di sini, cabang ketiga itu tidak
   * pernah terisi dan janji "edit bebas DALAM divisinya" (§9.3) hanya berlaku
   * bagi PIC.
   *
   * Diganti seluruhnya, bukan ditambah-satu: `PATCH` yang mengirim daftar
   * adalah pernyataan tentang **susunan akhirnya**, dan penambahan yang
   * diam-diam akan membuat pencabutan tugas mustahil dilakukan lewat endpoint
   * yang sama.
   */
  assigneeIds: z
    .array(z.uuid('Penerima tugas tidak sah.'))
    .max(20, 'Maksimal 20 penerima tugas.')
    .optional(),

  startDate: tanggal.nullish(),
  dueDate: tanggal.nullish(),

  progressPercentage: persentase.default(0),

  parentId: z.uuid('Parent story tidak sah.').nullish(),
  storyPoints: z.coerce.number().int().min(0, 'Story points tidak boleh negatif.').default(0),
  sourceRequestId: z.uuid('Request asal tidak sah.').nullish(),

  isRecurring: z.boolean().default(false),
  recurrenceRule: teks(200).nullish(),
});

@ZodDto(CreateWorkItemSchema)
export class CreateWorkItemDto {
  declare title: string;
  declare type: (typeof workItemTypeEnum.enumValues)[number];
  declare description?: string | null;
  declare primaryPicId?: string | null;
  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;
  declare programId?: string | null;
  declare periodId?: string | null;
  declare priority: (typeof priorityLevelEnum.enumValues)[number];
  declare moduleStatus?: string | null;
  declare assigneeIds?: string[];
  declare startDate?: string | null;
  declare dueDate?: string | null;
  declare progressPercentage: number;
  declare parentId?: string | null;
  declare storyPoints?: number;
  declare sourceRequestId?: string | null;
  declare isRecurring: boolean;
  declare recurrenceRule?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mengubah
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mengubah pekerjaan.
 *
 * Seluruh medannya opsional: `PATCH` yang menuntut seluruh isian adalah `PUT`
 * yang salah nama. Yang tidak dikirim tidak disentuh — dan itu dijamin service
 * dengan menyusun `.set()` per medan, bukan dengan menyebar DTO apa adanya.
 * Menyebar DTO berarti medan yang tidak dikirim ikut tertulis sebagai
 * `undefined`, dan Drizzle memperlakukannya sebagai "jangan ubah" hanya kalau
 * kuncinya memang tidak ada.
 */
export const UpdateWorkItemSchema = z.object({
  title: judul.optional(),
  type: z.enum(workItemTypeEnum.enumValues).optional(),
  description: teks(5000).nullish(),

  primaryPicId: z.uuid('PIC tidak sah.').nullish(),
  divisionId: z.uuid('Divisi tidak sah.').nullish(),
  clusterId: z.uuid('Cluster tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  programId: z.uuid('Program tidak sah.').nullish(),

  /**
   * `optional()`, **bukan** `nullish()` seperti pada `CreateWorkItemSchema`.
   *
   * Kolomnya `not null` (keputusan 20 — setiap pekerjaan milik satu periode),
   * sehingga `{"periodId": null}` tidak punya arti yang sah: bukan "pindahkan ke
   * periode aktif", karena pekerjaan ini sudah punya periode, dan memindahkannya
   * diam-diam ke periode lain adalah keputusan yang tidak diminta siapa pun.
   *
   * Bentuknya mengikuti `title`, `type`, dan `priority` — tiga kolom `not null`
   * lain di skema yang sama. Perbedaan dengan `CreateWorkItemSchema` bukan
   * ketidakkonsistenan: pada **pembuatan**, `null` berarti "pakai periode yang
   * aktif" dan ada service yang memenuhinya; pada **penyuntingan**, tidak ada.
   *
   * Kalau `null` dibiarkan lolos, yang terjadi adalah `500` dari pelanggaran
   * `not null` di database — untuk isian yang salah bentuk, yang tempatnya `422`.
   */
  periodId: z.uuid('Periode tidak sah.').optional(),

  priority: z.enum(priorityLevelEnum.enumValues).optional(),
  moduleStatus: teks(60).nullish(),

  /** Diganti seluruhnya saat dikirim — lihat catatan di `CreateWorkItemSchema`. */
  assigneeIds: z
    .array(z.uuid('Penerima tugas tidak sah.'))
    .max(20, 'Maksimal 20 penerima tugas.')
    .optional(),

  startDate: tanggal.nullish(),
  dueDate: tanggal.nullish(),

  progressPercentage: persentase.optional(),

  parentId: z.uuid('Parent story tidak sah.').nullish(),
  storyPoints: z.coerce.number().int().min(0, 'Story points tidak boleh negatif.').optional(),
  sourceRequestId: z.uuid('Request asal tidak sah.').nullish(),

  blockerReason: teks(2000).nullish(),
  assistanceNeeded: teks(2000).nullish(),
  completionSummary: teks(5000).nullish(),
  holdReason: teks(2000).nullish(),

  isRecurring: z.boolean().optional(),
  recurrenceRule: teks(200).nullish(),
});

@ZodDto(UpdateWorkItemSchema)
export class UpdateWorkItemDto {
  declare title?: string;
  declare type?: (typeof workItemTypeEnum.enumValues)[number];
  declare description?: string | null;
  declare primaryPicId?: string | null;
  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;
  declare programId?: string | null;
  declare periodId?: string;
  declare priority?: (typeof priorityLevelEnum.enumValues)[number];
  declare moduleStatus?: string | null;
  declare assigneeIds?: string[];
  declare startDate?: string | null;
  declare dueDate?: string | null;
  declare progressPercentage?: number;
  declare parentId?: string | null;
  declare storyPoints?: number;
  declare sourceRequestId?: string | null;
  declare blockerReason?: string | null;
  declare assistanceNeeded?: string | null;
  declare completionSummary?: string | null;
  declare holdReason?: string | null;
  declare isRecurring?: boolean;
  declare recurrenceRule?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transisi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memindahkan status.
 *
 * ## Kenapa kolom syaratnya ada di sini juga, padahal ada di `PATCH`
 *
 * Karena satu langkah sudah cukup bagi penggunanya. Menahan pekerjaan menuntut
 * alasan (keputusan 48), dan menyelesaikannya menuntut ringkasan. Kalau kolom
 * itu hanya ada di `PATCH`, memindahkan status menjadi **dua permintaan**:
 * kirim alasanmu, lalu pindahkan. Dua permintaan berarti satu keadaan di
 * antaranya yang tidak sah — alasan sudah tersimpan, statusnya belum berubah —
 * dan kalau yang kedua gagal, barisnya tertinggal di keadaan itu.
 *
 * Kolomnya di sini **tidak** menggantikan yang di `PATCH`: keduanya berakhir di
 * kolom tabel yang sama. Yang membedakan adalah niat penggunanya, dan itu
 * tercermin di `action` audit-nya — `work_item.updated` untuk yang satu,
 * `work_item.status.changed` untuk yang lain.
 *
 * ## Kenapa `to` bukan `status`
 *
 * Karena yang dikirim adalah **tujuan**, bukan keadaan baru. `status` akan
 * terbaca sebagai "setel statusnya ke ini", yang persis cara berpikir yang
 * dihapus oleh state machine. `to` menyatakan perpindahan, dan perpindahan
 * itulah yang diperiksa.
 */
export const TransitionWorkItemSchema = z.object({
  to: z.enum(workStatusEnum.enumValues, 'Status tujuan tidak dikenal.'),

  /** Catatan bebas yang ikut tersimpan di riwayat status. */
  note: teks(1000).nullish(),

  blockerReason: teks(2000).nullish(),
  assistanceNeeded: teks(2000).nullish(),
  holdReason: teks(2000).nullish(),
  completionSummary: teks(5000).nullish(),

  /**
   * Progres saat berpindah status.
   *
   * Diabaikan saat tujuannya `done`: §12 menetapkan `done` selalu berarti
   * `progress_percentage = 100`, dan membiarkan klien mengirim 80 di sana akan
   * menghasilkan pekerjaan selesai yang progresnya delapan puluh persen.
   * Pengabaian itu dilakukan service, bukan dengan menghapus medannya di sini —
   * skema yang berbeda per nilai `to` akan menuntut `superRefine`, dan pesan
   * galatnya menjadi lebih sulit dibaca daripada manfaatnya.
   */
  progressPercentage: persentase.optional(),
});

@ZodDto(TransitionWorkItemSchema)
export class TransitionWorkItemDto {
  declare to: (typeof workStatusEnum.enumValues)[number];
  declare note?: string | null;
  declare blockerReason?: string | null;
  declare assistanceNeeded?: string | null;
  declare holdReason?: string | null;
  declare completionSummary?: string | null;
  declare progressPercentage?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menetapkan atau melepas penanggung jawab.
 *
 * `primaryPicId: null` **melepas** PIC, dan itu bukan kelengkapan: pekerjaan
 * yang ditinggalkan pemimpinnya harus bisa dikembalikan ke antrean tanpa
 * menunjuk orang lain lebih dulu. Tanpa cara melepas, satu-satunya jalan
 * mengganti PIC adalah langsung menunjuk penggantinya — dan ketika belum ada
 * penggantinya, pekerjaannya tetap tercatat sebagai tanggung jawab orang yang
 * sudah pergi.
 *
 * Rute tersendiri, bukan lewat `PATCH`, karena wewenangnya berbeda:
 * `canChangePic` membuka jalur "klaim pekerjaan tanpa PIC" bagi anggota biasa
 * (§9.3 M2), sedangkan `canEditWorkItem` tidak. Menggabungkannya berarti
 * anggota yang boleh mengklaim pekerjaan jadi boleh mengubah seluruh isinya.
 */
export const SetWorkItemPicSchema = z.object({
  primaryPicId: z.uuid('PIC tidak sah.').nullable(),

  /** Alasan pengalihan. Tercatat di audit, tidak ada di kolom mana pun. */
  note: teks(500).nullish(),
});

@ZodDto(SetWorkItemPicSchema)
export class SetWorkItemPicDto {
  declare primaryPicId: string | null;
  declare note?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daftar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penyaring daftar pekerjaan.
 *
 * ## `withoutPic` ada karena §5.2.8
 *
 * Temuan itu berbunyi: *"`primary_pic_id` tetap menunjuk akun nonaktif.
 * Notifikasi tetap dikirim ke sana. Tidak ada daftar 'pekerjaan menggantung'."*
 *
 * Penyaring ini yang menjadi daftar itu. Pekerjaan yang PIC-nya dilepas karena
 * akunnya dinonaktifkan muncul di sini, dan `ALUR-PER-ROLE.md` §3.7 memang
 * meminta bentuknya begitu: daftar yang bisa ditindaklanjuti owner, bukan
 * pengalihan otomatis ke orang yang tidak memintanya.
 *
 * `withoutPic` dan `picId` boleh dipakai bersama tanpa saling meniadakan:
 * "pekerjaan tanpa PIC di divisi ini" adalah pertanyaan yang wajar, dan
 * menolaknya hanya akan membuat pemanggilnya menyaring sendiri di frontend —
 * yaitu memindahkan aturan ke tempat yang tidak menjaganya.
 */
export const ListWorkItemsSchema = z.object({
  divisionId: z.uuid('Divisi tidak sah.').optional(),
  clusterId: z.uuid('Cluster tidak sah.').optional(),
  subunitId: z.uuid('Subunit tidak sah.').optional(),
  programId: z.uuid('Program tidak sah.').optional(),
  periodId: z.uuid('Periode tidak sah.').optional(),

  status: z.enum(workStatusEnum.enumValues).optional(),
  type: z.enum(workItemTypeEnum.enumValues).optional(),
  priority: z.enum(priorityLevelEnum.enumValues).optional(),

  picId: z.uuid('PIC tidak sah.').optional(),
  parentId: z.uuid('Parent story tidak sah.').optional(),
  sourceRequestId: z.uuid('Request ID tidak sah.').optional(),

  /** Hanya pekerjaan yang belum punya PIC — lihat catatan di atas. */
  withoutPic: z.coerce.boolean().optional(),

  /** Pencarian pada judul dan nomor pekerjaan. */
  q: z.string().trim().min(1).max(120).optional(),

  /**
   * Menyertakan yang sudah diarsipkan. **Tidak pernah** menyertakan yang
   * dihapus: `deleted_at` berarti sampah, dan sampah tidak muncul di daftar
   * mana pun kecuali di recycle bin yang belum ada.
   */
  includeArchived: z.coerce.boolean().default(false),

  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@ZodDto(ListWorkItemsSchema)
export class ListWorkItemsDto {
  declare divisionId?: string;
  declare clusterId?: string;
  declare subunitId?: string;
  declare programId?: string;
  declare periodId?: string;
  declare status?: (typeof workStatusEnum.enumValues)[number];
  declare type?: (typeof workItemTypeEnum.enumValues)[number];
  declare priority?: (typeof priorityLevelEnum.enumValues)[number];
  declare picId?: string;
  declare parentId?: string;
  declare sourceRequestId?: string;
  declare withoutPic?: boolean;
  declare q?: string;
  declare includeArchived: boolean;
  declare limit: number;
  declare offset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Story with Sub-tasks
// ─────────────────────────────────────────────────────────────────────────────

export const SubTaskItemSchema = z.object({
  title: judul,
  description: teks(3000).nullish(),
  primaryPicId: z.uuid('PIC tidak sah.').nullish(),
  assigneeIds: z.array(z.uuid('Penerima tugas tidak sah.')).optional(),
  priority: z.enum(priorityLevelEnum.enumValues).default('medium'),
  startDate: tanggal.nullish(),
  dueDate: tanggal.nullish(),
  storyPoints: z.coerce.number().int().min(0, 'Story points tidak boleh negatif.').default(0),
});

export const CreateStoryWithTasksSchema = z.object({
  title: judul,
  description: teks(5000).nullish(),
  divisionId: z.uuid('Divisi tidak sah.').nullish(),
  clusterId: z.uuid('Cluster tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  programId: z.uuid('Program tidak sah.').nullish(),
  periodId: z.uuid('Periode tidak sah.').nullish(),
  priority: z.enum(priorityLevelEnum.enumValues).default('medium'),
  primaryPicId: z.uuid('PIC tidak sah.').nullish(),
  assigneeIds: z.array(z.uuid('Penerima tugas tidak sah.')).optional(),
  startDate: tanggal.nullish(),
  dueDate: tanggal.nullish(),
  sourceRequestId: z.uuid('Request asal tidak sah.').nullish(),
  storyPoints: z.coerce.number().int().min(0).default(0),
  tasks: z.array(SubTaskItemSchema).default([]),
});

@ZodDto(CreateStoryWithTasksSchema)
export class CreateStoryWithTasksDto {
  declare title: string;
  declare description?: string | null;
  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;
  declare programId?: string | null;
  declare periodId?: string | null;
  declare priority: (typeof priorityLevelEnum.enumValues)[number];
  declare primaryPicId?: string | null;
  declare assigneeIds?: string[];
  declare startDate?: string | null;
  declare dueDate?: string | null;
  declare sourceRequestId?: string | null;
  declare storyPoints: number;
  declare tasks: z.infer<typeof SubTaskItemSchema>[];
}

