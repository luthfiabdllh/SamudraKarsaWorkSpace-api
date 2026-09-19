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

export {};
