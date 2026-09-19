import { Logger, VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Instans aplikasi disimpan di lingkup modul supaya invocation berikutnya
 * memakai ulang container DI yang sudah dibangun.
 *
 * Ini yang menekan cold start di serverless (§7.19.2). Tanpa cache ini,
 * setiap request membangun ulang seluruh container — dan itulah biaya
 * terbesar bentuk serverless untuk NestJS.
 *
 * Yang disimpan adalah **promise-nya**, bukan hasilnya. Bedanya terasa saat
 * dua request datang bersamaan ke instans yang baru menyala: kalau yang
 * disimpan hasil, keduanya sama-sama melihat cache kosong dan membangun dua
 * container. Dengan promise, yang kedua menunggu yang pertama.
 */
let cached: Promise<INestApplication> | undefined;

/**
 * Memasang seluruh konfigurasi yang berlaku sama di semua lingkungan.
 *
 * Dipisahkan dari `createApp()` supaya test e2e memakai konfigurasi yang
 * **persis sama** — bukan salinannya. Kalau seseorang mengubah prefix di sini
 * dan lupa mengubahnya di test, test-nya akan tetap lulus sambil menguji hal
 * yang berbeda.
 */
export function configureApp(app: INestApplication): void {
  // Prefix-nya 'api', BUKAN 'api/v1'.
  //
  // Versioning URI menambahkan segmen versinya sendiri, jadi 'api/v1' di sini
  // akan menghasilkan /api/v1/v1/... Versi default '1' membuat rutenya menjadi
  // /api/v1/... — sesuai §7.2.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Menolak seluruh origin browser.
  //
  // Browser tidak pernah memanggil API ini langsung — yang memanggil adalah BFF
  // di Next.js, server-to-server, dan permintaan itu tidak tunduk pada CORS.
  // Karena itu tidak ada satu pun origin yang perlu diizinkan (PRD-SISTEM §5).
  // Kalau suatu saat ada origin yang ditambahkan di sini, tanyakan dulu
  // mengapa — jawabannya biasanya "ada yang memanggil API langsung dari browser",
  // dan itu memang yang ingin dicegah.
  app.enableCors({ origin: false });

  // Diperlukan supaya OnApplicationShutdown berjalan saat proses dihentikan.
  app.enableShutdownHooks();
}

async function buildApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // Memicu PolicyBootCheck. Kalau ada rute yang lupa dijaga, baris ini yang
  // melempar — dan aplikasi tidak pernah menyala.
  await app.init();

  return app;
}

export function createApp(): Promise<INestApplication> {
  cached ??= buildApp().catch((error: unknown) => {
    // Kegagalan tidak disimpan. Kalau ia disimpan, satu gangguan sesaat saat
    // menyala akan membuat instans ini menolak selamanya — dan di serverless
    // instans itu justru yang akan terus dipakai sampai platform mendaur
    // ulangnya.
    cached = undefined;
    throw error;
  });

  return cached;
}

/**
 * Menyala sebagai server biasa hanya kalau berkas ini dieksekusi langsung.
 *
 * Saat diimpor entri Vercel (`api/index.js`), `require.main` bukan modul ini,
 * jadi pendengaran port tidak pernah terjadi — yang dipakai adalah instans
 * dari `createApp()`.
 */
if (require.main === module) {
  void createApp()
    .then(async (app) => {
      const port = process.env.PORT ?? 3000;
      await app.listen(port);
      new Logger('Bootstrap').log(
        `Berjalan di http://localhost:${port}/api/v1`,
      );
    })
    .catch((error: unknown) => {
      // Gagal saat boot adalah kegagalan yang harus terlihat. Tanpa ini,
      // prosesnya berhenti tanpa jejak yang bisa dibaca.
      new Logger('Bootstrap').error('Gagal menyala', error as Error);
      process.exitCode = 1;
    });
}
