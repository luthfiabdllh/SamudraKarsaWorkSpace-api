import type { NextFunction, Request, Response } from 'express';
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
   */
  const strictTransportSecurity =
    nodeEnv === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false;

  /**
   * Helmet standar untuk seluruh 48 endpoint API:
   * Menggunakan `default-src 'none'` yang sangat ketat karena API hanya
   * menyajikan data JSON, bukan HTML/CSS/JS.
   */
  const apiHelmet = helmet({
    strictTransportSecurity,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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

  /**
   * Helmet khusus untuk Swagger UI (`/api/v1/docs`):
   * Swagger UI adalah aplikasi web SPA statis yang membutuhkan pemuatan skrip,
   * stylesheet CSS, inline styling, favicon, dan SVG.
   *
   * Sesuai catatan PRD-BACKEND.md §11, CSP dilonggarkan HANYA untuk rute dokumentasi
   * ini tanpa mengorbankan keamanan 48 endpoint API lainnya.
   */
  const docsHelmet = helmet({
    strictTransportSecurity,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'", 'data:'],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('/docs')) {
      return docsHelmet(req, res, next);
    }
    return apiHelmet(req, res, next);
  };
}

