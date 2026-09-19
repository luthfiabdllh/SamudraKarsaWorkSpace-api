# Cara menjalankan migrasi

Runbook untuk mengubah skema database. Ditulis untuk dijalankan orang, bukan
untuk dibaca sekali.

---

## Di mana apa berada

| Lokasi | Isi | Boleh diubah? |
|---|---|---|
| `src/database/schema/*.ts` | Definisi tabel dalam TypeScript — **sumber kebenaran skema** | Ya, selalu di sini |
| `src/database/migrations/NNNN_*.sql` | Migrasi bernomor, hasil `drizzle-kit generate` | **Tidak**, setelah dijalankan |
| `src/database/migrations/meta/` | Snapshot & jurnal yang dipakai drizzle-kit menghitung diff | Jangan disentuh |
| `src/database/sql/*.sql` | SQL yang tidak bisa dihasilkan drizzle (trigger, fungsi) | Ya, lalu salin ke migrasi baru |

Aturan yang mengikat semuanya: **naik saja, tidak pernah diubah setelah
dijalankan** (§8.4). Migrasi yang sudah jalan di satu database dan diubah isinya
akan menghasilkan dua database yang berbeda skema meski jurnalnya sama.

---

## Alur biasa — menambah atau mengubah tabel

```bash
# 1. Ubah definisinya di src/database/schema/*.ts

# 2. Lihat SQL apa yang akan dihasilkan, tanpa menyentuh database.
#    drizzle.config.ts melempar kalau DATABASE_URL kosong, padahal `generate`
#    tidak pernah menyambung ke database — karena itu URL placeholder.
DATABASE_URL='postgres://placeholder:placeholder@localhost:5432/placeholder' \
  npx drizzle-kit generate --name=nama_yang_menjelaskan_perubahannya

# 3. BACA berkas yang dihasilkan. Jangan langsung dijalankan.
#    Yang perlu dicurigai: DROP, ALTER COLUMN TYPE, dan tabel yang tiba-tiba
#    dianggap baru karena namanya berubah.

# 4. Jalankan ke database. drizzle-kit membaca .env sendiri.
npm run db:migrate
```

`generate` membandingkan skema dengan snapshot terakhir, bukan dengan database.
Karena itu ia bisa dijalankan berkali-kali tanpa efek samping: kalau tidak ada
perubahan, ia mengatakan `No schema changes` dan tidak membuat berkas apa pun.

> **`--name` bukan hiasan.** Ia menjadi nama berkas yang akan dibaca orang saat
> mencari "migrasi mana yang menambahkan kolom ini". `--name=update` tidak
> membantu siapa pun.

---

## Migrasi yang tidak bisa dihasilkan drizzle

`drizzle-kit generate` hanya tahu membuat DDL dari objek tabel. Trigger, fungsi,
dan `REVOKE` tidak termasuk — ia tidak melacaknya, sehingga tidak akan
mempertahankannya di generate berikutnya.

```bash
# 1. Buat berkas kosong di rantai migrasi, di posisi yang benar
DATABASE_URL='postgres://placeholder:placeholder@localhost:5432/placeholder' \
  npx drizzle-kit generate --custom --name=nama_migrasinya

# 2. Salin isi berkas di src/database/sql/ ke berkas baru itu
#    (bukan sebaliknya — lihat "Arah salin" di bawah)

# 3. Jalankan
npm run db:migrate
```

### Arah salin

`src/database/sql/` adalah **sumber kebenaran** untuk SQL yang ditulis tangan;
migrasi bernomor adalah salinannya yang beku. Jadi:

```
src/database/sql/foo.sql   ──salin──▶   migrations/NNNN_foo.sql
      (boleh diubah)                       (beku setelah dijalankan)
```

Kalau perlu mengubah sesuatu, ubah di `sql/` lebih dulu, lalu buat migrasi
**baru** dengan `--custom` — jangan menyunting migrasi lama.

