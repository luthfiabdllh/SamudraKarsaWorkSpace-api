import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Seluruh nilai enum sistem, dalam bahasa Inggris (keputusan 47).
 *
 * ## Kenapa berkas ini ada, terpisah dari tabelnya
 *
 * `sksks` mendefinisikan 22 tipe enum di satu berkas migrasi raksasa, dan
 * nilainya bercampur dua bahasa: nama tipenya Inggris (`request_status`),
 * isinya Indonesia (`diajukan`, `menunggu_ttd`). Berkas ini memisahkan
 * kosakata dari struktur supaya kosakatanya bisa ditinjau dalam satu layar —
 * dan supaya nilai yang **sama** di dua tabel benar-benar berasal dari satu
 * definisi, bukan dari dua penulisan yang kebetulan mirip.
 *
 * ## Lima perubahan yang disengaja, di luar penerjemahan
 *
 * Penerjemahan saja tidak cukup. Lima hal di bawah adalah keputusan, bukan
 * terjemahan — masing-masing dijelaskan di tempatnya:
 *
 * 1. **`diarsipkan` dibuang** dari status pekerjaan (keputusan 47 → §14.2).
 * 2. **`done` menjadi satu-satunya nilai "selesai"** di seluruh sistem.
 *    `sksks` memakai `done` di lima enum dan `selesai` di dua enum lain untuk
 *    hal yang sama persis.
 * 3. **`role` bertambah dua nilai** — kepala dan wakil kepala divisi
 *    (keputusan 46).
 * 4. **`document_type` ditambahkan** — jenis dokumen yang nomornya dihasilkan
 *    sistem. Tidak ada di `sksks`, karena di sana penomoran tidak punya tabel
 *    penghitung (temuan #2).
 * 5. **`notification_kind` ditambahkan** — di `sksks` jenis notifikasi adalah
 *    teks yang nilainya ditulis dari dalam trigger, dan daftarnya tidak ada di
 *    mana pun. Satu nilai di dalamnya, `unassignment`, belum pernah ada
 *    (keputusan 50).
 *
 * ## Yang tidak boleh diterjemahkan
 *
 * Nama orang, nama divisi, nama desa, sebutan jabatan resmi, dan isi nomor
 * dokumen. `kkn` di `kkn_phase` dipertahankan karena KKN adalah nama resmi
 * programnya, bukan kosakata sistem.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Peran & keanggotaan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lima peran, bukan tiga.
 *
 * `sksks` menyimpan peran di **dua kolom**: `app_role` berisi tiga nilai, dan
 * `profiles.division_role` berisi `kadiv`/`wakadiv`. Digabung, sistem yang
 * berjalan punya lima tingkat. Keputusan 46 mempertahankan kelimanya dalam
 * satu enum supaya tidak ada lagi peran yang hidup di kolom terpisah — kolom
 * terpisah adalah cara peran menghilang dari pemeriksaan izin.
 */
export const roleEnum = pgEnum('role', [
  'owner',
  'co_owner',
  'division_head',
  'division_deputy',
  'member',
]);

/**
 * `nonaktif` → `inactive`. Anggota aktif adalah `status = 'active'`.
 *
 * `sksks` memakai `status <> 'nonaktif'` sebagai definisi "aktif", sehingga
 * `invited` — orang yang belum pernah masuk sama sekali — terhitung aktif dan
 * mendapat akses baca ke 32 tabel (temuan #1). Enumnya benar; yang salah
 * pemakaiannya.
 */
export const memberStatusEnum = pgEnum('member_status', [
  'invited',
  'active',
  'inactive',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Status pekerjaan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status dokumen yang "dikerjakan" — pekerjaan, keputusan rapat, dan milestone
 * memakai enum yang sama.
 *
 * **Namanya `work_status`, bukan `work_item_status`.** `sksks` menamainya
 * `global_status`, dan tiga tabel memakainya: `work_items`,
 * `meeting_decisions`, dan `milestones`. Memberinya nama salah satu pemakainya
 * akan menyesatkan — dan memecahnya jadi tiga enum berarti tiga tempat yang
 * harus diubah bersama setiap kali satu status ditambah.
 *
 * **`diarsipkan` dibuang.** `sksks` punya tiga mekanisme penyembunyian yang
 * tumpang tindih, dan nilai status ini salah satunya. Menyembunyikan baris
 * adalah urusan kolom `archived_at`, bukan urusan status (keputusan 47 → §14.2).
 *
 * `on_hold` **tetap ada, tetapi berubah sifat** (keputusan 48): hanya boleh
 * dipasang manusia, dan wajib disertai alasan. Di `sksks` ia dipasang trigger
 * dengan nilai yang tidak berasal dari isian siapa pun (temuan #14).
 */
export const workStatusEnum = pgEnum('work_status', [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'canceled',
]);

export const workItemTypeEnum = pgEnum('work_item_type', [
  'story',
  'task',
  'request',
  'meeting_follow_up',
  'program_need',
  'division_need',
  'milestone',
  'evaluation_follow_up',
  'subunit_need',
]);

/**
 * Perhatikan urutannya: `need_clarification` berdiri sendiri, **tidak pernah**
 * dipetakan ke `need_review`.
 *
 * Sinkronisasi `sksks` melebur keduanya (temuan #5), padahal maknanya berbeda:
 * `need_review` berarti pekerjaannya sudah selesai dan menunggu dinilai,
 * `need_clarification` berarti pekerjaannya belum bisa dimulai karena ada yang
 * harus dijelaskan pemohon lebih dulu. Melebur keduanya membuat kepala divisi
 * tidak bisa membedakan "sudah jadi" dari "belum bisa jalan".
 */
export const requestStatusEnum = pgEnum('request_status', [
  'draft',
  'submitted',
  'accepted',
  'in_progress',
  'need_review',
  'need_clarification',
  'on_hold',
  'done',
  'rejected',
]);

export const requestTypeEnum = pgEnum('request_type', [
  'correspondence',
  'budget_plan',
  'design',
  'video_editing',
  'publication',
  'documentation',
  'goods_procurement',
  'goods_loan',
  'transportation',
  'cargo',
  'catering',
  'sponsorship',
  'program_need',
  'general_assistance',
]);

export const priorityLevelEnum = pgEnum('priority_level', [
  'urgent',
  'high',
  'medium',
  'low',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Persuratan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `selesai` → `done`. Lihat catatan `done` di bagian bawah berkas ini.
 *
 * `menunggu_ttd` → `awaiting_signature`, bukan `awaiting_ttd`: singkatan yang
 * hanya dikenal orang Indonesia tidak menyelamatkan apa pun di lapisan
 * penyimpanan, dan "ttd" bukan kata Inggris.
 */
export const letterStatusEnum = pgEnum('letter_status', [
  'submitted',
  'needs_completion',
  'verified',
  'drafting',
  'review',
  'awaiting_signature',
  'ready_to_send',
  'sent',
  'done',
]);

export const letterDirectionEnum = pgEnum('letter_direction', [
  'inbound',
  'outbound',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Keuangan
// ─────────────────────────────────────────────────────────────────────────────

/** `berjalan` → `in_progress`, `selesai` → `done`, `diajukan` → `submitted`. */
export const budgetStatusEnum = pgEnum('budget_status', [
  'draft',
  'submitted',
  'review',
  'needs_revision',
  'approved',
  'in_progress',
  'done',
]);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'income',
  'expense',
]);

export const duesStatusEnum = pgEnum('dues_status', [
  'unpaid',
  'installment',
  'paid',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Konten & kreatif
// ─────────────────────────────────────────────────────────────────────────────

export const contentStatusEnum = pgEnum('content_status', [
  'idea',
  'brief',
  'copywriting',
  'visual_request',
  'production',
  'review',
  'scheduled',
  'published',
  'evaluation',
]);

export const creativeStatusEnum = pgEnum('creative_status', [
  'request_received',
  'brief',
  'queued',
  'production',
  'draft',
  'review',
  'revision',
  'final',
  'done',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Mitra & program
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `kontraprestasi` → `counter_performance`.
 *
 * Istilah hukumnya dalam bahasa Inggris memang ini: imbalan yang diberikan
 * kembali sebagai bagian dari perjanjian timbal balik. Ia dipertahankan sebagai
 * satu nilai tersendiri karena dalam alur sponsorship ia adalah tahap yang
 * harus diselesaikan, bukan sekadar catatan.
 */
export const partnerStatusEnum = pgEnum('partner_status', [
  'prospect',
  'not_contacted',
  'initial_contact',
  'follow_up',
  'negotiation',
  'proposal_sent',
  'awaiting_response',
  'approved',
  'contract_signed',
  'counter_performance',
  'done',
]);

export const programStatusEnum = pgEnum('program_status', [
  'idea',
  'research',
  'validation',
  'planning',
  'ready',
  'in_progress',
  'monitoring',
  'evaluation',
  'done',
]);

/** `pra_kkn`/`pasca_kkn` mempertahankan `kkn` — nama resmi programnya. */
export const kknPhaseEnum = pgEnum('kkn_phase', ['pre_kkn', 'kkn', 'post_kkn']);

// ─────────────────────────────────────────────────────────────────────────────
// Inventaris & logistik
// ─────────────────────────────────────────────────────────────────────────────

export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
  'inbound',
  'outbound',
  'used',
  'borrowed',
  'returned',
  'relocated',
  'damaged_or_lost',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Penomoran dokumen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jenis dokumen yang nomornya dihasilkan sistem.
 *
 * **Enum ini tidak ada di `sksks`.** Di sana tiap nomor dibuat dengan caranya
 * sendiri: empat lewat `DEFAULT` kolom yang memanggil `nextval()` pada sequence
 * terpisah, satu lewat trigger, satu lewat trigger lain dengan format berbeda,
 * dan satu — `program_number` — tidak dihasilkan siapa pun sama sekali
 * (temuan #3).
 *
 * Enumnya sengaja dibuat sebagai enum, bukan teks: nama jenis ini adalah **kunci
 * penghitung**. Salah ketik satu huruf akan membuat penghitung kedua yang mulai
 * dari satu, dan nomor dokumen yang seharusnya berurutan akan melompat mundur.
 * Tipe yang salah di sini tidak menghasilkan galat di tempat kejadian — ia
 * menghasilkan nomor yang salah berbulan-bulan kemudian.
 */
export const documentTypeEnum = pgEnum('document_type', [
  'work_item',
  'request',
  'budget',
  'letter',
  'inventory_item',
  'program',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rapat, kalender, evaluasi
// ─────────────────────────────────────────────────────────────────────────────

export const meetingTypeEnum = pgEnum('meeting_type', [
  'general_meeting',
  'division_meeting',
  'coordination_meeting',
  'evaluation',
  'other',
]);

export const calendarEventTypeEnum = pgEnum('calendar_event_type', [
  'weekly_meeting',
  'all_hands_meeting',
  'daily_meeting',
  'division_meeting',
  'cluster_meeting',
  'subunit_meeting',
  'audience',
  'field_activity',
  'other',
]);

export const rsvpStatusEnum = pgEnum('rsvp_status', [
  'attending',
  'maybe',
  'not_attending',
  'no_response',
]);

export const evaluationVisibilityEnum = pgEnum('evaluation_visibility', [
  'anonymous',
  'named',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Kolaborasi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jenis notifikasi.
 *
 * `sksks` menyimpannya sebagai `text` dengan nilai bawaan `'info'`, dan
 * menuliskan nilainya langsung dari dalam trigger: `'meeting_invite'`,
 * `'cancellation'`, `'reschedule'`, `'mention'`, `'assignment'`. Tidak ada satu
 * pun tempat yang mendaftar nilai-nilai itu — daftarnya hanya bisa disusun
 * dengan membaca seluruh berkas migrasi.
 *
 * Dijadikan enum karena frontend **memilih ikon dan tujuan tautan berdasarkan
 * nilai ini**. Notifikasi dengan jenis yang tidak dikenal tidak tampak rusak —
 * ia tampak seperti notifikasi biasa tanpa ikon, dan tidak ada yang tahu ada
 * yang salah. Enum membuat nilai baru tidak bisa muncul diam-diam.
 *
 * `unassignment` adalah satu-satunya nilai yang **belum pernah ada**, dan ia ada
 * di sini karena keputusan 50: mencabut penugasan seseorang harus memberi tahu
 * orang itu. Sebelumnya hanya penugasan yang memberi tahu, sehingga orang yang
 * paling perlu tahu — yang pekerjaannya diambil — justru tidak diberi tahu.
 */
export const notificationKindEnum = pgEnum('notification_kind', [
  'info',
  'mention',
  'assignment',
  'unassignment',
  'meeting_invite',
  'reschedule',
  'cancellation',
]);

// ─────────────────────────────────────────────────────────────────────────────
// `done` — satu kata untuk satu makna
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Di seluruh berkas ini, **`done` adalah satu-satunya nilai yang berarti
 * "selesai"**.
 *
 * `sksks` memakai dua kata untuk hal yang sama: `done` di `global_status`,
 * `request_status`, `creative_status`, `partner_status`, dan `program_status`;
 * `selesai` di `letter_status` dan `budget_status`. Tidak ada satu pun kode di
 * sana yang memperlakukan keduanya berbeda — perbedaannya murni kebetulan
 * penulisan.
 *
 * Dua kata untuk satu makna punya harga yang tidak kelihatan sampai seseorang
 * menulis pemeriksaannya: setiap tempat yang ingin bertanya "apakah ini sudah
 * selesai?" harus ingat bahwa jawabannya bisa dua nilai, dan suatu saat ada
 * yang lupa salah satunya. Setelah disatukan, pertanyaannya cukup sekali.
 *
 * ## Ringkasan perubahan terhadap `sksks`
 *
 * Dihitung dari berkas migrasinya, bukan dikira-kira:
 *
 * | | `sksks` | Sekarang |
 * |---|---|---|
 * | Tipe enum | 22 | **24** |
 * | Nilai | 141 | **155** |
 * | Bahasa nilai | campur | Inggris |
 *
 * Selisih tipenya **+2**, dan keduanya adalah jenis yang **tidak ada di `sksks`
 * sebagai enum**: `document_type` (di sana penomoran tidak punya tabel
 * penghitung sama sekali) dan `notification_kind` (di sana ia teks bebas yang
 * nilainya ditulis dari dalam trigger).
 *
 * Selisih nilainya **+14**, dari empat sebab:
 *
 * - **+2** — `role` bertambah `division_head` dan `division_deputy`. Di `sksks`
 *   keduanya ada, tetapi di kolom terpisah yang tidak ikut diperiksa
 *   pemeriksaan izin (keputusan 46).
 * - **−1** — `diarsipkan` dibuang dari status pekerjaan (keputusan 47 → §14.2).
 * - **+6** — `document_type`, enam jenis dokumen yang nomornya dihasilkan
 *   sistem.
 * - **+7** — `notification_kind`: enam nilai yang di `sksks` sudah dipakai
 *   sebagai teks, plus `unassignment` yang benar-benar baru (keputusan 50).
 *
 * Yang **tidak** mengubah jumlah, tetapi tetap perlu diketahui:
 *
 * - `selesai` → `done` adalah **penggantian nama**, bukan penghapusan. Nilainya
 *   tetap ada di `letter_status` dan `budget_status`; yang berubah hanya
 *   ejaannya. Yang benar-benar hilang hanyalah **kata** `selesai` sebagai nilai
 *   enum — dan itu memang tujuannya.
 * - `nonaktif` → `inactive`, `diajukan` → `submitted`, dan seterusnya: seluruh
 *   penerjemahan lain juga tidak mengubah jumlah nilai.
 *
 * Tidak ada satu pun status yang benar-benar dipakai di `sksks` yang hilang
 * dari berkas ini.
 *
 * ## Cara memakainya
 *
 * Turunkan tipe dari enumnya, jangan tulis ulang nilainya sebagai teks:
 *
 * ```ts
 * import { workStatusEnum } from './enums';
 *
 * export type WorkStatus = (typeof workStatusEnum.enumValues)[number];
 * // 'draft' | 'submitted' | ... | 'rejected'
 *
 * const a: WorkStatus = 'submitted'; // ✓
 * const b: WorkStatus = 'submited';  // ✗ gagal kompilasi — dan itu tujuannya
 * ```
 *
 * Yang membuat ini bekerja adalah **satu definisi dipakai di dua tempat**:
 * `pgEnum` menghasilkan tipe PostgreSQL-nya, dan `enumValues` menghasilkan
 * union TypeScript-nya dari daftar yang sama. Tidak ada daftar kedua yang bisa
 * menyimpang dari yang pertama.
 *
 * Nilai di sini harus sama persis dengan yang tersimpan di database. Migrasi
 * SQL menyesuaikan diri pada berkas ini, bukan sebaliknya: tipe TypeScript
 * adalah sumber kebenaran, dan label Indonesia tidak pernah muncul di lapisan
 * ini (keputusan 47).
 */
