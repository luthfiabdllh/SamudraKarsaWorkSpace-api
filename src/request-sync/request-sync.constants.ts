import type { RequestStatus, WorkStatus } from '../policy/resource';

/**
 * Peta status antara permintaan dan pekerjaan terhubungnya.
 *
 * ## Kenapa dua tabel, bukan satu
 *
 * Sinkronisasinya **dua arah** (§5.2.3), dan arah yang satu tidak bisa dihitung
 * dari arah yang lain. Satu tabel dua kolom (`request_status`, `work_status`)
 * memang cukup untuk **memeriksa** kesepakatan, tetapi tidak cukup untuk
 * **memutuskan** ke mana sisi seberang harus berpindah — karena satu nilai
 * pekerjaan bisa cocok dengan dua nilai permintaan. Dua tabel yang masing-masing
 * total (setiap nilai punya tepat satu pasangan) menghilangkan keraguan itu di
 * tempat pertanyaannya diajukan.
 *
 * ## Ketidaksepakatan yang diketahui, dan kenapa ia tidak berbahaya
 *
 * `need_clarification` dan `on_hold` sama-sama memetakan ke pekerjaan `on_hold`,
 * sedangkan `on_hold` pada pekerjaan memetakan balik ke permintaan `on_hold`.
 * Artinya kedua pasangan ini **sama-sama sah**:
 *
 * | Permintaan | Pekerjaan | Artinya |
 * |---|---|---|
 * | `need_clarification` | `on_hold` | ditahan karena pemohon harus melengkapi |
 * | `on_hold` | `on_hold` | ditahan atas keputusan divisi tujuan |
 *
 * Pemeriksaannya ada di `WORK_STATUS_FOR_REQUEST` — arah permintaan ke
 * pekerjaan, satu arah saja — sehingga keduanya lolos tanpa perlu kasus
 * khusus. Yang **tidak** pernah terjadi adalah kebingungan saat sisi pekerjaan
 * berpindah: `REQUEST_STATUS_FOR_WORK` hanya dipakai ketika pekerjaannya
 * **bergerak**, dan sebuah perpindahan selalu mengubah status (tidak ada sisi
 * `on_hold → on_hold` di `status_transitions`), sehingga pekerjaan yang bergerak
 * **menuju** `on_hold` pasti datang dari status lain — dan permintaannya, kalau
 * pasangannya utuh, juga bukan `need_clarification` saat itu.
 *
 * Kalau di masa depan `need_clarification` dipetakan ke sesuatu yang lain,
 * **kedua tabel ini yang diubah lebih dulu**, bukan kode sinkronisasinya.
 */
export const WORK_STATUS_FOR_REQUEST = {
  draft: 'backlog',
  submitted: 'backlog',
  accepted: 'todo',
  in_progress: 'in_progress',
  need_review: 'in_review',
  on_hold: 'blocked',
  done: 'done',
  rejected: 'canceled',
  need_clarification: 'blocked',
} as const satisfies Record<RequestStatus, WorkStatus>;

/**
 * Arah sebaliknya — dipakai saat **pekerjaannya** yang berpindah.
 */
export const REQUEST_STATUS_FOR_WORK = {
  backlog: 'draft',
  todo: 'accepted',
  in_progress: 'in_progress',
  in_review: 'need_review',
  blocked: 'on_hold',
  done: 'done',
  canceled: 'rejected',
} as const satisfies Record<WorkStatus, RequestStatus>;

/**
 * Kolom permintaan yang **wajib terisi** saat statusnya menjadi nilai tertentu.
 */
export const REQUEST_STATUS_REQUIRED_FIELDS: Partial<
  Record<RequestStatus, readonly string[]>
> = {
  need_clarification: ['clarification_note'],
  on_hold: ['hold_reason'],
  done: ['result_summary'],
};

/** Kolom pekerjaan yang wajib terisi saat statusnya menjadi nilai tertentu. */
export const WORK_STATUS_REQUIRED_FIELDS: Partial<
  Record<WorkStatus, readonly string[]>
> = {
  blocked: ['hold_reason'],
  done: ['completion_summary'],
};

export const SYNC_ERRORS = {
  /** `409` — konflik ditandai; transisi ditutup sampai diselesaikan. */
  conflictFlagged: 'sync_conflict_flagged',
  /** `422` — penyelesaian menunjuk status yang tidak bisa dicapai. */
  resolutionInvalid: 'sync_resolution_invalid',
} as const;
