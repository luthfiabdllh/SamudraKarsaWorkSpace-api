import type { Role } from './roles';

/**
 * Menambahkan kolom pada objek Express lewat declaration merging.
 *
 * `requestId` dan `user` sengaja **opsional**. TypeScript kemudian memaksa
 * setiap pemakaian memeriksa keberadaannya lebih dulu — dan itu memang
 * pemeriksaan yang benar, karena sebuah request bisa dibaca sebelum middleware
 * atau guard sempat mengisinya.
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  /** `profiles.id` — bukan `auth.users.id`. */
  readonly id: string;
  readonly email: string;

  /**
   * Nama lengkap, untuk ditampilkan.
   *
   * Opsional karena guard tidak pernah memakainya: `PolicyGuard` memutuskan dari
   * peran dan status, bukan dari nama. Yang membacanya hanya `GET /auth/session`
   * — dan menuntutnya wajib di sini akan memaksa setiap penyusun aktor di test
   * ikut mengisinya, padahal test izin tidak punya urusan dengan nama.
   */
  readonly fullName?: string | null;

  readonly roles: readonly Role[];

  /**
   * Divisi yang dinaungi, kalau perannya kepala divisi atau wakilnya. Dipakai
   * policy resource-scoped — `division_head` dan `division_deputy` sama-sama
   * mengisi ini, dan pemisahannya baru dilakukan kalau wewenang keduanya
   * benar-benar dibedakan (keputusan 46).
   */
  readonly divisionCodes: readonly string[];
  readonly divisionId?: string | null;

  /**
   * Keputusan 10 — kalau true, seluruh endpoint non-exempt ditolak backend
   * sampai anggotanya mengganti password sementara dari owner (§7.8.6).
   */
  readonly mustChangePassword: boolean;
}

export {};
