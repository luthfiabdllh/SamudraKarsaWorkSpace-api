import type { Role } from '../common/types/roles';

/**
 * Matriks izin sebagai **data**, bukan `if` bertingkat (`PRD-BACKEND.md` §4).
 *
 * Alasannya bukan kerapian. Matriks yang berbentuk data bisa ditinjau manusia
 * dalam satu layar dan dibandingkan baris demi baris dengan tabel di
 * `PRD-REVAMP.md` §7.9. Kode bercabang tidak bisa diperlakukan begitu — untuk
 * memeriksanya, seseorang harus membacanya.
 */

/**
 * Policy yang bisa diputuskan **hanya dari peran** — tidak perlu melihat baris
 * yang bersangkutan lebih dulu.
 *
 * `division_head` di sini berarti "kepala divisi mana pun". Batasan "kepala
 * divisi **baris ini**" tidak bisa dinyatakan di tabel ini karena jawabannya
 * bergantung pada isi barisnya — policy seperti itu ada di
 * `RESOURCE_POLICY_NAMES` di bawah.
 *
 * ## `division_deputy` selalu sebaris dengan `division_head`
 *
 * Setiap baris yang memuat `division_head` memuat `division_deputy` juga, dan
 * itu disengaja. `sksks` memperlakukan keduanya identik lewat
 * `is_division_lead()`, dan keputusan 46 mempertahankan wakil kepala divisi
 * sebagai peran tersendiri tanpa memberinya wewenang berbeda **untuk
 * sekarang** (lihat `roles.ts`).
 *
 * Karena itu: kalau suatu saat salah satu baris di bawah diubah, ubah
 * `division_head` dan `division_deputy` bersama-sama — kecuali memang sedang
 * sengaja memisahkan wewenang keduanya. Baris yang hanya memuat salah satunya
 * adalah tanda ada yang terlewat, bukan tanda keputusan.
 */
