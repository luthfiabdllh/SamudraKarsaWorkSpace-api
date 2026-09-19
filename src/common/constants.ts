/**
 * Kunci metadata untuk decorator, dan nama header yang dipakai bolak-balik.
 *
 * Dipusatkan di satu berkas dengan satu alasan: kalau kunci metadata berbeda
 * diam-diam antara yang menulis dan yang membaca, guard-nya tidak akan pernah
 * menyala — dan itu gagal **tanpa suara**. Satu huruf salah ketik sudah cukup.
 */
export const IS_PUBLIC_KEY = 'samudrakarsa:isPublic';
export const POLICY_KEY = 'samudrakarsa:policy';
export const ZOD_SCHEMA_KEY = 'samudrakarsa:zodSchema';

/** Ditelusuri dari frontend → BFF → backend (§7.15). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Penguncian optimistis (§7.16). */
export const IF_MATCH_HEADER = 'if-match';

/** Idempotensi tulis (§7.10) — dipakai di pass berikutnya. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
