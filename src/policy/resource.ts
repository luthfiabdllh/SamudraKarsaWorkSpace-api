import type { Role } from '../common/types/roles';
import type {
  requestStatusEnum,
  workItemTypeEnum,
  workStatusEnum,
} from '../database/schema/enums';

/**
 * Policy resource-scoped — **fungsi murni**, tanpa database dan tanpa HTTP.
 *
 * ## Kenapa berkas ini ada
 *
 * Matriks di `matrix.ts` hanya bisa menjawab pertanyaan yang jawabannya ada di
 * dalam peran: "bolehkah `owner` menghapus pekerjaan?" Pertanyaan yang sebenarnya
 * ditanyakan sistem ini hampir selalu lebih sempit dari itu: "bolehkah **orang
 * ini** mengubah **pekerjaan ini**?" — dan jawabannya bergantung pada barisnya:
 * siapa pembuatnya, divisi mana pemiliknya, siapa PIC-nya.
 *
 * Pertanyaan seperti itu tidak bisa menjadi tabel data. Ia menjadi fungsi, dan
 * fungsi-fungsi itulah isi berkas ini.
 *
 * ## Kenapa murni
 *
 * Tidak ada satu pun fungsi di sini yang menyentuh database, membaca jam, atau
 * melempar exception. Semuanya menerima dua argumen dan mengembalikan satu
 * nilai. Tiga akibatnya, ketiganya diinginkan:
 *
 * - **Bisa dipakai frontend.** Fungsi yang sama dipakai backend untuk menolak
 *   dan frontend untuk menyembunyikan tombol. Itu bukan penghematan kode —
 *   itu yang membuat tombol di layar dan penolakan di server tidak bisa
 *   berbeda. Kalau keduanya ditulis terpisah, cepat atau lambat salah satunya
 *   ketinggalan, dan yang ketinggalan adalah yang tidak diperiksa siapa pun.
 * - **Bisa diuji tanpa apa pun.** Tidak ada database, tidak ada NestJS, tidak
 *   ada mock. Satu pertanyaan, satu jawaban.
 * - **Tidak bisa "kebetulan lolos".** Fungsi murni tidak punya jalur di mana
 *   kegagalan database berubah menjadi izin.
 *
 * ## Tempatnya nanti
 *
 * Sesuai keputusan 37, berkas ini pindah ke paket `@samudrakarsa/shared` di
 * repo ketiga. Ia ditulis di sini lebih dulu karena paketnya belum ada, dan
 * karena `PolicyGuard` sudah berdiri menunggu isinya. Yang dibutuhkan saat
 * pemindahan: berkas ini apa adanya, ditambah `Actor` dan `Role` — tidak ada
 * satu pun impor ke `database/` atau `common/` yang **nilainya** ikut terbawa,
 * hanya tipe.
 *
 * ## 404, bukan 403
 *
 * Setiap penolakan di berkas ini mengembalikan `404` (`PRD-REVAMP.md` §7.3,
 * §7.5). Actor yang ditolak **tidak boleh tahu bahwa barisnya ada** — 403
 * membocorkan keberadaannya, dan bagi sebagian tabel di sistem ini keberadaan
 * barisnya sendiri sudah merupakan informasi (keuangan, masukan privat).
 *
 * Karena itu penolakan tidak membawa pesan yang bisa dikirim ke klien. Ia
 * membawa `reason`: kode untuk **log dan audit**, yang tidak pernah keluar dari
 * server. Yang dikirim ke klien selalu "Tidak ditemukan", tanpa keterangan.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Bentuk masukan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Siapa yang meminta — lebih sempit daripada `AuthenticatedUser`, dan itu
 * disengaja. `AuthenticatedUser` memenuhi bentuk ini, dan begitu juga klaim di
 * dalam token yang dibaca frontend.
 */
export interface Actor {
  /** `profiles.id`. */
  readonly id: string;
  readonly roles: readonly Role[];

