# Inventaris Aturan — `sksks`

**Keluaran Fase 1** (`PRD-BACKEND.md` §12). Dokumen, bukan kode.

| | |
|---|---|
| Sumber | 11 migrasi di `sksks/supabase/migrations/` |
| Commit | `2a9587c` — **tidak ada remote**; ini satu-satunya salinan |
| Total | 1788 baris SQL, 43 tabel, 20 tipe enum |
| Disusun | 19 September 2026 |

> **Kenapa dokumen ini ada.** Keputusan 5 dan 6 membuang skema lama **dan** data lama. Setelah proyek Supabase `sksks` ditutup, tidak ada lagi cara mengetahui aturan apa yang pernah ada. Migrasi SQL adalah satu-satunya tempat aturan domain itu pernah dituliskan. Ini pekerjaan beberapa hari yang menyelamatkan berbulan-bulan (R2).

---

## Cara membaca

Setiap aturan di bawah mencantumkan berkas asalnya. Kategori mengikuti `PRD-BACKEND.md` §12: penomoran, validasi per status, transisi, sinkronisasi, pembuatan entitas otomatis, notifikasi, audit, versioning, soft delete.

Tanda yang dipakai:

- ✅ **Terbungkus** — aturan ada dan berlaku; tinggal dipindahkan ke service layer
- ⚠️ **Setengah** — aturan ada tapi bocor, tidak simetris, atau bisa dilewati
- ❌ **Tidak ada** — PRD memintanya, `sksks` tidak pernah punya

---

## 0. Ringkasan — yang mengubah desain

Sebelas temuan ini bukan detail implementasi. Masing-masing mengubah bentuk skema atau lapisan service.

| # | Temuan | Dampak |
|---|---|---|
| 1 | **Izin `sksks` hampir seluruhnya terbuka.** 32 dari 43 tabel memakai satu pola: setiap anggota aktif boleh SELECT, INSERT, dan UPDATE apa saja. Hanya DELETE yang dibatasi owner/co-owner. | Matriks §7.9 **bukan port, melainkan pengetatan**. Anggap setiap baris matriks sebagai keputusan baru yang harus diuji, bukan warisan. |
| 2 | **Keuangan terbuka untuk semua anggota.** `member_dues`, `member_payments`, `budgets`, `budget_items`, `transactions` ada di dalam grup "open collaboration" yang sama dengan tabel tugas. | PRD meminta owner/co-owner saja dengan **404** untuk yang lain. Perubahan paling tajam di seluruh revamp. |
| 3 | **`is_active_member()` memakai `status <> 'nonaktif'`.** Artinya `invited` ikut terhitung aktif. | Persis temuan §5.2.6. Definisi benar adalah `status = 'active'`. |
| 4 | **Tidak ada state machine sama sekali.** Tidak ada tabel transisi, tidak ada validasi bahwa `draft → done` itu ilegal. Yang ada hanya syarat isi field per status. | §5.2.1 dan §5.2.2. Ini yang harus dibangun sebagai **data**, plus `availableTransitions` (§9.1). |
| 5 | **Sinkronisasi request ↔ pekerjaan satu arah.** Hanya `requests → work_items`. | §5.2.3 meminta dua arah + penanda konflik. Arah sebaliknya harus dibangun dari nol. |
| 6 | **`perlu_klarifikasi` dilebur menjadi `need_review`** saat disinkronkan. | §5.2.5 — dua makna berbeda dijadikan satu. Harus dipisah. |
| 7 | **Pekerjaan terhubung dibuat saat request di-INSERT, bukan saat diajukan.** Request berstatus `draft` sudah melahirkan pekerjaan. | §5.2.4 meminta sebaliknya. |
| 8 | **Semua penomoran memakai `nextval()`.** Empat skema nomor, empat sequence, semuanya memberi celah saat transaksi bergulung balik. | §8.2 melarangnya. Ganti ke tabel penghitung + `FOR UPDATE`. |
| 9 | **Tidak ada kolom `version` untuk optimistic locking.** `record_versions.version_number` adalah penghitung riwayat, bukan kunci. | §7.16 dan §8.1. Setiap tabel yang bisa diedit bersamaan perlu kolom baru. |
| 10 | **Tidak ada kolom `periode`.** Yang ada `kkn_phase` (`pra_kkn`/`kkn`/`pasca_kkn`) dan `system_settings.kkn_period`, keduanya bukan penanda periode baris. | Keputusan 20 — lintas periode KKN. |
| 11 | **Tidak ada `refresh_tokens`, `idempotency_keys`, `profiles.google_sub`, `profiles.must_change_password`, dan tabel rate limit.** | Sesi ditangani Supabase Auth. Keempatnya harus dibuat baru. |

---

## 1. Penomoran

**Semua memakai `nextval()`, jadi semuanya bercelah** (❌ §8.2).

| Entitas | Format | Cara | Berkas |
|---|---|---|---|
| `work_items.work_number` | `WI-YYYY-#####` | `DEFAULT` kolom → `nextval('work_number_seq')` | `...000001_schema.sql:179,183` |
| `requests.request_number` | `REQ-YYYY-#####` | `DEFAULT` kolom → `nextval('request_number_seq')` | `...000001_schema.sql:261,265` |
| `budgets.budget_number` | `RAB-YYYY-#####` | `DEFAULT` kolom → `nextval('budget_number_seq')` | `...000001_schema.sql:390,394` |
| `letters.letter_number` | `SRT-<JENIS>-YYYY-#####` | trigger `generate_letter_number()` | `...000002_functions_triggers.sql:307-323` |
| `inventory_items.item_code` | `INV-#####` | trigger `generate_inventory_code()` | `...000002_functions_triggers.sql:328-340` |
| `programs.program_number` | — | **tidak ada penghasil** ⚠️ | `...000001_schema.sql:134` |

Catatan yang harus dibawa ke desain baru:

- **`nextval()` di dalam `DEFAULT`** berarti nomor terpakai bahkan ketika INSERT-nya gagal. Celah muncul tanpa ada baris yang tersimpan.
- **`SRT` menyisipkan jenis surat** (`upper(letter_kind)`, cadangan `UMUM`). Jadi penghitung §8.2 harus dikunci per **(jenis, periode)**, bukan per periode saja — persis seperti contoh di §8.2.
- **`INV-#####` tidak memuat tahun**, dan tidak pernah di-reset. Berbeda dari empat lainnya.
- **`program_number` adalah `not null unique` tanpa `DEFAULT` dan tanpa trigger** — artinya aplikasi yang mengisinya, dan aturannya tidak pernah dituliskan di mana pun. Ini satu-satunya nomor yang aturannya hilang. ⚠️

---

## 2. Validasi per status

### Pekerjaan — ✅ `enforce_work_item_status_rules`

`...000002_functions_triggers.sql:151-181`, `BEFORE INSERT OR UPDATE ON work_items`.

| Status | Syarat |
|---|---|
| `on_hold` | `blocker_reason` **dan** `assistance_needed` tidak boleh kosong |
| `done` | `completion_summary` tidak boleh kosong |
| `done` (dari status lain) | set `completed_at = now()` dan `progress_percentage = 100` |
| setiap perubahan | set `updated_by = auth.uid()` |
| setiap perubahan status | tulis baris `work_item_status_history(from, to, changed_by)` |

### Request — ⚠️ `enforce_request_status_rules`

`...000002_functions_triggers.sql:201-219`, **`BEFORE UPDATE` saja**.

