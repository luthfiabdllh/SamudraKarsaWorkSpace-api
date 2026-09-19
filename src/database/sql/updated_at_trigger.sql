-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger `updated_at` — dijaga database, bukan hanya aplikasi
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Kolom `updated_at` sudah ada sejak migrasi 0000, dan aplikasi sudah mengisinya
-- lewat `$onUpdate` di `src/database/schema/_columns.ts`. Yang belum ada adalah
-- penjaganya di sisi database — dan tanpa itu, setiap perubahan yang **tidak
-- lewat NestJS** membiarkan `updated_at` basi tanpa jejak:
--
--   · migrasi yang memperbaiki data
--   · perbaikan manual lewat SQL editor Supabase
--   · skrip sekali pakai
--   · `UPDATE` yang ditulis seseorang langsung di psql
--
-- Semuanya menghasilkan baris yang `updated_at`-nya berbohong. Tidak ada yang
-- gagal, tidak ada yang error — barisnya hanya mengatakan "terakhir diubah
-- kemarin" padahal diubah hari ini. Itu jenis kesalahan yang baru ketahuan saat
-- seseorang memakainya untuk memutuskan sesuatu.
--
-- Berkas ini BUKAN migrasi drizzle. Ia **sumber kebenaran**-nya, dan isinya
-- sudah disalin ke `src/database/migrations/0003_updated_at_trigger.sql`.
-- Alasannya: `drizzle-kit generate` hanya tahu membuat DDL dari objek tabel, dan
-- trigger bukan objek yang ia lacak. Menaruhnya di `src/database/migrations/`
-- dengan nama bernomor akan membuatnya terlihat seperti keluaran drizzle, dan
-- migrasi berikutnya yang di-generate bisa menimpanya.
--
-- Aturan yang mengikat keduanya: **ubah berkas ini lebih dulu**, lalu salin ke
-- migrasi baru. Jangan pernah mengubah `0003_...sql` secara langsung — ia sudah
-- dijalankan, dan migrasi yang sudah dijalankan tidak pernah diubah (§8.4).
--
-- Seluruh berkas ini **idempoten**. Ia boleh dijalankan berkali-kali; yang sudah
-- ada dilewati, yang belum dibuat. Karena itu ia juga aman dijalankan langsung:
--
--   psql "$DATABASE_URL" -f src/database/sql/updated_at_trigger.sql
--
-- tapi jalur itu **tidak mencatat apa pun di rantai migrasi** — database yang
-- dibangun ulang dari nol tidak akan punya triggernya. Lihat
-- `docs/CARA-MENJALANKAN-MIGRASI.md`.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Fungsi trigger
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_updated_at() IS
  'Mengisi NEW.updated_at dengan waktu transaksi. Dipakai trigger BEFORE UPDATE.';

-- Sengaja **bukan** `SECURITY DEFINER`.
--
-- Fungsinya hanya menulis satu kolom pada baris yang sedang di-UPDATE, dan
-- pemanggilnya sudah pasti punya hak UPDATE ke baris itu — kalau tidak, ia tidak
-- akan sampai ke trigger. `SECURITY DEFINER` di sini akan memberi hak pemilik
-- tabel kepada siapa pun yang berhasil memicu trigger, tanpa satu pun hal yang
-- didapat. Hak istimewa yang tidak dibutuhkan adalah hak istimewa yang suatu
-- saat disalahgunakan.

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Pemasang trigger
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_updated_at_triggers()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  target  record;
  applied integer := 0;
