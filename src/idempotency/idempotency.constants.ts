/**
 * Berapa lama hasil sebuah operasi tulis disimpan (`PRD-REVAMP.md` §7.10).
 *
 * Dua puluh empat jam, dan angkanya dari PRD — bukan hasil perkiraan berapa
 * lama klien menunda percobaan ulangnya. Yang menentukan sebuah baris boleh
 * dipakai ulang adalah `expires_at`, bukan penghapusan: percobaan ulang datang
 * dalam hitungan detik, dan menghapus barisnya tepat saat kedaluwarsa berarti
 * menaruh pekerjaan pembersihan di jalur permintaan — tempat yang paling tidak
 * pantas menerimanya.
 */
export const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Batas panjang kunci, sama dengan yang dinyatakan kontrak OpenAPI.
 *
 * Ditegakkan di sini, bukan hanya di dokumen: `key` adalah **kunci utama**
 * tabel, dan kolom teks tanpa batas yang dijadikan kunci utama adalah cara
 * termurah membuat indeksnya membengkak — satu permintaan dengan kunci
 * sepanjang satu megabita sudah cukup.
 */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * Kode error yang bisa dibedakan klien.
 *
 * `mismatch` dan `inFlight` sama-sama `409`, dan perbedaannya penting: yang
 * pertama berarti kliennya **salah memakai kunci** dan harus memperbaikinya,
 * yang kedua berarti permintaannya benar dan hanya perlu diulang sebentar lagi.
 * Satu kode untuk keduanya akan membuat klien memperlakukan salah satunya
 * dengan cara yang keliru.
 */
export const IDEMPOTENCY_ERRORS = {
  /** Kunci yang sama, isi permintaan yang berbeda. */
  mismatch: 'idempotency_key_mismatch',
  /** Kunci yang sama, permintaan pertama belum selesai. */
  inFlight: 'idempotency_key_in_flight',
  /** Kunci yang tidak bisa dibaca — dikirim lebih dari sekali, atau terlalu panjang. */
  unreadable: 'invalid_idempotency_key',
} as const;

/**
 * Berapa lama permintaan kedua menunggu permintaan pertama selesai.
 *
 * Enam kali seratus milidetik. Angkanya sengaja kecil: yang ditunggu adalah
 * **tombol yang tertekan dua kali**, dan jarak dua ketukan adalah ratusan
 * milidetik. Menunggu lebih lama daripada itu tidak menolong siapa pun — ia
 * hanya menahan permintaan yang toh tidak akan menemukan jawabannya.
 */
export const IDEMPOTENCY_IN_FLIGHT_ATTEMPTS = 6;
export const IDEMPOTENCY_IN_FLIGHT_WAIT_MS = 100;