| Status | Syarat |
|---|---|
| `perlu_klarifikasi` | `clarification_note` tidak boleh kosong |
| `done` | `result_summary` tidak boleh kosong |
| `done` (dari status lain) | set `completed_at = now()` |

> ⚠️ **Bocor.** Karena hanya `BEFORE UPDATE`, sebuah request yang di-INSERT langsung dengan `status = 'done'` **melewati kedua syarat itu**. Pekerjaan memakai `BEFORE INSERT OR UPDATE` dan tidak punya lubang ini. Ketidaksimetrisan ini tidak disengaja — kemungkinan besar kelalaian.

### Surat, anggaran, konten, kreatif, mitra, program, inventaris, kalender

**Tidak ada validasi per status sama sekali**, padahal semuanya punya enum status berisi 7–11 nilai. ❌ Syarat isi field untuk `letter_status`, `budget_status`, `content_status`, `creative_status`, `partner_status`, `program_status` harus ditulis dari nol di Fase 3–4.

---

## 3. Transisi status

❌ **Tidak ada.** Ini temuan terpenting setelah matriks izin.

Tidak ada tabel transisi, tidak ada fungsi yang menolak perpindahan status, tidak ada daftar transisi yang sah. Kolom status adalah `enum` biasa — **nilai apa pun boleh berpindah ke nilai apa pun**. `draft` bisa langsung menjadi `done` tanpa melewati satu pun syarat perjalanan.

Yang ada hanyalah pencatatan **setelah** kejadian (`work_item_status_history`), bukan penolakan **sebelum** kejadian.

`PRD-BACKEND.md` §9.1 meminta bentuk yang secara struktural memaksa frontend memakai aturan backend:

```json
{ "status": "on_progress", "version": 7,
  "availableTransitions": ["need_review", "on_hold"] }
```

Untuk itu dibutuhkan tabel transisi sebagai **data**, lalu satu fungsi murni yang menghitung transisi sah bagi seorang aktor. Tempatnya di paket `@samudrakarsa/shared` supaya frontend dan backend memakai aturan yang sama persis.

---

## 4. Sinkronisasi

### `sync_request_to_work_item` — ⚠️ satu arah

`...000002_functions_triggers.sql:244-276`, `AFTER UPDATE OF status ON requests`.

Peta status yang dipakai:

| `request_status` | → `global_status` |
|---|---|
| `draft` | `draft` |
| `diajukan` | `diajukan` |
| `diterima` | `disetujui` |
| `on_progress` | `on_progress` |
| `need_review` | `need_review` |
| `on_hold` | `on_hold` |
| `done` | `done` |
| `ditolak` | `ditolak` |
| **`perlu_klarifikasi`** | **`need_review`** ⚠️ |
| lainnya | `draft` |

Tiga hal yang harus diperbaiki:

1. **Arah balik tidak ada.** Mengubah status pekerjaan tidak menyentuh request-nya. §5.2.3 meminta dua arah.
2. **`perlu_klarifikasi` dilebur.** §5.2.5 — "butuh klarifikasi dari pemohon" dan "menunggu review" adalah dua keadaan berbeda; meleburnya menghapus informasi.
3. **Tidak ada penanda konflik.** Kalau kedua sisi diubah bersamaan, yang terakhir menang tanpa jejak.

Saat `on_hold`, sinkronisasi ini juga mengisi `blocker_reason` dari `clarification_note` dan `assistance_needed` dengan teks tetap `'Menunggu tindak lanjut request'`. Itu yang membuat validasi §2 lolos — **kopling rapuh**: syarat wajib-isi dipenuhi oleh nilai karangan, bukan oleh orang.

### Efek berantai yang perlu diperhitungkan

Satu perubahan status request memicu, secara berurutan: validasi request → pembaruan pekerjaan → validasi pekerjaan → `activity_logs` (dua baris) → `record_versions` (satu baris) → pemeriksaan soft delete. **Satu aksi pengguna, enam penulisan database.** Di bentuk serverless dengan `max: 1` koneksi per instans, ini perlu dihitung ulang.

---

## 5. Pembuatan entitas otomatis

| # | Pemicu | Yang dibuat | Berkas |
|---|---|---|---|
| 1 | `AFTER INSERT ON auth.users` | Baris `profiles` (`role` dari metadata atau `member`, `status = 'invited'`) | `...000002:61-79` |
| 2 | sama, setelah fix | Baris `member_dues` dengan `target_amount` dari `system_settings.member_dues_target` (cadangan 4.000.000) | `...17000002:12-37` |
| 3 | `AFTER UPDATE ON auth.users` | `profiles.status`: `invited → active` saat `email_confirmed_at` pertama terisi | `...000002:82-94` |
| 4 | `AFTER INSERT ON requests` | Baris `work_items` (`type = 'request'`, `global_status = 'draft'`), lalu tautkan dua arah | `...000002:221-241` |
| 5 | RPC `create_work_item_from_decision(uuid)` | Baris `work_items` (`type = 'tindak_lanjut_rapat'`) dari keputusan rapat; idempoten | `...000002:281-302` |

> ⚠️ **Nomor 4 dibuat terlalu dini.** Request berstatus `draft` sudah melahirkan pekerjaan. §5.2.4 meminta pembuatan terjadi **saat request diajukan**. Akibatnya di `sksks`: setiap draft yang tidak jadi diajukan meninggalkan pekerjaan hantu.
>
> ⚠️ **Nomor 5 tidak memeriksa izin.** Fungsi ini `grant execute ... to authenticated` (`...000003_rls.sql:134`) dan isinya tidak memanggil satu pun penolong izin. Setiap anggota aktif bisa membuat pekerjaan dari keputusan rapat mana pun, termasuk rapat divisi yang bukan miliknya.

---

## 6. Notifikasi

Enam sumber, semuanya menulis langsung ke tabel `notifications` lewat trigger `SECURITY DEFINER`.

| Pemicu | Penerima | Judul | `kind` |
|---|---|---|---|
| `AFTER INSERT OR UPDATE OF primary_pic_id ON work_items` | PIC baru | Anda ditetapkan sebagai PIC | `assignment` |
| sama | PIC lama (kecuali diri sendiri) | Anda tidak lagi menjadi PIC | `assignment` |
| `AFTER INSERT ON requests` | `assigned_pic_id` | Request baru untuk divisi Anda | `request` |
| `AFTER INSERT ON work_item_assignees` | Anggota terlibat baru (kecuali diri sendiri) | Anda ditambahkan sebagai anggota terlibat | `assignment` |
| `AFTER INSERT ON calendar_event_attendees` | Peserta (kecuali diri sendiri) | Undangan agenda: `<judul>` | `meeting_invite` |
| `AFTER UPDATE ON calendar_events` | Semua peserta (kecuali diri sendiri) | Agenda dibatalkan / Jadwal agenda diperbarui | `cancellation` / `reschedule` |
| `AFTER INSERT ON comments` | Setiap id di `mentioned_profile_ids` (kecuali diri sendiri) | Anda disebut dalam komentar | `mention` |

Berkas: `...000002:411-441`, `...18000001` (seluruh berkas), `...18000002:88-104`, `...17000003:85-130`, `...17000004` (seluruh berkas).

Dua celah:

- ⚠️ **Penghapusan anggota terlibat tidak memberi notifikasi.** Penambahan memberi. Jadi anggota bisa diam-diam dikeluarkan dari sebuah pekerjaan — persis kelas masalah yang migration `pic_reassign_notify` perbaiki untuk PIC, tapi tidak untuk assignee.
- ⚠️ **Request tanpa `assigned_pic_id` tidak memberi notifikasi ke siapa pun**, padahal `target_division_id` diketahui dan wajib ada. Permintaan bisa masuk tanpa satu orang pun di divisi tujuan mengetahuinya.

---

## 7. Audit

### `log_activity` — ✅ dengan dua catatan

`...000002_functions_triggers.sql:345-376`, `AFTER INSERT OR UPDATE OR DELETE`, pada **12 tabel**:

```
work_items · requests · programs · meetings · letters · budgets
transactions · partners · inventory_items · content_items
creative_requests · profiles
```

Menyimpan `actor_id`, `action` (`insert`/`update`/`delete`), `entity_type`, `entity_id`, `before_data`, `after_data` sebagai `jsonb`.

Pengamanannya benar dan patut dipertahankan:

- `activity_logs` **hanya punya policy SELECT**, untuk owner/co-owner (`...000003_rls.sql:115`)
- Tidak ada policy insert/update/delete — hanya trigger yang bisa menulis
- `revoke execute on function public.log_activity() from authenticated` (`...000003_rls.sql:130`)

**Yang belum tercakup:** 31 tabel tidak diaudit, termasuk `calendar_events`, `milestones`, `member_dues`, `member_payments`, `comments`, `attachments`, `announcements`, `feedback`, `shipments`, `trips`, dan seluruh tabel relasi.

❌ **Pembacaan data sensitif tidak dicatat sama sekali.** Keputusan 39 meminta audit mencatat **pembacaan** keuangan, persuratan, dan masukan privat — bukan hanya perubahan. Ini menambah satu penulisan database di setiap pembacaan sensitif, dan harus diperhitungkan di desain tabel audit.

---

## 8. Versioning

### `save_record_version` — ⚠️

`...000002_functions_triggers.sql:381-406`, `BEFORE UPDATE`, pada **8 tabel**: 7 di berkas itu (`work_items`, `requests`, `programs`, `meetings`, `letters`, `budgets`, `partners`) plus `calendar_events` (`...17000003:78-80`).

Menyimpan `to_jsonb(old)` — yaitu **keadaan sebelum perubahan** — ke `record_versions` dengan `version_number = max + 1` per `(entity_type, entity_id)`.

Dua masalah:

1. ⚠️ **Balapan.** `select coalesce(max(version_number),0) + 1` dijalankan tanpa kunci, dan **tidak ada unique constraint** pada `(entity_type, entity_id, version_number)`. Dua pembaruan bersamaan menghasilkan `version_number` yang sama, dan riwayatnya jadi tidak bisa diurutkan.
2. ⚠️ **Tanpa trigger INSERT.** Versi 1 baru tercatat saat pembaruan pertama, dan isinya adalah keadaan awal. Artinya keadaan awal tidak pernah punya barisnya sendiri — memulihkan ke versi 1 berarti membaca `before_data` dari baris versi 1.

> Ini **bukan** optimistic locking. Kolom `version` yang diminta §7.16 tidak ada di tabel mana pun.

---

## 9. Soft delete & arsip

### `enforce_soft_delete_permission` — ⚠️ tidak merata

`...000002_functions_triggers.sql:124-146` — mengubah `deleted_at` hanya boleh owner/co-owner. Terpasang pada **15 tabel**: 14 di daftar berkas itu, plus `calendar_events` (`...17000003:74-76`).

| | Jumlah |
|---|---|
| Tabel punya kolom `deleted_at` | **19** |
| Tabel punya penjaga izinnya | **15** |
| **Tabel punya `deleted_at` tanpa penjaga** | **4** — `transactions`, `comments`, `attachments`, `milestones` |

Keempatnya berarti: **setiap anggota aktif boleh memindahkan dan memulihkan baris itu dari recycle bin**, sementara tabel lain tidak. `transactions` adalah tabel keuangan.

### `archived_at` — ❌ tanpa aturan apa pun

Kolom ini ada di **17 tabel** (`programs`, `work_items`, `requests`, `meetings`, `letters`, `budgets`, `transactions`, `internal_activities`, `content_items`, `creative_requests`, `inventory_items`, `shipments`, `trips`, `partners`, `announcements`, `milestones`, `calendar_events`).

Tidak ada trigger, tidak ada policy, tidak ada aturan izin. Siapa pun boleh mengubahnya, dan tidak ada satu pun kode yang mendefinisikan apa artinya "diarsipkan" berbeda dari "dihapus". Padahal `global_status` juga punya nilai `diarsipkan`.

**Tiga mekanisme penyembunyian yang saling tumpang tindih** (`deleted_at`, `archived_at`, `global_status = 'diarsipkan'`) dengan aturan yang hanya jelas di satu di antaranya. Fase 1 harus memutuskan mana yang bertahan.

---

## 10. Hak akses

### Penolong izin

`...000002:8-32` dan `...18000002:13-21`.

| Fungsi | Isi | Catatan |
|---|---|---|
| `current_profile_id()` | `auth.uid()` | |
| `current_app_role()` | `profiles.role` | `SECURITY DEFINER` |
| `is_owner()` | `role = 'owner'` | |
| `is_owner_or_coowner()` | `role in ('owner','co_owner')` | |
| `is_active_member()` | **`status <> 'nonaktif'`** | ⚠️ temuan §5.2.6 — `invited` ikut aktif |
| `is_division_lead(p_division_id)` | `division_id` sama **dan** `division_role in ('kadiv','wakadiv')` | Ditambahkan belakangan |

### Matriks

| Kelompok tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `divisions`, `clusters`, `subunits` (3) | semua terautentikasi | owner/co-owner | owner/co-owner | owner/co-owner |
| `system_settings` (1) | semua terautentikasi | owner/co-owner | owner/co-owner | owner/co-owner |
| `profiles` (1) | semua terautentikasi | — (trigger saja) | **diri sendiri** atau owner/co-owner | — (dinonaktifkan lewat `status`) |
| **"Open Collaboration" (32)** | **anggota aktif** | **anggota aktif** | **anggota aktif** | owner/co-owner |
| `feedback` (1) | `is_private = false` atau penulis atau owner/co-owner | anggota aktif | penulis atau owner/co-owner | owner/co-owner |
| `notifications` (1) | penerima sendiri | — (trigger saja) | penerima sendiri | penerima sendiri |
| `activity_logs` (1) | **owner/co-owner** | — (trigger saja) | — | — |
| `record_versions` (1) | anggota aktif | — (trigger saja) | — | — |
| `calendar_events` (1) | anggota aktif | anggota aktif | anggota aktif | owner/co-owner |
| `calendar_event_attendees` (1) | anggota aktif | anggota aktif | anggota aktif | anggota aktif |

**32 tabel "Open Collaboration"** — inilah temuan nomor 1 di Ringkasan:

```
programs · program_members · work_items · work_item_assignees
work_item_checklists · work_item_dependencies · work_item_status_history
requests · meetings · meeting_participants · meeting_decisions · letters
member_dues · member_payments · budgets · budget_items · transactions
internal_activities · content_items · creative_requests
inventory_items · inventory_movements · shipments · trips
partners · partner_followups · sponsor_benefits · announcements
comments · attachments · milestones · exports
```

### Izin yang ditegakkan trigger, bukan RLS

