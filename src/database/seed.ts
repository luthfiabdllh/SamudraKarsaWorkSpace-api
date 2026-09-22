// Harus jadi impor **pertama**, dan urutannya penting.
//
// `PasswordService` memakai dekorator `@Injectable()`, dan dekorator itu
// memanggil `Reflect.defineMetadata`. Fungsi itu berasal dari paket ini, bukan
// dari JavaScript itu sendiri. Di dalam aplikasi Nest, `@nestjs/core` yang
// memuatnya lebih dulu; skrip ini tidak memuat `@nestjs/core` sama sekali,
// sehingga tanpa baris ini kelasnya gagal **saat berkasnya dibaca** — jauh
// sebelum satu baris pun di bawah sempat berjalan.
import 'dotenv/config';
import 'reflect-metadata';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { PasswordService } from '../auth/password.service';
import {
  clusters,
  divisions,
  periods,
  profiles,
  subunits,
  systemSettings,
} from './schema/organization';

/**
 * Seeder database pengembangan.
 *
 * ## Cara menjalankan
 *
 * ```bash
 * npm run build
 * SEED_ALLOW=1 npm run db:seed
 * ```
 *
 * `SEED_ALLOW=1` **wajib**, dan itu satu-satunya alasan skrip ini menolak
 * berjalan tanpa alasan yang jelas bagi yang membacanya.
 *
 * ## Kenapa ada penjaganya sama sekali
 *
 * Isi berkas ini bukan data rahasia — divisi dan cluster memang data master
 * yang harus ada. Yang berbahaya adalah **tujuh akun dengan password yang
 * tertulis di dalam berkas ini**. Kalau skrip ini pernah dijalankan terhadap
 * database yang dipakai orang sungguhan, tujuh akun itu ada di sana dengan
 * password yang bisa dibaca siapa pun yang pernah membuka repositori ini —
 * termasuk satu `owner`.
 *
 * Karena itu ada tiga lapis, dan ketiganya berdiri sendiri:
 *
 * 1. `NODE_ENV=production` menolak, tanpa kecuali.
 * 2. `SEED_ALLOW=1` wajib, sehingga tidak ada yang berjalan karena kebetulan.
 * 3. Host database dicetak sebelum menulis, supaya orangnya melihat **ke mana**
 *    ia sedang menulis tepat sebelum tulisannya terjadi.
 *
 * ## Yang sengaja TIDAK diisi
 *
 * Pekerjaan, request, pengumuman, program, dan seluruh data kerja lainnya.
 * Prinsip itu dipertahankan dari seeder `sksks` (`20260915000004_seed.sql`):
 * data struktural boleh diisi, data kerja tidak. Baris pekerjaan yang dibuat
 * seeder adalah baris yang akan muncul di setiap tangkapan layar, di setiap
 * hitungan dashboard, dan di setiap laporan — dan tidak ada cara membedakannya
 * dari pekerjaan sungguhan setelah tercampur.
 *
 * Akun **termasuk** pengecualian yang disengaja: tanpa satu pun akun, tidak ada
 * yang bisa masuk, dan seluruh sistem yang sudah dibangun tidak bisa diuji
 * sama sekali.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Data master
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diambil apa adanya dari `sksks/supabase/migrations/20260915000004_seed.sql`.
 *
 * Disalin, bukan dikarang. Nama divisi dan desa adalah **nama sungguhan** yang
 * sudah beredar di organisasi dan di dokumen; menggantinya dengan contoh
 * karangan akan membuat basis data pengembangan berisi struktur yang tidak
 * pernah ada, dan setiap uji coba di atasnya menguji hal yang salah.
 */
const DIVISIONS = [
  { code: 'sekbend', name: 'Sekretaris & Bendahara', icon: '💼', sortOrder: 1 },
  { code: 'psdm', name: 'PSDM', icon: '🫂', sortOrder: 2 },
  { code: 'humpub', name: 'Humas & Publikasi', icon: '📣', sortOrder: 3 },
  { code: 'medkre', name: 'Media Kreatif', icon: '🎨', sortOrder: 4 },
  { code: 'ops', name: 'Operasional', icon: '🚚', sortOrder: 5 },
  { code: 'sponsor', name: 'Sponsorship', icon: '🤝', sortOrder: 6 },
] as const;

