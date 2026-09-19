import {
  Injectable,
  Logger,
  RequestMethod,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, POLICY_KEY } from '../common/constants';

/**
 * Membuat aplikasi **menolak menyala** kalau ada rute yang lupa dijaga.
 *
 * Ini bagian keempat dari empat bagian yang membuat §7.1 bekerja — dan yang
 * membuatnya bisa diandalkan. Tiga bagian lainnya (`APP_GUARD` global,
 * `@Public()`, `@Policy()`) semuanya bisa terlupa; yang ini tidak bisa, karena
 * kegagalannya bukan rute terbuka melainkan **proses yang gagal start**.
 *
 * Perhatikan ke mana kegagalannya berpindah. Dengan pemeriksaan ini, lupa
 * memasang `@Policy` menghasilkan error saat menyala — aman. Yang justru
 * berbahaya adalah **`@Public()` yang salah pasang**: rute terbuka tanpa
 * peringatan apa pun. Karena itu daftar `@Public()` harus tetap pendek dan
 * bisa ditinjau dalam satu layar (§7.2).
 */
@Injectable()
export class PolicyBootCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(PolicyBootCheck.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const violations: string[] = [];
    let guarded = 0;
    let publicRoutes = 0;

    for (const wrapper of this.discovery.getControllers()) {
      // `InstanceWrapper` dari DiscoveryService bertipe `any` pada kedua
      // properti ini. Diambil sebagai `unknown` lebih dulu lalu dipersempit
      // sendiri — kalau didestruktur langsung, `any`-nya menjalar ke seluruh
      // sisa berkas dan setiap pemeriksaan di bawah kehilangan artinya.
      const instance: unknown = wrapper.instance;
      const metatype: unknown = wrapper.metatype;

      if (!instance || typeof instance !== 'object') {
        continue;
      }

      if (typeof metatype !== 'function') {
        continue;
      }

      const prototype: object = Object.getPrototypeOf(instance) as object;
      const controllerPath = this.controllerPathOf(metatype);
      const controllerIsPublic =
        this.reflector.get<boolean>(IS_PUBLIC_KEY, metatype) === true;

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[methodName];

        if (typeof handler !== 'function') {
          continue;
        }

        // Penanda bahwa metode ini benar-benar sebuah route handler:
        // hanya metode yang dipasangi @Get/@Post/… yang punya metadata path.
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) {
          continue;
        }

        const isPublic =
          controllerIsPublic ||
          this.reflector.get<boolean>(IS_PUBLIC_KEY, handler) === true;

        if (isPublic) {
          publicRoutes += 1;
          continue;
        }

        if (this.reflector.get<unknown>(POLICY_KEY, handler) !== undefined) {
          guarded += 1;
          continue;
        }

        violations.push(this.describe(handler, controllerPath));
      }
    }

    if (violations.length === 0) {
      this.logger.log(
        `Policy: ${guarded} rute dijaga, ${publicRoutes} rute publik. Tidak ada yang lolos.`,
      );
      return;
    }

    throw new Error(
      [
        '',
        `PolicyBootCheck menolak menyalakan aplikasi: ${violations.length} rute tidak dijaga.`,
        '',
        ...violations.map((line) => `  • ${line}`),
        '',
        'Setiap rute yang bukan @Public() wajib punya @Policy(name).',
        'Tambahkan @Policy(...) — atau, kalau rute ini memang boleh diakses',
        'tanpa token, tambahkan @Public() DAN pastikan ia memang pantas masuk',
        'daftar pendek di PRD-BACKEND.md §7.2.',
        '',
      ].join('\n'),
    );
  }

  private describe(handler: object, controllerPath: string): string {
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as
      RequestMethod | undefined;
    const verb =
      method === undefined ? 'ALL' : (RequestMethod[method] ?? String(method));
    const methodPath = this.methodPathOf(handler);
    const fullPath = `/${[controllerPath, methodPath].filter((part) => part.length > 0).join('/')}`;

    return `${verb.padEnd(6)} ${fullPath.replace(/\/+/g, '/')}`;
  }

  private controllerPathOf(metatype: object): string {
    const path = Reflect.getMetadata(PATH_METADATA, metatype) as
      string | string[] | undefined;

    if (Array.isArray(path)) {
      return path.join('/');
    }

    return path ?? '';
  }

  private methodPathOf(handler: object): string {
    const path = Reflect.getMetadata(PATH_METADATA, handler) as
      string | string[] | undefined;

    if (Array.isArray(path)) {
      return path.join('/');
    }

    return path ?? '';
  }
}