### `--> statement-breakpoint`

drizzle-kit memecah berkas migrasi pada penanda ini dan menjalankan tiap
potongan sebagai perintah terpisah. Letakkan **hanya di antara pernyataan
tingkat atas**.

**Jangan pernah menaruhnya di dalam blok `$$ ... $$`** milik `plpgsql`. Penanda
itu bukan komentar SQL — ia dipotong sebelum perintahnya dikirim, sehingga
fungsi yang terbelah dua akan gagal dengan error sintaks yang menunjuk ke baris
yang salah.

---

## Trigger `updated_at`

Berkas: `src/database/sql/updated_at_trigger.sql`, tersalin ke
`0003_updated_at_trigger.sql`.

Ia memasang trigger pada **setiap tabel `public` yang punya kolom `updated_at`**,
dipilih dari katalog — bukan dari daftar nama tabel yang ditulis tangan. Daftar
tulisan tangan punya satu kelemahan yang pasti terjadi: tabel yang ditambahkan
bulan depan tidak akan ada di dalamnya, dan tidak ada yang akan ingat.

**Konsekuensinya, dan ini yang perlu diingat:**

> Setiap kali sebuah migrasi menambah tabel ber-`updated_at`, panggil ulang
> pemasangnya. Satu baris, dan idempoten:
>
> ```sql
> SELECT public.apply_updated_at_triggers();
> ```

Ia membaca keadaan saat dijalankan, bukan keadaan saat tabelnya dibuat. Yang
menjaganya adalah kebiasaan menyebut baris itu di migrasi yang menambah tabel —
bukan sesuatu yang bisa ditegakkan database.

### Memeriksa hasilnya

Kedua hitungan ini harus sama:

```sql
SELECT count(*) AS tabel_ber_updated_at
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'updated_at';

SELECT count(*) AS trigger_terpasang
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND tg.tgname LIKE '%\_touch_updated_at'
  AND NOT tg.tgisinternal;
```

Kalau `trigger_terpasang` lebih kecil, ada tabel yang terlewat — jalankan
pemasangnya. Kalau lebih besar, ada trigger yang tertinggal dari tabel yang
sudah dihapus; bukan masalah, tapi tanda ada `DROP TABLE` yang tidak lewat
migrasi.

### Jalur langsung

Karena idempoten, berkasnya boleh dijalankan langsung:

```bash
psql "$DATABASE_URL" -f src/database/sql/updated_at_trigger.sql
```

**Tapi jalur ini tidak mencatat apa pun di rantai migrasi.** Database yang
dibangun ulang dari nol tidak akan punya triggernya, dan tidak ada yang akan
tahu sampai ada baris yang `updated_at`-nya basi. Pakai `npm run db:migrate`.

---

## Kalau ada yang salah

**`DATABASE_URL belum diisi`** — `drizzle.config.ts` melempar sebelum apa pun
berjalan. Salin `.env.example` menjadi `.env` dan isi nilainya. Untuk `generate`
saja, URL placeholder sudah cukup.

**Migrasi gagal di tengah** — drizzle-kit menjalankan migrasi di dalam
transaksi. Kalau gagal, seluruh migrasi itu bergulung balik, dan jurnalnya tidak
mencatatnya. Perbaiki penyebabnya, buat migrasi baru, ulangi. Jangan menyunting
migrasi yang gagal dan menjalankannya ulang — kalau ada bagian yang sempat
berhasil di luar transaksi, hasilnya bergantung pada apa yang sudah terjadi.

**Database sudah punya tabelnya, jurnal belum** — gejala: migrasi gagal dengan
`relation already exists`. Penyebab biasanya SQL yang pernah dijalankan manual
lewat SQL editor. Jangan tandai migrasinya sebagai sudah jalan; samakan dulu
skemanya, baru putuskan. Database yang jurnalnya tidak cocok dengan isinya
adalah database yang tidak bisa dipercaya saat dibangun ulang.
