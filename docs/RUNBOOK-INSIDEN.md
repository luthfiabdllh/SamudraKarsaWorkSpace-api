# Runbook: Penanganan Insiden

Dokumen ini adalah *playbook* pertolongan pertama ketika antarmuka pengguna Samudra Karsa menampilkan indikator _down_ atau gagal beroperasi. 

> [!NOTE]
> Ingat Keputusan 17 (Penanganan Error): Aplikasi ini tidak dirancang untuk menelan masalah secara diam-diam. Jika ada masalah yang fatal, sistem sengaja dimatikan (*fail loud*) agar masalah tersebut dapat langsung ditelusuri alih-alih merusak integritas data.

## 1. Menghadapi Error 500 (Internal Server Error)
Jika pengguna melaporkan muncul layar "Terjadi kesalahan pada server", itu berarti penanganan error level *framework* (`AllExceptionsFilter`) menangkap anomali sistem yang tak terduga.

### Tindakan:
1. **Dapatkan Request ID**: Minta pengguna menekan tombol "Detail/Salin" di layar error untuk memberi Anda `Request ID` (contoh: `req_aB3dE...`).
2. **Cari di Log Vercel**: 
   - Buka Dasbor Vercel -> Proyek SamudraKarsa-API -> Tab *Logs*.
   - Filter menggunakan teks `Request ID` tersebut. 
   - **Ingat**: Vercel Hobby hanya menyimpan log selama **1 jam**. Anda berpacu dengan waktu.
3. **Analisa**: Lihat *Stack Trace*. Jika asalnya dari fungsi database, tinjau perubahannya di GitHub. Jika dari *AuthVerifier*, Google mungkin memutar kuncinya (*JWKS*) atau layanannya sedang _down_.

## 2. Isu Koneksi & Database Terkunci (Max Connections)
Lingkungan Serverless (Vercel) sering kali menciptakan ratusan *instance* (lambda) dalam sekedip mata saat lalu lintas tinggi. Jika mereka semua membuka koneksi ke Neon Postgres dan tidak menutupnya seketika, _pool_ database akan kering.

### Gejala:
- Log Vercel dipenuhi error: `remaining connection slots are reserved for non-replication superuser connections`.
- Latensi meroket tak wajar.

### Tindakan Darurat:
1. Masuk ke Dasbor Neon.
2. Periksa metrik *Active Connections*.
3. **Reset Bouncer**: Matikan sementara *pooler* di Neon atau mulai ulang instans database.
4. **Mitigasi**: Pastikan Vercel API terkonfigurasi ke port dan URL yang ditujukan untuk *Connection Pooling* (misalnya: `postgres://...-pooler.neon.tech`), bukan ke _direct connection_. 

## 3. Tingginya Pinalti Cold Start
Jika _endpoint_ butuh lebih dari 3 detik untuk merespons pertama kalinya setelah aplikasi diistirahatkan (di luar Vercel *Free Tier sleep*).

### Tindakan:
- Jalankan simulasi lokal `./scripts/test-cold-start.sh` ke *production URL* untuk memastikan bukan masalah internet pengguna.
- Periksa ukuran paket. Jika NestJS terlalu *gemuk* saat di-*bundle* (misal: *dependencies* besar tidak dimasukkan ke `devDependencies`), _cold start_ akan memburuk. Optimalkan *tree shaking* atau potong modul tak terpakai.

## 4. Rate Limit Abuse (429 Beruntun)
Jika API dihajar oleh permintaan berlebih dari IP jahat.

### Tindakan:
1. Karena `RateLimitGuard` bersifat otomatis (100 / menit untuk *write*, 300 / menit untuk *read*), aplikasi tidak akan jatuh. Pengguna jahat tersebut akan diblokir dengan *status code* `429 Too Many Requests`.
2. Jika mereka menyebabkan _bandwidth exhaustion_ (menghabiskan batas transfer gratis Vercel), manfaatkan dasbor *Firewall/Security* Vercel (atau Edge Network) untuk memblokir rentang *IP Address* penyerang secara fundamental sebelum paketnya mencapai aplikasi NestJS kita.
