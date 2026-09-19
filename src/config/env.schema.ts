import { z } from 'zod';

/**
 * Environment divalidasi saat boot, bukan saat dipakai.
 *
 * Prinsipnya sama dengan `PolicyBootCheck`: lebih baik aplikasi menolak menyala
 * daripada gagal diam-diam berjam-jam kemudian. Variabel yang kurang biasanya
 * baru terasa sebagai `undefined` yang menjalar jauh dari sumbernya.
 *
 * Memakai Zod — pustaka yang sama dengan validasi request — supaya hanya ada
 * satu cara menyatakan bentuk data di seluruh sistem (keputusan 8).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Keputusan 9 — Supabase Postgres, hanya sebagai database, lewat pooler.
   *
   * Wajib, termasuk di development. Sempat terpikir dibuat opsional supaya
   * aplikasi bisa menyala tanpa database, tapi itu akan memaksa setiap
   * repository memeriksa `null` selamanya — demi kenyamanan sesaat. Gagal saat
   * boot lebih murah, dan `/health/ready` tetap bisa menguji jalur gagalnya
   * dengan URL yang belum bisa dijangkau.
   */
  DATABASE_URL: z.string().min(1),

  /** Dipakai menyusun URI `type` pada respons RFC 7807 (§7.5). */
  API_PUBLIC_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Dipanggil `@nestjs/config` lewat opsi `validate`.
 *
 * Melempar error di sini membuat aplikasi berhenti saat menyala — dan pesannya
 * menyebutkan setiap variabel yang bermasalah sekaligus, bukan satu per satu
 * supaya tidak ada bolak-balik.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  • ${issue.path.join('.') || '(akar)'} — ${issue.message}`,
      )
      .join('\n');

    throw new Error(
      `Environment tidak valid. Perbaiki lalu jalankan ulang:\n${details}\n\n` +
        `Lihat .env.example untuk daftar kunci yang dibutuhkan.`,
    );
  }

  return result.data;
}