  /**
   * Kode divisi yang **dinaungi** — hanya terisi kalau perannya kepala divisi
   * atau wakilnya. Seorang anggota biasa yang kebetulan berada di divisi
   * Sekretaris & Bendahara **tidak** mengisi ini, dan justru itu yang membuat
   * pemeriksaan keuangan di bawah benar.
   */
  readonly divisionCodes: readonly string[];
}

/**
 * Pekerjaan, sejauh yang dibutuhkan policy.
 *
 * Perhatikan `divisionCode`, bukan `divisionId`. Policy membandingkannya dengan
 * `Actor.divisionCodes`, yang berisi **kode** divisi — bukan uuid. Konsekuensinya
 * pemanggil harus menyertakan satu join ke `divisions` saat membaca pekerjaan
 * yang akan diperiksa izinnya. Join itu bukan biaya tambahan yang sia-sia:
 * layar yang menampilkan pekerjaan hampir selalu menampilkan nama divisinya juga.
 */
export interface WorkItemForPolicy {
  readonly id: string;
  readonly type: WorkItemType;
  readonly status: WorkStatus;
  readonly divisionCode: string | null;
  readonly primaryPicId: string | null;
  readonly createdBy: string | null;

  /**
   * Penerima tugas selain PIC — isi `work_item_assignees`.
   *
   * Harus dimuat terpisah (satu query tambahan ke tabel itu). Alternatifnya
   * adalah tidak mengizinkan assignee mengubah pekerjaannya, dan itu akan
   * membuat janji "edit bebas DALAM divisinya" di `PRD-REVAMP.md` §9.3 tidak
   * berlaku bagi orang yang justru ditugaskan mengerjakannya.
   */
  readonly assigneeIds: readonly string[];

  /**
   * Terisi kalau pekerjaan ini dan permintaan asalnya tidak lagi sepakat
   * (keputusan 49). Selama terisi, transisi status ditolak.
   */
  readonly syncConflictAt: Date | null;
}

/** Permintaan, sejauh yang dibutuhkan policy. */
export interface RequestForPolicy {
  readonly id: string;
  readonly status: RequestStatus;
  readonly requesterId: string | null;
  /** Divisi **tujuan**, bukan divisi pemohon — §7.9 memakai yang ini. */
  readonly targetDivisionCode: string | null;
  /**
   * Penanggung jawab yang ditunjuk divisi tujuan.
   *
   * Ada di sini karena `canEditRequest` memberinya hak mengubah, mengikuti pola
   * yang sama dengan pekerjaan (keputusan 36 dan 44): yang boleh mengubah sebuah
   * baris adalah pembuatnya, kepala divisinya, **dan orang yang mengerjakannya**.
   * Untuk permintaan, "orang yang mengerjakannya" adalah penanggung jawab yang
   * ditunjuk — bukan pemohon, yang tidak mengerjakan apa pun setelah mengajukan.
   */
  readonly assignedPicId: string | null;
  readonly syncConflictAt: Date | null;
}

/** Masukan anggota, sejauh yang dibutuhkan policy. */
export interface FeedbackForPolicy {
  readonly id: string;
  readonly authorId: string | null;
  readonly isPrivate: boolean;
}

/** Surat, sejauh yang dibutuhkan policy. */
export interface LetterForPolicy {
  readonly id: string;
  readonly requesterId: string | null;
  readonly picId: string | null;
}

/**
 * Konten, sejauh yang dibutuhkan policy.
 *
 * `divisionCode` adalah kode divisi **pembuat** — diisi dari join ke
 * `profiles → divisions` saat memuat baris. Tanpa join itu, policy tidak
 * bisa memutuskan apakah kepala divisi sedang membaca konten divisinya sendiri.
 */
export interface ContentForPolicy {
  readonly id: string;
  readonly createdBy: string | null;
  readonly picId: string | null;
  readonly divisionCode: string | null;
}

