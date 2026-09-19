import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/types/express';
import type { AuthVerifier } from './auth-verifier';

/**
 * Implementasi sementara yang **menolak semua** permintaan.
 *
 * Ini bukan placeholder yang perlu diingat untuk dihapus — ini **default yang
 * benar**. Selama verifikasi token belum ada, tidak ada satu pun request yang
 * boleh dianggap sah. Alternatifnya — meloloskan semuanya supaya "bisa dites"
 * — akan menghasilkan backend yang tampak berjalan padahal terbuka, dan itu
 * kegagalan yang tidak terlihat sampai seseorang menemukannya.
 *
 * Konsekuensinya bisa diprediksi dan mudah diperiksa: `/api/v1/health` tetap
 * hijau karena rute itu `@Public()`, sementara seluruh rute lain menjawab
 * `401`. Itu memang keadaannya sampai auth selesai.
 *
 * FASE 2 LANJUTAN: ganti dengan verifier JWT asli yang menjalankan lima
 * pemeriksaan Google SSO (`PRD-BACKEND.md` §6).
 */
@Injectable()
export class RejectingAuthVerifier implements AuthVerifier {
  /**
   * Sengaja tidak menerima parameter. TypeScript mengizinkan implementasi
   * dengan parameter lebih sedikit daripada antarmukanya, dan itu di sini
   * memang lebih jujur: verifier ini tidak membaca request sama sekali.
   */
  verify(): Promise<AuthenticatedUser> {
    throw new UnauthorizedException({
      code: 'not_authenticated',
      title: 'Permintaan ini memerlukan token yang sah',
      detail:
        'Verifikasi token belum diimplementasikan. Sampai saat itu, seluruh rute non-publik memang tertutup.',
    });
  }
}