export const ROLE_POLICY_MATRIX = {
  // Pekerjaan — PRD-REVAMP §7.9
  'work-item:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'work-item:create': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'work-item:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  /**
   * Penulisan pekerjaan selain membuat dan menghapus — gerbang **kasar**.
   *
   * Satu nama untuk tiga rute, dan itu memang yang dibutuhkan:
   *
   * | Rute | Yang memutuskan sesungguhnya |
   * |---|---|
   * | `PATCH /work-items/:id` | `canEditWorkItem` |
   * | `PATCH /work-items/:id/pic` | `canChangePic` |
   * | `POST /work-items/:id/transitions` | `canTransitionWorkItem` |
   *
   * ## Kenapa satu, bukan tiga
   *
   * Karena §7.9 **tidak membedakan ketiganya**. Baris "Edit pekerjaan" di sana
   * memberi ✓ kepada kelima peran, dan ketiga rute ini adalah tiga bentuk dari
   * pekerjaan yang sama: mengubah sebuah pekerjaan. Yang membedakan siapa boleh
   * apa bukan perannya, melainkan **barisnya** — apakah ia pembuatnya, PIC-nya,
   * penerima tugasnya, atau kepala divisi yang menaunginya. Pertanyaan itu tidak
   * bisa dijawab dari peran, jadi ia tidak boleh berpura-pura bisa: jawabannya
   * ada di `resource.ts`, dan service yang memanggilnya.
   *
   * Tiga nama terpisah di sini akan menyiratkan tiga aturan peran yang berbeda
   * padahal isinya sama persis — dan yang menyiratkan perbedaan akan dibaca
   * sebagai perbedaan oleh orang berikutnya yang membukanya.
   *
   * ## Kenapa `work-item:delete` **tidak** ikut ke sini
   *
   * Karena §7.9 memang membedakannya: `member` mendapat ❌ pada penghapusan dan
   * ✓ pada pengubahan. Itu perbedaan yang benar-benar ada di dalam peran, jadi
   * ia berhak punya barisnya sendiri di tabel ini — dan ia sudah punya.
   */
  'work-item:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  // Request
  'request:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'request:create': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  /**
   * Penulisan permintaan selain membuat dan menghapus — gerbang **kasar**.
   *
   * Bentuknya sengaja sama persis dengan `work-item:write`, dan itu memang
   * tujuannya: §7.9 tidak membedakan siapa yang boleh mengubah sebuah
   * permintaan dari siapa yang boleh memindahkan statusnya. Yang membedakan
   * bukan perannya, melainkan **barisnya** — apakah ia pemohonnya, penanggung
   * jawabnya, atau kepala divisi yang dituju. Jawaban itu ada di
   * `canEditRequest` dan `canTransitionRequest` di `resource.ts`.
   *
   * | Rute | Yang memutuskan sesungguhnya |
   * |---|---|
   * | `PATCH /requests/:id` | `canEditRequest` |
   * | `POST /requests/:id/transitions` | `canTransitionRequest` |
   * | `POST /requests/:id/sync-conflict` | `canEditRequest` |
   *
   * **`request:transition` sengaja tidak dipakai di sini** meski namanya paling
   * cocok, dan itu bukan pilihan gaya: nama itu sudah ada di
   * `RESOURCE_POLICY_NAMES`, dan `PolicyGuard` **menolak** policy
   * resource-scoped — sehingga memasangnya di controller akan membuat setiap
   * perpindahan status permintaan menjadi `404` bagi semua orang, termasuk
   * owner. Kegagalannya terlihat seketika, jadi bukan bahaya yang diam-diam,
   * tetapi tetap dicatat supaya yang menambahkannya tahu apa yang ia tambahkan.
   */
  'request:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  /**
   * Menghapus permintaan — `member` ❌, sama seperti pekerjaan.
   *
   * §7.9 tidak memuat baris ini. Yang dipakai adalah pola keputusan 36, dan
   * pola itu tidak memberi anggota hak menghapus di domain mana pun.
   */
  'request:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Keuangan — akses sangat ketat, lihat `canReadFinance` di `resource.ts`.
  // `finance:read` dibatasi `owner`/`co_owner` di sini sebagai gerbang pertama;
  // kepala Sekbend diizinkan oleh service lewat `canReadFinance`, bukan guard.
  // Dua baris di §7.9 memang berbeda (`finance:read` vs `finance:export`),
  // dan perbedaannya dipertahankan.
  'finance:read': ['owner', 'co_owner'],
  'finance:write': ['owner', 'co_owner'],
  'finance:export': ['owner', 'co_owner'],

  // Persuratan — semua anggota aktif bisa mengajukan dan mengubah surat.
  // Penghapusan dibatasi kepala divisi ke atas agar tidak ada yang menghilangkan
  // surat divisi lain.
  'letter:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'letter:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'letter:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Konten (Humas) — Open Collaboration Mode; write adalah gerbang kasar,
  // `canEditContent` di `resource.ts` yang memutuskan lebih lanjut.
  'content:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'content:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'content:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Kreatif (Media Kreatif) — pola sama dengan konten.
  'creative:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'creative:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'creative:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Sponsorship / Mitra — pipeline mitra terbuka untuk semua anggota aktif.
  'partner:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'partner:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'partner:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Inventaris — semua anggota bisa mencatat; hapus dibatasi.
  'inventory:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'inventory:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'inventory:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Logistik (pengiriman + perjalanan) — pola sama.
  'logistics:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'logistics:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'logistics:delete': ['owner', 'co_owner', 'division_head', 'division_deputy'],

  // Pengumuman
  'announcement:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'announcement:create': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
  ],
  'announcement:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
  ],
  'announcement:delete': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
  ],

  // Kolaborasi (Meetings, Calendar)
  'collaboration:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'collaboration:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'collaboration:delete': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
  ],

  // Notifikasi
  'notification:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  // Administrasi
  'member:admin': ['owner', 'co_owner'],
  'audit:read': ['owner', 'co_owner'],

  /**
   * Data acuan organisasi — divisi, cluster, subunit, periode.
   *
   * **Baris ini penambahan, bukan pertentangan.** §7.9 tidak memuatnya karena
   * tabel itu disusun per fitur, sedangkan keempat tabel ini adalah acuan yang
   * dipakai hampir setiap fitur dan tidak punya layar sendiri di sana. Sama
   * seperti `work-item:transition`, ketiadaannya di §7.9 berarti tabel itu
   * ditulis sebelum bagian ini ada — bukan bahwa aksesnya bebas.
   *
   * Dibaca **siapa saja yang sudah masuk**. Nama divisi muncul di daftar
   * pekerjaan, profil anggota, dan laporan; menyembunyikannya tidak
   * menyembunyikan apa pun yang berguna, hanya memaksa setiap layar mengirim
   * id tanpa nama.
   *
   * Ditulis hanya `owner`/`co_owner`, dan itu lebih ketat daripada kelihatannya:
   * puluhan tabel merujuk keempat tabel ini lewat foreign key, sehingga satu
   * divisi yang salah dibentuk menular ke seluruh sistem dan tidak bisa
   * diperbaiki dari layar mana pun yang memakainya. Kepala divisi **tidak**
   * ikut: mengubah nama divisinya sendiri bukan wewenang yang diberikan §7.9
   * kepadanya.
   */
  'organization:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'organization:write': ['owner', 'co_owner'],

  // Evaluasi
  'evaluation:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'evaluation:write': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  /**
   * Profil anggota.
   *
   * **`profile:read` bukan "baca profil siapa saja".** Ia hanya membuka
   * **daftar anggota** — id, nama, panggilan, foto, peran, unit, jabatan. Email
   * dan nomor telepon tidak ikut, dan yang membacanya hanya pemiliknya sendiri
   * atau `member:admin`. Lihat `PROFILE_DIRECTORY_COLUMNS` di
   * `profiles.constants.ts`: pemisahannya dilakukan dengan **memilih kolom**,
   * bukan dengan menyaring hasil di JavaScript — kolom yang tidak pernah
   * diambil tidak bisa bocor karena satu cabang `if` yang salah.
   *
   * Untuk organisasi seukuran ini, nomor telepon seluruh panitia yang terbuka
   * bagi seluruh panitia adalah kebocoran yang nyata, bukan teoretis.
   *
   * **`profile:write-self` hanya membuka kolom yang aman ditulis sendiri.**
   * Ia dinamai "write-self", bukan "write", karena itulah satu-satunya yang
   * boleh dilakukannya. §5.1.1 menemukan bahwa di `sksks` seorang anggota biasa
   * bisa mengubah `division_id` dan `is_kormasit` miliknya sendiri dari console
   * browser lalu seketika menjadi Kepala Divisi. Di sini kolom itu **tidak ada**
   * di DTO-nya, sehingga tidak ada yang bisa ditulis — bukan karena diperiksa,
   * melainkan karena tidak dapat dijangkau.
   */
  'profile:read': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'profile:write-self': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],

  // Auth — juga dipakai daftar pengecualian must_change_password di bawah
  'auth:session': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'auth:change-password': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
  'auth:logout': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
    'member',
  ],
} as const satisfies Record<string, readonly Role[]>;

