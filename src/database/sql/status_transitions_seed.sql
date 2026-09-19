-- ═══════════════════════════════════════════════════════════════════════════
-- Isi `status_transitions` — state machine sebagai DATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sumber kebenarannya adalah berkas **ini**. Salinannya ada di
-- `src/database/migrations/0004_status_transitions_seed.sql`; kalau ada yang
-- perlu diubah, ubah di sini lebih dulu lalu salin sebagai migrasi baru.
-- Jangan mengubah migrasi yang sudah dijalankan (§8.4).
--
-- ─── Kenapa ini migrasi, bukan seeder ──────────────────────────────────────
--
-- `src/database/seed.ts` berisi data **pengembangan**: akun uji, dan data
-- master yang boleh berbeda antar lingkungan. Berkas ini bukan itu. Tanpa satu
-- baris pun di sini, `availableTransitions` selalu kosong dan **tidak ada
-- pekerjaan yang bisa berpindah status sama sekali** — aplikasinya hidup tetapi
-- tidak bisa dipakai. Aturan yang ketiadaannya membuat sistem tidak berfungsi
-- adalah bagian dari skema, bukan pelengkapnya.
--
-- ─── Kenapa tabelnya ada, padahal statusnya enum ───────────────────────────
--
-- Lihat catatan panjang di `src/database/schema/system.ts`. Ringkasnya: aturan
-- ini dibaca **dua sisi** — backend untuk menolak, frontend untuk menentukan
-- tombol mana yang boleh muncul. Selama ia di satu tempat, keduanya tidak bisa
-- berbeda.
--
-- ─── Dari mana daftar transisinya berasal ──────────────────────────────────
--
-- `sksks` **tidak punya satu pun aturan transisi** (temuan #3): kolom statusnya
-- enum biasa, dan `draft` bisa langsung menjadi `done` tanpa melewati apa pun.
-- Jadi daftar ini bukan salinan — ia diturunkan dari dua tempat:
--
--   1. `PRD-REVAMP.md` §9.2 (bagan alur pekerjaan) dan §9.1 (bagan alur
--      permintaan) — bentuk alur yang dituju.
--   2. `docs/INVENTARIS-ATURAN.md` §2 — syarat isi field per status, yang
--      dipertahankan apa adanya dari `enforce_work_item_status_rules`.
--
-- ─── Kenapa `allowed_roles` LEBIH SEMPIT daripada `canEditWorkItem` ────────
--
-- Ini bagian yang paling mudah salah. `canEditWorkItem` di `src/policy/resource.ts`
-- membolehkan pembuat, PIC, dan penerima tugas mengubah pekerjaannya. Kalau
-- `allowed_roles` disamakan dengan itu, maka **seorang anggota bisa menyetujui
-- pekerjaannya sendiri** — ia pembuatnya, jadi `canEditWorkItem` meloloskannya,
-- dan `submitted → approved` menjadi tombol yang bisa ia tekan sendiri.
--
-- Karena itu dua pemeriksaan dipasang berdampingan, dan keduanya harus lolos:
--
--   · `allowed_roles` (tabel ini) — "bolehkah **peran ini** melakukan langkah
--     ini sama sekali?" Menyetujui adalah wewenang kepala divisi, titik.
--   · `canTransitionWorkItem` (`resource.ts`) — "bolehkah **orang ini**
--     melakukannya pada **baris ini**?" Kepala divisi A tidak menyetujui
--     pekerjaan divisi B.
--
-- Yang pertama menjaga **jenis** wewenangnya, yang kedua menjaga **wilayahnya**.
-- Menghapus salah satunya membuka lubang yang berbeda.
--
-- ─── Yang sengaja TIDAK ada di sini ────────────────────────────────────────
--
-- **`archived_at` bukan transisi.** Menyembunyikan baris dari daftar aktif
-- adalah operasi tersendiri (§14.2), bukan perpindahan status. Di `sksks`
-- keduanya tumpang tindih; di sini tidak.
--
-- **Transisi masuk ke `draft` dari ketiadaan tidak ada.** Pembuatan baris
-- menghasilkan `draft` lewat nilai `default` kolomnya, bukan lewat perpindahan
-- status. Baris di sini yang menyatakan `null → draft` akan menyatakan sesuatu
-- yang tidak pernah ditanyakan siapa pun.

-- ─────────────────────────────────────────────────────────────────────────────
-- Pekerjaan
-- ─────────────────────────────────────────────────────────────────────────────

insert into status_transitions
  (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order)
values

  -- Diajukan. Pembuatnya sendiri yang mengajukan, jadi seluruh peran ikut —
  -- termasuk `member`. Penyempitannya ada di `canTransitionWorkItem`: yang
  -- boleh mengajukan hanyalah orang yang boleh mengubah baris itu.
  ('work_item', 'draft', 'submitted',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 10),

  -- Disetujui. **Tidak ada `member` di sini, dan itu disengaja** — lihat
  -- catatan di kepala berkas.
  ('work_item', 'submitted', 'approved',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 20),

  ('work_item', 'submitted', 'rejected',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 30),

  -- Dikembalikan ke draft setelah ditolak, supaya pembuatnya bisa memperbaiki
  -- lalu mengajukan ulang. Tanpa ini `rejected` menjadi jalan buntu, dan
  -- satu-satunya cara memperbaiki pekerjaan yang ditolak adalah membuat baris
  -- baru — yang berarti kehilangan riwayatnya.
  ('work_item', 'rejected', 'draft',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 40),

  -- Mulai dikerjakan. Wewenang kepala divisi karena di sinilah PIC ditetapkan,
  -- dan menetapkan siapa yang bertanggung jawab adalah keputusan, bukan
  -- inisiatif. Kewajiban "PIC-nya harus ada dan aktif" **tidak** dinyatakan di
  -- sini: `required_fields` berisi nama kolom pada barisnya, sedangkan syarat
  -- itu tentang baris **lain** (`profiles.status`). Tempatnya di service.
  ('work_item', 'approved', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 50),

  -- PIC menyerahkan hasilnya untuk dinilai.
  ('work_item', 'in_progress', 'need_review',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 60),

  -- Ditahan. Keputusan 48: hanya boleh dipasang manusia, dan wajib beralasan.
  --
  -- **Tiga kolom, dan ketiganya diperiksa.** `hold_reason` ditegakkan
  -- `check` constraint di tabelnya (keputusan 48); `blocker_reason` dan
  -- `assistance_needed` adalah syarat `sksks` yang dipertahankan
  -- (`docs/INVENTARIS-ATURAN.md` §2) dan diminta ulang `PRD-BACKEND.md` §12.
  -- Ketiganya tumpang tindih sebagian, dan itu diketahui — menuntut lebih
  -- banyak aman, sedangkan menuntut lebih sedikit membuat penulisan ditolak
  -- constraint database sebagai `500`, bukan sebagai `422` yang menyebut
  -- kolom mana yang kurang.
  ('work_item', 'in_progress', 'on_hold',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['blocker_reason','assistance_needed','hold_reason']::text[], 70),

  ('work_item', 'on_hold', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 80),

  -- Selesai. `completion_summary` ditegakkan `check` constraint juga, jadi
  -- memeriksanya di sini bukan pengganti — ia yang membuat pesannya `422`
  -- yang menyebut kolomnya.
  ('work_item', 'need_review', 'done',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['completion_summary']::text[], 90),

  -- Dinilai belum selesai, dikembalikan ke pengerjaan. Ini yang membedakan
  -- `need_review` dari jalan buntu.
  ('work_item', 'need_review', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 100)

on conflict (entity_type, from_status, to_status) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permintaan
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `need_clarification` **berdiri sendiri**, tidak pernah dipetakan ke
-- `need_review` seperti di `sksks` (temuan #5). Keduanya berarti hal yang
-- berlawanan: `need_clarification` = "pekerjaannya belum bisa dimulai, kami
-- butuh keterangan", `need_review` = "pekerjaannya sudah selesai, kami sedang
-- menilai". Meleburnya membuat kepala divisi tidak bisa membedakan keduanya.

insert into status_transitions
  (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order)
values

  -- Diajukan pemohonnya sendiri. Penyempitannya di `canTransitionRequest`,
  -- yang menuntut `requester_id` sama dengan aktornya — §7.9 hanya menulis
  -- "member: draft→submitted" tanpa menyebut milik siapa, dan draft yang bisa
  -- diajukan orang lain adalah cara mengirim permintaan atas nama orang lain
  -- tanpa ia tahu.
  ('request', 'draft', 'submitted',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 10),

  -- Diterima divisi tujuan.
  ('request', 'submitted', 'accepted',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 20),

  -- Butuh keterangan dari pemohon. Wajib beralasan — pemohon tidak akan tahu
  -- apa yang harus dilengkapi kalau tidak ada yang mengatakan apa.
  ('request', 'submitted', 'need_clarification',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['clarification_note']::text[], 30),

  ('request', 'submitted', 'rejected',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 40),

  -- Pemohon melengkapi lalu mengajukan ulang. Kembali ke `submitted`, bukan
  -- langsung ke `accepted`: keterangan yang dilengkapi tetap harus dinilai
  -- ulang oleh divisi tujuan.
  ('request', 'need_clarification', 'submitted',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 50),

  ('request', 'accepted', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 60),

  ('request', 'in_progress', 'need_review',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 70),

  ('request', 'in_progress', 'on_hold',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['hold_reason']::text[], 80),

  ('request', 'on_hold', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 90),

  ('request', 'need_review', 'done',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['result_summary']::text[], 100),

  ('request', 'need_review', 'in_progress',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 110)

on conflict (entity_type, from_status, to_status) do nothing;
