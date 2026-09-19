/**
 * Nama aksi audit dan kode kesalahan untuk modul organisasi.
 *
 * ## Kenapa dikumpulkan, padahal `action` bertipe `text`
 *
 * Sama alasannya dengan `AUDIT_ACTIONS` di modul auth: kolom teks bebas akan
 * berisi `division.create` di satu tempat dan `organization.division.created` di
 * tempat lain kalau tidak ada yang menyatakannya. Perbedaannya baru terasa saat
 * seseorang menyaring `activity_logs` untuk mencari "semua perubahan divisi" dan
 * hanya mendapat sepertiganya — tanpa cara tahu bahwa sisanya ada, karena
 * tidak ada daftar yang bisa dibaca.
 *
 * `code` di bawah masuk ke badan RFC 7807 bersama `title` dan `detail`, jadi ia
 * **dibaca program**, bukan manusia. Karena itu bentuknya tetap Inggris dan
 * bertitik — keputusan 47 menaruh bahasa Indonesia di label antarmuka, bukan di
 * nilai yang dibandingkan kode.
 */

/**
 * Aksi yang tercatat di `activity_logs`.
 *
 * Setiap penghapusan punya barisnya sendiri, dan itu bukan kelengkapan
 * belaka: `beforeData` pada aksi `deleted` adalah satu-satunya tempat nilai
 * sebuah divisi masih bisa ditemukan setelah barisnya hilang. Menghapus tanpa
 * mencatat isinya berarti kehilangan itu secara permanen — dan pada tabel acuan
 * yang dirujuk puluhan tabel lain, "divisi apa tadi namanya" adalah pertanyaan
 * yang benar-benar muncul.
 */
export const ORGANIZATION_ACTIONS = {
  periodCreated: 'organization.period.created',
  periodUpdated: 'organization.period.updated',
  /**
   * Perpindahan periode aktif dicatat terpisah dari `periodUpdated`.
   *
   * Mengaktifkan periode **mengubah baris lain juga** — periode yang tadinya
   * aktif ikut dimatikan. Catatan `updated` pada satu baris akan menyembunyikan
   * separuh kejadiannya, dan justru separuh itu yang dicari orang ketika
   * bertanya "sejak kapan periodenya berganti".
   */
  periodActivated: 'organization.period.activated',
  periodDeleted: 'organization.period.deleted',

  divisionCreated: 'organization.division.created',
  divisionUpdated: 'organization.division.updated',
  divisionDeleted: 'organization.division.deleted',

  clusterCreated: 'organization.cluster.created',
  clusterUpdated: 'organization.cluster.updated',
  clusterDeleted: 'organization.cluster.deleted',

  subunitCreated: 'organization.subunit.created',
  subunitUpdated: 'organization.subunit.updated',
  subunitDeleted: 'organization.subunit.deleted',
} as const;

/**
 * Kode kesalahan yang mungkin dikembalikan modul ini.
 *
 * Dipisahkan dari HTTP statusnya karena dua kesalahan berbeda bisa memakai
 * status yang sama — `409` untuk kode ganda, untuk data yang masih dirujuk, dan
 * untuk tanggal periode yang terbalik. Tanpa `code`, frontend hanya tahu
 * "bentrok" dan harus menebak dari isi `title`, yang berarti menebak dari teks
 * yang boleh berubah kapan saja.
 */
export const ORGANIZATION_ERRORS = {
  /** `404` — barisnya tidak ada. */
  notFound: 'organization_not_found',
  /** `409` — kode sudah dipakai baris lain di tabel yang sama. */
  duplicateCode: 'organization_duplicate_code',
  /** `409` — masih ada tabel lain yang menunjuk baris ini. */
  stillReferenced: 'organization_still_referenced',
  /**
   * `409` — periode aktif tidak boleh dihapus.
   *
   * Dibedakan dari `stillReferenced` meski statusnya sama: yang satu bisa
   * diselesaikan dengan memindahkan data lain, yang ini dengan mengaktifkan
   * periode lain lebih dulu. Menyamakannya membuat frontend menampilkan saran
   * yang salah.
   */
  activePeriod: 'organization_active_period',
  /** `409` — `endsOn` tidak setelah `startsOn`. */
  periodOrder: 'organization_period_order',
} as const;
