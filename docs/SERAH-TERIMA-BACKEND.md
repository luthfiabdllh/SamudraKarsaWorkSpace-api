# Dokumentasi Serah Terima Backend (Handover)

Repositori ini (`SamudraKarsaWorkSpace-api`) adalah penyedia data tunggal untuk ekosistem aplikasi Samudra Karsa. Dokumen ini bertujuan menjembatani pemahaman antarangkatan _developer_ agar perputaran panitia tidak mengganggu keberlanjutan infrastruktur perangkat lunak.

## 1. Peta Topografi Proyek
Aplikasi kita menggunakan _framework_ **NestJS** yang diikat kuat oleh TypeScript. Semua logika diletakkan di dalam folder `src/`.

- `src/database/schema/`: Representasi Drizzle ORM terhadap tabel-tabel di Postgres. Jika ada tabel baru, pastikan didaftarkan di sini.
- `src/common/`: Tempat bernaung utilitas yang tidak terikat domain spesifik (misalnya `PolicyGuard`, `LoggingInterceptor`, Zod validator).
- `src/[domain]/`: Modul fungsional spesifik (misal: `auth`, `profiles`, `settings`). Masing-masing berisi `[domain].controller.ts` (penjaga pintu masuk HTTP) dan `[domain].service.ts` (eksekutor logika).

## 2. Sistem Keamanan & Otorisasi
### Authenticated Routes
Hampir seluruh rute di aplikasi ini **TERTUTUP** secara bawaan. Anda **tidak perlu** mengingat untuk mengunci rute. Rute hanya bisa ditembus jika:
1. Anda memasang `@Public()` (untuk rute publik penuh).
2. Anda memasang `@Policy('namapolicy')` (untuk memverifikasi peran melalui `matrix.ts`).

Apabila Anda melupakan salah satu dekorator ini, **aplikasi akan menolak untuk menyala (Fatal Boot Error)** karena `PolicyBootCheck` akan memutus inisialisasi aplikasi. Sistem *gagal berisik* demi keamanan.

### OAuth
Kita **tidak** menggunakan aliran OAuth penuh dengan pertukaran _Authorization Code_ di backend. Backend secara mentah memverifikasi validitas _Google ID Token (JWT)_ menggunakan kunci publik Google (JWKS). Oleh karena itu, kita **bebas dari masalah CSRF Callback**.

## 3. Alur Kerja Pengembang Baru (Developer Onboarding)
Untuk mulai meng- *coding* di mesin lokal Anda:

1. **Instalasi:**
   ```bash
   pnpm install
   ```
2. **Lingkungan (Environment Variables):**
   Salin `.env.example` ke `.env.local` dan isi dengan konfigurasi Postgres Anda (contohnya di server *Neon* cabang dev/lokal).
3. **Database Sinkronisasi (Drizzle):**
   Tarik skema terbaru ke database lokal Anda dengan perintah:
   ```bash
   npm run db:push
   ```
   *Catatan:* Bacalah `CARA-MENJALANKAN-MIGRASI.md` untuk membedakan antara `db:push` (lokal/prototipe) dan `db:migrate` (produksi).
4. **Menjalankan Server:**
   ```bash
   npm run start:dev
   ```
   *Hot-reloading* akan aktif. Perhatikan terminal Anda—setiap masalah pengetikan (*Typescript Error*) akan langsung ditangkap.

## 4. Alur Peluncuran (Deployments)
Proses penempatan (deploy) dikendalikan penuh oleh **Vercel**.
- **Staging/Preview:** Setiap *Pull Request* (PR) yang Anda buat di GitHub secara otomatis akan memicu Vercel untuk membuatkan satu URL *Preview*. Anda dapat mencoba fitur tersebut sebelum disatukan (_merge_) ke cabang utama.
- **Production:** Menggabungkan kodingan ke cabang `main` akan langsung diserap dan diluncurkan oleh Vercel secara otomatis ke URL utama (Production). Pastikan _migration_ telah dieksekusi **sebelum** kodingan utama _merge_ ke main jika terdapat perubahan kolom database.

---
*Semoga berlayar dengan aman! Samudra Karsa mengandalkan kontribusi kode Anda.*
