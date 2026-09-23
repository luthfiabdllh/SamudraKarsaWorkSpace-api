import { z } from 'zod';

import { normalizeEmail } from '../../auth/email';
import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { ROLES } from '../../common/types/roles';

/**
 * Skema profil anggota.
 *
 * ## Berkas ini memuat dua skema yang sengaja **tidak** berbagi apa pun
 *
 * `UpdateSelfProfileSchema` dan `UpdateProfileSchema` terlihat seperti dua
 * variasi dari satu hal, dan justru itu yang membuatnya berbahaya. §5.1.1
 * menemukan bahwa di `sksks` seorang anggota bisa mengubah `division_id` dan
 * `is_kormasit` miliknya sendiri — UI-nya sudah memakai whitelist Zod yang
 * benar, tetapi RLS-nya tidak, sehingga console browser cukup untuk melewatinya.
 *
 * Pelajaran yang diambil bukan "periksa lagi di server", melainkan **kolomnya
 * tidak boleh ada di skema yang bisa dijangkau**. Karena itu keduanya ditulis
 * terpisah dan tidak ada `baseProfileSchema.partial()` di antara keduanya:
 * seandainya ada, menambahkan satu kolom privilege ke basisnya akan
 * diam-diam membukanya untuk diri sendiri — persis kegagalan yang sama, dengan
 * bentuk yang berbeda.
 *
 * Yang menjaga pemisahan itu bukan disiplin, melainkan bentuk tipe: `UpdateSelfProfileDto`
 * tidak punya medan `roles`, sehingga `roles: dto.roles` **tidak bisa ditulis**
 * di service-nya. Kesalahan yang tidak bisa dinyatakan tidak perlu diingat.
 */

const nama = (maks: number) =>
  z.string().trim().min(2, 'Nama minimal 2 karakter.').max(maks);

const teksOpsional = (maks: number) => z.string().trim().max(maks).nullish();

/**
 * Nomor telepon.
 *
 * Diterima longgar — angka, spasi, `+`, `-`, dan tanda kurung — lalu
 * dinormalisasi hanya sebatas membuang spasi di ujung. Menolak format yang
 * tidak lazim akan menghukum orang yang menulis nomornya dengan cara yang benar
 * bagi mereka, dan nomor telepon bukan nilai yang dibandingkan kode mana pun.
 *
 * Yang **tidak** dilakukan: memaksakan awalan `+62`. Nomor darurat bisa saja
 * nomor rumah, dan memaksakan awalan akan membuat formulir menolak isian yang
 * benar.
 */
const telepon = z
  .string()
  .trim()
  .max(32)
  .refine(
    (value) => /^[0-9+()\s-]+$/.test(value),
    'Nomor telepon hanya boleh berisi angka, spasi, dan tanda + ( ) -.',
  );

/**
 * Tautan sosial sebagai objek berkunci tetap, bukan `record` bebas.
 *
 * `socialLinks` bertipe `jsonb` tanpa bentuk yang dinyatakan database, jadi
 * bentuknya hanya ditentukan di sini. `z.record(z.string(), z.url())` akan
 * menerima kunci apa pun — dan kolom `jsonb` yang bisa diisi kunci apa pun
 * berubah menjadi tempat sampah dalam satu tahun pemakaian, karena tidak ada
 * yang pernah bisa menghapus kunci yang sudah tidak dipakai siapa pun.
 *
 * `.strict()` dipilih alih-alih membiarkan Zod membuang kunci yang tidak
 * dikenal. Membuangnya diam-diam berarti frontend yang menulis `instagramUrl`
 * alih-alih `instagram` akan tampak berhasil, dan tautannya hilang tanpa satu
 * pun pesan. `422` yang menyebut nama medannya jauh lebih murah.
 */
const tautan = z.url('Tautan harus berupa URL yang sah.').max(300);

const socialLinks = z
  .strictObject({
    instagram: tautan.nullish(),
    linkedin: tautan.nullish(),
    github: tautan.nullish(),
    tiktok: tautan.nullish(),
    youtube: tautan.nullish(),
    website: tautan.nullish(),
  })
  .nullish();

const daftarTeks = (maksItem: number, maksPanjang: number) =>
  z
    .array(z.string().trim().min(1).max(maksPanjang))
    .max(maksItem, `Maksimal ${maksItem} item.`)
    .nullish();

