'use strict';

/**
 * Entri Vercel.
 *
 * Berkas ini **CommonJS dan JavaScript biasa, bukan TypeScript** — disengaja.
 * Vercel mengompilasi berkas di `api/` dengan rantai build-nya sendiri, dan
 * rantai itu belum tentu menghormati `emitDecoratorMetadata` yang wajib bagi
 * NestJS. Kalau sumber TypeScript ditaruh di sini, dekorator bisa berubah
 * menjadi kode yang tidak bisa membaca tipe parameternya — dan kegagalannya
 * berupa DI yang tidak menemukan apa pun, jauh dari pesan yang jelas.
 *
 * Karena itu berkas ini **mengimpor hasil `npm run build`** (`dist/`), yang
 * dikompilasi oleh `nest build` dengan konfigurasi yang benar.
 *
 * Seluruh permintaan diarahkan ke sini lewat `rewrites` di `vercel.json`,
 * sehingga prefix `/api/v1` tetap utuh saat sampai ke Nest.
 */

const { createApp } = require('../dist/main');

module.exports = async (req, res) => {
  const app = await createApp();

  // Instans Express di dalam Nest sudah berupa request handler. Tidak ada
  // `listen()` di sini — Vercel yang memegang soketnya, bukan kita.
  return app.getHttpAdapter().getInstance()(req, res);
};