/** Permintaan kreatif, sejauh yang dibutuhkan policy. */
export interface CreativeForPolicy {
  readonly id: string;
  readonly requesterId: string | null;
  readonly picId: string | null;
  readonly divisionCode: string | null;
}

/**
 * Mitra sponsorship, sejauh yang dibutuhkan policy.
 *
 * Tidak ada `createdBy` — `partners` tidak menyimpannya. Yang berlaku:
 * PIC + kepala divisi sponsor + owner/co_owner.
 */
export interface PartnerForPolicy {
  readonly id: string;
  readonly picId: string | null;
  readonly divisionCode: string | null;
}

/** Barang inventaris, sejauh yang dibutuhkan policy. */
export interface InventoryItemForPolicy {
  readonly id: string;
  readonly picId: string | null;
  readonly divisionCode: string | null;
}

/** Item logistik (pengiriman/perjalanan), sejauh yang dibutuhkan policy. */
export interface LogisticsItemForPolicy {
  readonly id: string;
  readonly picId: string | null;
  readonly divisionCode: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hasil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alasan penolakan, untuk log dan audit.
 *
 * **Tidak pernah dikirim ke klien.** Klien menerima 404 tanpa keterangan; kalau
 * alasannya ikut dikirim, 404-nya berubah menjadi 403 yang memakai kode status
 * berbeda — dan seluruh gunanya hilang.
 */
export type PolicyDenialReason =
  | 'not_owner_or_co_owner'
  | 'not_division_lead_for_row'
  | 'not_creator_pic_or_assignee'
  | 'not_target_division_lead'
  | 'not_request_requester'
  | 'transition_not_allowed'
  | 'sync_conflict_unresolved'
  | 'not_finance_division_lead'
  | 'private_feedback_not_author'
  | 'not_letter_editor'
  | 'not_content_editor'
  | 'not_creative_editor'
  | 'not_partner_editor'
  | 'not_inventory_editor'
  | 'not_logistics_editor';

export interface PolicyAllow {
  readonly effect: 'allow';
}

export interface PolicyDeny {
  readonly effect: 'deny';
  /** Selalu 404 — §7.3. Lihat catatan di kepala berkas. */
  readonly status: 404;
  readonly reason: PolicyDenialReason;
}

export type PolicyResult = PolicyAllow | PolicyDeny;

const ALLOW: PolicyAllow = { effect: 'allow' };

const allow = (): PolicyResult => ALLOW;

const deny = (reason: PolicyDenialReason): PolicyResult => ({
  effect: 'deny',
  status: 404,
  reason,
});

// ─────────────────────────────────────────────────────────────────────────────
// Penolong
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dua peran yang memimpin sebuah divisi.
 *
 * **Ini satu-satunya tempat keduanya disebut bersama**, dan itu tujuannya.
 * `division_deputy` adalah peran yang paling mudah hilang dari pemeriksaan izin:
 * di matriks `matrix.ts` ia terlihat jelas karena barisnya memuat daftar peran,
 * tetapi di sini ia hanya muncul sebagai satu kata di dalam sebuah fungsi. Fungsi
 * yang menulis `role === 'division_head'` tidak akan error, tidak akan gagal
 * kompilasi, dan tidak akan ada yang tahu — ia hanya diam-diam mencabut wewenang
 * seluruh wakil kepala divisi.
 *
 * Karena itu pemeriksaannya **tidak pernah** ditulis langsung. Selalu lewat
 * `isDivisionLead()` di bawah, sehingga menghapus `division_deputy` dari sistem
 * menuntut satu perubahan di satu baris, bukan pencarian ke seluruh berkas.
 */
export const DIVISION_LEAD_ROLES = [
  'division_head',
  'division_deputy',
] as const satisfies readonly Role[];

/** Kepala divisi atau wakilnya — di divisi mana pun. */
export function isDivisionLead(actor: Actor): boolean {
  const leads: readonly Role[] = DIVISION_LEAD_ROLES;
  return actor.roles.some((role) => leads.includes(role));
}

/** Kepala (atau wakil kepala) **divisi ini**, dibandingkan lewat kode divisi. */
export function leadsDivisionOf(
  actor: Actor,
  divisionCode: string | null,
): boolean {
  if (divisionCode === null) {
    return false;
  }

  // `isDivisionLead` diperiksa juga, meskipun `divisionCodes` seharusnya hanya
  // terisi untuk pemimpin divisi. Kalau suatu saat pengisiannya salah — satu
  // bug di penerbitan token sudah cukup — pemeriksaan ini tetap menolak.
  return isDivisionLead(actor) && actor.divisionCodes.includes(divisionCode);
}

/** `owner` atau `co_owner`. */
export function isOwnerOrCoOwner(actor: Actor): boolean {
  return actor.roles.includes('owner') || actor.roles.includes('co_owner');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pekerjaan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /work-items/{id}` — `PRD-REVAMP.md` §7.9.
 *
 * | Peran | Boleh mengubah |
 * |---|---|
 * | `owner`, `co_owner` | semuanya |
 * | `division_head`, `division_deputy` | pekerjaan divisinya |
 * | `member` | pekerjaan yang **ia buat**, **ia pimpin**, atau **ia kerjakan** |
 *
 * Baris terakhir adalah janji "edit bebas DALAM divisinya" di §9.3, diterjemahkan
 * menjadi nama-nama: yang mengubah sebuah pekerjaan adalah orang yang membuatnya,
 * orang yang bertanggung jawab atasnya, dan orang yang mengerjakannya.
 */
export function canEditWorkItem(
  actor: Actor,
  item: WorkItemForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (
    item.createdBy === actor.id ||
    item.primaryPicId === actor.id ||
    item.assigneeIds.includes(actor.id)
  ) {
    return allow();
  }

  return deny('not_creator_pic_or_assignee');
}

/**
 * `DELETE /work-items/{id}`.
 *
 * Sama dengan `canEditWorkItem` **tanpa** cabang anggota: §7.9 memberi `member`
 * tanda ❌ pada baris ini. Sebuah anggota boleh mengubah pekerjaannya sendiri
 * sepanjang hari; menghapusnya bukan wewenangnya. Penghapusan di sistem ini
 * soft delete (`deleted_at`), dan yang masuk recycle bin tetap hilang dari semua
 * daftar — praktenya sama saja dengan terhapus bagi orang yang sedang bekerja.
 */
export function canDeleteWorkItem(
  actor: Actor,
  item: WorkItemForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  return deny('not_division_lead_for_row');
}

/**
 * `PATCH /work-items/{id}/pic` — mengganti penanggung jawab.
 *
 * | Peran | Boleh |
 * |---|---|
 * | `owner`, `co_owner` | selalu |
 * | `division_head`, `division_deputy` | pada divisinya |
 * | `member` | **hanya** mengisi PIC pada `task` yang **belum punya PIC** |
 *
 * Baris terakhir adalah jalur "klaim pekerjaan tanpa PIC" (§9.3 M2). Ia sengaja
 * sesempit itu: begitu sebuah pekerjaan punya PIC, mengalihkannya adalah
 * keputusan, bukan inisiatif — dan yang memutuskan adalah kepala divisinya.
 *
 * Perhatikan bahwa `member` **tidak** dibatasi hanya boleh mengisi dirinya
 * sendiri. Itu dipertahankan dari `sksks`, yang membebaskan pengisian PIC pada
 * pekerjaan tanpa PIC untuk siapa saja: yang penting pekerjaannya ada yang
 * mengerjakan, dan menahan orang yang mau mencarikan pengganti hanya membuat
 * pekerjaannya menggantung.
 */
export function canChangePic(
  actor: Actor,
  item: WorkItemForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (item.type === 'task' && item.primaryPicId === null) {
    return allow();
  }

  return deny('not_creator_pic_or_assignee');
}

/**
 * `POST /work-items/{id}/transitions` — memindahkan status pekerjaan.
 *
 * **Tidak ada barisnya di §7.9**, karena tabel itu ditulis sebelum endpoint
 * transisi ada. Wewenangnya mengikuti `canEditWorkItem` — orang yang boleh
 * mengubah pekerjaan adalah orang yang boleh memindahkan statusnya — ditambah
 * satu syarat yang tidak dimiliki pengubahan biasa:
 *
 * **Konflik sinkronisasi menutup transisi, dan tidak ada peran yang boleh
 * melewatinya** (keputusan 49). Termasuk owner. Itu bukan kelalaian: penanda
 * konflik berarti pekerjaan ini dan permintaan asalnya tidak lagi sepakat, dan
 * memindahkan status salah satunya sementara itu berarti memilih satu sisi
 * secara diam-diam. Yang menutup konflik adalah **penyelesaiannya**, bukan
 * wewenang yang lebih tinggi — kalau owner bisa melewatinya, jalan tercepat
 * menyelesaikan konflik adalah mengabaikannya, dan itu persis yang ingin dicegah
 * keputusan 49.
 *
 * Field wajib per status (`hold_reason` saat `on_hold`, `completion_summary`
 * saat `done`) **tidak** diperiksa di sini. Itu validasi bentuk, bukan izin, dan
 * tempatnya di pipe bersama skema Zod — supaya pesannya bisa menyebut field mana
 * yang kurang, bukan sekadar "tidak ditemukan".
 */
export function canTransitionWorkItem(
  actor: Actor,
  item: WorkItemForPolicy,
  to: WorkStatus,
): PolicyResult {
  if (item.syncConflictAt !== null && to !== item.status) {
    return deny('sync_conflict_unresolved');
  }

  return canEditWorkItem(actor, item);
}

// ─────────────────────────────────────────────────────────────────────────────
// Permintaan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `POST /requests/{id}/transitions` — `PRD-REVAMP.md` §7.9.
 *
 * | Peran | Boleh |
 * |---|---|
 * | `owner`, `co_owner` | semua transisi |
 * | `division_head`, `division_deputy` | pada permintaan yang **divisi tujuannya** ia pimpin |
 * | `member` | **hanya** `draft → submitted`, dan hanya atas permintaannya sendiri |
 *
 * ## Dua hal yang mengetatkan §7.9, keduanya disengaja
 *
 * **Pertama, `member` hanya boleh mengajukan permintaannya sendiri.** §7.9
 * menulis "hanya `draft→submitted`" tanpa menyebut siapa pemilik draftnya. Itu
 * terbaca sebagai izin mengajukan draft siapa pun — dan draft yang bisa diajukan
 * orang lain adalah cara mengirim permintaan atas nama orang lain tanpa ia tahu.
 * Karena itu diperketat, dan `INVENTARIS-ATURAN.md` §15 memang meminta §7.9
 * **diketatkan**, bukan disalin dari matriks §10 yang melonggarkan hampir
 * semuanya. Kalau ternyata alur kerja nyatanya memang butuh sekretaris
 * mengajukan draft milik orang lain, **§7.9 yang diubah lebih dulu**, bukan baris
 * ini.
 *
 * **Kedua, konflik sinkronisasi menutup transisi bagi semua peran** — alasannya
 * sama dengan `canTransitionWorkItem`, dan di sini ia bahkan lebih tegas:
 * perubahan status permintaan **adalah** yang memicu sinkronisasi. Memindahkannya
 * saat konflik berarti menuliskan versi yang menang tanpa ada yang memutuskan
 * versi mana yang benar.
 */
export function canTransitionRequest(
  actor: Actor,
  request: RequestForPolicy,
  to: RequestStatus,
): PolicyResult {
  if (request.syncConflictAt !== null && to !== request.status) {
    return deny('sync_conflict_unresolved');
  }

  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, request.targetDivisionCode)) {
    return allow();
  }

  // Satu-satunya transisi yang terbuka bagi anggota.
  if (request.status === 'draft' && to === 'submitted') {
    if (request.requesterId === actor.id) {
      return allow();
    }

    return deny('not_request_requester');
  }

  // Sampai di sini aktornya anggota biasa, dan transisinya bukan pengajuan.
  // Alasannya dibedakan hanya untuk log: keduanya menghasilkan 404 yang sama.
  if (request.requesterId === actor.id) {
    return deny('transition_not_allowed');
  }

  return deny('not_target_division_lead');
}

/**
 * `PATCH /requests/{id}` — mengubah isi permintaan.
 *
 * **Tidak ada barisnya di §7.9.** Tabel itu hanya memuat
 * `POST /requests/{id}/transitions`, karena yang dibahasnya adalah alurnya.
 * Wewenang mengubah isinya mengikuti **keputusan 36**: domain tanpa konsep
 * "pembuat/PIC" memakai pola yang sama — yang boleh mengubah adalah pembuat
 * baris, kepala divisinya, dan owner/co-owner. Di sini:
 *
 * | Peran | Boleh mengubah |
 * |---|---|
 * | `owner`, `co_owner` | semuanya |
 * | `division_head`, `division_deputy` | permintaan yang **divisi tujuannya** ia pimpin |
 * | `member` | permintaan yang **ia ajukan**, dan permintaan yang **ia kerjakan** |
 *
 * Divisi yang dibandingkan adalah divisi **tujuan**, bukan divisi pemohon, dan
 * itu mengikuti §7.9 apa adanya: yang berkepentingan atas isi sebuah permintaan
 * adalah divisi yang akan mengerjakannya. Kepala divisi pemohon tidak ikut —
 * permintaan diajukan **kepada** orang lain, dan mengubahnya setelah terkirim
 * bukan wewenang pengirimnya.
 *
 * Pemohonnya sendiri **ikut**, dan itu bukan kelonggaran: §7.9 membiarkannya
 * mengajukan dan melengkapi (`need_clarification → submitted`), dan melengkapi
 * berarti mengubah isinya. Melarangnya mengubah berarti memaksanya menjawab
 * pertanyaan klarifikasi lewat jalur yang tidak ada.
 */
export function canEditRequest(
  actor: Actor,
  request: RequestForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, request.targetDivisionCode)) {
    return allow();
  }

  if (request.requesterId === actor.id || request.assignedPicId === actor.id) {
    return allow();
  }

  return deny('not_creator_pic_or_assignee');
}

/**
 * `DELETE /requests/{id}` — soft delete.
 *
 * Sama dengan `canEditRequest` **tanpa** cabang anggota, persis seperti
 * `canDeleteWorkItem` terhadap `canEditWorkItem`: §7.9 tidak memuat baris ini,
 * dan yang dipakai adalah pola keputusan 36 apa adanya. Sebuah anggota boleh
 * mengubah permintaannya sepanjang hari; menghapusnya bukan wewenangnya.
 */
export function canDeleteRequest(
  actor: Actor,
  request: RequestForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, request.targetDivisionCode)) {
    return allow();
  }

  return deny('not_division_lead_for_row');
}

// ─────────────────────────────────────────────────────────────────────────────
// Keuangan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Divisi yang memegang keuangan — `sekbend`, Sekretaris & Bendahara.
 *
 * Kode ini adalah **data master**, bukan kosakata sistem: ia dibuat
 * `...00000004_seed.sql` di `sksks` bersama lima divisi lain. Yang Inggris
 * adalah nama kolomnya (`divisions.code`), bukan isinya — isi kolom itu nama
 * divisi, dan nama divisi tidak diterjemahkan (keputusan 47).
 *
 * Ditulis sebagai konstanta bernama, bukan sebagai teks `'sekbend'` yang tersebar
 * di beberapa pemeriksaan, supaya saat divisi ini berganti nama — atau saat
 * keuangan dipindah ke divisi lain — ada **satu** baris yang berubah.
 */
export const FINANCE_DIVISION_CODE = 'sekbend';

/**
 * `GET /finance/*` — iuran, anggaran, transaksi.
 *
 * | Peran | Boleh |
 * |---|---|
 * | `owner`, `co_owner` | ya |
 * | `division_head`, `division_deputy` **divisi Sekretaris & Bendahara** | ya |
 * | semua lainnya | **404** |
 *
 * Ini perubahan tingkat keterbukaan yang paling besar di seluruh revamp. Di
 * `sksks`, kelima tabel keuangan berada di grup RLS "open collaboration" yang
 * sama dengan tabel tugas — **setiap anggota aktif bisa membacanya** (temuan #2
 * di `docs/INVENTARIS-ATURAN.md`). Setelah ini, anggota biasa yang menebak alamat
 * endpoint-nya mendapat 404 — bukan 403, karena 403 memberi tahu bahwa datanya
 * ada.
 *
 * Keunikannya: ini satu-satunya policy di berkas ini yang **tidak butuh baris**.
 * Yang menentukan bukan isi barisnya, melainkan divisi si peminta. Karena itu
 * tidak ada parameter baris di sini — bukan karena lupa.
 */
export function canReadFinance(actor: Actor): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, FINANCE_DIVISION_CODE)) {
    return allow();
  }

  return deny('not_finance_division_lead');
}