// ─────────────────────────────────────────────────────────────────────────────
// Profil diri sendiri
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kolom yang boleh diubah pemiliknya sendiri — dan hanya ini.
 *
 * Yang **tidak ada** di sini, beserta alasannya masing-masing:
 *
 * - `email` — dipakai untuk masuk. Mengubahnya dari dalam sesi berarti
 *   memindahkan akun ke alamat yang mungkin belum diverifikasi pemiliknya.
 * - `roles`, `status` — menentukan seluruh wewenang. Diberikan orang lain.
 * - `divisionId`, `clusterId`, `subunitId` — menentukan unit kerja. Di `sksks`
 *   inilah celah §5.1.1: seorang anggota menunjuk dirinya ke divisi mana pun,
 *   lalu menjadi Kepala Divisi di sana.
 * - `teamRole`, `isKormasit` — sebutan jabatan dan badge. Menulisnya sendiri
 *   berarti mengangkat diri sendiri.
 * - `mustChangePassword` — lapisan yang memaksa anggota mengganti password
 *   sementara. Kalau bisa dimatikan sendiri, ia tidak menjaga apa pun.
 */
export const UpdateSelfProfileSchema = z.object({
  fullName: nama(160).optional(),
  nickname: teksOpsional(60),
  photoUrl: z.url('Foto harus berupa URL yang sah.').max(500).nullish(),
  phone: telepon.nullish(),
  facultyMajor: teksOpsional(160),
  batchYear: z
    .string()
    .trim()
    .max(12)
    .refine(
      (value) => /^[0-9]{4}$/.test(value),
      'Angkatan harus berupa empat angka, misalnya 2023.',
    )
    .nullish(),
  socialLinks,
  skills: daftarTeks(30, 60),
  hobbies: daftarTeks(30, 60),
  availabilityNote: teksOpsional(500),
  emergencyContactName: teksOpsional(160),
  emergencyContactPhone: telepon.nullish(),
});

