/**
 * Berjalan **sebelum** modul test diimpor — dan itu satu-satunya alasan berkas
 * ini ada.
 *
 * `ConfigModule.forRoot()` menyalin `process.env` pada saat modulnya diimpor,
 * bukan saat container DI dibangun. Jadi mengisi environment di `beforeAll`
 * sudah terlambat: salinannya sudah terlanjur dibuat tanpa nilai-nilai ini.
 *
 * Karena `process.env` menang atas isi `.env`, nilai di bawah juga menetralkan
 * `.env` milik pengembang — test tidak akan pernah menyentuh database sungguhan.
 */
process.env.NODE_ENV = 'test';

// Port yang tidak ada isinya, dan itu disengaja: kegagalan koneksinya terjadi
// seketika (ECONNREFUSED) alih-alih setelah menunggu timeout 5 detik.
process.env.DATABASE_URL = 'postgresql://uji:uji@127.0.0.1:59999/uji';

process.env.API_PUBLIC_URL = 'http://localhost:3000';

// ── Auth ────────────────────────────────────────────────────────────────────
//
// Keduanya wajib sejak `JWT_SECRET` dan `GOOGLE_CLIENT_ID` masuk `envSchema`:
// skema itu menolak boot kalau salah satunya kosong, dan test e2e membangun
// aplikasi yang sesungguhnya — jadi kekurangan di sini muncul sebagai aplikasi
// yang gagal menyala, bukan sebagai satu test yang gagal.
//
// Nilainya **tetap** dan boleh terlihat: keduanya hanya dipakai di dalam proses
// test yang tidak menyentuh database mana pun. Yang tidak boleh ada di berkas
// ini adalah nilai dari `.env` sungguhan — menyalinnya ke sini akan membuat
// rahasia produksi ikut ter-commit, dan itu satu-satunya akibat yang berbahaya.

// 48 karakter acak, panjangnya sama dengan yang dihasilkan perintah di
// `.env.example`. Bukan nilai yang dipakai di mana pun selain di sini.
process.env.JWT_SECRET =
  'test-only-jwt-secret-yang-tidak-dipakai-di-luar-test-uji-1234567890';

// Berakhiran `.apps.googleusercontent.com` karena `envSchema` memeriksanya —
// kekeliruan yang paling mudah terjadi adalah menyalin client *secret* ke
// variabel client *id*, dan bentuk keduanya tidak mirip sama sekali.
process.env.GOOGLE_CLIENT_ID = '000000000000-uji.apps.googleusercontent.com';

export {};