/**
 * `GET /finance/export` — ekspor laporan keuangan.
 *
 * `owner` dan `co_owner` saja. §7.9 memberi tanda ❌ kepada `division_head`
 * **termasuk** kepala Sekretaris & Bendahara — satu-satunya baris di tabel itu
 * yang memisahkan kepala divisi dari orang yang memimpinnya.
 *
 * Alasannya bukan kerahasiaan tambahan, melainkan bahwa ekspor adalah berkas utuh
 * yang keluar dari sistem dan tidak bisa ditarik kembali. Membacanya di layar
 * meninggalkan jejak di audit; mengunduhnya tidak. Karena itu haknya berhenti di
 * pemegang akun tertinggi.
 */
export function canExportFinance(actor: Actor): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  return deny('not_owner_or_co_owner');
}

// ─────────────────────────────────────────────────────────────────────────────
// Masukan anggota
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `GET /feedback/*` — masukan, kritik, dan saran.
 *
 * | Peran | Boleh membaca |
 * |---|---|
 * | `owner`, `co_owner` | semuanya, termasuk yang privat |
 * | semua anggota aktif | yang **tidak** privat |
 * | penulisnya | masukannya sendiri, termasuk yang privat |
 * | `division_head`, `division_deputy` | **hanya yang tidak privat** |
 *
 * Baris terakhir sengaja disebut karena ia yang paling mudah salah dibaca.
 * Seorang kepala divisi **tidak** boleh membaca masukan privat yang ditujukan
 * kepada divisinya. Itu bukan kelalaian: masukan privat yang bisa dibaca orang
 * yang dikritik berhenti menjadi masukan, dan kepala divisi adalah pihak pertama
 * yang dikritik dalam sebagian besar kasus.
 *
 * Perhatikan bahwa `isPrivate` **tidak** menyembunyikan penulisnya — itu urusan
 * `visibility` (`anonymous`/`named`), kolom yang berbeda. `author_id` selalu
 * terisi (keputusan 47 → §5.2.10), dan itulah yang membuat pemeriksaan "penulisnya
 * sendiri" di bawah mungkin dilakukan sama sekali.
 */
