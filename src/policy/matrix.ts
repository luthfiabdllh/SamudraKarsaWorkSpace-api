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

  // Keuangan — `finance:export` sengaja lebih sempit daripada `finance:read`.
  // Dua baris di §7.9 memang berbeda, dan perbedaannya dipertahankan di sini.
  'finance:export': ['owner', 'co_owner'],

  // Pengumuman
  'announcement:create': [
    'owner',
    'co_owner',
    'division_head',
    'division_deputy',
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
  'finance:read',
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
