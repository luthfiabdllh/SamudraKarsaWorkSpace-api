/**
 * Kode kesalahan dan aksi audit untuk modul permintaan.
 *
 * Bentuknya sama dengan `organization.constants.ts`, `profiles.constants.ts`,
 * dan `work-items.constants.ts`.
 */

/**
 * Nama entitasnya di `activity_logs.entity_type`, `record_versions.entity_type`,
 * dan `status_transitions.entity_type`.
 *
 * Ketiganya memakai nilai yang sama, jadi teks yang salah ketik di salah satu
 * tempat menghasilkan riwayat yang tidak bisa ditemukan kembali lewat
 * pencarian entitas — kegagalan yang tidak menimbulkan error di mana pun.
 */
export const REQUEST_ENTITY = 'request';

export const REQUEST_ACTIONS = {
  created: 'request.created',
  updated: 'request.updated',

  /**
   * Perpindahan status dicatat terpisah dari pengubahan biasa.
   *
   * Alasannya sama dengan pekerjaan: yang satu menyimpan **isi** barisnya, yang
   * satu menyimpan **perjalanannya**. Permintaan tidak punya tabel riwayat
   * status tersendiri seperti `work_item_status_history`, sehingga baris inilah
   * satu-satunya tempat "dari mana ke mana, oleh siapa" terjawab.
   */
  transitioned: 'request.status.changed',
  deleted: 'request.deleted',

  /**
   * Penanggung jawab permintaan dilepas karena akunnya dinonaktifkan (§5.2.8).
   *
   * Pelakunya bukan manusia: `actorId`-nya adalah orang yang menonaktifkan,
   * sedangkan yang berubah adalah permintaan orang lain.
   */
  picReleased: 'request.assigned_pic.released',

  /**
   * Pekerjaan terhubung dibuat saat permintaan **diajukan** (§5.2.4).
   *
   * Aksi tersendiri meski yang membuatnya adalah modul permintaan, karena yang
   * lahir adalah **pekerjaan** — dan riwayat pekerjaan itu harus bisa menjawab
   * "dari mana kamu berasal" tanpa membuka tabel permintaan. `entityType`-nya
   * karena itu `work_item`, bukan `request`; lihat pemakaiannya di
   * `RequestsService`.
   */
  linkedWorkItemCreated: 'request.linked_work_item.created',

  /**
   * Konflik sinkronisasi ditandai (keputusan 49).
   *
   * Dicatat pada saat **muncul**, bukan hanya saat diselesaikan. Konflik yang
   * muncul lalu hilang tanpa jejak berarti dua catatan yang berbeda pernah
   * beredar di sistem ini, dan tidak ada satu pun cara mengetahui mengapa.
   */
  syncConflictFlagged: 'request.sync_conflict.flagged',

  /**
   * Konflik sinkronisasi diselesaikan — keputusan 49, dan satu-satunya jalur
   * yang boleh menulis status **tanpa** melewati state machine.
   */
  syncConflictResolved: 'request.sync_conflict.resolved',
} as const;

export const REQUEST_ERRORS = {
  /** `404` — permintaan tidak ada, id bukan UUID, atau bukan wilayah aktor. */
  notFound: 'request_not_found',
  /** `409` — `If-Match` tidak cocok; barisnya sudah berubah. */
  versionMismatch: 'request_version_mismatch',
  /** `428` — `If-Match` tidak ada pada penulisan yang menuntutnya. */
  versionRequired: 'request_version_required',
  /** `409` — permintaan dan pekerjaan terhubungnya belum sepakat. */
  syncConflict: 'request_sync_conflict',
  /** `409` — penyelesaian diminta untuk baris yang tidak sedang berkonflik. */
  notInConflict: 'request_not_in_conflict',
  /** `422` — divisi tujuan tidak boleh berpindah setelah diajukan. */
  targetDivisionLocked: 'request_target_division_locked',
  /** `422` — kolom yang dituntut status tujuan belum terisi. */
  requiredFieldMissing: 'request_required_field_missing',
  /** `422` — penanggung jawab yang ditunjuk tidak ada atau tidak aktif. */
  picInvalid: 'request_pic_invalid',
  /**
   * `422` — pekerjaan terhubungnya belum punya PIC aktif.
   *
   * Terpisah dari `picInvalid` karena yang salah bukan permintaannya: PIC-nya
   * ada di pekerjaan terhubung, dan yang harus diperbaiki ada di sana. Pesan
   * yang menyamakan keduanya akan menyuruh orang menetapkan ulang penanggung
   * jawab pada permintaan yang penanggung jawabnya sudah benar.
   */
  linkedWorkItemPicMissing: 'request_linked_work_item_pic_missing',
  /** `422` — tidak ada periode aktif dan periodenya tidak disebutkan. */
  periodRequired: 'request_period_required',
  /** `422` — permintaan tanpa divisi tujuan tidak berarti apa-apa. */
  targetDivisionRequired: 'request_target_division_required',
} as const;
