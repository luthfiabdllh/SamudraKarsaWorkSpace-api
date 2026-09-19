-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Isi `status_transitions`: surat dan domain pendukung Fase 4
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migrasi ini **tidak dihasilkan `drizzle-kit generate`**. Ia dibuat lewat
-- `--custom` seperti 0004.
--
-- Sumber kebenarannya adalah berkas ini. Jangan mengubah migrasi yang sudah
-- dijalankan (§8.4); tambahkan migrasi baru sebagai gantinya.
--
-- `on conflict do nothing` dipasang supaya aman dijalankan ulang.

-- ─────────────────────────────────────────────────────────────────────────────
-- Persuratan — 9 status, alur linier dengan beberapa jalur kembali
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Alur normal:
--   submitted → needs_completion → verified → drafting → review
--   → awaiting_signature → ready_to_send → sent → done
--
-- Jalur kembali:
--   - needs_completion → submitted (setelah dilengkapi)
--   - review → drafting (revisi)
--   - awaiting_signature → drafting (dikembalikan)
--
-- Catatan `allowed_roles`:
--   - `submitted` dibuat siapa pun (member) karena pemohon mengajukannya.
--   - `verified` ke atas: kepala divisi ke atas karena menyatakan siap kirim.
--   - Sekbend / Humpub / siapa pun bisa mengisi draf; yang mengesahkan adalah
--     kepala divisi.

insert into status_transitions
  (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order)
values

  -- Diajukan → butuh pelengkapan (sekretaris cek kelengkapan)
  ('letter', 'submitted', 'needs_completion',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 10),

  -- Dilengkapi → kembali diajukan
  ('letter', 'needs_completion', 'submitted',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 20),

  -- Diverifikasi (kelengkapan oke, siap didraf)
  ('letter', 'submitted', 'verified',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 30),

  -- Mulai didraf
  ('letter', 'verified', 'drafting',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 40),

  -- Draf selesai, dikirim untuk ditinjau
  ('letter', 'drafting', 'review',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array[]::text[], 50),

  -- Dikembalikan untuk revisi
  ('letter', 'review', 'drafting',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 60),

  -- Disetujui → menunggu tanda tangan
  ('letter', 'review', 'awaiting_signature',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array['signer_name']::text[], 70),

  -- Dikembalikan dari penandatanganan
  ('letter', 'awaiting_signature', 'drafting',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 80),

  -- Siap dikirim
  ('letter', 'awaiting_signature', 'ready_to_send',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 90),

  -- Dikirim
  ('letter', 'ready_to_send', 'sent',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array['letter_date']::text[], 100),

  -- Surat masuk langsung ke sent
  ('letter', 'submitted', 'sent',
   array['owner','co_owner','division_head','division_deputy','member']::role[],
   array['letter_date']::text[], 105),

  -- Selesai
  ('letter', 'sent', 'done',
   array['owner','co_owner','division_head','division_deputy']::role[],
   array[]::text[], 110)

on conflict (entity_type, from_status, to_status) do nothing;
