# Kosakata Enum — Indonesia → Inggris

Terjemahan seluruh enum `sksks` ke kosakata baru (keputusan 47), ditambah dua
enum yang tidak ada di sana dan ditambahkan di sistem baru.

**Sumber kebenaran ada di kode:** `src/database/schema/enums.ts`. Dokumen ini
adalah pasangan yang bisa ditinjau manusia — kode tidak bisa dibaca baris per
baris berdampingan dengan migrasi lamanya, tabel di bawah bisa.

| | `sksks` | Sekarang |
|---|---|---|
| Tipe enum | 22 | **24** |
| Nilai | 141 | **155** |
| Bahasa nilai | campur | Inggris |

Selisih nilainya **+14**:

- **+2** — `role` bertambah `division_head` dan `division_deputy` (keputusan 46).
- **−1** — `diarsipkan` dibuang dari status pekerjaan (keputusan 47 → §14.2).
- **+6** — `document_type`, jenis dokumen yang nomornya dihasilkan sistem.
  Tidak ada di `sksks` sama sekali — lihat §10.
- **+7** — `notification_kind`, yang di `sksks` adalah teks bebas berisi enam
  nilai; satu nilai baru, `unassignment`, ditambahkan (keputusan 50). Lihat §11.

Seluruh penerjemahan lain tidak mengubah jumlah nilai. `selesai` → `done` adalah
penggantian nama, bukan penghapusan — penjelasannya di §9.1.

---

## 1. Peran & keanggotaan

### `app_role` → `role` · 3 → **5** nilai

| `sksks` | Sekarang | |
|---|---|---|
| `owner` | `owner` | |
| `co_owner` | `co_owner` | |
| `member` | `member` | |
| — | `division_head` | **baru** |
| — | `division_deputy` | **baru** |

Kedua nilai baru **sudah ada** di `sksks`, hanya saja di kolom terpisah
`profiles.division_role` sebagai `kadiv`/`wakadiv` — di luar jangkauan
pemeriksaan izin, dan itulah cara peran itu menghilang (keputusan 46).

### `member_status` · 3 nilai

| `sksks` | Sekarang |
|---|---|
| `invited` | `invited` |
| `active` | `active` |
| `nonaktif` | `inactive` |

