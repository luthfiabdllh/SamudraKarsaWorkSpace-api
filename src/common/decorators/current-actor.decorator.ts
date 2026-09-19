import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types/express';

/**
 * Aktor yang sedang masuk, dari `request.user`.
 *
 * `PolicyGuard` sudah mengisinya — dan sudah menolak permintaan yang tidak
 * membawa aktor — sehingga di dalam handler ia selalu ada. Pemeriksaan di bawah
 * karena itu **tidak mungkin** gagal pada rute yang dijaga.
 *
 * Ia tetap ditulis, dan tetap melempar alih-alih memakai `!`. Alasannya sama
 * dengan pemeriksaan `policy missing` di guard: yang tidak mungkin terjadi
 * menurut alur hari ini bisa menjadi mungkin besok, dan `!` mengubahnya menjadi
 * aktor `undefined` yang menjalar ke dalam keputusan izin. Gagal di sini
 * menghasilkan `401`; gagal di sana menghasilkan keputusan yang salah.
 *
 * Parameternya bertipe `custom`, sehingga `ZodValidationPipe` melewatinya —
 * tidak ada yang perlu divalidasi pada sesuatu yang bukan berasal dari HTTP.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new UnauthorizedException({
        code: 'not_authenticated',
        title: 'Permintaan ini memerlukan token yang sah',
      });
    }

    return request.user;
  },
);
