# SamudraKarsaWorkSpace — API

Backend untuk sistem manajemen organisasi Samudra Karsa. NestJS 11 di atas
Vercel, Postgres Supabase lewat Drizzle.

Dokumen rujukan ada di repo induk: `PRD-SISTEM.md`, `PRD-BACKEND.md`,
`PRD-FRONTEND.md`, `PRD-REVAMP.md`. Nomor § yang disebut di komentar kode
merujuk ke sana — bukan hiasan, itu tempat alasan keputusannya ditulis.

---

## Menjalankan

```bash
npm install                                   # dependensi dasar

npm install @nestjs/config drizzle-orm pg zod # runtime
npm install -D drizzle-kit @types/pg          # alat

cp .env.example .env                          # lalu isi DATABASE_URL
npm run start:dev
```

Lalu:

```bash
curl -i localhost:3000/api/v1/health        # 200 — tidak menyentuh database
curl -i localhost:3000/api/v1/health/ready  # 200 siap · 503 database belum terjangkau
```

> **Catatan tentang dua `npm install` di atas.** `package.json` sengaja tidak
> memuat keempat paket itu dengan versi yang ditulis tangan — versinya belum
> diverifikasi terhadap registry. Setelah perintah di atas dijalankan sekali,
> versinya terkunci di `package-lock.json` dan langkah itu tidak perlu diulang.

### Perintah lain

| Perintah | Kegunaan |
|---|---|
| `npm run build` | Kompilasi ke `dist/` — ini yang dipakai Vercel |
| `npm run lint` | ESLint dengan pemeriksaan tipe |
| `npm run test:e2e` | Test fondasi: kesehatan, guard, boot check |
| `npm run db:generate` | Hasilkan migrasi SQL dari `src/database/schema/` |
| `npm run db:migrate` | Jalankan migrasi yang belum dijalankan |
| `npm run db:studio` | Lihat isi database |

Migrasi **naik saja dan tidak pernah diubah** setelah dijalankan (§8.4).

---

## Bentuk struktur

```
src/
├─ main.ts              createApp() di-cache · configureApp() dipakai bersama test
├─ app.module.ts        graf modul + empat provider APP_*
├─ config/              environment divalidasi Zod saat menyala
├─ common/              konstanta · dekorator · middleware · pipe · filter · interceptor
├─ policy/              matriks izin · guard · boot check
├─ auth/                AuthVerifier (masih menolak semua — lihat di bawah)
├─ database/            Drizzle + pg · migrations/ · schema/
└─ health/              liveness · readiness
api/index.js            entri Vercel — CommonJS, mengimpor dist/
```

Arah ketergantungannya satu arah: `common/` tidak mengimpor apa pun dari
`policy/`, `auth/`, atau modul domain. Yang lintas-potong tidak boleh tahu
tentang yang spesifik.

---

## Tiga hal yang perlu diketahui sebelum menyentuh kode ini

### 1. Rute yang lupa dijaga membuat aplikasi gagal menyala

Empat bagian bekerja bersama (§7.1):

| Bagian | Berkas |
|---|---|
| Guard berlaku global lewat `APP_GUARD` | `app.module.ts` |
| `@Public()` untuk rute yang memang boleh terbuka | `common/decorators/public.decorator.ts` |
| `@Policy(name)` untuk sisanya | `common/decorators/policy.decorator.ts` |
| **Pemeriksaan saat boot yang melempar** | `policy/policy.boot-check.ts` |

Tiga yang pertama bisa terlupa. Yang keempat tidak — dan itulah gunanya.
Menambahkan rute tanpa `@Policy()` menghasilkan proses yang **gagal start**
dengan menyebut metode dan pathnya, bukan rute terbuka yang tidak ada yang
sadar. Ini diuji di `test/app.e2e-spec.ts`.

Konsekuensinya: **daftar `@Public()` harus tetap pendek.** Yang berbahaya
bukan `@Policy` yang lupa dipasang — itu berisik. Yang berbahaya adalah
`@Public()` yang salah pasang: rute terbuka tanpa peringatan apa pun.
Saat ini ada dua, keduanya di `health/`.

### 2. Izin adalah data, bukan percabangan

