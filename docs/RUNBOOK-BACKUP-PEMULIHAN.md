# Runbook: Backup & Pemulihan (Disaster Recovery)

Sistem ini didesain dengan asumsi bahwa segala yang bisa hancur, suatu saat akan hancur (Keputusan 33). Prosedur di bawah adalah garis pertahanan terakhir.

## 1. Arsitektur Cadangan (Backup)
- **Eksekutor:** GitHub Actions (`.github/workflows/backup.yml`).
- **Jadwal:** Berjalan setiap tengah malam secara kron (harian).
- **Format:** `pg_dump` dengan format *plain-text* SQL, lalu dikompresi gzip.
- **Tujuan Akhir:** *Bucket* Cloudflare R2 bernama `sksks-backup`.
- **Retensi:** R2 dikonfigurasi untuk menghapus otomatis *object* yang lebih tua dari 30 hari.

> [!CAUTION]
> **Akses R2 Terbatas!** Rahasia akses `AWS_ACCESS_KEY_ID` dan `AWS_SECRET_ACCESS_KEY` untuk akun R2 HANYA disimpan di GitHub Actions *Secrets*. Jika Anda kehilangan akses ke repositori ini, Anda juga kehilangan jalur *backup*. 

## 2. Prosedur Pemulihan (Restorasi) Database
Jika *database* produksi Neon mengalami korupsi atau terhapus, ikuti langkah ini. Kondisi ini menuntut tindakan segera.

### Prasyarat
1. Mesin lokal Anda harus sudah terpasang Node.js, `pnpm`, AWS CLI, dan Docker.
2. Anda membutuhkan kredensial R2 (Minta kepada Pemilik Proyek/Kormasit jika Anda belum memilikinya di *local*).
3. Buat _database_ kosong baru di Neon (jangan menimpa _database_ yang sedang bermasalah).

### Langkah Pemulihan Darurat
1. Masuk ke terminal di _root_ proyek API.
2. Konfigurasi `AWS CLI` lokal Anda menggunakan token R2.
3. Jalankan skrip utuh kita:
   ```bash
   ./scripts/verify-backup.sh
   ```
   *Catatan:* Walaupun skrip ini bernama `verify-backup`, Anda bisa mengikutinya sebagai panduan manual untuk me-*restore* (skrip tersebut akan menarik `.sql.gz` dari R2 dan mengekstraknya ke PostgreSQL lokal).
4. Ambil _file_ `latest-backup.sql` yang berhasil diekstrak skrip tersebut.
5. Jalankan impor ke database Neon yang baru:
   ```bash
   psql "postgres://user:password@ep-neon-host.neon.tech/dbname" < latest-backup.sql
   ```
6. Ganti _environment variable_ `DATABASE_URL` di Vercel agar menunjuk ke database yang baru pulih tersebut.

> [!WARNING]
> Setelah _restore_ dilakukan, sesi *login* pengguna dan sisa jatah *rate limit* mungkin merujuk ke data kemarin. Beberapa token mungkin tidak sah. Pengguna yang membuat akun di hari terjadinya insiden (sebelum *backup* berjalan) harus mengulang pendaftaran.

## 3. Pengecekan Rutin (Latihan Kesiagaan)
Jangan menunggu bencana datang. Uji *runbook* ini minimal satu kali per semester:
- Unduh salah satu _backup_ dari R2.
- Angkat PostgreSQL menggunakan Docker.
- *Restore* datanya dan jalankan aplikasi lokal menggunakan data tersebut.
- Pastikan semua tabel ada dan Drizzle dapat berinteraksi (Login, buat tabel, dll).