Anggota aktif adalah `status = 'active'`. `invited` **bukan** aktif — di
`sksks` ia terhitung aktif karena definisinya `status <> 'nonaktif'`
(temuan #1).

---

## 2. Status pekerjaan

### `global_status` → `work_status` · 9 → **8** nilai

| `sksks` | Sekarang | |
|---|---|---|
| `draft` | `draft` | |
| `diajukan` | `submitted` | |
| `disetujui` | `approved` | |
| `on_progress` | `in_progress` | |
| `need_review` | `need_review` | |
| `on_hold` | `on_hold` | sifatnya berubah — keputusan 48 |
| `done` | `done` | |
| `ditolak` | `rejected` | |
| `diarsipkan` | — | **dibuang** |

**Namanya berubah dari `global_status`.** Tiga tabel memakainya — `work_items`,
`meeting_decisions`, `milestones` — jadi memberinya nama salah satu pemakainya
menyesatkan.

**`diarsipkan` dibuang** karena menyembunyikan baris adalah urusan kolom
`archived_at`, bukan urusan status (§14.2).

### `request_status` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `draft` | `draft` |
| `diajukan` | `submitted` |
| `diterima` | `accepted` |
| `on_progress` | `in_progress` |
| `need_review` | `need_review` |
| `perlu_klarifikasi` | `need_clarification` |
| `on_hold` | `on_hold` |
| `done` | `done` |
| `ditolak` | `rejected` |

`accepted` berbeda dari `approved` di `work_status` — dan perbedaannya
dipertahankan: permintaan **diterima** divisi tujuan, sedangkan pekerjaan
**disetujui** untuk dijalankan. Dua kata, dua makna.

`need_clarification` **tidak pernah** dipetakan ke `need_review`. Sinkronisasi
`sksks` meleburnya (temuan #5), padahal "sudah jadi, menunggu dinilai" dan
"belum bisa jalan, ada yang harus dijelaskan" adalah dua keadaan yang berbeda.

### `request_type` · 14 nilai

| `sksks` | Sekarang |
|---|---|
| `persuratan` | `correspondence` |
| `rab_keuangan` | `budget_plan` |
| `desain` | `design` |
| `editing_video` | `video_editing` |
| `publikasi` | `publication` |
| `dokumentasi` | `documentation` |
| `pengadaan_barang` | `goods_procurement` |
| `peminjaman_barang` | `goods_loan` |
| `transportasi` | `transportation` |
| `cargo` | `cargo` |
| `konsumsi` | `catering` |
| `sponsorship` | `sponsorship` |
| `kebutuhan_program` | `program_need` |
| `bantuan_umum` | `general_assistance` |

`rab_keuangan` → `budget_plan` mengikuti istilah yang dipakai di seluruh dokumen
ini; RAB tetap ditampilkan sebagai "RAB" di UI.

`program_need` muncul di **dua** enum (`work_item_type` dan `request_type`) — dan
itu disengaja: sebuah request bisa berjenis "kebutuhan program", dan pekerjaan
yang lahir darinya juga. Keduanya enum berbeda, jadi tidak ada tabrakan.

### `work_item_type` · 8 nilai

| `sksks` | Sekarang |
|---|---|
| `task` | `task` |
| `request` | `request` |
| `tindak_lanjut_rapat` | `meeting_follow_up` |
| `tindak_lanjut_evaluasi` | `evaluation_follow_up` |
| `kebutuhan_program` | `program_need` |
| `kebutuhan_divisi` | `division_need` |
| `kebutuhan_subunit` | `subunit_need` |
| `milestone` | `milestone` |

### `priority_level` · 4 nilai

| `sksks` | Sekarang |
|---|---|
| `mendesak` | `urgent` |
| `tinggi` | `high` |
| `sedang` | `medium` |
| `rendah` | `low` |

### `kkn_phase` · 3 nilai

| `sksks` | Sekarang |
|---|---|
| `pra_kkn` | `pre_kkn` |
| `kkn` | `kkn` |
| `pasca_kkn` | `post_kkn` |

`kkn` sengaja tidak diterjemahkan — KKN adalah nama resmi programnya.

---

## 3. Persuratan

### `letter_status` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `diajukan` | `submitted` |
| `perlu_dilengkapi` | `needs_completion` |
| `terverifikasi` | `verified` |
| `penyusunan_draft` | `drafting` |
| `review` | `review` |
| `menunggu_ttd` | `awaiting_signature` |
| `siap_dikirim` | `ready_to_send` |
| `terkirim` | `sent` |
| `selesai` | `done` |

### `letter_direction` · 2 nilai

| `sksks` | Sekarang |
|---|---|
| `masuk` | `inbound` |
| `keluar` | `outbound` |

---

## 4. Keuangan

### `budget_status` · 7 nilai

| `sksks` | Sekarang |
|---|---|
| `draft` | `draft` |
| `diajukan` | `submitted` |
| `review` | `review` |
| `perlu_revisi` | `needs_revision` |
| `disetujui` | `approved` |
| `berjalan` | `in_progress` |
| `selesai` | `done` |

### `transaction_type` · 2 nilai

| `sksks` | Sekarang |
|---|---|
| `pemasukan` | `income` |
| `pengeluaran` | `expense` |

### `dues_status` · 3 nilai

| `sksks` | Sekarang |
|---|---|
| `belum_bayar` | `unpaid` |
| `cicilan` | `installment` |
| `lunas` | `paid` |

---

## 5. Konten & kreatif

### `content_status` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `ide` | `idea` |
| `brief` | `brief` |
| `copywriting` | `copywriting` |
| `request_visual` | `visual_request` |
| `produksi` | `production` |
| `review` | `review` |
| `terjadwal` | `scheduled` |
| `tayang` | `published` |
| `evaluasi` | `evaluation` |

### `creative_status` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `request_masuk` | `request_received` |
| `brief` | `brief` |
| `antrean` | `queued` |
| `produksi` | `production` |
| `draft` | `draft` |
| `review` | `review` |
| `revisi` | `revision` |
| `final` | `final` |
| `done` | `done` |

---

## 6. Mitra & program

### `partner_status` · 11 nilai

| `sksks` | Sekarang |
|---|---|
| `prospek` | `prospect` |
| `belum_dihubungi` | `not_contacted` |
| `kontak_awal` | `initial_contact` |
| `follow_up` | `follow_up` |
| `negosiasi` | `negotiation` |
| `proposal_dikirim` | `proposal_sent` |
| `menunggu_jawaban` | `awaiting_response` |
| `disetujui` | `approved` |
| `mou_kontrak` | `contract_signed` |
| `kontraprestasi` | `counter_performance` |
| `done` | `done` |

`kontraprestasi` → `counter_performance` — istilah hukumnya dalam bahasa
Inggris. Ia dipertahankan sebagai tahap tersendiri karena dalam alur
sponsorship ia memang harus diselesaikan.

### `program_status` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `ide` | `idea` |
| `riset` | `research` |
| `validasi` | `validation` |
| `perancangan` | `planning` |
| `siap` | `ready` |
| `on_progress` | `in_progress` |
| `monitoring` | `monitoring` |
| `evaluasi` | `evaluation` |
| `done` | `done` |

---

## 7. Inventaris

### `inventory_movement_type` · 7 nilai

| `sksks` | Sekarang |
|---|---|
| `masuk` | `inbound` |
| `keluar` | `outbound` |
| `dipakai` | `used` |
| `dipinjam` | `borrowed` |
| `kembali` | `returned` |
| `pindah_lokasi` | `relocated` |
| `rusak_hilang` | `damaged_or_lost` |

---

## 8. Rapat, kalender, evaluasi

### `meeting_type` · 5 nilai

| `sksks` | Sekarang |
|---|---|
| `rapat_besar` | `general_meeting` |
| `rapat_divisi` | `division_meeting` |
| `rapat_koordinasi` | `coordination_meeting` |
| `evaluasi` | `evaluation` |
| `lainnya` | `other` |

### `calendar_event_type` · 9 nilai

| `sksks` | Sekarang |
|---|---|
| `weekly_meeting` | `weekly_meeting` |
| `rapat_seluruh_tim` | `all_hands_meeting` |
| `rapat_harian` | `daily_meeting` |
| `rapat_divisi` | `division_meeting` |
| `rapat_klaster` | `cluster_meeting` |
| `rapat_subunit` | `subunit_meeting` |
| `audiensi` | `audience` |
| `kegiatan_lapangan` | `field_activity` |
| `lainnya` | `other` |

### `rsvp_status` · 4 nilai

| `sksks` | Sekarang |
|---|---|
| `hadir` | `attending` |
| `mungkin` | `maybe` |
| `tidak_hadir` | `not_attending` |
| `belum_merespons` | `no_response` |

### `evaluation_visibility` · 2 nilai

| `sksks` | Sekarang |
|---|---|
| `anonim` | `anonymous` |
| `nama` | `named` |

---

## 9. Yang perlu diperhatikan

Ketiga hal di bawah **bukan** terjemahan — ini temuan yang muncul saat
menerjemahkan, dan masing-masing butuh keputusan terpisah.

### 9.1 `done` dan `selesai` adalah kata yang sama

`sksks` memakai `done` di lima enum dan `selesai` di dua enum lain
(`letter_status`, `budget_status`) untuk hal yang sama persis. Tidak ada satu
pun kode di sana yang memperlakukannya berbeda.

Sekarang seluruhnya `done`. Ini **penggantian nama**, bukan penghapusan: jumlah
nilainya tidak berubah, yang hilang hanya kata `selesai` sebagai nilai enum.

### 9.2 `meeting_type` dan `calendar_event_type` menutupi wilayah yang sama

Keduanya punya `rapat_divisi`, `evaluasi`, dan `lainnya`/`other`. Yang satu
menggolongkan **rapat**, yang lain menggolongkan **acara kalender** — tetapi
banyak rapat memang acara kalender.

Ini dilaporkan apa adanya, **bukan** digabung, karena menggabungkannya adalah
keputusan pemodelan yang lebih besar daripada penerjemahan: ia menyentuh
pertanyaan apakah rapat dan acara kalender adalah hal yang sama. Pertanyaan itu
dijawab saat modul `meetings` dan `calendar` dibangun (Fase 5), bukan sekarang.

### 9.3 Dua enum memakai `approved`

`work_status` dan `request_status` (lewat `accepted`) punya `approved`, dan
`budget_status`, `partner_status` juga. Masing-masing berada di enum berbeda,
jadi tidak ada tabrakan — tetapi saat menulis pemeriksaan izin, "disetujui"
tidak pernah bisa diambil dari satu tempat. Alur transisi per entitas
(`PRD-BACKEND.md` §8.1) yang akan menjawabnya, bukan enumnya.

---

## 10. `document_type` — 6 nilai (baru)

Jenis dokumen yang nomornya dihasilkan sistem. **Tidak ada padanannya di
`sksks`**, karena di sana penomoran tidak punya tabel penghitung: empat nomor
dibuat `DEFAULT` kolom yang memanggil `nextval()` pada sequence masing-masing,
satu lewat trigger, satu lewat trigger lain dengan format berbeda, dan satu —
`program_number` — tidak dihasilkan siapa pun (temuan #3).

| Nilai | Dokumen | Bentuk nomor |
|---|---|---|
| `work_item` | Pekerjaan | `WI-YYYY-#####` |
| `request` | Permintaan | `REQ-YYYY-#####` |
| `budget` | Anggaran (RAB) | `RAB-YYYY-#####` |
| `letter` | Surat | `SRT-<JENIS>-YYYY-#####` |
| `inventory_item` | Barang inventaris | `INV-YYYY-#####` |
| `program` | Program kerja | `PRG-YYYY-#####` |

Dua hal yang berubah bentuknya dari `sksks`, keduanya disengaja:

- **Surat** memakai satu penghitung **per jenis surat**, bukan satu untuk semua
  surat. `sksks` memakai satu sequence tunggal, sehingga nomor urut tiap jenis
  melompat-lompat tanpa alasan yang bisa dijelaskan ke instansi penerimanya.
- **Inventaris** memuat tahun. `sksks` menghasilkannya sebagai `INV-#####` —
  tanpa tahun dan tidak pernah di-reset, satu-satunya dari enam nomor yang
  berbeda bentuk. Kode yang sudah ditempel di barang tetap dipakai apa adanya;
  yang berubah hanya barang yang didaftarkan setelah sistem baru berjalan.

`<JENIS>` **tetap bahasa Indonesia** (keputusan 47): nomor surat adalah artefak
organisasi yang dibaca instansi luar, bukan kosakata sistem.

---

## 11. `notification_kind` — 7 nilai (baru sebagai enum)

Di `sksks` ini bukan enum, melainkan kolom `notifications.kind` bertipe `text`
dengan nilai bawaan `'info'` — dan nilainya ditulis langsung dari dalam
trigger, tersebar di beberapa berkas migrasi. Tidak ada satu pun tempat yang
mendaftar nilai yang sah; daftarnya hanya bisa disusun dengan membaca semuanya.

| `sksks` (`kind`) | Sekarang |
|---|---|
| `'info'` (bawaan) | `info` |
| `'mention'` | `mention` |
| `'assignment'` | `assignment` |
| — | **`unassignment`** (baru) |
| `'meeting_invite'` | `meeting_invite` |
| `'reschedule'` | `reschedule` |
| `'cancellation'` | `cancellation` |

**Kenapa dijadikan enum.** Frontend memilih ikon dan tujuan tautan berdasarkan
nilai ini. Notifikasi dengan jenis yang tidak dikenal tidak tampak rusak — ia
tampak seperti notifikasi biasa tanpa ikon, dan tidak ada yang tahu ada yang
salah.

**Kenapa ada `unassignment`.** Keputusan 50: mencabut penugasan seseorang harus
memberi tahu orang itu. Di `sksks` hanya penugasan yang memberi tahu, sehingga
orang yang paling perlu tahu — yang pekerjaannya diambil — justru tidak diberi
tahu.

