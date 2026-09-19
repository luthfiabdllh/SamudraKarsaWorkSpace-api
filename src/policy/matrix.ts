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
 * `kadiv` di sini berarti "kadiv mana pun". Batasan "kadiv **divisinya**"
 * tidak bisa dinyatakan di tabel ini karena jawabannya bergantung pada isi
 * barisnya — policy seperti itu ada di `RESOURCE_POLICY_NAMES` di bawah.
 */
export const ROLE_POLICY_MATRIX = {
  // Pekerjaan — PRD-REVAMP §7.9
  'work-item:read': ['owner', 'co_owner', 'kadiv', 'member'],
  'work-item:create': ['owner', 'co_owner', 'kadiv', 'member'],
  'work-item:delete': ['owner', 'co_owner', 'kadiv'],

  // Request
  'request:read': ['owner', 'co_owner', 'kadiv', 'member'],
  'request:create': ['owner', 'co_owner', 'kadiv', 'member'],

  // Keuangan — `finance:export` sengaja lebih sempit daripada `finance:read`.
  // Dua baris di §7.9 memang berbeda, dan perbedaannya dipertahankan di sini.
  'finance:export': ['owner', 'co_owner'],

  // Pengumuman
  'announcement:create': ['owner', 'co_owner', 'kadiv'],

  // Administrasi
  'member:admin': ['owner', 'co_owner'],
  'audit:read': ['owner', 'co_owner'],

  // Auth — juga dipakai daftar pengecualian must_change_password di bawah
  'auth:session': ['owner', 'co_owner', 'kadiv', 'member'],
  'auth:change-password': ['owner', 'co_owner', 'kadiv', 'member'],
  'auth:logout': ['owner', 'co_owner', 'kadiv', 'member'],
} as const satisfies Record<string, readonly Role[]>;

export type RolePolicyName = keyof typeof ROLE_POLICY_MATRIX;

/**
 * Policy yang **butuh melihat barisnya lebih dulu** — siapa pembuatnya, divisi
 * mana, siapa PIC-nya. Ini tidak bisa menjadi data di tabel atas karena
 * jawabannya bergantung pada isi database.
 *
 * Implementasinya ada di paket `@samudrakarsa/shared` (`canEditWorkItem`,
 * `canChangePic`, `canTransitionRequest` — `PRD-REVAMP.md` §7.9), supaya
 * frontend dan backend memakai fungsi yang sama persis dan tidak ada dua
 * tafsir atas aturan yang sama.
 *
 * **Sampai paket itu ada, `PolicyGuard` menolak policy jenis ini.** Menolak
 * adalah default yang benar: kalau belum bisa memutuskan, jawabannya bukan
 * "boleh".
 */
export const RESOURCE_POLICY_NAMES = [
  'work-item:update',
  'work-item:set-pic',
  'finance:read',
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