Empat aturan ini tidak bisa dinyatakan sebagai policy, jadi ditulis sebagai trigger:

| Aturan | Berkas |
|---|---|
| Ubah `role`/`status` profil → owner/co-owner; owner tidak bisa diturunkan orang lain; owner tidak bisa menurunkan dirinya sendiri; **pengecualian** `invited → active` selama role tetap | `...000002:99-119`, diperbaiki di `...17000001` |
| Ganti `primary_pic_id` → owner/co-owner, kadiv/wakadiv divisi terkait, atau PIC yang sedang menjabat; **mengisi PIC ke pekerjaan yang belum punya PIC bebas untuk siapa saja** | `...18000002:30-50` |
| Ubah `status` request → owner/co-owner atau kadiv/wakadiv **divisi tujuan** | `...18000002:57-69` |
| Hapus assignee → assignee itu sendiri, owner/co-owner, atau kadiv/wakadiv divisi terkait. **Menambah assignee bebas.** | `...18000002:77-83` |

> **Pelajaran dari `fix_profile_confirm_trigger`.** Trigger `protect_profile_privileges` memblokir alur aktivasi Supabase sendiri, karena proses itu berjalan **tanpa `auth.uid()`** — bukan dipicu sesi pengguna. Trigger menyimpulkan itu sebagai upaya mengubah privilege tanpa izin, lalu menggagalkan **seluruh** konfirmasi email.
>
> Pelajaran yang harus dibawa: **aturan izin yang membaca identitas pemanggil akan salah menilai penulisan yang dimulai sistem.** Di backend baru, penulisan semacam itu harus punya jalur eksplisit, bukan menumpang jalur pengguna.

### Penyimpanan berkas

`...16000001_storage.sql`:

| Bucket | Baca | Tulis | Hapus |
|---|---|---|---|
| `attachments` (privat) | anggota aktif | anggota aktif | owner/co-owner |
| `avatars` (publik) | siapa saja | folder milik sendiri | folder milik sendiri |

---

## 11. Enum & nilai status

20 tipe enum. Seluruhnya harus diputuskan ulang satu per satu — nilai yang dipertahankan, diganti nama, atau dibuang.

| Enum | Nilai | Jml |
|---|---|---|
| `app_role` | `owner`, `co_owner`, `member` — **tanpa `kadiv`** | 3 |
| `member_status` | `invited`, `active`, `nonaktif` | 3 |
| `global_status` | `draft`, `diajukan`, `disetujui`, `on_progress`, `need_review`, `on_hold`, `done`, `ditolak`, `diarsipkan` | 9 |
| `work_item_type` | `task`, `request`, `tindak_lanjut_rapat`, `kebutuhan_program`, `kebutuhan_divisi`, `milestone`, `tindak_lanjut_evaluasi`, `kebutuhan_subunit` | 8 |
| `request_type` | `persuratan`, `rab_keuangan`, `desain`, `editing_video`, `publikasi`, `dokumentasi`, `pengadaan_barang`, `peminjaman_barang`, `transportasi`, `cargo`, `konsumsi`, `sponsorship`, `kebutuhan_program`, `bantuan_umum` | 14 |
| `request_status` | `draft`, `diajukan`, `diterima`, `on_progress`, `need_review`, `done`, `perlu_klarifikasi`, `on_hold`, `ditolak` | 9 |
| `letter_status` | `diajukan`, `perlu_dilengkapi`, `terverifikasi`, `penyusunan_draft`, `review`, `menunggu_ttd`, `siap_dikirim`, `terkirim`, `selesai` | 9 |
| `budget_status` | `draft`, `diajukan`, `review`, `perlu_revisi`, `disetujui`, `berjalan`, `selesai` | 7 |
| `content_status` | `ide`, `brief`, `copywriting`, `request_visual`, `produksi`, `review`, `terjadwal`, `tayang`, `evaluasi` | 9 |
| `creative_status` | `request_masuk`, `brief`, `antrean`, `produksi`, `draft`, `review`, `revisi`, `final`, `done` | 9 |
| `partner_status` | `prospek`, `belum_dihubungi`, `kontak_awal`, `follow_up`, `negosiasi`, `proposal_dikirim`, `menunggu_jawaban`, `disetujui`, `mou_kontrak`, `kontraprestasi`, `done` | 11 |
| `program_status` | `ide`, `riset`, `validasi`, `perancangan`, `siap`, `on_progress`, `monitoring`, `evaluasi`, `done` | 9 |
| `calendar_event_type` | `weekly_meeting`, `rapat_seluruh_tim`, `rapat_harian`, `rapat_divisi`, `rapat_klaster`, `rapat_subunit`, `audiensi`, `kegiatan_lapangan`, `lainnya` | 9 |
| `rsvp_status` | `hadir`, `mungkin`, `tidak_hadir`, `belum_merespons` | 4 |
| `priority_level` | `mendesak`, `tinggi`, `sedang`, `rendah` | 4 |
| `kkn_phase` | `pra_kkn`, `kkn`, `pasca_kkn` | 3 |
| `letter_direction` | `masuk`, `keluar` | 2 |
| `transaction_type` | `pemasukan`, `pengeluaran` | 2 |
| `dues_status` | `belum_bayar`, `cicilan`, `lunas` | 3 |
| `inventory_movement_type` | `masuk`, `keluar`, `dipakai`, `dipinjam`, `kembali`, `pindah_lokasi`, `rusak_hilang` | 7 |
| `meeting_type` | `rapat_besar`, `rapat_divisi`, `rapat_koordinasi`, `evaluasi`, `lainnya` | 5 |
| `evaluation_visibility` | `anonim`, `nama` | 2 |

> **`app_role` tidak punya `kadiv`.** Peran itu masuk belakangan lewat kolom terpisah `profiles.division_role` (`kadiv`/`wakadiv`) di `...18000002:10-11` — **bukan** sebagai anggota enum role. Jadi `sksks` sebenarnya punya lima tingkat: owner, co_owner, kadiv, wakadiv, member.
>
> **Sudah diputuskan — §14.1.** Sistem baru memakai kelimanya (`owner`, `co_owner`, `division_head`, `division_deputy`, `member`); wakil kepala divisi tidak lagi hilang. Catatan di atas tetap dipertahankan sebagai temuan, bukan sebagai pertanyaan terbuka.

### Master data awal

`...00000004_seed.sql`:

- **Divisi (6):** `sekbend` Sekretaris & Bendahara · `psdm` · `humpub` Humas & Publikasi · `medkre` Media Kreatif · `ops` Operasional · `sponsor` Sponsorship
- **Klaster (5):** `saintek`, `soshum`, `agro`, `medika`, `lintas`
- **Subunit (2):** `kaiwatu`, `werwaru`
- **Pengaturan:** `kkn_period` = **2026-12-19 → 2027-02-06**, zona `Asia/Jakarta`, mata uang `IDR`, target kas anggota 4.000.000, target dana 100.000.000, target anggota 25

> Tanggal di `kkn_period` adalah **satu-satunya definisi periode** yang ada di seluruh sistem — dan ia hidup di dalam `jsonb`, bukan sebagai kolom. Keputusan 20 meminta kolom `periode` di entitas utama supaya data lintas periode KKN tidak tercampur.

---

## 12. Yang belum ada

Yang diminta PRD tetapi tidak pernah ada di `sksks`. Semuanya harus dibuat baru.