BEGIN
  -- Dipilih dari katalog, bukan dari daftar nama tabel yang ditulis tangan.
  --
  -- Daftar yang ditulis tangan punya satu kelemahan yang pasti terjadi: tabel
  -- yang ditambahkan bulan depan tidak akan ada di dalamnya, dan tidak ada yang
  -- akan ingat. Akibatnya tabel terbaru justru yang `updated_at`-nya tidak
  -- dijaga — kebalikan dari yang diinginkan.
  --
  -- Sebaliknya, daftar ini diturunkan dari kenyataan: apa pun yang punya kolom
  -- `updated_at` mendapat triggernya. Kolom itu sendiri yang menjadi
  -- pendaftarannya, dan `_columns.ts` sudah memutuskan tabel mana yang
  -- memilikinya.
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- tabel biasa; view & matview dikecualikan
      AND a.attname = 'updated_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target.table_name
        AND tg.tgname = target.table_name || '_touch_updated_at'
        AND NOT tg.tgisinternal
    ) THEN
      -- `WHEN (OLD IS DISTINCT FROM NEW)` — bukan hiasan.
      --
      -- Tanpa syarat itu, setiap `UPDATE` menaikkan `updated_at`, termasuk
      -- `UPDATE` yang menulis nilai yang sama persis dengan yang sudah ada.
      -- Aplikasi yang menyimpan form tanpa perubahan apa pun akan membuat
      -- barisnya tampak "baru saja diubah" — dan kolom yang selalu bergerak
      -- tidak berguna untuk memutuskan apa pun.
      --
      -- Dibandingkan sebagai **baris utuh** (`OLD IS DISTINCT FROM NEW`),
      -- bukan kolom per kolom: kolom yang ditambahkan nanti ikut terbanding
      -- dengan sendirinya, tanpa ada daftar yang harus diperbarui.
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
        'FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) '
        'EXECUTE FUNCTION public.touch_updated_at()',
        target.table_name || '_touch_updated_at',
        target.table_name
      );

      applied := applied + 1;
    END IF;
  END LOOP;

  RETURN applied;
END;
$$;

COMMENT ON FUNCTION public.apply_updated_at_triggers() IS
  'Memasang trigger touch_updated_at pada setiap tabel public yang punya kolom '
  'updated_at. Idempoten — aman dijalankan berulang. Mengembalikan jumlah '
  'trigger yang baru dibuat.';

-- Fungsi ini menjalankan DDL. Ia tidak boleh bisa dipanggil dari klien mana pun.
--
-- `PUBLIC` mendapat `EXECUTE` pada setiap fungsi baru secara bawaan di
-- PostgreSQL, sehingga tanpa `REVOKE` di bawah ini, siapa pun yang bisa
-- menyambung ke database bisa memanggilnya. Yang ia lakukan bukan membaca data
-- — ia mengubah struktur skema. Sejalan dengan `revoke execute` pada
-- `log_activity` dan `save_record_version` di `sksks`, yang dipertahankan.
REVOKE ALL ON FUNCTION public.apply_updated_at_triggers() FROM PUBLIC;

-- `touch_updated_at()` **tidak** dicabut, dan itu disengaja.
--
-- Sebuah fungsi trigger dipanggil dengan hak pemanggil `UPDATE`-nya, jadi
-- mencabut `EXECUTE`-nya akan menggagalkan setiap `UPDATE` biasa — bukan
-- menambah keamanan. Lagi pula ia tidak berbahaya: dipanggil di luar konteks
-- trigger ia gagal sendiri, karena `NEW` tidak ada.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Jalankan
-- ───────────────────────────────────────────────────────────────────────────

SELECT public.apply_updated_at_triggers();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Periksa hasilnya
-- ───────────────────────────────────────────────────────────────────────────
--
-- Jalankan setelah migrasi untuk memastikan tidak ada tabel ber-updated_at yang
-- terlewat. Kedua hitungannya harus sama:
--
--   SELECT count(*) AS tabel_ber_updated_at
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND column_name = 'updated_at';
--
--   SELECT count(*) AS trigger_terpasang
--   FROM pg_trigger tg
--   JOIN pg_class c ON c.oid = tg.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND tg.tgname LIKE '%\_touch_updated_at'
--     AND NOT tg.tgisinternal;
--
-- Setelah menambahkan tabel baru ber-`updated_at` di migrasi berikutnya,
-- panggil ulang pemasangnya — satu baris, dan idempoten:
--
--   SELECT public.apply_updated_at_triggers();
