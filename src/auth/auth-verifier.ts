import type { Request } from 'express';

import type { AuthenticatedUser } from '../common/types/express';

/**
 * Token DI untuk verifikasi token.
 *
 * Guard bergantung pada antarmuka ini, bukan pada implementasi JWT. Itu yang
 * membuat `PolicyGuard` bisa ditulis, ditinjau, dan diuji sekarang — sementara
 * implementasi tokennya menyusul.
 *
 * Ini juga yang membuat penggantian nanti murah: Fase 2 lanjutan cukup
 * menyediakan provider lain untuk token yang sama.
 */
export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export interface AuthVerifier {
  /**
   * Memeriksa token pada request dan mengembalikan aktornya.
   *
   * Implementasi **wajib melempar** `UnauthorizedException` kalau token tidak
   * ada, kedaluwarsa, atau tidak sah. **Tidak boleh mengembalikan `null`** —
   * pemanggil akan memperlakukannya sebagai aktor yang sah, dan itu berarti
   * rute terbuka.
   */
  verify(request: Request): Promise<AuthenticatedUser>;
}