| Yang diminta | Acuan | Catatan |
|---|---|---|
| Kolom `version` (optimistic locking) | §7.16, §8.1 | Tidak ada di tabel mana pun |
| Kolom `periode` | Keputusan 20 | Hanya ada `kkn_phase` dan `kkn_period` di `system_settings` |
| Tabel transisi status | §5.2.1, §5.2.2, §9.1 | Tidak ada sama sekali |
| `profiles.google_sub` | §7.8.2 | Nullable, unik bila terisi |
| `profiles.must_change_password` | §7.8.6, §6.5 | Tidak ada |
| `refresh_tokens` | §6.6 | Sesi ditangani Supabase Auth |
| `idempotency_keys` | §7.10 | Tidak ada |
| Tabel penyimpanan rate limit | Keputusan 43 | Tidak ada |
| Penanda konflik pada `requests` | §5.2.3 | Tidak ada |
| Audit pembacaan data sensitif | Keputusan 39 | Tidak ada |
| Pemulihan akun nonaktif | §7.8.6 | Tidak ada jalur |
| Pencabutan sesi saat password berubah / akun dinonaktifkan | §6.3 | Tidak ada — Supabase Auth tidak mendukungnya dari sisi tabel |

**Yang sudah ada dan layak dipertahankan:** struktur `activity_logs` + `record_versions` beserta pengamanannya, pola trigger `SECURITY DEFINER` + `revoke execute`, pemisahan `deleted_at` dari `archived_at`, `comments.mentioned_profile_ids` sebagai `uuid[]`, pola soft delete 15 tabel, dan `system_settings` sebagai `jsonb` berkunci.

---

## 13. Bug & inkonsistensi yang ditemukan

Daftar ini bukan untuk diperbaiki di `sksks` — melainkan supaya **tidak ikut terbawa** ke skema baru.

| # | Temuan | Bukti |
|---|---|---|
| 1 | `is_active_member()` memakai `status <> 'nonaktif'` sehingga `invited` terhitung aktif | `...000002:29-32` |
| 2 | Empat skema nomor memakai `nextval()` → bercelah | `...000001:179,261,390`; `...000002:314,333` |
| 3 | `program_number` `not null unique` tanpa penghasil — aturannya hilang | `...000001:134` — **terjawab §14.5** |
| 4 | Validasi request hanya `BEFORE UPDATE`; INSERT berstatus `done` lolos | `...000002:217` |
| 5 | `perlu_klarifikasi` dilebur menjadi `need_review` saat sinkronisasi | `...000002:258` |
| 6 | Sinkronisasi hanya satu arah | `...000002:274-276` — **terjawab §14.5** |
| 7 | Pekerjaan terhubung dibuat saat request `draft`, bukan saat diajukan | `...000002:239-241` |
| 8 | `save_record_version` menghitung `max+1` tanpa kunci dan tanpa unique constraint | `...000002:386-388` |
| 9 | `transactions`, `comments`, `attachments`, `milestones` punya `deleted_at` tanpa penjaga izin | `...000001` vs `...000002:138-142` |
| 10 | `archived_at` di 17 tabel tanpa aturan apa pun | — |
| 11 | Penghapusan assignee tidak memberi notifikasi; penambahan memberi | `...18000002:88-104` — **terjawab §14.5** |
| 12 | Request tanpa `assigned_pic_id` tidak memberi notifikasi ke siapa pun | `...000002:431` — **terjawab §14.5** |
| 13 | `create_work_item_from_decision` tidak memeriksa izin, padahal `grant execute` ke `authenticated` | `...000002:281-302`; `...000003:134` |
| 14 | `on_hold` dipenuhi nilai karangan, bukan isian manusia | `...000002:266-267` — **terjawab §14.5** |
| 15 | Tiga mekanisme penyembunyian tumpang tindih (`deleted_at`, `archived_at`, `status = 'diarsipkan'`) | — **terjawab §14.2** |
| 16 | Satu perubahan status request memicu enam penulisan database | `...000002` (rantai trigger) |
| 17 | `letters.letter_number` nullable padahal selalu diisi trigger | `...000001:344` |
| 18 | `work_item_assignees` di grup "open collaboration" tapi policy DELETE-nya ditimpa belakangan — urutan pemuatan jadi menentukan | `...000003:89` vs `...18000002:77-83` |
| 19 | `app_role` tanpa `kadiv`, peran itu hidup di kolom terpisah `division_role` | `...000001:10`; `...18000002:10-11` |
| 20 | `wakadiv` tidak punya padanan di model peran baru | `PRD-REVAMP.md` §7.9 — **terjawab §14.1** |

---

## 14. Keputusan Fase 1 yang sudah diambil

### 14.1 Wakil kepala divisi dipertahankan sebagai peran kelima

**Menyimpang dari `PRD-REVAMP.md` §7.9 dan `PRD-BACKEND.md` §9**, yang keduanya menyebut empat peran. Keputusan ini mengalahkan dokumen, jadi **PRD yang harus disusulkan, bukan kodenya.** Sudah disusulkan: keputusan 46 di `PRD-REVAMP.md` §4.6.

Alasannya ada di §11: `sksks` tidak pernah memuat peran dalam satu kolom. `app_role` hanya berisi tiga nilai, sementara kepala divisi hidup di kolom terpisah `profiles.division_role` berisi `kadiv` dan `wakadiv`. Sistem yang berjalan punya lima tingkat, dan `wakadiv` salah satunya.

Menyatukannya ke `kadiv` membuang informasi yang sudah ada di data, dan tidak bisa dikembalikan setelahnya. Maka `wakadiv` menjadi peran kelima **dengan wewenang yang untuk sekarang sama persis dengan `kadiv`** — persis seperti `is_division_lead()` di `sksks` yang memperlakukan keduanya identik. Yang didapat bukan wewenang berbeda hari ini, melainkan kemampuan membedakannya nanti tanpa migrasi data.

Diterapkan di `src/common/types/roles.ts` dan `src/policy/matrix.ts`, dengan nama peran baru hasil keputusan 47 (§14.3): `kadiv` → `division_head`, `wakadiv` → `division_deputy`. `division_deputy` diletakkan di antara `division_head` dan `member` pada urutan kekuasaan.

> **Yang paling mudah hilang nanti:** policy yang butuh melihat baris — "kepala divisi **baris ini**". Di tabel matriks `division_deputy` terlihat jelas karena barisnya memuat daftar peran; di fungsi `canEditWorkItem` dan sejenisnya di paket `@samudrakarsa/shared`, ia tidak. Fungsi yang hanya memeriksa `division_head` akan diam-diam mencabut wewenang seluruh wakil kepala divisi, tanpa error dan tanpa jejak. Setiap fungsi di paket itu perlu satu test beraktor `division_deputy`.

### 14.2 Dua mekanisme penyembunyian, dipisahkan dengan tegas

`sksks` punya tiga mekanisme yang tumpang tindih (§9). Skema baru memakai **dua**, masing-masing dengan satu makna:

| Mekanisme | Makna | Izin |
|---|---|---|
| `deleted_at` | Sampah. Baris ada di recycle bin dan bisa dipulihkan. | Owner/co-owner saja — penjaga izin yang sudah ada di 15 tabel dipertahankan |
| `archived_at` | Disembunyikan dari daftar aktif, tetapi bukan sampah. Baris tetap utuh dan biasa dibaca. | Perlu ditentukan per modul di Fase 3 |
| ~~nilai status `archived`~~ | **Dibuang.** | — |

