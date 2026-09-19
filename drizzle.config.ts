import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

if (!url) {
  // drizzle-kit membaca `.env` sendiri, jadi pesan ini muncul persis saat
  // berkasnya belum disalin — bukan nanti saat migrasi dijalankan.
  throw new Error(
    'DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu isi nilainya.',
  );
}

/**
 * Konfigurasi drizzle-kit.
 *
 * `out` menunjuk ke `src/database/migrations/` — migrasi disimpan **di dalam
 * repo**, bukan dihasilkan ulang saat deploy. Sesuai §8.4: bernomor, naik saja,
 * dan tidak pernah diubah setelah dijalankan.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/*.ts',
  out: './src/database/migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