const CLUSTERS = [
  { code: 'saintek', name: 'Saintek', sortOrder: 1 },
  { code: 'soshum', name: 'Soshum', sortOrder: 2 },
  { code: 'agro', name: 'Agro', sortOrder: 3 },
  { code: 'medika', name: 'Medika', sortOrder: 4 },
  { code: 'lintas', name: 'Lintas Klaster', sortOrder: 5 },
] as const;

const SUBUNITS = [
  {
    code: 'kaiwatu',
    name: 'Subunit Kaiwatu',
    villageName: 'Kaiwatu',
    sortOrder: 1,
  },
  {
    code: 'werwaru',
    name: 'Subunit Werwaru',
    villageName: 'Werwaru',
    sortOrder: 2,
  },
] as const;

const PERIODS = [
  {
    code: 'KKN-2026-2027',
    name: 'KKN 2026/2027',
    startsOn: new Date('2026-12-19T00:00:00.000Z'),
    endsOn: new Date('2027-02-06T00:00:00.000Z'),
    phase: 'kkn' as const,
    isActive: true,
  },
] as const;

const SETTINGS = [
  { key: 'app_name', value: 'MOA DESK' },
  {
    key: 'app_tagline',
    value: 'Katong datang untuk mendengar, belajar, dan baku kerja.',
  },
  { key: 'timezone', value: 'Asia/Jakarta' },
  { key: 'currency', value: 'IDR' },
  { key: 'member_dues_target', value: 4000000 },
  { key: 'team_fundraising_target', value: 100000000 },
  { key: 'member_count_target', value: 25 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Akun
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Password seluruh akun uji.
 *
 * Satu password untuk semuanya, dan itu disengaja: akun-akun ini ada untuk
 * **menguji perbedaan wewenang**, bukan untuk menguji kerahasiaan. Tujuh
 * password berbeda berarti tujuh hal yang harus dicatat dan disalin, dan yang
 * ketujuh akan salah ketik.
 *
 * Bisa ditimpa lewat `SEED_PASSWORD` kalau ada yang tidak ingin passwordnya
 * muncul di riwayat shell.
 */
const DEFAULT_PASSWORD = 'SamudraKarsa#2026';

/**
 * Akun uji, disusun supaya **setiap cabang `PolicyGuard` punya wakilnya**.
 *
 * Perhatikan yang ada dan yang sengaja ada:
 *
 * - `kadiv.sekbend` — kepala divisi Sekretaris & Bendahara. Satu-satunya akun
 *   di sini yang punya akses keuangan, karena `canReadFinance` menuntut
 *   kepemimpinan atas divisi `sekbend` **dan** tidak ada cara lain mendapatkannya.
 * - `wakadiv.medkre` — wakil kepala divisi. Ada di sini secara khusus karena
 *   keputusan 56: `division_deputy` harus diperlakukan sama persis dengan
 *   `division_head`, dan itu satu-satunya cara membuktikannya di aplikasi yang
 *   berjalan, bukan hanya di `resource.spec.ts`.
 * - `pending` — `mustChangePassword` menyala. Akun ini **tidak bisa dipakai
 *   membuka apa pun** kecuali mengganti password, dan justru itu gunanya:
 *   tanpa satu pun akun seperti ini, cabang penolakan di `PolicyGuard` tidak
 *   pernah dijalankan siapa pun sampai ada anggota sungguhan yang menerima
 *   password sementara — yaitu saat paling buruk untuk menemukan bugnya.
 */
const ACCOUNTS = [
  {
    email: 'owner@samudrakarsa.test',
    fullName: 'Rangga Prasetya',
    nickname: 'Rangga',
    roles: ['owner'],
    status: 'active',
    divisionCode: null,
    teamRole: 'Ketua',
    isKormasit: true,
    mustChangePassword: false,
  },
  {
    email: 'coowner@samudrakarsa.test',
    fullName: 'Salsabila Putri',
    nickname: 'Salsa',
    roles: ['co_owner'],
    status: 'active',
    divisionCode: null,
    teamRole: 'Wakil Ketua',
    isKormasit: true,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.sekbend@samudrakarsa.test',
    fullName: 'Anindya Larasati',
    nickname: 'Anin',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'sekbend',
    teamRole: 'Kadiv Sekretaris & Bendahara',
    isKormasit: false,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.medkre@samudrakarsa.test',
    fullName: 'Bagas Wicaksono',
    nickname: 'Bagas',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'medkre',
    teamRole: 'Kadiv Media Kreatif',
    isKormasit: false,
    mustChangePassword: false,
  },
  {
    email: 'wakadiv.medkre@samudrakarsa.test',
    fullName: 'Citra Maharani',
    nickname: 'Citra',
    roles: ['division_deputy'],
    status: 'active',
    divisionCode: 'medkre',
    teamRole: 'Wakadiv Media Kreatif',
    isKormasit: false,
    mustChangePassword: false,
  },
  {
    email: 'anggota@samudrakarsa.test',
    fullName: 'Damar Nugroho',
    nickname: 'Damar',
    roles: ['member'],
    status: 'active',
    divisionCode: 'medkre',
    teamRole: null,
    isKormasit: false,
    mustChangePassword: false,
  },
  {
    email: 'pending@samudrakarsa.test',
    fullName: 'Eka Saputra',
    nickname: 'Eka',
    roles: ['member'],
    status: 'active',
    divisionCode: 'medkre',
    teamRole: null,
    isKormasit: false,
    mustChangePassword: true,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Penjaga
// ─────────────────────────────────────────────────────────────────────────────

function assertAllowedToRun(): void {
  if (process.env.NODE_ENV === 'production') {
    fail(
      'NODE_ENV=production. Seeder ini tidak pernah boleh dijalankan terhadap ' +
        'database produksi — ia membuat akun dengan password yang tertulis di ' +
        'dalam kode sumber.',
    );
  }

  if (process.env.SEED_ALLOW !== '1') {
    fail(
      'SEED_ALLOW belum disetel.\n\n' +
        'Jalankan dengan:\n' +
        '    SEED_ALLOW=1 npm run db:seed\n\n' +
        'Penjaga ini ada karena skrip ini membuat tujuh akun dengan password ' +
        'yang bisa dibaca siapa pun yang membuka repositori ini.',
    );
  }

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL kosong. Jalankan lewat `npm run db:seed` agar .env ikut terbaca.',
    );
  }
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/** Host tujuan, tanpa kredensialnya — supaya bisa dicetak dengan aman. */
function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '(bawaan)'}${url.pathname}`;
  } catch {
    return '(tidak bisa dibaca)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Jalan
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertAllowedToRun();

  const password = process.env.SEED_PASSWORD ?? DEFAULT_PASSWORD;

  if (password.length < 12) {
    fail('SEED_PASSWORD kurang dari 12 karakter, dan akan ditolak saat login.');
  }

  console.log('\n  Database tujuan : ' + databaseHost());
  console.log(
    '  Password akun   : ' +
      (process.env.SEED_PASSWORD ? '(dari SEED_PASSWORD)' : DEFAULT_PASSWORD),
  );

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pool);
  const passwords = new PasswordService();

  try {
    /**
     * Seluruhnya dalam satu transaksi.
     *
     * Seeder yang gagal di tengah akan meninggalkan database yang **sebagian**
     * terisi — dan database yang sebagian terisi jauh lebih menyulitkan daripada
     * database kosong, karena tidak ada cara cepat mengetahui sampai mana ia
     * berjalan. Satu transaksi membuat hasilnya utuh atau tidak ada sama sekali.
     */
    const summary = await db.transaction(async (tx) => {
      // ── Data master ────────────────────────────────────────────────────────
      //
      // Semuanya `onConflictDoNothing` pada kuncinya masing-masing, sehingga
      // menjalankannya ulang tidak menggandakan apa pun dan tidak menimpa
      // perubahan yang sudah dibuat orang lewat API.

      await tx
        .insert(divisions)
        .values([...DIVISIONS])
        .onConflictDoNothing();
      await tx
        .insert(clusters)
        .values([...CLUSTERS])
        .onConflictDoNothing();
      await tx
        .insert(subunits)
        .values([...SUBUNITS])
        .onConflictDoNothing();
      await tx
        .insert(periods)
        .values([...PERIODS])
        .onConflictDoNothing();

      await tx
        .insert(systemSettings)
        .values(SETTINGS.map((s) => ({ key: s.key, value: s.value })))
        .onConflictDoNothing();

      // ── Id divisi ──────────────────────────────────────────────────────────
      //
      // Dibaca kembali alih-alih memakai hasil `returning`, karena baris yang
      // sudah ada dari jalan sebelumnya tidak muncul di `returning` — dan akun
      // yang menunjuk divisi itu tetap harus mendapat id yang benar.

      const divisionRows = await tx.select().from(divisions);
      const divisionIdByCode = new Map(divisionRows.map((d) => [d.code, d.id]));

      const periodRows = await tx.select().from(periods);

      // ── Akun ───────────────────────────────────────────────────────────────

      const created: { email: string; roles: string; note: string }[] = [];
      let skipped = 0;

      for (const account of ACCOUNTS) {
        const divisionId = account.divisionCode
          ? (divisionIdByCode.get(account.divisionCode) ?? null)
          : null;

        // Divisi yang diminta tapi tidak ada akan menghasilkan akun tanpa
        // divisi — dan akun tanpa divisi yang seharusnya punya divisi adalah
        // bug yang menyesatkan: uji coba izin akan gagal dengan alasan yang
        // tidak ada hubungannya dengan yang sedang diuji.
        if (account.divisionCode && !divisionId) {
          throw new Error(
            `Divisi "${account.divisionCode}" tidak ada, padahal akun ` +
              `${account.email} menghendakinya.`,
          );
        }

        const inserted = await tx
          .insert(profiles)
          .values({
            email: account.email,
            fullName: account.fullName,
            nickname: account.nickname,
            passwordHash: await passwords.hashPassword(password),
            roles: [...account.roles],
            status: account.status,
            divisionId,
            teamRole: account.teamRole,
            isKormasit: account.isKormasit,
            mustChangePassword: account.mustChangePassword,
          })
          .onConflictDoNothing({ target: profiles.email })
          .returning({ id: profiles.id });

        if (inserted.length === 0) {
          skipped += 1;
          continue;
        }

        created.push({
          email: account.email,
          roles: account.roles.join(' + '),
          note: [
            account.divisionCode ? `divisi ${account.divisionCode}` : null,
            account.mustChangePassword ? 'WAJIB ganti password' : null,
          ]
            .filter(Boolean)
            .join(' · '),
        });
      }

      return {
        divisions: divisionRows.length,
        clusters: (await tx.select().from(clusters)).length,
        subunits: (await tx.select().from(subunits)).length,
        periods: periodRows.length,
        settings: SETTINGS.length,
        created,
        skipped,
      };
    });

    // ── Laporan ──────────────────────────────────────────────────────────────

    console.log('\n  Data master');
    console.log(`    divisi   ${summary.divisions}`);
    console.log(`    cluster  ${summary.clusters}`);
    console.log(`    subunit  ${summary.subunits}`);
    console.log(`    periode  ${summary.periods}`);
    console.log(`    setelan  ${summary.settings}`);

    if (summary.created.length > 0) {
      console.log(`\n  Akun dibuat (${summary.created.length})`);
      for (const account of summary.created) {
        console.log(`    ${account.email.padEnd(36)} ${account.roles}`);
        if (account.note) {
          console.log(`    ${''.padEnd(36)} ${account.note}`);
        }
      }
      console.log(`\n  Password semuanya: ${password}`);
      console.log(
        '\n  Akun ini punya password yang tertulis di kode sumber.\n' +
          '  Jangan pernah menjalankan seeder ini terhadap database produksi.',
      );
    } else {
      console.log('\n  Akun: tidak ada yang baru.');
    }

    if (summary.skipped > 0) {
      console.log(
        `  (${summary.skipped} akun dilewati karena emailnya sudah ada)`,
      );
    }

    console.log('');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    '\n  ✗ Seeder gagal:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
