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
  draft: 'draft',
  submitted: 'submitted',
  accepted: 'approved',
  in_progress: 'in_progress',
  need_review: 'need_review',
  on_hold: 'on_hold',
  done: 'done',
  rejected: 'rejected',

  /**
   * **Tidak** dipetakan ke `need_review`, dan itu inti perbaikannya.
   *
   * `sksks` melebur keduanya (`docs/INVENTARIS-ATURAN.md` §4, temuan #6), dan
   * §5.2.5 menyebutnya sebagai kehilangan informasi: "kami butuh keterangan dari
   * Anda" dan "kami sedang menilai hasil kerja Anda" adalah dua keadaan yang
   * berlawanan arah. Meleburkannya membuat kepala divisi tidak bisa membedakan
   * pekerjaan yang belum bisa dimulai dari pekerjaan yang sudah jadi.
   *
   * `on_hold` dipilih sebagai pasangannya karena itulah artinya bagi pekerjaan:
   * **belum bisa dikerjakan**, ditahan oleh sesuatu di luar pekerjaan itu
   * sendiri. Kolom `hold_reason`-nya diisi dari `clarification_note`
   * permintaan — bukan dengan teks karangan seperti di `sksks`, yang mengisi
   * `assistance_needed` dengan `'Menunggu tindak lanjut request'` hanya supaya
   * validasinya lolos.
   */
  need_clarification: 'on_hold',
} as const satisfies Record<RequestStatus, WorkStatus>;

/**
 * Arah sebaliknya — dipakai saat **pekerjaannya** yang berpindah.
 *
 * `approved` menjadi `accepted`, bukan `approved`: nama statusnya berbeda di
 * kedua tabel (`sksks` menyebutnya `diterima` di sisi permintaan dan
 * `disetujui` di sisi pekerjaan — §5.2.5 baris pertama), dan yang disatukan di
 * sini adalah **artinya**, bukan tulisannya. Menyeragamkan namanya berarti
 * mengubah salah satu enum, dan enum `work_status` sudah dipakai pekerjaan yang
 * tidak berasal dari permintaan sama sekali.
 */
export const REQUEST_STATUS_FOR_WORK = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'accepted',
  in_progress: 'in_progress',
  need_review: 'need_review',
  on_hold: 'on_hold',
  done: 'done',
  rejected: 'rejected',
} as const satisfies Record<WorkStatus, RequestStatus>;

/**
 * Kolom permintaan yang **wajib terisi** saat statusnya menjadi nilai tertentu.
 *
 * Ditulis ulang di sini meski `status_transitions.required_fields` sudah memuat
 * hal yang sama, dan itu **bukan** duplikasi: tabel itu menyatakan syarat sebuah
 * **perpindahan**, sedangkan yang dibutuhkan penyelesaian konflik adalah syarat
 * sebuah **keadaan**. Penyelesaian konflik boleh melompat — itulah gunanya —
 * sehingga tidak ada baris `status_transitions` yang bisa dibacanya.
 *
 * Ketiganya sejalan dengan `check` constraint di tabel `requests`. Yang
 * membedakan: constraint itu menolak sebagai `500` yang tidak menyebut kolom,
 * sedangkan peta ini menolak sebagai `422` yang menyebut kolomnya.
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
  on_hold: ['hold_reason'],
  done: ['completion_summary'],
};

export const SYNC_ERRORS = {
  /** `409` — konflik ditandai; transisi ditutup sampai diselesaikan. */
  conflictFlagged: 'sync_conflict_flagged',
  /** `422` — penyelesaian menunjuk status yang tidak bisa dicapai. */
  resolutionInvalid: 'sync_resolution_invalid',
} as const;