export function canReadFeedback(
  actor: Actor,
  item: FeedbackForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (!item.isPrivate) {
    return allow();
  }

  if (item.authorId === actor.id) {
    return allow();
  }

  return deny('private_feedback_not_author');
}

// ─────────────────────────────────────────────────────────────────────────────
// Persuratan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /letters/{id}` — mengubah isi surat.
 *
 * | Peran | Boleh |
 * |---|---|
 * | `owner`, `co_owner` | semuanya |
 * | `division_head`, `division_deputy` | surat yang **diajukan ke divisinya** |
 * | `member` | surat yang **ia ajukan** atau **ia kerjakan** (PIC) |
 *
 * Tidak ada syarat divisi pada `member`: pengirim surat dan PIC-nya boleh
 * mengubah dari divisi mana pun, karena surat seringkali dikerjakan lintas divisi.
 */
export function canEditLetter(
  actor: Actor,
  letter: LetterForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (isDivisionLead(actor)) {
    return allow();
  }

  if (letter.requesterId === actor.id || letter.picId === actor.id) {
    return allow();
  }

  return deny('not_letter_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Konten
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /content/{id}` — mengubah rencana konten.
 *
 * | Peran | Boleh |
 * |---|---|
 * | `owner`, `co_owner` | semuanya |
 * | `division_head`, `division_deputy` | konten divisinya |
 * | `member` | konten yang **ia buat** atau **ia kerjakan** (PIC) |
 */
export function canEditContent(
  actor: Actor,
  item: ContentForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (item.createdBy === actor.id || item.picId === actor.id) {
    return allow();
  }

  return deny('not_content_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Kreatif
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /creative/{id}` — mengubah permintaan kreatif.
 *
 * Pola identik dengan `canEditContent`.
 */
export function canEditCreative(
  actor: Actor,
  item: CreativeForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (item.requesterId === actor.id || item.picId === actor.id) {
    return allow();
  }

  return deny('not_creative_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mitra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /partners/{id}` — mengubah data mitra.
 *
 * Tidak ada `createdBy` pada tabel `partners`, sehingga yang berlaku adalah:
 * PIC + kepala divisi yang menangani + owner/co_owner.
 */
export function canEditPartner(
  actor: Actor,
  partner: PartnerForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, partner.divisionCode)) {
    return allow();
  }

  if (partner.picId === actor.id) {
    return allow();
  }

  return deny('not_partner_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventaris
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /inventory/{id}` — mengubah data barang inventaris.
 *
 * Pola sama dengan `canEditPartner` — tidak ada `createdBy`.
 */
export function canEditInventoryItem(
  actor: Actor,
  item: InventoryItemForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (item.picId === actor.id) {
    return allow();
  }

  return deny('not_inventory_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Logistik
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PATCH /logistics/shipments/{id}` dan `PATCH /logistics/trips/{id}`.
 */
export function canEditLogistics(
  actor: Actor,
  item: LogisticsItemForPolicy,
): PolicyResult {
  if (isOwnerOrCoOwner(actor)) {
    return allow();
  }

  if (leadsDivisionOf(actor, item.divisionCode)) {
    return allow();
  }

  if (item.picId === actor.id) {
    return allow();
  }

  return deny('not_logistics_editor');
}

// ─────────────────────────────────────────────────────────────────────────────
// Kosakata baris
// ─────────────────────────────────────────────────────────────────────────────

/*
 * `WorkStatus`, `RequestStatus`, dan `WorkItemType` diturunkan dari enum
 * database, bukan ditulis ulang di sini.
 *
 * Itu satu definisi dipakai dua tempat: `pgEnum` menghasilkan tipe PostgreSQL-nya
 * dan `enumValues` menghasilkan union TypeScript-nya dari daftar yang sama.
 * Menyalin nilainya ke berkas ini akan membuat daftar kedua yang bisa menyimpang
 * dari yang pertama — dan yang menyimpang akan menjadi daftar yang dipakai
 * pemeriksaan izin.
 */

export type WorkStatus = (typeof workStatusEnum.enumValues)[number];
export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type WorkItemType = (typeof workItemTypeEnum.enumValues)[number];
