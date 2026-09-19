/**
 * Kode kesalahan dan aksi audit untuk modul pekerjaan.
 *
 * Bentuknya sama dengan `organization.constants.ts` dan `profiles.constants.ts`.
 */

/**
 * Nama entitasnya di `activity_logs.entity_type` dan `record_versions.entity_type`.
 *
 * Ditulis sekali di sini, bukan sebagai teks `'work_item'` yang tersebar. Nilai
 * ini **juga** yang dipakai `status_transitions.entity_type`, jadi teks yang
 * salah ketik di salah satu tempat akan menghasilkan riwayat versi yang tidak
 * bisa ditemukan kembali lewat pencarian entitas — kegagalan yang tidak
 * menimbulkan error di mana pun.
 */
export const WORK_ITEM_ENTITY = 'work_item';

export const WORK_ITEM_ACTIONS = {
  created: 'work_item.created',
  updated: 'work_item.updated',

  /**
   * Perpindahan status dicatat terpisah dari pengubahan biasa.
   *
   * Bukan kerapian: `work_item_status_history` menyimpan **perjalanannya**,
   * sedangkan yang ini menyimpan **siapa yang memindahkannya, dari mana, dan
   * lewat permintaan mana**. Ketika suatu saat ada yang bertanya "kenapa
   * pekerjaan ini ditahan selama dua minggu", jawabannya ada di riwayat; ketika
   * yang ditanya "siapa yang menahannya", jawabannya ada di sini.
   */
  transitioned: 'work_item.status.changed',
  picChanged: 'work_item.pic.changed',
  deleted: 'work_item.deleted',

  /**
   * PIC dilepas karena akunnya dinonaktifkan (§5.2.8).
   *
   * Aksi tersendiri, bukan `picChanged`, karena pelakunya bukan manusia:
   * `actorId`-nya adalah orang yang menonaktifkan, sedangkan yang berubah
   * adalah pekerjaan orang lain. Mencampurnya dengan pengalihan biasa akan
   * membuat "siapa yang melepas PIC pekerjaan ini" terjawab dengan nama orang
   * yang menonaktifkan akun — yang secara harfiah benar dan sama sekali tidak
   * berguna.
   */
  picReleased: 'work_item.pic.released',

  /**
   * Penerima tugas dicabut karena akunnya dinonaktifkan (§5.2.8).
   *
   * Terpisah dari `picReleased` meski dipicu kejadian yang sama, karena yang
   * berubah berbeda: yang satu **penunjuk tanggung jawab**, yang satu
   * **keikutsertaan**. Satu pekerjaan bisa kehilangan keduanya sekaligus, dan
   * catatan yang menyebut keduanya sebagai satu hal akan membuat pertanyaan
   * "kenapa saya tidak lagi menerima tugas ini" terjawab dengan "PIC-nya
   * dilepas" — yang belum tentu benar untuk orang yang bertanya.
   */
  assigneeReleased: 'work_item.assignee.released',
} as const;

export const WORK_ITEM_ERRORS = {
  /** `404` — pekerjaan tidak ada, id bukan UUID, atau bukan wilayah aktor. */
  notFound: 'work_item_not_found',
  /** `409` — `If-Match` tidak cocok; barisnya sudah berubah. */
  versionMismatch: 'work_item_version_mismatch',
  /** `428` — `If-Match` tidak ada pada penulisan yang menuntutnya. */
  versionRequired: 'work_item_version_required',
  /**
   * `409` — pekerjaan dan permintaan asalnya belum sepakat (keputusan 49).
   *
   * Terpisah dari `versionMismatch` meski sama-sama `409`, karena keduanya
   * meminta hal yang berbeda dari penggunanya: yang satu "muat ulang lalu ulangi
   * perubahanmu", yang satu "selesaikan dulu konfliknya, dan perubahanmu belum
   * hilang".
   */
  syncConflict: 'work_item_sync_conflict',
  /** `422` — `in_progress` dituntut, tetapi PIC-nya belum ada. */
  picRequired: 'work_item_pic_required',
  /**
   * `422` — PIC yang ditunjuk tidak ada atau tidak berstatus `active`.
   *
   * Terpisah dari `picRequired` meski sama-sama `422`, karena yang salah
   * berbeda: yang satu pekerjaannya belum punya PIC, yang satu orangnya tidak
   * bisa dijadikan PIC. Pesan yang menyamakan keduanya akan membuat orang
   * mencari PIC untuk pekerjaan yang sebenarnya sudah punya.
   */
  picInvalid: 'work_item_pic_invalid',
  /** `422` — tidak ada periode aktif dan periodenya tidak disebutkan. */
  periodRequired: 'work_item_period_required',
} as const;
