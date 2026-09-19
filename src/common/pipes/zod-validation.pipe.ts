import {
  BadRequestException,
  Injectable,
  Optional,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

import { ZOD_SCHEMA_KEY } from '../constants';

/**
 * Satu-satunya jalur masuk data ke aplikasi (§7.12).
 *
 * Terdaftar **global** lewat `APP_PIPE`, jadi tidak ada rute yang bisa lupa
 * divalidasi. Skema diambil dari metadata yang dipasang `@ZodDto(...)` pada
 * kelas DTO. Kalau sebuah parameter tidak punya skema, nilainya diteruskan apa
 * adanya — pipe ini tidak menebak, dan tidak pernah menolak karena ketiadaan
 * skema.
 *
 * Sengaja **tidak** memakai `class-validator`. Skema Zod yang sama nanti
 * dipakai ulang frontend lewat paket `@samudrakarsa/shared`, sehingga bentuk
 * data hanya punya satu definisi. `class-validator` akan menjadi definisi
 * kedua — persis yang ingin dihapus keputusan 8.
 *
 * CATATAN: saat Swagger dihidupkan (§7.14), pipe ini digantikan `nestjs-zod`
 * supaya OpenAPI 3.1 bisa diturunkan dari skema yang sama. Bentuk pemakaiannya
 * di controller tidak berubah.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  /**
   * `@Optional()` wajib, bukan hiasan.
   *
   * `ZodType` diimpor dengan `import type`, jadi ia terhapus saat kompilasi dan
   * `design:paramtypes` yang dihasilkan `emitDecoratorMetadata` menjadi
   * `Object`. Tanpa `@Optional()`, Nest membaca itu sebagai provider yang harus
   * disuntikkan lalu gagal menyala dengan pesan yang menyesatkan. Dengan
   * `@Optional()`, ketiadaan provider dijawab `undefined` — dan `undefined`
   * memang arti yang benar untuk parameter ini.
   *
   * @param schemaOverride Diisi hanya kalau pipe dipakai per-parameter,
   *   mis. `@Body(new ZodValidationPipe(Skema))`. Mode global tidak memakainya.
   */
  constructor(@Optional() private readonly schemaOverride?: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = this.schemaOverride ?? this.schemaFromMetadata(metadata);

    if (!schema) {
      return value;
    }

    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: 'validation_failed',
        title: 'Data yang dikirim tidak valid',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    return result.data;
  }

  private schemaFromMetadata(metadata: ArgumentMetadata): ZodType | undefined {
    const { metatype, type } = metadata;

    // `custom` berarti parameter yang tidak berasal dari HTTP
    // (mis. @CurrentUser), jadi tidak ada yang perlu divalidasi.
    if (!metatype || type === 'custom') {
      return undefined;
    }

    return Reflect.getMetadata(ZOD_SCHEMA_KEY, metatype) as ZodType | undefined;
  }
}
