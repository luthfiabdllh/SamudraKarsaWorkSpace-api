import type { ZodType } from 'zod';

import { ZOD_SCHEMA_KEY } from '../constants';

/**
 * Memasang skema Zod pada sebuah kelas DTO supaya `ZodValidationPipe` global
 * bisa menemukannya.
 *
 * ```ts
 * const CreateWorkItemSchema = z.object({ title: z.string().min(1) });
 *
 * @ZodDto(CreateWorkItemSchema)
 * export class CreateWorkItemDto {
 *   declare title: string;
 * }
 * ```
 *
 * Bidang `declare` tidak menghasilkan kode apa pun saat runtime — ia hanya
 * memberi tahu TypeScript bentuknya. Validasi tetap sepenuhnya milik skema.
 *
 * **Kenapa tidak langsung `z.infer`?** Karena `z.infer` menghasilkan `type`,
 * dan `type` hilang saat kompilasi. `ZodValidationPipe` global perlu sesuatu
 * yang masih ada saat runtime untuk dibaca metadatanya; kelas inilah hal itu.
 *
 * CATATAN: saat `nestjs-zod` masuk untuk Swagger (§7.14), decorator ini
 * digantikan `createZodDto` dari pustaka itu dan berkas ini bisa dihapus.
 */
export function ZodDto<T extends ZodType>(schema: T): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, schema, target);
  };
}
