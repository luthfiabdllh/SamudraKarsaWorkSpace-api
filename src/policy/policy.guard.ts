import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AUTH_VERIFIER, type AuthVerifier } from '../auth/auth-verifier';
import { IS_PUBLIC_KEY, POLICY_KEY } from '../common/constants';
import type { AuthenticatedUser } from '../common/types/express';
import {
  PENDING_PASSWORD_EXEMPT,
  ROLE_POLICY_MATRIX,
  isResourcePolicy,
  isRolePolicy,
  type PolicyName,
} from './matrix';

/**
 * Satu-satunya pintu masuk ke setiap rute yang dijaga.
 *
 * Terdaftar lewat `APP_GUARD` di `AppModule`, jadi ia berjalan untuk **setiap**
 * rute secara bawaan — bukan ditambahkan satu per satu. Inilah yang membuat
 * "tidak bisa dilewati" menjadi sifat struktural, bukan disiplin.
 *
 * Urutan pemeriksaannya tetap dan disengaja:
 *
 * 1. `@Public()`? → lolos
 * 2. token sah? → dapat aktor
 * 3. password masih sementara? → tolak, kecuali rute pengecualian
 * 4. perannya boleh? → lolos atau tolak
 *
 * **Nomor 3 dikerjakan di sini, bukan di UI.** Kalau hanya frontend yang
 * menahan, satu request `curl` dengan token yang sah sudah cukup untuk
 * melewatinya (keputusan 10).
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const policyName = this.policyName(context);
    const request = context.switchToHttp().getRequest<Request>();

    const actor = await this.authenticate(request);
    request.user = actor;

    this.assertPasswordIsSettled(actor, policyName);

    if (!this.isAllowed(policyName, actor)) {
      throw this.denial(policyName, actor);
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private policyName(context: ExecutionContext): PolicyName {
    const name = this.reflector.getAllAndOverride<PolicyName>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // PolicyBootCheck sudah memastikan ini tidak terjadi saat boot. Kalau tetap
    // terjadi, ada rute yang dibuat setelah boot — dan menolak adalah jawaban
    // yang benar untuk sesuatu yang tidak kita pahami.
    if (!name) {
      const where = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.error(`Rute tanpa @Policy lolos pemeriksaan boot: ${where}`);
      throw new ForbiddenException({
        code: 'policy_missing',
        title: 'Rute ini tidak punya policy',
      });
    }

    return name;
  }

  private async authenticate(request: Request): Promise<AuthenticatedUser> {
    try {
      return await this.verifier.verify(request);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Verifier yang melempar hal lain sedang **rusak**, bukan sedang
      // menolak. Jangan pernah mengubahnya menjadi "lolos" — itu akan
      // mengubah bug menjadi lubang keamanan.
      this.logger.error(
        'AuthVerifier melempar error tak terduga',
        error as Error,
      );
      throw new UnauthorizedException({
        code: 'not_authenticated',
        title: 'Permintaan ini memerlukan token yang sah',
      });
    }
  }

  private assertPasswordIsSettled(
    actor: AuthenticatedUser,
    policyName: PolicyName,
  ): void {
    if (!actor.mustChangePassword) {
      return;
    }

    if (PENDING_PASSWORD_EXEMPT.includes(policyName)) {
      return;
    }

    throw new ForbiddenException({
      code: 'password_change_required',
      title: 'Password harus diganti sebelum memakai sistem',
      detail:
        'Akun ini masih memakai password sementara yang diberikan owner. ' +
        'Ganti password terlebih dahulu.',
    });
  }

  private isAllowed(policyName: PolicyName, actor: AuthenticatedUser): boolean {
    if (isRolePolicy(policyName)) {
      const allowed: readonly string[] = ROLE_POLICY_MATRIX[policyName];
      return actor.roles.some((role) => allowed.includes(role));
    }

    if (isResourcePolicy(policyName)) {
      // Fase berikutnya: delegasikan ke fungsi policy di paket
      // @samudrakarsa/shared. Sampai saat itu, menolak.
      this.logger.warn(
        `Policy resource-scoped belum diimplementasikan: ${policyName}`,
      );
      return false;
    }

    // Cabang ini mustahil menurut tipe: `PolicyName` adalah union tertutup dan
    // dua penjaga di atas menghabiskannya — karena itu `policyName` sudah
    // menyempit menjadi `never` di sini, dan template literal dengan `never`
    // ditolak `restrict-template-expressions`.
    //
    // Ia tetap ditulis karena nama policy datang dari **metadata runtime**, yang
    // bisa berisi apa saja kalau ada yang memasangnya di luar tipe. Menolak
    // lebih baik daripada menebak.
    const unrecognised: string = policyName;
    this.logger.error(`Nama policy tidak dikenali: ${unrecognised}`);
    return false;
  }

  /**
   * `PRD-BACKEND.md` §7.3 — **404, bukan 403**, kalau yang ditolak adalah akses
   * ke sebuah resource. 403 membocorkan bahwa resource itu ada.
   *
   * Untuk penolakan berbasis peran murni — koleksi, bukan satu baris — 403
   * justru yang benar: tidak ada yang dibocorkan, karena endpoint-nya memang
   * sudah diketahui.
   */
  private denial(policyName: PolicyName, actor: AuthenticatedUser): Error {
    if (isResourcePolicy(policyName)) {
      return new NotFoundException({
        code: 'not_found',
        title: 'Tidak ditemukan',
      });
    }

    return new ForbiddenException({
      code: 'forbidden',
      title: 'Peran Anda tidak diizinkan untuk tindakan ini',
      detail: `Policy: ${policyName}. Peran: ${actor.roles.join(', ') || 'tidak ada'}.`,
    });
  }
}
