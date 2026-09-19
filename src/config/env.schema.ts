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

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Kunci penanda tangan access token (HMAC-SHA256).
   *
   * Minimal 32 karakter, dan batas itu **tidak** ditegakkan di sini untuk
   * kerapian: HS256 memotong kunci yang lebih pendek dari panjang bloknya,
   * sehingga kunci 8 karakter memberi rasa aman yang tidak sebanding dengan
   * entropi yang benar-benar ada. Menolak saat boot lebih murah daripada
   * menemukannya setelah token beredar.
   *
   * Membuatnya:
   *
   *   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   *
   * **Mengganti nilai ini mencabut seluruh sesi yang sedang berjalan**, karena
   * setiap access token lama berhenti cocok. Itu memang yang diinginkan kalau
   * kuncinya bocor — tapi jangan menggantinya tanpa sadar.
   */
  JWT_SECRET: z
    .string()
    .min(
      32,
      'JWT_SECRET minimal 32 karakter — bangkitkan dengan acak, jangan diketik.',
    ),

  /**
   * Client ID OAuth Google.
   *
   * Dipakai sebagai **audience** saat memverifikasi ID token: token yang
   * diterbitkan untuk aplikasi lain harus ditolak, meski tanda tangannya sah.
   * Tanpa pemeriksaan ini, ID token milik aplikasi Google mana pun bisa dipakai
   * masuk ke sini.
   *
   * `GOOGLE_CLIENT_SECRET` **tidak** ada di sini, dan itu disengaja: rahasia itu
   * dipakai untuk menukar authorization code, dan yang menukarnya adalah BFF
   * (keputusan 31). Backend hanya menerima ID token yang sudah jadi dan
   * memverifikasinya — pekerjaan yang tidak menuntut rahasia klien sama sekali.
   */
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1)
    .refine((v) => v.endsWith('.apps.googleusercontent.com'), {
      message:
        'GOOGLE_CLIENT_ID harus berakhiran .apps.googleusercontent.com — ' +
        'periksa apakah yang tersalin adalah client ID, bukan client secret.',
    }),
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
