-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Isi `status_transitions`: state machine untuk Fase 4 lanjutan
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Keuangan / RAB (budget)
-- ─────────────────────────────────────────────────────────────────────────────
insert into status_transitions (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order) values
  ('budget', 'draft', 'submitted', array['owner','co_owner','division_head']::role[], array[]::text[], 10),
  ('budget', 'submitted', 'review', array['owner','co_owner']::role[], array[]::text[], 20),
  ('budget', 'review', 'needs_revision', array['owner','co_owner']::role[], array['reviewNote']::text[], 30),
  ('budget', 'needs_revision', 'submitted', array['owner','co_owner','division_head']::role[], array[]::text[], 40),
  ('budget', 'review', 'approved', array['owner','co_owner']::role[], array[]::text[], 50),
  ('budget', 'approved', 'in_progress', array['owner','co_owner','division_head']::role[], array[]::text[], 60),
  ('budget', 'in_progress', 'done', array['owner','co_owner','division_head']::role[], array[]::text[], 70)
on conflict (entity_type, from_status, to_status) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Konten / Publikasi (content)
-- ─────────────────────────────────────────────────────────────────────────────
insert into status_transitions (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order) values
  ('content', 'idea', 'brief', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 10),
  ('content', 'brief', 'copywriting', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 20),
  ('content', 'brief', 'visual_request', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 25),
  ('content', 'copywriting', 'production', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 30),
  ('content', 'visual_request', 'production', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 35),
  ('content', 'production', 'review', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 40),
  ('content', 'review', 'production', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 50),
  ('content', 'review', 'scheduled', array['owner','co_owner','division_head','division_deputy']::role[], array['plannedDate']::text[], 60),
  ('content', 'scheduled', 'published', array['owner','co_owner','division_head','division_deputy','member']::role[], array['publishedUrl']::text[], 70),
  ('content', 'published', 'evaluation', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 80)
on conflict (entity_type, from_status, to_status) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permintaan Kreatif (creative)
-- ─────────────────────────────────────────────────────────────────────────────
insert into status_transitions (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order) values
  ('creative', 'request_received', 'brief', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 10),
  ('creative', 'brief', 'queued', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 20),
  ('creative', 'queued', 'production', array['owner','co_owner','division_head','division_deputy','member']::role[], array['picId']::text[], 30),
  ('creative', 'production', 'draft', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 40),
  ('creative', 'draft', 'review', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 50),
  ('creative', 'review', 'revision', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 60),
  ('creative', 'revision', 'draft', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 70),
  ('creative', 'review', 'final', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 80),
  ('creative', 'final', 'done', array['owner','co_owner','division_head','division_deputy']::role[], array['finalFileUrl']::text[], 90)
on conflict (entity_type, from_status, to_status) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Mitra / Sponsorship (partner)
-- ─────────────────────────────────────────────────────────────────────────────
insert into status_transitions (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order) values
  ('partner', 'prospect', 'outreach', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 10),
  ('partner', 'outreach', 'negotiation', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 20),
  ('partner', 'negotiation', 'proposal_sent', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 30),
  ('partner', 'proposal_sent', 'proposal_review', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 40),
  ('partner', 'proposal_review', 'contract_review', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 50),
  ('partner', 'contract_review', 'active', array['owner','co_owner','division_head','division_deputy']::role[], array['actualAmount']::text[], 60),
  ('partner', 'active', 'fulfilled', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 70),
  ('partner', 'active', 'on_hold', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 80),
  ('partner', 'prospect', 'rejected', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 90),
  ('partner', 'outreach', 'rejected', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 91),
  ('partner', 'negotiation', 'rejected', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 92),
  ('partner', 'active', 'cancelled', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 93)
on conflict (entity_type, from_status, to_status) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Peminjaman Logistik (logistics)
-- ─────────────────────────────────────────────────────────────────────────────
insert into status_transitions (entity_type, from_status, to_status, allowed_roles, required_fields, sort_order) values
  ('logistics', 'draft', 'submitted', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 10),
  ('logistics', 'submitted', 'review', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 20),
  ('logistics', 'review', 'approved', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 30),
  ('logistics', 'review', 'rejected', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 40),
  ('logistics', 'approved', 'in_progress', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 50),
  ('logistics', 'in_progress', 'returned', array['owner','co_owner','division_head','division_deputy','member']::role[], array[]::text[], 60),
  ('logistics', 'returned', 'done', array['owner','co_owner','division_head','division_deputy']::role[], array[]::text[], 70)
on conflict (entity_type, from_status, to_status) do nothing;