@ZodDto(UpdateSelfProfileSchema)
export class UpdateSelfProfileDto {
  declare fullName?: string;
  declare nickname?: string | null;
  declare photoUrl?: string | null;
  declare phone?: string | null;
  declare facultyMajor?: string | null;
  declare batchYear?: string | null;
  declare socialLinks?: Record<string, string | null | undefined> | null;
  declare skills?: string[] | null;
  declare hobbies?: string[] | null;
  declare availabilityNote?: string | null;
  declare emergencyContactName?: string | null;
  declare emergencyContactPhone?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profil oleh admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Membuat profil baru — undangan (keputusan 26–28).
 *
 * Tanpa password: `invited` berarti "baris dibuat owner, belum diklaim", dan
 * login Google pertama kali mengubahnya menjadi `active`. Jalur email yang
 * menyebabkan temuan §5.2.7 tidak ada di sini karena barisnya memang tidak
 * pernah menunggu konfirmasi email.
 *
 * `status` boleh langsung `active` untuk orang yang sudah ada dan sudah
 * dipastikan — memaksa dua langkah untuk anggota yang jelas aktif hanya
 * menambah satu klik yang selalu dikerjakan tanpa dibaca.
 */
export const CreateProfileSchema = z.object({
  email: z.email('Email tidak sah.').transform(normalizeEmail),
  fullName: nama(160),
  nickname: teksOpsional(60),
  photoUrl: z.url('Foto harus berupa URL yang sah.').max(500).nullish(),
  phone: telepon.nullish(),
  facultyMajor: teksOpsional(160),
  batchYear: teksOpsional(12),
  roles: z
    .array(z.enum(ROLES))
    .min(1, 'Minimal satu peran.')
    .default(['member']),
  status: z.enum(['invited', 'active', 'inactive']).default('active'),
  divisionId: z.uuid('Divisi tidak sah.').nullish(),
  clusterId: z.uuid('Cluster tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  teamRole: teksOpsional(120),
  isKormasit: z.boolean().default(false),
  isKormater: z.boolean().default(false),
  mustChangePassword: z.boolean().default(false),
  socialLinks: socialLinks.default({}),
  skills: daftarTeks(30, 60).default([]),
  hobbies: daftarTeks(30, 60).default([]),
  availabilityNote: teksOpsional(500),
  emergencyContactName: teksOpsional(160),
  emergencyContactPhone: telepon.nullish(),
});

@ZodDto(CreateProfileSchema)
export class CreateProfileDto {
  declare email: string;
  declare fullName: string;
  declare nickname?: string | null;
  declare photoUrl?: string | null;
  declare phone?: string | null;
  declare facultyMajor?: string | null;
  declare batchYear?: string | null;
  declare roles: (typeof ROLES)[number][];
  declare status: 'invited' | 'active' | 'inactive';
  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;
  declare teamRole?: string | null;
  declare isKormasit: boolean;
  declare isKormater: boolean;
  declare mustChangePassword: boolean;
  declare socialLinks?: Record<string, string | null | undefined> | null;
  declare skills?: string[] | null;
  declare hobbies?: string[] | null;
  declare availabilityNote?: string | null;
  declare emergencyContactName?: string | null;
  declare emergencyContactPhone?: string | null;
}

/**
 * Mengubah profil orang lain — hanya `owner`/`co_owner` lewat `member:admin`.
 *
 * Memuat seluruh kolom privilege, dan itu memang tujuannya: di sinilah tempat
 * sah satu-satunya untuk mengubahnya. Yang menjaga bukan panjang daftarnya,
 * melainkan bahwa hanya `member:admin` yang bisa mencapai endpoint ini.
 *
 * `passwordHash` dan `googleSub` tidak ada di sini meski admin pun tidak boleh
 * menulisnya: yang pertama hanya lahir dari `resetPassword`, yang kedua hanya
 * dari verifikasi Google. Kolom yang tidak boleh ditulis siapa pun tidak perlu
 * muncul di DTO mana pun.
 */
export const UpdateProfileSchema = z.object({
  email: z.email('Email tidak sah.').transform(normalizeEmail).optional(),
  fullName: nama(160).optional(),
  nickname: teksOpsional(60),
  photoUrl: z.url('Foto harus berupa URL yang sah.').max(500).nullish(),
  phone: telepon.nullish(),
  facultyMajor: teksOpsional(160),
  batchYear: teksOpsional(12),
  roles: z.array(z.enum(ROLES)).min(1, 'Minimal satu peran.').optional(),
  status: z.enum(['invited', 'active', 'inactive']).optional(),
  divisionId: z.uuid('Divisi tidak sah.').nullish(),
  clusterId: z.uuid('Cluster tidak sah.').nullish(),
  subunitId: z.uuid('Subunit tidak sah.').nullish(),
  teamRole: teksOpsional(120),
  isKormasit: z.boolean().optional(),
  isKormater: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  socialLinks: socialLinks.optional(),
  skills: daftarTeks(30, 60).optional(),
  hobbies: daftarTeks(30, 60).optional(),
  availabilityNote: teksOpsional(500),
  emergencyContactName: teksOpsional(160),
  emergencyContactPhone: telepon.nullish(),
});

@ZodDto(UpdateProfileSchema)
export class UpdateProfileDto {
  declare email?: string;
  declare fullName?: string;
  declare nickname?: string | null;
  declare photoUrl?: string | null;
  declare phone?: string | null;
  declare facultyMajor?: string | null;
  declare batchYear?: string | null;
  declare roles?: (typeof ROLES)[number][];
  declare status?: 'invited' | 'active' | 'inactive';
  declare divisionId?: string | null;
  declare clusterId?: string | null;
  declare subunitId?: string | null;
  declare teamRole?: string | null;
  declare isKormasit?: boolean;
  declare isKormater?: boolean;
  declare mustChangePassword?: boolean;
  declare socialLinks?: Record<string, string | null | undefined> | null;
  declare skills?: string[] | null;
  declare hobbies?: string[] | null;
  declare availabilityNote?: string | null;
  declare emergencyContactName?: string | null;
  declare emergencyContactPhone?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daftar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penyaring daftar anggota.
 *
 * Semuanya opsional: daftar tanpa penyaring mengembalikan seluruh anggota.
 * Batas 100 dipilih karena daftar ini dipakai untuk memilih orang — daftar
 * pemilih PIC, daftar anggota divisi — dan daftar sepanjang itu tidak pernah
 * digulir sampai habis oleh manusia.
 */
export const ListProfilesSchema = z.object({
  divisionId: z.uuid('Divisi tidak sah.').optional(),
  clusterId: z.uuid('Cluster tidak sah.').optional(),
  subunitId: z.uuid('Subunit tidak sah.').optional(),
  status: z.enum(['invited', 'active', 'inactive']).optional(),
  role: z.enum(ROLES).optional(),
  isKormasit: z.coerce.boolean().optional(),
  isKormater: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

@ZodDto(ListProfilesSchema)
export class ListProfilesDto {
  declare divisionId?: string;
  declare clusterId?: string;
  declare subunitId?: string;
  declare status?: 'invited' | 'active' | 'inactive';
  declare role?: (typeof ROLES)[number];
  declare isKormasit?: boolean;
  declare isKormater?: boolean;
  declare q?: string;
  declare limit: number;
}
