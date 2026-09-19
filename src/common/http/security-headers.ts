import helmet from 'helmet';

/**
 * Header keamanan untuk seluruh respons (`PRD-REVAMP.md` §7.18).
 *
 * ## Kenapa berkas tersendiri, bukan tiga baris di `main.ts`
 *
 * Karena isinya sebagian besar **alasan**, bukan pemanggilan. Hampir setiap
 * nilai di bawah ini berbeda dari bawaan `helmet`, dan perbedaan yang tidak
 * dijelaskan akan "dirapikan" seseorang suatu hari nanti — dikembalikan ke
 * bawaan, karena bawaan terlihat lebih aman daripada angka yang tidak ada
 * asalnya. Alasannya ditulis di sini supaya perbedaan itu bisa dibantah, bukan
 * hanya diikuti.
 *
 * ## Yang tidak disebut di sini, dan tetap terpasang
 *
 * `helmet` memasang beberapa header yang tidak disebut §7.18 dan tidak perlu
 * diubah: `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy:
 * same-origin`, `Cross-Origin-Resource-Policy: same-origin`,
 * `Origin-Agent-Cluster: ?1`, `X-DNS-Prefetch-Control: off`,
 * `X-Permitted-Cross-Domain-Policies: none`, `X-Download-Options: noopen`,
 * `X-XSS-Protection: 0`, dan penghapusan `X-Powered-By`.
 *
 * `nosniff` sengaja **tidak** ditulis ulang meski §7.18 menyebutnya: nilai
 * bawaannya sudah persis itu, dan menyalinnya ke sini akan menyiratkan bahwa
 * kita yang menentukannya — padahal yang menentukan `helmet`, dan menyebutnya
 * di sini berarti satu tempat lagi yang harus diperbarui saat ia berubah.
 *
 * ## Yang dijelaskan satu per satu di bawah, karena berbeda dari bawaan
 *
 * `Strict-Transport-Security`, `X-Frame-Options`, `Content-Security-Policy`,
 * dan `Referrer-Policy`. Ketiga yang terakhir berbeda dari bawaan `helmet`;
 * yang pertama berbeda di angkanya.
 */
export function securityHeaders(nodeEnv: string) {
  /**
   * HSTS hanya dikirim di produksi.
   *
   * ## Kenapa ini satu-satunya header yang dibuat bersyarat
   *
   * `max-age=31536000` adalah janji yang dipegang **browser**, bukan server:
   * setelah menerimanya, browser menolak berbicara HTTP biasa dengan host itu
   * selama setahun, dan server tidak punya cara menariknya kembali. Untuk
   * `localhost` — yang diakses lewat HTTP dan tidak punya sertifikat — janji
   * itu membuat pengembangnya terkunci dari API-nya sendiri, dan membukanya
   * kembali menuntut orang membersihkan daftar HSTS di browsernya, sebuah
   * langkah yang tidak diketahui sebagian besar orang.
   *
   * Aman dikaitkan ke `NODE_ENV` karena Vercel menetapkannya `production`
   * sendiri pada setiap deployment produksi — jadi tidak ada keadaan di mana
   * header ini hilang di produksi hanya karena seseorang lupa menyalin
   * variabel.
   *
   * Kalau suatu saat proyek ini di-deploy ke tempat yang **tidak**
   * menetapkan `NODE_ENV`, cabang ini yang harus diperiksa lebih dulu: ia akan
   * diam-diam mematikan HSTS, dan itu kegagalan yang tidak bersuara.
   *
   * `preload` sengaja tetap `false`. Preload berarti hostname-nya didaftarkan
   * ke daftar bawaan browser — dan pendaftaran itu jauh lebih lambat dicabut
   * daripada HSTS biasa. Ia keputusan tersendiri, bukan bawaan yang ikut
   * terbawa.
   */
  const strictTransportSecurity =
    nodeEnv === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false;

  return helmet({
    strictTransportSecurity,

    /**
     * `DENY`, bukan bawaan `SAMEORIGIN`.
     *
     * Bawaan `helmet` mengizinkan halaman dari origin yang sama membingkai
     * respons ini. Untuk API yang tidak punya halaman sama sekali, izin itu
     * tidak memberi manfaat apa pun — sementara `DENY` menutup satu kelas
     * serangan yang seluruhnya bergantung pada kemampuan membingkai.
     *
     * `frame-ancestors 'none'` di CSP di bawah menyatakan hal yang sama, dan
     * bagi browser modern ia yang berlaku. Keduanya dipasang karena §7.18
     * meminta `X-Frame-Options`, dan karena pembaca lama masih mengenainya.
     */
    frameguard: { action: 'deny' },

    /**
     * `strict-origin-when-cross-origin`, bukan bawaan `no-referrer`.
     *
     * Nilai ini mengirim origin penuh untuk navigasi sesama-origin, dan hanya
     * origin saja untuk lintas-origin — tidak pernah path, tidak pernah query.
     * Untuk API, path dan query justru bagian yang berbahaya: di sistem lain
     * keduanya kerap memuat id dokumen, dan di sistem ini pun §7.18 menuntut
     * "tidak ada data sensitif di URL" justru supaya kebocoran lewat `Referer`
     * tidak berakibat apa-apa.
     */
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    /**
     * ## CSP untuk API yang tidak pernah menyajikan HTML
     *
     * `default-src 'none'` adalah kebijakan paling ketat yang masih bermakna:
     * tidak ada apa pun yang boleh dimuat. Ia bisa seketat itu justru karena
     * API ini hanya mengembalikan JSON — tidak ada dokumen, tidak ada skrip,
     * tidak ada gaya. Browser yang membuka endpoint ini menampilkan teks JSON
     * apa adanya, dan CSP tidak menghalangi hal itu.
     *
     * ## Kenapa `useDefaults: false`
     *
     * Bawaan `helmet` memuat `style-src 'self' 'unsafe-inline'` dan
     * `script-src 'self'`. Membiarkannya berarti mengirim `unsafe-inline` di
     * header yang §7.18 minta **tanpa** `unsafe-inline` — dan itu bukan
     * perbedaan kecil: `unsafe-inline` adalah bagian yang membuat CSP berhenti
     * menahan serangan injeksi. Karena itu bawaannya dimatikan seluruhnya, dan
     * yang tersisa hanyalah empat direktif di bawah.
     *
     * `form-action 'none'` dan `base-uri 'none'` tidak menutup apa pun yang
     * belum ditutup `default-src 'none'` pada API ini. Keduanya tetap ditulis
     * karena keduanya **tidak selalu** mengikuti `default-src`: sebagian
     * browser memakai nilai bawaannya sendiri untuk kedua direktif itu, dan
     * menuliskannya eksplisit menghapus ketergantungan pada perbedaan itu.
     *
     * ## Yang harus diubah saat Swagger dihidupkan
     *
     * `PRD-BACKEND.md` §11 merencanakan dokumentasi di `/api/v1/docs`. Halaman
     * itu **HTML yang menjalankan skrip dan memuat gaya**, sehingga
     * `default-src 'none'` akan membuatnya tampil kosong — tanpa error yang
     * menyebut CSP sebagai sebabnya.
     *
     * Yang benar saat itu bukan melonggarkan kebijakan ini untuk seluruh API,
     * melainkan memasang CSP tersendiri pada rute itu saja. Melonggarkan di
     * sini berarti seluruh 48 operasi ikut kehilangan kebijakan yang ketat demi
     * satu halaman yang tidak mengembalikan data.
     */
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
  });
}
