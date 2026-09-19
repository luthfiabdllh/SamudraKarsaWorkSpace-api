/**
 * Angka dan nama yang dipakai bersama oleh seluruh jalur auth.
 *
 * Dikumpulkan di satu berkas karena nilai-nilai ini punya sifat yang sama:
 * kalau salah satu berubah, ada berkas lain yang ikut salah tanpa error.
 * Masa berlaku access token yang berbeda antara penanda tangan dan pemeriksa
 * tidak menghasilkan kegagalan — ia menghasilkan token yang ditolak sesudah
 * 15 menit, atau diterima jauh lebih lama dari yang disangka.
 */

/** Token akses: 15 menit (`PRD-REVAMP.md` §7.8.7). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Token penyegar: 7 hari, dan **diperbarui setiap kali dipakai**. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Nama cookie yang dipasang BFF.
 *
 * Backend sendiri tidak pernah memasang cookie — ia mengembalikan tokennya di
 * badan respons, dan BFF yang menerjemahkannya menjadi cookie `httpOnly`
 * (keputusan 31). Nama ini dipakai hanya supaya kedua sisi menyebut hal yang
 * sama dengan nama yang sama.
 */
export const REFRESH_COOKIE_NAME = 'sk_refresh';

/**
 * `aud` dan `iss` token yang kita terbitkan sendiri.
 *
 * Keduanya diperiksa saat verifikasi. Tanpa `aud`, token yang diterbitkan untuk
 * aplikasi lain dengan kunci yang sama akan diterima di sini.
 */
export const ACCESS_TOKEN_AUDIENCE = 'samudrakarsa-api';
export const ACCESS_TOKEN_ISSUER = 'samudrakarsa';

/**
 * Pesan tunggal untuk **setiap** kegagalan masuk.
 *
 * `PRD-REVAMP.md` §7.8.4 menetapkannya secara harfiah: *"Pesan kegagalan selalu
 * sama untuk email tidak terdaftar, password salah, dan akun nonaktif."*
 *
 * Kalimat di bawah karena itu menutupi ketiganya sekaligus, dan **tidak boleh
 * dipecah** menjadi pesan yang lebih informatif. Pesan yang membedakan "email
 * tidak terdaftar" dari "password salah" memberi tahu penyerang alamat surel
 * mana yang terdaftar — dan daftar anggota organisasi adalah daftar yang tidak
 * perlu bisa dipanen dari luar.
 *
 * Pesannya tetap menyebut langkah berikutnya, karena yang paling sering membaca
 * ini adalah anggota yang sah dengan alamat yang salah ketik.
 */
export const LOGIN_FAILED_MESSAGE =
  'Kredensial tidak sah, atau akun ini tidak aktif. Hubungi pemilik organisasi.';

/**
 * Batas percobaan login — `PRD-REVAMP.md` §7.13, *"5 percobaan / 15 menit per
 * IP + per akun"*. Keduanya dipasang, karena keduanya menangkap serangan yang
 * berbeda: penghitung per akun menahan tebakan bertubi pada satu akun, dan
 * penghitung per IP menahan satu sumber yang mencoba banyak akun sekaligus.
 *
 * ## Yang dihitung hanya percobaan yang **gagal**
 *
 * Ini penyimpangan yang disengaja dari kata "percobaan", dan alasannya bukan
 * kenyamanan.
 *
 * Penghitung ini berguna selama tebakannya salah. Begitu tebakannya benar,
 * penghitungnya sudah selesai bekerja — yang perlu ditahan bukan orang yang
 * tahu passwordnya. Menghitung login yang berhasil menciptakan akibat yang
 * tidak diinginkan siapa pun: kampus dan kantor keluar lewat satu alamat IP,
 * dan lima login berhasil dari ruangan yang sama akan mengunci seluruh ruangan
 * itu selama seperempat jam.
 *
 * Perlindungannya identik: penyerang yang tidak tahu passwordnya tidak pernah
 * menghasilkan login berhasil, sehingga setiap tebakannya tetap menambah
 * penghitung. Yang hilang hanyalah kemampuan memakai kredensial sah milik
 * sendiri untuk mengunci orang lain — dan itu memang bukan yang ingin dicapai.
 */
export const LOGIN_LIMIT_PER_ACCOUNT = 5;
export const LOGIN_LIMIT_PER_IP = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * Jeda tenggang sebelum pemakaian ulang refresh token dianggap pencurian.
 *
 * Rotasi membuat token lama langsung dicabut. Tapi klien yang tidak menerima
 * jawabannya — koneksi putus, fungsi serverless kehabisan waktu — akan mencoba
 * lagi dengan token yang **sama**, dan itu terlihat persis seperti penyerang
 * yang memakai token hasil salinan.
 *
 * Dalam jeda ini, percobaan ulang dijawab `401` biasa tanpa mencabut
 * keluarganya. Di luar jeda ini, seluruh keluarga token dicabut: dua pemegang
 * token yang sama berarti salah satunya menyalinnya, dan tidak ada cara
 * mengetahui yang mana.
 */
export const REFRESH_REUSE_LEEWAY_SECONDS = 30;

/**
 * Panjang minimum password baru.
 *
 * 12, bukan 8. Password di sini bukan satu-satunya lapisan — tapi ia satu-satunya
 * yang bergantung pada pilihan manusia, dan 8 karakter yang dipilih manusia
 * biasanya satu kata ditambah satu angka.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Nama aksi untuk `activity_logs`.
 *
 * `action` di tabel itu bertipe `text`, bukan enum — jadi tidak ada migrasi
 * yang dibutuhkan untuk menambah nama baru. Justru karena itu daftarnya
 * dikumpulkan di sini: kolom teks bebas akan berisi `auth.login` di satu tempat
 * dan `login.google` di tempat lain kalau tidak ada yang menyatakannya.
 */
export const AUDIT_ACTIONS = {
  loginGoogle: 'auth.login.google',
  loginPassword: 'auth.login.password',
  loginFailed: 'auth.login.failed',
  /**
   * **Tidak ditulis pada setiap penyegaran yang berhasil.**
   *
   * Penyegaran terjadi setiap 15 menit untuk setiap orang yang sedang membuka
   * sistem. Mencatatnya berarti catatan audit didominasi baris yang isinya
   * "masih ada yang membuka halaman" — dan catatan yang sebagian besar isinya
   * begitu berhenti dibaca orang, tepat ketika ada yang perlu dicari di
   * dalamnya.
   *
   * Yang dicatat adalah `refreshReuse` di bawah: penyegaran yang **gagal**
   * karena tokennya dipakai dua kali. Itu kejadian yang menuntut tindakan, dan
   * ia tidak akan tenggelam karena tetangganya bukan baris rutin.
   */
  refresh: 'auth.refresh',
  refreshReuse: 'auth.refresh.reuse_detected',
  logout: 'auth.logout',
  passwordChanged: 'auth.password.changed',
} as const;
