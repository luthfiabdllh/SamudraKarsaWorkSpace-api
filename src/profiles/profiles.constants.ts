/**
 * Kode kesalahan dan aksi audit untuk modul profil.
 *
 * Bentuknya sama dengan `organization.constants.ts`; alasannya sama pula —
 * `action` bertipe `text` bebas dan `code` dibaca program, jadi keduanya
 * dikumpulkan alih-alih ditulis di tempat pemakaiannya.
 */

export const PROFILE_ACTIONS = {
  selfUpdated: 'profile.self.updated',

  /**
   * Perubahan oleh admin dicatat terpisah dari perubahan sendiri.
   *
   * Bukan kerapian: yang satu dilakukan pemilik datanya, yang satu dilakukan
   * orang lain atas namanya. Ketika suatu saat ada yang bertanya "sejak kapan
   * divisi saya berubah", jawabannya berbeda tergantung yang mana — dan
   * mencampurnya menjadi satu nama aksi menghapus perbedaan itu.
   */
  created: 'profile.created',
  updated: 'profile.updated',
  passwordReset: 'profile.password.reset',
} as const;

export const PROFILE_ERRORS = {
  /** `404` — profil tidak ada, atau id-nya bukan UUID. */
  notFound: 'profile_not_found',
  /** `409` — email sudah dipakai profil lain. */
  duplicateEmail: 'profile_duplicate_email',
  /** `409` — `If-Match` tidak cocok; barisnya sudah berubah. */
  versionMismatch: 'profile_version_mismatch',
  /** `428` — `If-Match` tidak ada pada penulisan yang menuntutnya. */
  versionRequired: 'profile_version_required',
  /** `409` — status akhir tidak sah dari status sekarang. */
  statusConflict: 'profile_status_conflict',
} as const;

/**
 * Panjang password sementara yang dibuatkan owner.
 *
 * 20, bukan 12 seperti `MIN_PASSWORD_LENGTH`. Password sementara **dibacakan
 * lisan atau dikirim lewat pesan**, jadi ia harus tetap tidak tertebak meski
 * dilihat orang lain sekilas — dan ia hidup di antara "dibuatkan" dan "dipakai
 * sekali", bukan di kepala seseorang selama bertahun-tahun.
 *
 * Dibuat dari `randomBytes` dan bukan dari kata yang bisa dibaca, karena
 * password yang mudah diingat juga mudah ditebak. Yang membuatnya bisa dipakai
 * adalah `must_change_password`, bukan kemudahan menghafalnya.
 *
 * 15 byte menjadi 20 karakter base64url — di atas `MIN_PASSWORD_LENGTH`, dan
 * itu diperiksa test supaya keduanya tidak bisa menyimpang tanpa ketahuan.
 */
export const TEMPORARY_PASSWORD_BYTES = 15;