Nilai `diarsipkan` dikeluarkan dari enum status. Sebelumnya ada dua cara menyatakan "disembunyikan" yang berbeda (`archived_at` dan nilai status), dan tidak ada satu pun kode yang mendefinisikan perbedaannya.

### 14.3 Bahasa penyimpanan: Inggris, satu bahasa per lapisan

`sksks` mencampur dua bahasa dalam satu baris — tabelnya Inggris (`work_items`, `letters`), nilai enum-nya Indonesia (`diajukan`, `menunggu_ttd`). Untuk membacanya seseorang harus menguasai keduanya.

Skema baru memakai **Inggris di lapisan penyimpanan dan kontrak**, Indonesia di lapisan tampilan. Batasnya:

| Lapisan | Bahasa | Contoh |
|---|---|---|
| Nama tabel & kolom | Inggris | `work_items`, `deleted_at`, `division_id` |
| Nama & **nilai** enum | Inggris | `submitted`, `need_clarification` |
| Nilai peran | Inggris | `division_head`, `division_deputy` |
| Kunci JSON API | Inggris | `{"status": "submitted"}` |
| Identifier TypeScript | Inggris | `canEditWorkItem()` |
| Komentar & dokumen | Indonesia | berkas ini |
| Pesan yang dilihat pengguna | Indonesia | "Anda tidak berwenang mengubah pekerjaan ini." |
| Label UI & dictionary | Indonesia (keputusan 15) | "Diajukan" |

**Yang tidak boleh diterjemahkan:** nama orang, nama divisi, nama desa, sebutan jabatan resmi, dan **isi nomor dokumen** — `<JENIS>` di `SRT-<JENIS>-YYYY-#####` tetap Indonesia, karena nomor surat adalah artefak organisasi, bukan kosakata sistem.

**Konsekuensi untuk §11:** seluruh nilai status dan peran yang didaftar di sana harus ditulis ulang dalam bahasa Inggris saat skema dibangun. Tabel di §11 tetap apa adanya sebagai catatan apa yang **ada di `sksks`** — ia deskriptif, bukan preskriptif.

> **Sudah dikerjakan.** Kosakatanya ada di `src/database/schema/enums.ts` (22 enum, 142 nilai) dan pemetaan lengkapnya di `docs/KOSAKATA-ENUM.md`, terperiksa nilai per nilai terhadap berkas ini. §11 tetap dipertahankan sebagai catatan sistem lama.

> **Kenapa ini penting untuk Fase 1, bukan sekadar kerapian.** Tabel §11 adalah bahan mentah pembangunan enum. Kalau ia dibaca sebagai "nilai yang akan dipakai", maka enum baru akan mewarisi kosakata campuran `sksks` — dan inventaris Fase 1 kehilangan separuh gunanya. Yang diwarisi adalah **aturannya** (status apa ada, transisi apa sah), bukan **ejaannya**.

### 14.4 Temuan §13 yang sudah tertutup

Sebagian besar dari 20 temuan tidak perlu diputuskan lagi: PRD sudah menjawabnya, atau jawabannya mengikuti begitu skema lama dibuang. Daftar ini menutupnya secara eksplisit supaya tidak ada yang dibuka ulang tanpa alasan.

| # | Temuan | Aturan di sistem baru |
|---|---|---|
| 1 | `invited` terhitung aktif | Anggota aktif adalah `status = 'active'`. `invited` **bukan** anggota aktif — ia belum punya akses apa pun |
| 2 | Empat skema nomor bercelah | Tabel penghitung + `SELECT ... FOR UPDATE` (`PRD-BACKEND.md` §8.2). Tidak ada `nextval()` untuk nomor dokumen |
| 4 | Validasi request hanya `BEFORE UPDATE` | Validasi berjalan pada INSERT **dan** UPDATE, seperti yang sudah benar di pekerjaan |
| 5 | `perlu_klarifikasi` dilebur | `need_clarification` berdiri sendiri, tidak pernah dipetakan ke `need_review` |
| 7 | Pekerjaan dibuat saat `draft` | Pekerjaan terhubung dibuat saat request **diajukan**, bukan saat disimpan sebagai draft |
| 8 | `max+1` tanpa kunci | `unique (record_type, record_id, version_number)` + penghitungan berkunci. Duplikat ditolak database, bukan diharapkan tidak terjadi |
| 9 | Empat tabel tanpa penjaga izin hapus | Penjaga izin `deleted_at` dipasang **merata** — tidak ada tabel yang punya kolomnya tanpa aturannya |
| 13 | Fungsi pembuat entitas tanpa pemeriksaan izin | Pembuatan entitas otomatis pindah ke lapisan aplikasi. Fungsi database tidak lagi `grant execute` ke klien |
| 15 | Tiga mekanisme penyembunyian | Dua saja — §14.2 |
| 16 | Enam penulisan database per perubahan status | Rantai trigger dipindahkan ke satu transaksi di service. Yang tersisa di database hanya yang benar-benar harus di sana (`PRD-BACKEND.md` §8.3) |
| 17 | `letter_number` nullable | `not null`. Kolom yang selalu diisi tidak boleh mengizinkan kosong |
| 18 | Urutan pemuatan menentukan policy | Hanya ada **satu** sumber policy: matriks di backend. Tidak ada penimpaan di database, jadi tidak ada urutan yang perlu dijaga |
| 19 | `app_role` tanpa kepala divisi | Lima peran — §14.1 |
| 20 | Wakil kepala divisi hilang | Lima peran — §14.1 |

Tersisa **lima** temuan yang benar-benar butuh keputusan domain — **3**, **6**, **11**, **12**, dan **14**. Kelimanya sudah diputuskan, di §14.5. Temuan **10** (`archived_at`) bukan tertunda karena belum diputuskan, melainkan karena aturannya memang berbeda per modul; ia dijadwalkan ke Fase 3 bersama modulnya.

Dengan begitu **seluruh 20 temuan §13 sudah tertutup**: 14 di tabel di atas, 5 di §14.5, dan 1 dijadwalkan.

### 14.5 Lima temuan terakhir

| # | Keputusan | Alasan singkat |
|---|---|---|
| 3 | **Program memakai penomoran yang sama dengan dokumen lain** — tabel penghitung yang sama, format `PRG-YYYY-#####` | Kolom wajib-unik yang tidak dihasilkan siapa pun adalah aturan yang hilang. Menghasilkan sendiri lebih murah daripada mewajibkan manusia mengisi nomor unik dengan benar |
| 6 | **Sinkronisasi dua arah; konflik menghalangi, bukan sekadar dicatat** | Status request adalah dasar keputusan divisi lain. Kalau satu sisi menimpa sisi lain tanpa ada yang memutuskan, pihak yang kalah tidak akan pernah tahu — dan itu baru ketahuan saat sudah terlambat |
| 11 | **Pencabutan assignee memberi notifikasi kepada yang dicabut** | Yang dicabut mungkin masih merasa bertanggung jawab. Penambahan sudah memberi tahu; ketiadaan notifikasi pencabutan adalah kesenjangan, bukan pilihan |
| 12 | **Request tanpa PIC memberi notifikasi kepada kepala divisi tujuan** | Request yang tidak punya PIC tidak akan dikerjakan siapa pun. Ini satu-satunya jenis request yang tidak memberi tahu siapa pun — dan justru yang paling perlu |
| 14 | **`on_hold` dipertahankan, hanya boleh diisi manusia, dengan `hold_reason` wajib** | Status yang tidak pernah dipilih siapa pun tidak menyampaikan apa pun. Tetapi pekerjaan memang kadang berhenti karena faktor luar; tanpa status untuk itu ia menumpuk di `on_progress` dan daftar berjalan kehilangan maknanya. Alasan wajib adalah yang membedakan "tertahan karena sesuatu" dari "tidak ada yang mengerjakan" |