`policy/matrix.ts` memuat matriks peran (`owner`, `co_owner`, `kadiv`,
`member`) sebagai objek biasa, supaya bisa dibandingkan baris demi baris
dengan tabel di `PRD-REVAMP.md` §7.9. Mengecek kebenaran matriks berarti
membaca satu layar, bukan menelusuri `if`.

Dua jenis policy dipisah dengan sengaja:

- **Berbasis peran** — bisa diputuskan dari peran saja. Ada di `ROLE_POLICY_MATRIX`.
- **Berbasis resource** — butuh melihat barisnya dulu (siapa pembuatnya, divisi
  mana). Ada di `RESOURCE_POLICY_NAMES`, dan **implementasinya belum ada**.
  Guard menolak policy jenis ini sampai fungsi di paket `@samudrakarsa/shared`
  tersedia. Menolak adalah default yang benar: kalau belum bisa memutuskan,
  jawabannya bukan "boleh".

Penolakan mengikuti §7.3 — **404** untuk policy resource-scoped (403
membocorkan bahwa resource-nya ada), **403** untuk penolakan peran murni
(tidak ada yang dibocorkan; endpoint-nya memang sudah diketahui).

### 3. Auth masih menolak semuanya — dan itu disengaja

`auth/rejecting-auth-verifier.ts` menolak setiap permintaan. Ini **fail-closed**:
selama verifikasi token belum ada, tidak ada satu pun rute yang bisa dipakai.

Backend yang tampak berjalan padahal terbuka lebih berbahaya daripada backend
yang jelas-jelas menolak. Kalau Anda mencoba memakai API ini sekarang dan
semuanya menjawab 401, itu memang perilaku yang diharapkan — bukan bug.

Implementasi sesungguhnya (Google OAuth, argon2id, JWT) menyusul setelah
kredensial Google Cloud tersedia. Yang perlu diganti hanya satu provider:
`AUTH_VERIFIER` di `auth/auth.module.ts`.

---

## Bentuk serverless

Vercel menjalankan fungsi, bukan proses yang hidup terus. Dua konsekuensinya
sudah ditangani di sini:

- **Cold start.** `createApp()` menyimpan promise instans di lingkup modul,
  jadi invocation berikutnya memakai ulang container DI yang sudah dibangun
  (§7.19.2). Yang disimpan promise-nya, bukan hasilnya — supaya dua request
  bersamaan tidak membangun dua container. Kegagalan tidak disimpan, supaya
  gangguan sesaat tidak membuat instans menolak selamanya.
- **Koneksi database.** `max: 1` per instans, dan pooler Supabase yang
  menggabungkannya. Query Drizzle memakai parameter biasa, bukan prepared
  statement bernama — `.prepare()` **tidak aman** di mode transaksi pooler.

Browser tidak pernah memanggil API ini langsung; yang memanggil adalah BFF di
Next.js secara server-to-server. Karena itu CORS menolak semua origin
(`main.ts`). Kalau suatu saat ada origin yang perlu ditambahkan, tanyakan dulu
mengapa — jawabannya biasanya "ada yang memanggil API langsung dari browser",
dan itu memang yang ingin dicegah.

---

## Yang belum ada

Sengaja, dengan tempatnya sudah disiapkan:

| Hal | Kapan |
|---|---|
| Google OAuth · argon2id · JWT · refresh token | Perlu kredensial Google Cloud |
| Skema tabel & migrasi pertama | Fase 1 lanjutan |
| Implementasi policy resource-scoped | Setelah paket `@samudrakarsa/shared` ada |
| Rate limit login · Swagger · idempotency · R2 presigned URL | Pass berikutnya |
| 23 modul domain | Fase 3 dan seterusnya |

### Satu hal yang belum teruji

`api/index.js` dan `vercel.json` belum pernah dipakai deploy sungguhan. NestJS
butuh `emitDecoratorMetadata`, dan rantai build Vercel belum tentu
menghasilkannya — karena itu entri Vercel mengimpor hasil `npm run build`
(`dist/`), bukan TypeScript mentah. **Ini wajib diverifikasi saat deploy
pertama.** Kalau DI gagal menemukan provider tanpa pesan yang jelas, tersangka
pertamanya ada di sini.
