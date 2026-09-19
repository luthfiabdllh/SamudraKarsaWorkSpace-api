/**
 * Normalisasi alamat surel.
 *
 * `profiles.email` disimpan **selalu huruf kecil** — lihat catatan pada kolomnya
 * di `organization.ts`. Artinya setiap jalur yang mencari berdasarkan surel
 * wajib melewati fungsi ini lebih dulu. Mencari dengan nilai mentah akan gagal
 * untuk `Budi@Example.com` meski barisnya ada, dan kegagalannya muncul sebagai
 * "akun tidak ditemukan" — pesan yang menuding penggunanya, bukan kodenya.
 *
 * `trim()` juga bukan hiasan: alamat surel yang disalin dari dokumen atau
 * chatroom sering membawa spasi di ujungnya, dan spasi itu tidak terlihat.
 *
 * **Tidak** ada normalisasi yang lebih pintar dari ini, dan itu disengaja:
 * membuang titik pada bagian lokal (`budi.santoso` → `budisantoso`) atau
 * memotong bagian setelah `+` adalah aturan yang benar untuk Gmail dan salah
 * untuk hampir semua penyedia lain. Alamat surel yang berbeda adalah alamat
 * yang berbeda.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