**Konsekuensi ke skema yang harus dibawa saat migrasi ditulis:**

- `document_counters.document_type` menerima `program` sebagai jenis yang sah, di samping pekerjaan, request, RAB, inventaris, surat
- `work_items` dan `requests` masing-masing mendapat kolom penanda konflik, dan transisi status **menolak** selama penanda itu menyala
- `work_items` mendapat `hold_reason`, dan tidak ada satu pun jalur otomatis di seluruh sistem yang boleh memasang `on_hold`
- Notifikasi bertambah dua sumber: pencabutan assignee, dan request masuk tanpa PIC

**Keputusan 51** di `PRD-REVAMP.md` §4.6. Detail 48 dan 49 ada di sana juga.



---

## 15. Langkah berikutnya

Fase 1 belum selesai. Urutannya, dan masing-masing bergantung pada yang di atasnya:

1. ~~**Putuskan sisa 20 temuan di §13**~~ — **selesai.** 14 tertutup di §14.4, 5 di §14.5, dan 1 (temuan 10, `archived_at`) dijadwalkan ke Fase 3. Tidak ada temuan yang tersisa terbuka.
2. ~~**Susulkan PRD**~~ — **sudah dikerjakan.** `PRD-REVAMP.md` §4.6 (keputusan 46 & 47), §7.9 (matriks lima kolom), §9.3 (diagram lima peran), dan `PRD-BACKEND.md` §8.5 (bahasa skema), §11, serta `PRD-FRONTEND.md` sudah sejalan dengan kode. Yang **tidak** diubah: kutipan `sksks` di `PRD-REVAMP.md` §5.1.1 — di sana `kadiv` adalah nama kolom yang benar-benar ada di sistem lama, bukan kosakata sistem baru.
3. **Skema baru sebagai migrasi bernomor** — termasuk tabel penghitung §8.2, tabel transisi, kolom `version` dan `periode`, dan sebelas tabel yang belum ada (§12). **Seluruh nama dan nilai enum dalam bahasa Inggris** (§14.3).
   - [x] Kosakata enum — `src/database/schema/enums.ts` + `docs/KOSAKATA-ENUM.md`
   - [x] Organisasi & identitas — `0000_organization.sql` (8 tabel: `periods`, `divisions`, `clusters`, `subunits`, `profiles`, `system_settings`, `programs`, `program_members`)
   - [x] Domain kerja — pekerjaan, request, surat, keuangan, konten, mitra, inventaris
   - [x] Kolaborasi & administrasi — rapat, kalender, pengumuman, notifikasi, lampiran
   - [x] Sistem — auth, idempotency, transisi status, rate limit, audit
   - [x] Tabel penghitung `document_counters` — enam jenis dokumen, satu format
   - [x] Trigger `updated_at` — `src/database/sql/updated_at_trigger.sql`

   Berkas skema, dan apa yang ada di dalamnya:

   | Berkas | Tabel |
   |---|---|
   | `enums.ts` | 24 tipe enum, 155 nilai |
   | `_columns.ts` | potongan kolom berulang — `id`, `created_at`, `updated_at`, `version`, `archived_at`/`deleted_at` |
   | `organization.ts` | `periods`, `divisions`, `clusters`, `subunits`, `profiles`, `system_settings`, `programs`, `program_members` |
   | `work.ts` | `work_items`, `requests`, `work_item_assignees`, `work_item_checklists`, `work_item_dependencies`, `work_item_status_history`, `milestones` |
   | `letters.ts` | `letters` |
   | `finance.ts` | `member_dues`, `member_payments`, `budgets`, `budget_items`, `transactions` |
   | `content.ts` | `content_items`, `creative_requests` |
   | `partners.ts` | `partners`, `partner_followups`, `sponsor_benefits` |
   | `operations.ts` | `inventory_items`, `inventory_movements`, `shipments`, `trips` |
   | `internal.ts` | `internal_activities`, `feedback` |
   | `collaboration.ts` | `meetings`, `meeting_participants`, `meeting_decisions`, `calendar_events`, `calendar_event_attendees`, `announcements`, `comments`, `attachments`, `notifications` |
   | `system.ts` | `activity_logs`, `record_versions`, `status_transitions`, `refresh_tokens`, `idempotency_keys`, `rate_limit_counters`, `exports` |
   | `counters.ts` | `document_counters` + bentuk nomor tiap jenis dokumen |

   Tiga hal yang **tidak** dikerjakan di grup ini, dan alasannya:

   - **Validasi per status untuk surat, anggaran, konten, kreatif, mitra,
     program, dan inventaris.** `sksks` tidak punya satu pun (inventaris §2),
     jadi aturannya harus **ditulis**, bukan disalin. Tempatnya di Fase 3–4
     bersama tabel transisi, supaya tombol di layar dan pemeriksaan di backend
     berasal dari satu definisi. Menambahkannya sekarang berarti mengarang
     aturan lalu memberlakukannya sebelum ada yang menyetujuinya.
   - **Seluruh dua belas butir §12 "Yang belum ada".** Sepuluh di antaranya
     berwujud di skema: `version` (`_columns.ts`), `periods`,
     `status_transitions`, `profiles.google_sub`, `profiles.must_change_password`,
     `refresh_tokens`, `idempotency_keys`, `rate_limit_counters`, penanda
     konflik `sync_conflict_at` pada `work_items` dan `requests`, dan
     `activity_logs.action` yang menerima `read`. Dua sisanya — pemulihan akun
     nonaktif dan pencabutan sesi saat kata sandi berubah — **tidak menuntut
     tabel apa pun**: keduanya jalur di lapisan aplikasi yang memakai kolom
     yang sudah ada (`profiles.status`, `refresh_tokens.revoked_at`).

   Tentang trigger `updated_at`, yang tadinya ada di daftar ini: ia **sudah
   dikerjakan** — lihat butir 6 di bawah.

