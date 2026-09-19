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
  readonly roles: readonly Role[];

  /** Divisi yang dinaungi, kalau perannya kadiv. Dipakai policy resource-scoped. */
  readonly divisionCodes: readonly string[];

  /**
   * Keputusan 10 — kalau true, seluruh endpoint non-exempt ditolak backend
   * sampai anggotanya mengganti password sementara dari owner (§7.8.6).
   */
  readonly mustChangePassword: boolean;
}

export {};