export type RolePolicyName = keyof typeof ROLE_POLICY_MATRIX;

/**
 * Policy yang **butuh melihat barisnya lebih dulu** — siapa pembuatnya, divisi
 * mana, siapa PIC-nya. Ini tidak bisa menjadi data di tabel atas karena
 * jawabannya bergantung pada isi database.
 *
 * Implementasinya ada di `resource.ts` di folder ini, dan nanti pindah ke paket
 * `@samudrakarsa/shared` (`PRD-REVAMP.md` §7.9), supaya frontend dan backend
 * memakai fungsi yang sama persis dan tidak ada dua tafsir atas aturan yang sama.
 *
 * | Nama policy | Fungsi |
 * |---|---|
 * | `work-item:update` | `canEditWorkItem` |
 * | `work-item:delete` | `canDeleteWorkItem` |
 * | `work-item:set-pic` | `canChangePic` |
 * | `work-item:transition` | `canTransitionWorkItem` |
 * | `request:transition` | `canTransitionRequest` |
 * | `request:update` | `canEditRequest` |
 * | `request:delete` | `canDeleteRequest` |
 * | `finance:read` | `canReadFinance` |
 * | `feedback:read-own` | `canReadFeedback` |
 *
 * Dua catatan tentang daftar di atas:
 *
 * - **`finance:export` tidak ada di sini** meskipun ia terdengar seperti policy
 *   resource-scoped. Ia ada di tabel peran di atas, dan itu benar: §7.9
 *   memberinya `owner`/`co_owner` saja, tanpa syarat apa pun tentang barisnya.
 * - **`work-item:transition` tidak ada barisnya di §7.9**, karena tabel itu
 *   ditulis sebelum endpoint transisi ada (`PRD-BACKEND.md` §12 Fase 3). Ia
 *   mengikuti wewenang `work-item:update` ditambah penutupan karena konflik
 *   sinkronisasi (keputusan 49). Ini **penambahan**, bukan pertentangan.
 * - **`request:update` dan `request:delete` juga penambahan.** §7.9 hanya
 *   memuat `POST /requests/{id}/transitions` untuk modul ini; wewenang mengubah
 *   dan menghapus isinya mengikuti pola keputusan 36. Lihat `canEditRequest`.
 *
 * ## Satu nama di tabel atas bisa dipakai lebih dari satu cara
 *
 * Tabel di atas memasangkan satu nama policy dengan satu fungsi, dan itu benar
 * untuk hampir semuanya. Satu pengecualiannya adalah `work-item:transition`:
 * `canTransitionWorkItem` adalah **gabungan** dari `canEditWorkItem` dan
 * pemeriksaan konflik, dan `WorkItemsService` memanggil keduanya **terpisah**
 * karena penolakannya menuntut kode status berbeda — `404` untuk "bukan
 * wilayahmu", `409` untuk "sedang berkonflik".
 *
 * Fungsi gabungannya tetap ada dan tetap dipakai: **frontend** memakainya untuk
 * memutuskan apakah tombol transisinya bisa ditekan. Yang tidak boleh
 * disimpulkan dari tabel ini hanyalah bahwa backend memanggilnya apa adanya.
 *
 * ## `work-item:delete` ada di **kedua** daftar, dan itu disengaja
 *
 * Ia satu-satunya nama yang muncul di tabel peran **dan** di daftar ini, dan
 * hasilnya adalah dua lapis yang keduanya berlaku:
 *
 * 1. Guard membacanya sebagai policy peran lebih dulu — lihat urutan
 *    pemeriksaan di `isRolePolicy()`. `member` ditolak di situ, dengan `403`.
 * 2. Service memanggil `canDeleteWorkItem` untuk barisnya — kepala divisi yang
 *    bukan pemimpin divisi baris itu ditolak di situ, dengan `404`.
 *
 * Yang membuatnya bekerja adalah **urutan** di `isRolePolicy()`: nama yang ada
 * di kedua daftar diselesaikan sebagai policy peran. Kalau urutannya dibalik,
 * `work-item:delete` akan dibaca sebagai policy resource-scoped — dan
 * `PolicyGuard` **menolak** policy resource-scoped, sehingga setiap penghapusan
 * pekerjaan menjadi `404` bagi semua orang termasuk owner. Kegagalan itu akan
 * terlihat seketika, jadi bahayanya bukan diam-diam salah melainkan tiba-tiba
 * mati. Tetap dicatat di sini supaya yang membalik urutannya tahu apa yang ia
 * balik.
 *
 * Nama **lain** di daftar ini sengaja tidak ada di tabel peran, supaya tidak
 * ada nama yang artinya bergantung pada urutan itu lagi.
 *
 * **`division_deputy` wajib ikut di sini juga.** Di sinilah ia paling mudah
 * hilang: tabel di atas hanya memuat peran, sehingga `division_deputy`
 * terlihat jelas, tetapi fungsi-fungsi ini memeriksa "apakah aktor kepala
 * divisi **baris ini**" — dan jawabannya harus `division_head` **atau**
 * `division_deputy` dari divisi yang sama, persis seperti
 * `is_division_lead()` di `sksks`. Fungsi yang hanya memeriksa
 * `division_head` akan diam-diam mencabut wewenang seluruh wakil kepala
 * divisi, tanpa error dan tanpa jejak. Karena itu `resource.ts` memusatkan
 * pemeriksaan itu di `DIVISION_LEAD_ROLES` dan `isDivisionLead()`, dan
 * `resource.spec.ts` menguji setiap fungsi dengan aktor `division_deputy`.
 *
 * **Sampai paket `@samudrakarsa/shared` ada, `PolicyGuard` menolak policy jenis
 * ini.** Menolak adalah default yang benar: kalau belum bisa memutuskan,
 * jawabannya bukan "boleh". Yang hilang hanyalah pemeriksaan per baris di
 * guard — service yang memanggil fungsi di `resource.ts` sudah bisa
 * memutuskannya sendiri.
 */
export const RESOURCE_POLICY_NAMES = [
  'work-item:update',
  'work-item:delete',
  'work-item:set-pic',
  'work-item:transition',
  'request:transition',
  'feedback:read-own',
] as const;

export type ResourcePolicyName = (typeof RESOURCE_POLICY_NAMES)[number];

export type PolicyName = RolePolicyName | ResourcePolicyName;

export function isRolePolicy(name: PolicyName): name is RolePolicyName {
  return name in ROLE_POLICY_MATRIX;
}

export function isResourcePolicy(name: PolicyName): name is ResourcePolicyName {
  return (RESOURCE_POLICY_NAMES as readonly string[]).includes(name);
}

/**
 * Policy yang tetap boleh diakses walau `must_change_password` menyala.
 *
 * Harus tetap sesingkat ini, dan `auth:change-password` **wajib** ada di
 * dalamnya. Tanpa itu, anggota yang menerima password sementara dari owner
 * terkunci di luar sistem secara permanen — tidak bisa memakai sistem, tidak
 * bisa mengganti passwordnya sendiri.
 */
export const PENDING_PASSWORD_EXEMPT: readonly PolicyName[] = [
  'auth:session',
  'auth:change-password',
  'auth:logout',
];