4. ~~**Kontrak OpenAPI 3.1 ditulis lebih dulu**~~ — **selesai.**
   `docs/openapi.yaml`, OpenAPI 3.1.0. Cakupannya sengaja berhenti di fondasi
   dan dua domain pertama: `health`, `auth`, `work-items`, `requests`.

   Sembilan belas modul sisanya **tidak** ditulis di sini, dan itu keputusan,
   bukan kelalaian: kontrak yang menebak bentuk endpoint yang aturannya belum
   ada akan menjadi kontrak yang harus dilanggar saat modulnya dibangun.
   Setiap fase menambahkan bagiannya ke berkas ini **sebelum** modulnya
   dikerjakan — tabel pembagiannya ada di kepala berkas itu.

   Yang sudah diputuskan di dalamnya, dan yang tadinya belum:

   - **`security` di tingkat akar**, sehingga operasi baru tertutup secara
     bawaan dan yang publik harus menulis `security: []` secara eksplisit.
     Bentuknya sengaja mencerminkan `APP_GUARD` + `@Public()`: lupa berarti
     tertutup, bukan terbuka.
   - **`PATCH` tidak menerima `status`** — baik pada pekerjaan maupun
     permintaan. Perpindahan status hanya lewat
     `POST /{resource}/{id}/transitions`. Satu operasi bermakna, satu jalur.
   - **`availableTransitions` disertakan pada setiap `GET`** satu baris.
     Ini yang membuat state machine tidak bisa lagi hidup hanya di frontend
     (§5.2.2) — frontend tidak punya pilihan selain memakai daftar dari
     backend.
   - **`If-Match` untuk optimistic locking, `Idempotency-Key` untuk penulisan
     ulang.** Keduanya header, bukan field body.
   - **`Request.targetDivisionId` wajib**, dan itulah yang menentukan siapa
     yang boleh memindahkan statusnya.
   - **`need_clarification` dan `need_review` tetap dua status berbeda** di
     `RequestStatus` (temuan #5).
   - **`diarsipkan` tidak ada di `WorkStatus`** — penyembunyian baris adalah
     urusan kolom `archivedAt`/`deletedAt`, bukan urusan status (§14.2).

   Satu ketegangan yang **dinyatakan terus terang di kepala berkas**:
   `PRD-BACKEND.md` §11 menetapkan dokumentasi yang disajikan dihasilkan dari
   skema Zod, sedangkan berkas ini ditulis tangan. Keduanya benar pada
   waktunya masing-masing. Berkas ini adalah **kontrak yang ditulis lebih
   dulu**; setelah `@samudrakarsa/shared` ada (keputusan 37), Swagger
   dihidupkan dari skema Zod dan berkas ini berubah peran menjadi acuan yang
   harus **cocok** dengan keluaran generator — bukan sumbernya lagi.

5. ~~**Policy sebagai fungsi murni + matriks data**~~ — **selesai.**
   `src/policy/resource.ts` (tujuh fungsi murni) dan
   `src/policy/matrix.ts` (matriks peran sebagai data), diuji
   `src/policy/resource.spec.ts`.

   Matriks §10 dipakai sebagai **bahan**, bukan disalin — persis seperti yang
   diminta butir ini. Dua pengetatan yang diambil, keduanya karena §10
   melonggarkan:

   - **`member` hanya boleh mengajukan draft miliknya sendiri.** §7.9 menulis
     "hanya `draft→submitted`" tanpa menyebut pemilik draftnya. Draft yang
     bisa diajukan orang lain adalah cara mengirim permintaan atas nama orang
     lain tanpa ia tahu. Kalau kenyataannya sekretaris memang perlu mengajukan
     atas nama orang lain, **§7.9 yang diubah lebih dulu** — bukan fungsinya
     diam-diam.
   - **Konflik sinkronisasi menutup transisi bagi semua peran, termasuk
     `owner`** (keputusan 49). §10 tidak membicarakannya sama sekali.

   Satu invarian yang dijaga eksplisit: **`division_deputy` selalu sebaris
   dengan `division_head`.** Ini tempat paling mudah ia hilang — tabel peran
   memuatnya dengan jelas, tetapi fungsi baris-level memeriksa "apakah aktor
   kepala divisi **baris ini**", dan fungsi yang hanya memeriksa
   `division_head` akan diam-diam mencabut wewenang seluruh wakil kepala
   divisi, tanpa error dan tanpa jejak. Karena itu pemeriksaannya dipusatkan
   di `DIVISION_LEAD_ROLES`/`isDivisionLead()`, dan `resource.spec.ts` menguji
   **setiap** fungsi dengan aktor `division_deputy`.

   `resource.spec.ts` ada meskipun keputusan 7 menunda tes, dan itu bukan
   pertentangan: invarian di atas tidak bisa dipegang oleh komentar, dan §14.1
   memang menuntut uji tersebut.

   Satu pertanyaan desain yang **sengaja dibiarkan terbuka**, dan dicatat di
   `policy.guard.ts`: guard hanya melihat permintaan HTTP, sedangkan fungsi di
   `resource.ts` menerima **baris** yang baru dimuat service. Sampai itu
   dijawab, `PolicyGuard` menolak seluruh policy resource-scoped — endpoint
   yang belum dibangun menjadi mati, bukan terbuka. Pertanyaannya lebih baik
   dijawab sebelum handler pertama ditulis daripada setelah dua puluh handler
   menebak jawabannya masing-masing.

6. **Trigger `updated_at`** — `src/database/sql/updated_at_trigger.sql`.

   Diletakkan **di luar** `src/database/migrations/` dengan sengaja: ia bukan
   keluaran `drizzle-kit`, dan menaruhnya di sana akan membuat orang berikutnya
   mengira ia dihasilkan generator. Isinya idempoten, jadi boleh dijalankan
   berkali-kali, dan boleh juga disalin ke migrasi `--custom` supaya ikut
   tercatat di rantai migrasi. Keduanya sah; yang tidak boleh adalah tidak
   dijalankan sama sekali.

   Dua keputusan di dalamnya:

   - **Pemasangnya menelusuri katalog**, bukan daftar tabel yang ditulis
     tangan. Daftar tulisan tangan menjamin hal yang salah: tabel yang **paling
     baru** justru yang paling sering terlewat. `apply_updated_at_triggers()`
     mencari sendiri setiap tabel yang punya kolom `updated_at`, jadi tabel
     yang ditambahkan bulan depan ikut terjaga asalkan fungsinya dijalankan
     ulang.
   - **`FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW)`** — perbandingan baris,
     bukan sekadar `BEFORE UPDATE`. `UPDATE` yang tidak mengubah apa pun tidak
     menaikkan `updated_at`, sehingga "diubah" tetap berarti "isinya berubah".

   `EXECUTE` dicabut dari `PUBLIC` untuk fungsi pemasangnya (PostgreSQL
   memberikannya ke `PUBLIC` secara bawaan). `touch_updated_at()` sendiri
   **tidak** dicabut, dan itu disengaja: trigger sudah berjalan dengan hak
   pemanggil `UPDATE`-nya, jadi mencabutnya tidak menambah apa pun selain
   risiko.

**Gerbang Fase 1:** kontrak, skema, dan policy selesai sebelum satu domain pun dibangun.

Ketiganya **sudah ada di repo**. Tapi "sudah ditulis" belum sama dengan "sudah
jalan": sejak berkas skema dan policy ditambahkan, `npm run build`, `npm run
lint`, dan `npm test` **belum pernah dijalankan**. Pembacaan mata bukan
pengganti kompilasi — enam berkas terakhir ini belum pernah dilihat
TypeScript, dan `strict: true` + `noUncheckedIndexedAccess` memang dirancang
untuk menemukan hal yang tidak terlihat saat membaca. Gerbangnya baru benar-
benar lewat setelah ketiganya hijau.

Yang belum diverifikasi, berurutan:

| Perintah | Yang dibuktikan |
|---|---|
| `npm run build` | Seluruh skema dan policy lolos `strict: true` |
| `npm run lint` | Tidak ada aturan type-aware yang dilanggar |
| `npm test` | `resource.spec.ts` benar-benar menguji apa yang diklaimnya |
| `drizzle-kit generate` | Skema menghasilkan SQL yang bisa dijalankan |

> Satu hal di luar repo ini yang masih terbuka: repo `sksks` **tidak punya remote**, dan proyek Supabase-nya akan ditutup. Migrasi ini ikut hilang bersama mesin ini bila tidak disalin keluar. Ekspor data (R15) belum dikerjakan — dan ini satu-satunya butir Fase 0 yang **tidak bisa dikerjakan ulang** setelah proyeknya ditutup.
