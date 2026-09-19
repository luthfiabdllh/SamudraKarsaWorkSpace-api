import { SetMetadata } from '@nestjs/common';

import { SKIP_IDEMPOTENCY_KEY } from '../common/constants';

/**
 * Menandai rute yang hasilnya **tidak** disimpan meski `Idempotency-Key`
 * dikirim klien.
 *
 * ## Kenapa ada, padahal §7.10 tidak menyebutnya
 *
 * `idempotency_keys.response_body` menyimpan jawaban **apa adanya**, dan
 * beberapa jawaban berisi kredensial. `POST /auth/google`, `/auth/login`, dan
 * `/auth/refresh` mengembalikan access token dan refresh token — dan menyimpan
 * token di tabel yang kuncinya ditentukan klien berarti token itu tinggal di
 * sana selama dua puluh empat jam, bisa dibaca siapa pun yang bisa membaca
 * tabelnya: kebocoran basis data, cadangan yang salah tempat, atau satu celah
 * injeksi di suatu tempat yang belum ada hari ini.
 *
 * Yang ditukar bukan manfaat besar. Percobaan ulang login yang gagal toh
 * **sudah** aman: memasukkan password yang sama dua kali menghasilkan token
 * baru, bukan pengguna kedua. Jadi yang didapat dari menyimpannya nyaris nol,
 * sementara yang dipertaruhkan adalah token yang masih berlaku.
 *
 * Karena itu daftar pengecualiannya **pendek dan bisa ditinjau dalam satu
 * layar** — persis alasan yang sama dengan daftar `@Public()` di §7.19.1. Kalau
 * daftar itu memanjang, itu tandanya ada yang salah.
 *
 * ## Kenapa decorator, bukan daftar path di interceptor
 *
 * Daftar path di interceptor harus menyebut prefix dan versinya
 * (`/api/v1/auth/...`), dan prefix itu ditetapkan di `main.ts`. Dua tempat yang
 * harus berubah bersama-sama adalah dua tempat yang suatu hari akan berubah
 * tidak bersama-sama — dan kegagalannya tidak bersuara: token mulai tersimpan,
 * dan tidak ada satu pun gejala yang menunjuk ke sana.
 *
 * Decorator menempel pada controllernya, jadi ia ikut terbaca di tempat orang
 * membaca rutenya.
 */
export const SkipIdempotency = () => SetMetadata(SKIP_IDEMPOTENCY_KEY, true);
