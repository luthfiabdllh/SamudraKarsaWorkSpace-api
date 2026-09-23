// Harus jadi impor **pertama**, dan urutannya penting.
import 'dotenv/config';
import 'reflect-metadata';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { PasswordService } from '../auth/password.service';
import {
  announcements,
  calendarEventAttendees,
  calendarEvents,
  meetingDecisions,
  meetingParticipants,
  meetings,
  notifications,
} from './schema/collaboration';
import { contentItems, creativeRequests } from './schema/content';
import { documentCounters } from './schema/counters';
import {
  budgetItems,
  budgets,
  memberDues,
  memberPayments,
  transactions,
} from './schema/finance';
import { feedback, internalActivities } from './schema/internal';
import { letters } from './schema/letters';
import {
  inventoryItems,
  inventoryMovements,
  shipments,
  trips,
} from './schema/operations';
import {
  clusters,
  divisions,
  periods,
  profiles,
  programMembers,
  programs,
  subunits,
  systemSettings,
} from './schema/organization';
import {
  partnerFollowups,
  partners,
  sponsorBenefits,
} from './schema/partners';
import { activityLogs } from './schema/system';
import {
  milestones,
  requests,
  workItemAssignees,
  workItemChecklists,
  workItems,
} from './schema/work';

/**
 * Seeder datowner@samudrakarsa.testabase operasional dan pengembangan lengkap.
 *
 * Mengisi struktur organisasi, akun uji peran lengkap, serta seluruh data domain
 * operasional sesuai alur dan tata kelola di ALUR-BACKEND-UNTUK-FE.md.
 *
 * ## Cara menjalankan
 * ```bash
 * npm run build
 * SEED_ALLOW=1 npm run db:seed
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Data Master Organisasi
// ─────────────────────────────────────────────────────────────────────────────

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
// 2. Akun Uji Lintas Peran & Divisi
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PASSWORD = 'SamudraKarsa#2026';

const ACCOUNTS = [
  {
    email: 'owner@samudrakarsa.test',
    fullName: 'Rangga Prasetya',
    nickname: 'Rangga',
    roles: ['owner'],
    status: 'active',
    divisionCode: null,
    clusterCode: 'saintek',
    subunitCode: 'kaiwatu',
    teamRole: 'Ketua Pelaksana',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'coowner@samudrakarsa.test',
    fullName: 'Salsabila Putri',
    nickname: 'Salsa',
    roles: ['co_owner'],
    status: 'active',
    divisionCode: null,
    clusterCode: 'soshum',
    subunitCode: 'werwaru',
    teamRole: 'Wakil Ketua Pelaksana',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.sekbend@samudrakarsa.test',
    fullName: 'Anindya Larasati',
    nickname: 'Anin',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'sekbend',
    clusterCode: 'soshum',
    subunitCode: 'kaiwatu',
    teamRole: 'Kadiv Sekretaris & Bendahara',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.medkre@samudrakarsa.test',
    fullName: 'Bagas Wicaksono',
    nickname: 'Bagas',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'medkre',
    clusterCode: 'saintek',
    subunitCode: 'kaiwatu',
    teamRole: 'Kadiv Media Kreatif',
    isKormasit: false,
    isKormater: true,
    mustChangePassword: false,
  },
  {
    email: 'wakadiv.medkre@samudrakarsa.test',
    fullName: 'Citra Maharani',
    nickname: 'Citra',
    roles: ['division_deputy'],
    status: 'active',
    divisionCode: 'medkre',
    clusterCode: 'soshum',
    subunitCode: 'werwaru',
    teamRole: 'Wakadiv Media Kreatif',
    isKormasit: true,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'anggota@samudrakarsa.test',
    fullName: 'Damar Nugroho',
    nickname: 'Damar',
    roles: ['member'],
    status: 'active',
    divisionCode: 'medkre',
    clusterCode: 'saintek',
    subunitCode: 'kaiwatu',
    teamRole: 'Staf Desain Grafis',
    isKormasit: true,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'pending@samudrakarsa.test',
    fullName: 'Eka Saputra',
    nickname: 'Eka',
    roles: ['member'],
    status: 'active',
    divisionCode: 'medkre',
    clusterCode: 'saintek',
    subunitCode: 'kaiwatu',
    teamRole: 'Staf Kreatif Baru',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: true,
  },
  {
    email: 'kadiv.humpub@samudrakarsa.test',
    fullName: 'Fajar Ramadhan',
    nickname: 'Fajar',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'humpub',
    clusterCode: 'soshum',
    subunitCode: 'werwaru',
    teamRole: 'Kadiv Humas & Publikasi',
    isKormasit: false,
    isKormater: true,
    mustChangePassword: false,
  },
  {
    email: 'member.humpub@samudrakarsa.test',
    fullName: 'Gita Savitri',
    nickname: 'Gita',
    roles: ['member'],
    status: 'active',
    divisionCode: 'humpub',
    clusterCode: 'agro',
    subunitCode: 'werwaru',
    teamRole: 'Staf Media Sosial',
    isKormasit: false,
    isKormater: true,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.ops@samudrakarsa.test',
    fullName: 'Hadi Kusuma',
    nickname: 'Hadi',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'ops',
    clusterCode: 'medika',
    subunitCode: 'werwaru',
    teamRole: 'Kadiv Operasional & Logistik',
    isKormasit: false,
    isKormater: true,
    mustChangePassword: false,
  },
  {
    email: 'member.ops@samudrakarsa.test',
    fullName: 'Indra Wijaya',
    nickname: 'Indra',
    roles: ['member'],
    status: 'active',
    divisionCode: 'ops',
    clusterCode: 'lintas',
    subunitCode: 'werwaru',
    teamRole: 'Staf Logistik Posko',
    isKormasit: false,
    isKormater: true,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.sponsor@samudrakarsa.test',
    fullName: 'Joko Prasetyo',
    nickname: 'Joko',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'sponsor',
    clusterCode: 'soshum',
    subunitCode: 'kaiwatu',
    teamRole: 'Kadiv Sponsorship',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'kadiv.psdm@samudrakarsa.test',
    fullName: 'Kartika Sari',
    nickname: 'Kartika',
    roles: ['division_head'],
    status: 'active',
    divisionCode: 'psdm',
    clusterCode: 'agro',
    subunitCode: 'kaiwatu',
    teamRole: 'Kadiv PSDM & Internal',
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
  {
    email: 'inactive@samudrakarsa.test',
    fullName: 'Luki Hermawan',
    nickname: 'Luki',
    roles: ['member'],
    status: 'inactive',
    divisionCode: 'ops',
    clusterCode: 'saintek',
    subunitCode: 'kaiwatu',
    teamRole: null,
    isKormasit: false,
    isKormater: false,
    mustChangePassword: false,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Penjaga
// ─────────────────────────────────────────────────────────────────────────────

function assertAllowedToRun(): void {
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV=production. Seeder ini dilarang keras di environment produksi.');
  }

  if (process.env.SEED_ALLOW !== '1') {
    fail(
      'SEED_ALLOW belum disetel.\n\n' +
        'Jalankan dengan:\n' +
        '    SEED_ALLOW=1 npm run db:seed\n',
    );
  }

  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL kosong. Periksa file .env.');
  }
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '(bawaan)'}${url.pathname}`;
  } catch {
    return '(tidak bisa dibaca)';
  }
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error('Hasil query returning kosong.');
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eksekusi Seeder Utama
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertAllowedToRun();

  const password = process.env.SEED_PASSWORD ?? DEFAULT_PASSWORD;
  if (password.length < 12) {
    fail('SEED_PASSWORD kurang dari 12 karakter.');
  }

  console.log('\n  ======================================================');
  console.log('  SAMUDRA KARSA — SEEDER BASIS DATA PENGEMBANGAN LENGKAP');
  console.log('  ======================================================');
  console.log('  Database tujuan : ' + databaseHost());
  console.log('  Password akun   : ' + password);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pool);
  const passwords = new PasswordService();

  try {
    await db.transaction(async (tx) => {
      // ───────────────────────────────────────────────────────────────────────
      // A. Data Master Struktural
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(divisions).values([...DIVISIONS]).onConflictDoNothing();
      await tx.insert(clusters).values([...CLUSTERS]).onConflictDoNothing();
      await tx.insert(subunits).values([...SUBUNITS]).onConflictDoNothing();
      await tx.insert(periods).values([...PERIODS]).onConflictDoNothing();
      await tx
        .insert(systemSettings)
        .values(SETTINGS.map((s) => ({ key: s.key, value: s.value })))
        .onConflictDoNothing();

      const divisionRows = await tx.select().from(divisions);
      const divisionIdByCode = new Map(divisionRows.map((d) => [d.code, d.id]));

      const clusterRows = await tx.select().from(clusters);
      const clusterIdByCode = new Map(clusterRows.map((c) => [c.code, c.id]));

      const subunitRows = await tx.select().from(subunits);
      const subunitIdByCode = new Map(subunitRows.map((s) => [s.code, s.id]));

      const periodRows = await tx.select().from(periods);
      const activePeriod = periodRows.find((p) => p.isActive) ?? periodRows[0];
      if (!activePeriod) {
        throw new Error('Tidak ada periode aktif.');
      }

      // ───────────────────────────────────────────────────────────────────────
      // B. Akun Anggota (Profiles)
      // ───────────────────────────────────────────────────────────────────────
      for (const account of ACCOUNTS) {
        const divisionId = account.divisionCode
          ? (divisionIdByCode.get(account.divisionCode) ?? null)
          : null;
        const clusterId = account.clusterCode
          ? (clusterIdByCode.get(account.clusterCode) ?? null)
          : null;
        const subunitId = account.subunitCode
          ? (subunitIdByCode.get(account.subunitCode) ?? null)
          : null;

        await tx
          .insert(profiles)
          .values({
            email: account.email,
            fullName: account.fullName,
            nickname: account.nickname,
            passwordHash: await passwords.hashPassword(password),
            roles: [...account.roles],
            status: account.status,
            divisionId,
            clusterId,
            subunitId,
            teamRole: account.teamRole,
            isKormasit: account.isKormasit,
            isKormater: account.isKormater,
            mustChangePassword: account.mustChangePassword,
          })
          .onConflictDoNothing({ target: profiles.email });
      }

      const allProfiles = await tx.select().from(profiles);
      const pByEmail = new Map(allProfiles.map((p) => [p.email, p]));
      const getProfile = (email: string) => {
        const found = pByEmail.get(email);
        if (!found) throw new Error(`Akun ${email} tidak ditemukan.`);
        return found;
      };

      const owner = getProfile('owner@samudrakarsa.test');
      const coowner = getProfile('coowner@samudrakarsa.test');
      const sekbend = getProfile('kadiv.sekbend@samudrakarsa.test');
      const medkre = getProfile('kadiv.medkre@samudrakarsa.test');
      const citra = getProfile('wakadiv.medkre@samudrakarsa.test');
      const damar = getProfile('anggota@samudrakarsa.test');
      const humpub = getProfile('kadiv.humpub@samudrakarsa.test');
      const gita = getProfile('member.humpub@samudrakarsa.test');
      const ops = getProfile('kadiv.ops@samudrakarsa.test');
      const indra = getProfile('member.ops@samudrakarsa.test');
      const sponsor = getProfile('kadiv.sponsor@samudrakarsa.test');
      const psdm = getProfile('kadiv.psdm@samudrakarsa.test');

      // ───────────────────────────────────────────────────────────────────────
      // C. Bersihkan Tabel Operasional (Idempoten untuk seeding ulang)
      // ───────────────────────────────────────────────────────────────────────
      await tx.execute(sql`
        TRUNCATE TABLE
          activity_logs,
          notifications,
          feedback,
          announcements,
          calendar_event_attendees,
          calendar_events,
          meeting_decisions,
          meeting_participants,
          meetings,
          internal_activities,
          shipments,
          trips,
          inventory_movements,
          inventory_items,
          sponsor_benefits,
          partner_followups,
          partners,
          creative_requests,
          content_items,
          member_payments,
          member_dues,
          transactions,
          budget_items,
          budgets,
          letters,
          milestones,
          work_item_dependencies,
          work_item_checklists,
          work_item_assignees,
          work_items,
          requests,
          program_members,
          programs,
          document_counters
        CASCADE;
      `);

      // ───────────────────────────────────────────────────────────────────────
      // D. Program Kerja (programs & program_members)
      // ───────────────────────────────────────────────────────────────────────
      const progRows = await tx
        .insert(programs)
        .values([
          {
            programNumber: 'PRG-2026-00001',
            name: 'Instalasi Panel Surya & Pompa Air Bersih Desa Kaiwatu',
            periodId: activePeriod.id,
            clusterId: clusterIdByCode.get('saintek')!,
            subunitId: subunitIdByCode.get('kaiwatu')!,
            picId: owner.id,
            status: 'in_progress',
            progressPercentage: 45,
            budgetPlan: '15000000',
            budgetRealization: '14250000',
            background:
              'Desa Kaiwatu memiliki potensi penyinaran matahari tinggi namun suplai listrik dari PLTD desa terbatas dan pasokan air bersih sering terhenti.',
            problemStatement: 'Ketiadaan akses air bersih terjadwal bagi 120 KK di pesisir Kaiwatu.',
            goals: 'Menyediakan pompa air bertenaga surya 1000W dengan tandon penampung 5000L.',
            outputTarget: '1 unit sistem pompa air surya berfungsi penuh di Dusun 1 Kaiwatu.',
            createdBy: owner.id,
          },
          {
            programNumber: 'PRG-2026-00002',
            name: 'Revitalisasi Pengolahan & Pengemasan Minyak Pala Werwaru',
            periodId: activePeriod.id,
            clusterId: clusterIdByCode.get('agro')!,
            subunitId: subunitIdByCode.get('werwaru')!,
            picId: coowner.id,
            status: 'in_progress',
            progressPercentage: 60,
            budgetPlan: '8500000',
            budgetRealization: '5200000',
            background: 'Pala melimpah namun nilai jual rendah karena dijual mentah tanpa hilirisasi.',
            goals: 'Pelatihan ekstraksi minyak atsiri pala dan standardisasi kemasan UMKM desa.',
            outputTarget: '2 kelompok tani mampu memproduksi minyak pala berlabel SNI kemasan 100ml.',
            createdBy: coowner.id,
          },
          {
            programNumber: 'PRG-2026-00003',
            name: 'Skrining Kesehatan Gigi & Edukasi Gizi Pencegahan Stunting',
            periodId: activePeriod.id,
            clusterId: clusterIdByCode.get('medika')!,
            subunitId: subunitIdByCode.get('kaiwatu')!,
            picId: psdm.id,
            status: 'ready',
            progressPercentage: 10,
            budgetPlan: '4500000',
            budgetRealization: '0',
            background: 'Tingginya angka karies pada balita dan kebutuhan edukasi MP-ASI bergizi lokal.',
            goals: 'Pemeriksaan gigi gratis 150 anak dan pelatihan olahan pangan kelor.',
            outputTarget: '150 anak terskrining dan buku saku gizi dibagikan ke seluruh posyandu.',
            createdBy: psdm.id,
          },
          {
            programNumber: 'PRG-2026-00004',
            name: 'Pelatihan Digital Marketing & E-Commerce Tenun Tradisional',
            periodId: activePeriod.id,
            clusterId: clusterIdByCode.get('soshum')!,
            subunitId: subunitIdByCode.get('werwaru')!,
            picId: gita.id,
            status: 'idea',
            progressPercentage: 0,
            budgetPlan: '3000000',
            budgetRealization: '0',
            background: 'Kain tenun khas Werwaru berkualitas tinggi namun belum tersentuh pasar daring.',
            goals: 'Membuka etalase digital di Tokopedia/Shopee dan katalog digital Instagram.',
            outputTarget: 'Katalog digital 20 motif tenun dan akun toko resmi kelompok perajin.',
            createdBy: gita.id,
          },
        ])
        .returning();

      const prog1 = progRows[0]!;
      const prog2 = progRows[1]!;
      const prog3 = progRows[2]!;
      const prog4 = progRows[3]!;

      await tx.insert(programMembers).values([
        { programId: prog1.id, profileId: owner.id, roleNote: 'Koordinator Lapangan' },
        { programId: prog1.id, profileId: ops.id, roleNote: 'Penanggung Jawab Instalasi' },
        { programId: prog2.id, profileId: coowner.id, roleNote: 'Pendamping Pengolahan' },
        { programId: prog3.id, profileId: psdm.id, roleNote: 'Koordinator Tenaga Medis' },
        { programId: prog4.id, profileId: gita.id, roleNote: 'Instruktur Pemasaran Digital' },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // E. Permintaan (Requests) & Pekerjaan (Work Items) - FSM & Sinkronisasi
      // ───────────────────────────────────────────────────────────────────────

      // 1. Work Item mandiri pertama (Status: done)
      const wi1 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00001',
            title: 'Penyusunan Rencana Strategis & Timeline Induk KKN 2026/2027',
            type: 'task',
            description: 'Penyusunan kerangka kerja seluruh klaster dan sinkronisasi agenda lapangan.',
            primaryPicId: owner.id,
            divisionId: divisionIdByCode.get('sekbend')!,
            periodId: activePeriod.id,
            priority: 'urgent',
            status: 'done',
            progressPercentage: 100,
            completionSummary:
              'Renstra dan timeline induk selesai disahkan oleh DPL dan pimpinan tim KKN.',
            completedAt: new Date('2026-09-05T10:00:00Z'),
            createdBy: owner.id,
          })
          .returning(),
      );

      // 2. Request Desain (Humas -> Medkre) yang melahirkan Work Item 2
      const req1 = firstRow(
        await tx
          .insert(requests)
          .values({
            requestNumber: 'REQ-2026-00001',
            requesterId: humpub.id,
            requesterDivisionId: divisionIdByCode.get('humpub')!,
            targetDivisionId: divisionIdByCode.get('medkre')!,
            type: 'design',
            title: 'Permintaan Desain Template Feed & Story Launching Program KKN',
            description:
              'Dibutuhkan 6 variasi template postingan Instagram resmi untuk publikasi program kerja klaster.',
            periodId: activePeriod.id,
            priority: 'high',
            status: 'in_progress',
            assignedPicId: medkre.id,
            dueDate: '2026-10-15',
            createdBy: humpub.id,
          })
          .returning(),
      );

      const wi2 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00002',
            title: 'Produksi Desain Template Feed & Story Launching Program KKN',
            type: 'request',
            description: 'Turunan dari REQ-2026-00001 untuk kebutuhan publikasi Divisi Humas.',
            primaryPicId: medkre.id,
            divisionId: divisionIdByCode.get('medkre')!,
            periodId: activePeriod.id,
            priority: 'high',
            status: 'in_progress',
            progressPercentage: 65,
            sourceRequestId: req1.id,
            dueDate: '2026-10-15',
            createdBy: medkre.id,
          })
          .returning(),
      );

      // Tautkan balik request 1 ke work item 2 (Bidirectional sync)
      await tx
        .update(requests)
        .set({ linkedWorkItemId: wi2.id })
        .where(sql`id = ${req1.id}`);

      // 3. Work Item Status on_hold (Wajib holdReason)
      const wi3 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00003',
            title: 'Pengadaan Generator Cadangan 5000W Posko Werwaru',
            type: 'program_need',
            description: 'Penyediaan cadangan listrik posko saat pemadaman bergilir PLN kecamatan.',
            primaryPicId: ops.id,
            divisionId: divisionIdByCode.get('ops')!,
            periodId: activePeriod.id,
            priority: 'high',
            status: 'blocked',
            progressPercentage: 30,
            holdReason: 'Menunggu pencairan dana sponsorship tahap pertama dari PT Bank Daerah.',
            blockerReason: 'Kas operasional belum mencukupi untuk pembelian unit genset 5000W baru.',
            assistanceNeeded: 'Divisi Sponsorship mohon follow-up pencairan termin 1 MoU sponsorship.',
            createdBy: ops.id,
          })
          .returning(),
      );

      // 4. Work Item Status in_review
      const wi4 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00004',
            title: 'Finalisasi Surat Izin Riset & Audiensi Bappeda Maluku Barat Daya',
            type: 'task',
            description: 'Draft surat resmi pengantar audiensi dan rekomendasi penelitian desa.',
            primaryPicId: sekbend.id,
            divisionId: divisionIdByCode.get('sekbend')!,
            periodId: activePeriod.id,
            priority: 'urgent',
            status: 'in_review',
            progressPercentage: 90,
            dueDate: '2026-10-01',
            createdBy: sekbend.id,
          })
          .returning(),
      );

      // 5. Work Item Tanpa PIC (Test Case FE: ?withoutPic=true)
      const wi5 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00005',
            title: 'Survei Jalur Distribusi Logistik dan Sewa Kapal Penyeberangan',
            type: 'subunit_need',
            description:
              'Pencarian kontak motor laut / speedboat dan negosiasi tarif muatan barang dari Tiakur ke Moa.',
            primaryPicId: null, // Tanpa PIC!
            divisionId: divisionIdByCode.get('ops')!,
            periodId: activePeriod.id,
            priority: 'medium',
            status: 'todo',
            progressPercentage: 0,
            createdBy: ops.id,
          })
          .returning(),
      );

      // 6. Work Item Status backlog
      const wi6 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00006',
            title: 'Penyusunan Modul Pelatihan Kewirausahaan & Manajemen Kas UMKM',
            type: 'task',
            primaryPicId: gita.id,
            divisionId: divisionIdByCode.get('humpub')!,
            periodId: activePeriod.id,
            priority: 'low',
            status: 'backlog',
            progressPercentage: 0,
            createdBy: gita.id,
          })
          .returning(),
      );

      // 7. Work Item Soft-Deleted (Test Case FE: Recycle Bin)
      const wi7 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00007',
            title: 'Riset Pembuatan Video Dokumenter Lama (Dibatalkan)',
            type: 'task',
            primaryPicId: medkre.id,
            divisionId: divisionIdByCode.get('medkre')!,
            periodId: activePeriod.id,
            priority: 'low',
            status: 'backlog',
            deletedAt: new Date('2026-09-18T14:30:00Z'),
            createdBy: medkre.id,
          })
          .returning(),
      );

      // 8. Work Item Program Need
      const wi8 = firstRow(
        await tx
          .insert(workItems)
          .values({
            workNumber: 'WI-2026-00008',
            title: 'Penyusunan Rincian Anggaran Komponen Solar Cell Kaiwatu',
            type: 'program_need',
            primaryPicId: ops.id,
            divisionId: divisionIdByCode.get('ops')!,
            periodId: activePeriod.id,
            priority: 'medium',
            status: 'done',
            progressPercentage: 100,
            completionSummary: 'Komponen solar cell telah disurvei harganya dan disetujui bendahara.',
            completedAt: new Date('2026-09-12T16:00:00Z'),
            createdBy: ops.id,
          })
          .returning(),
      );

      // Assignees untuk Work Item 2 & 1
      await tx.insert(workItemAssignees).values([
        { workItemId: wi2.id, profileId: medkre.id },
        { workItemId: wi2.id, profileId: citra.id },
        { workItemId: wi2.id, profileId: damar.id },
        { workItemId: wi1.id, profileId: owner.id },
        { workItemId: wi1.id, profileId: coowner.id },
        { workItemId: wi3.id, profileId: ops.id },
        { workItemId: wi3.id, profileId: indra.id },
      ]);

      // Checklists untuk Work Item 2
      await tx.insert(workItemChecklists).values([
        { workItemId: wi2.id, label: 'Sketsa konsep visual dan logo KKN', isDone: true, sortOrder: 1 },
        { workItemId: wi2.id, label: 'Penentuan palet warna primer dan tipografi', isDone: true, sortOrder: 2 },
        { workItemId: wi2.id, label: 'Template feed Instagram 6 slide carousel', isDone: false, sortOrder: 3 },
        { workItemId: wi2.id, label: 'Template story Instagram untuk pengumuman', isDone: false, sortOrder: 4 },
      ]);

      // Sisa Permintaan (Requests)
      // Req 2: Submitted
      await tx.insert(requests).values({
        requestNumber: 'REQ-2026-00002',
        requesterId: ops.id,
        requesterDivisionId: divisionIdByCode.get('ops')!,
        targetDivisionId: divisionIdByCode.get('sekbend')!,
        type: 'correspondence',
        title: 'Permintaan Penerbitan Surat Rekomendasi Camat Moa',
        description: 'Dibutuhkan surat resmi permohonan dispensasi angkutan logistik kapal pelat merah.',
        periodId: activePeriod.id,
        priority: 'high',
        status: 'submitted',
        assignedPicId: sekbend.id,
        createdBy: ops.id,
      });

      // Req 3: need_clarification (Wajib clarificationNote)
      await tx.insert(requests).values({
        requestNumber: 'REQ-2026-00003',
        requesterId: owner.id,
        requesterDivisionId: null,
        targetDivisionId: divisionIdByCode.get('ops')!,
        type: 'goods_procurement',
        title: 'Permintaan Pengadaan Alat Pengukur pH & Kelembapan Tanah',
        description: 'Dibutuhkan 3 set soil meter untuk survei awal lahan pertanian Desa Werwaru.',
        periodId: activePeriod.id,
        priority: 'medium',
        status: 'need_clarification',
        clarificationNote:
          'Mohon konfirmasi tipe alat: apakah sensor digital portabel dengan probe ganda atau model strip manual? Tolong sebutkan estimasi pagu biaya.',
        assignedPicId: ops.id,
        createdBy: owner.id,
      });

      // Req 4: Konflik Sinkronisasi (Test Case FE: sync_conflict_at & rekonsiliasi)
      await tx.insert(requests).values({
        requestNumber: 'REQ-2026-00004',
        requesterId: coowner.id,
        requesterDivisionId: null,
        targetDivisionId: divisionIdByCode.get('medkre')!,
        type: 'video_editing',
        title: 'Permintaan Video Profil Potensi Pariwisata Desa Werwaru',
        description: 'Video teaser 90 detik menampilkan pesona pantai dan kerajinan tenun ikat.',
        periodId: activePeriod.id,
        priority: 'medium',
        status: 'in_progress',
        assignedPicId: citra.id,
        syncConflictAt: new Date('2026-09-20T11:00:00Z'),
        syncConflictNote:
          'Pekerjaan ditandai selesai oleh tim kreatif namun pemohon meminta revisi color grading. Perlu rekonsiliasi status.',
        createdBy: coowner.id,
      });

      // Req 5: Draft Tanpa PIC
      await tx.insert(requests).values({
        requestNumber: 'REQ-2026-00005',
        requesterId: psdm.id,
        requesterDivisionId: divisionIdByCode.get('psdm')!,
        targetDivisionId: divisionIdByCode.get('humpub')!,
        type: 'general_assistance',
        title: 'Permintaan Penyusunan Form Survei Kepuasan Warga Terhadap KKN',
        description: 'Kuesioner evaluasi program kerja akhir masa bakti KKN.',
        periodId: activePeriod.id,
        priority: 'low',
        status: 'draft',
        assignedPicId: null,
        createdBy: psdm.id,
      });

      // Req 6: Soft Deleted (Recycle Bin)
      await tx.insert(requests).values({
        requestNumber: 'REQ-2026-00006',
        requesterId: indra.id,
        requesterDivisionId: divisionIdByCode.get('ops')!,
        targetDivisionId: divisionIdByCode.get('ops')!,
        type: 'catering',
        title: 'Permintaan Konsumsi Rapat Koordinasi Wilayah (Dibatalkan)',
        periodId: activePeriod.id,
        priority: 'low',
        status: 'draft',
        deletedAt: new Date('2026-09-19T08:00:00Z'),
        createdBy: indra.id,
      });

      // ───────────────────────────────────────────────────────────────────────
      // F. Persuratan (Letters) - Penomoran Gapless
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(letters).values([
        {
          letterNumber: 'SRT-UND-2026-00001',
          direction: 'outbound',
          letterKind: 'UND',
          requesterId: owner.id,
          senderRecipient: 'Kepala Desa Werwaru & BPD Werwaru',
          institution: 'Pemerintah Desa Werwaru',
          subject: 'Undangan Rapat Koordinasi Lintas Klaster & Tokoh Masyarakat Desa Werwaru',
          letterDate: '2026-09-25',
          picId: sekbend.id,
          signerName: 'Rangga Prasetya (Ketua KKN)',
          status: 'sent',
          periodId: activePeriod.id,
          programId: prog2.id,
          note: 'Surat telah diantar langsung oleh staf operasional.',
        },
        {
          letterNumber: 'SRT-PBM-2026-00001',
          direction: 'outbound',
          letterKind: 'PBM',
          requesterId: owner.id,
          senderRecipient: 'Kepala Bappeda Maluku Barat Daya',
          institution: 'Badan Perencanaan Pembangunan Daerah Kab. MBD',
          subject: 'Pemberitahuan Pelaksanaan KKN Tematik Samudra Karsa 2026/2027',
          letterDate: '2026-09-28',
          picId: sekbend.id,
          signerName: 'Rangga Prasetya & DPL KKN',
          status: 'awaiting_signature',
          periodId: activePeriod.id,
          note: 'Menunggu tanda tangan Dekan dan Dosen Pembimbing Lapangan.',
        },
        {
          letterNumber: 'SRT-KTR-2026-00001',
          direction: 'outbound',
          letterKind: 'KTR',
          requesterId: sponsor.id,
          senderRecipient: 'Pimpinan Wilayah PT Bank Pembangunan Daerah',
          institution: 'PT Bank Pembangunan Daerah',
          subject: 'Surat Keterangan Kemitraan Sponsorship Program Solar Water Pump',
          letterDate: '2026-09-30',
          picId: sekbend.id,
          signerName: 'Rangga Prasetya',
          status: 'drafting',
          periodId: activePeriod.id,
          programId: prog1.id,
          note: 'Lampiran draf perjanjian kerjasama (MoU).',
        },
        {
          letterNumber: 'SRT-UND-2026-00002',
          direction: 'outbound',
          letterKind: 'UND',
          requesterId: owner.id,
          subject: 'Undangan Internal Gladi Bersih (Dibatalkan)',
          letterDate: '2026-09-15',
          picId: sekbend.id,
          status: 'submitted',
          periodId: activePeriod.id,
          deletedAt: new Date('2026-09-17T12:00:00Z'),
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // G. Keuangan (Budgets, Items, Transactions, Dues, Payments)
      // ───────────────────────────────────────────────────────────────────────
      const bRows = await tx
        .insert(budgets)
        .values([
          {
            budgetNumber: 'RAB-2026-00001',
            title: 'RAB Program Kerja Instalasi Panel Surya & Pompa Air Kaiwatu',
            divisionId: divisionIdByCode.get('ops')!,
            programId: prog1.id,
            requestedBy: ops.id,
            totalPlanned: '15000000',
            totalRealized: '14250000',
            status: 'approved',
            periodId: activePeriod.id,
            reviewNote: 'Disetujui penuh oleh Ketua dan Bendahara.',
          },
          {
            budgetNumber: 'RAB-2026-00002',
            title: 'RAB Publikasi, Banner Posko, dan Dokumentasi KKN',
            divisionId: divisionIdByCode.get('medkre')!,
            requestedBy: medkre.id,
            totalPlanned: '3500000',
            totalRealized: '0',
            status: 'review',
            periodId: activePeriod.id,
            reviewNote: 'Sedang ditinjau ketersediaan kas bersama.',
          },
        ])
        .returning();

      const b1 = bRows[0]!;
      const b2 = bRows[1]!;

      await tx.insert(budgetItems).values([
        {
          budgetId: b1.id,
          label: 'Panel Surya Monokristalin 200Wp (4 unit)',
          quantity: '4',
          unit: 'unit',
          unitPrice: '1750000',
          plannedTotal: '7000000',
          realizedTotal: '7000000',
          sortOrder: 1,
        },
        {
          budgetId: b1.id,
          label: 'Inverter Pure Sine Wave 1000W 24V',
          quantity: '1',
          unit: 'unit',
          unitPrice: '3250000',
          plannedTotal: '3250000',
          realizedTotal: '3100000',
          sortOrder: 2,
        },
        {
          budgetId: b1.id,
          label: 'Baterai Solar Deep Cycle VRLA 100Ah (2 unit)',
          quantity: '2',
          unit: 'unit',
          unitPrice: '2375000',
          plannedTotal: '4750000',
          realizedTotal: '4150000',
          sortOrder: 3,
        },
        {
          budgetId: b2.id,
          label: 'Cetak Spanduk Posko & Banner Program (6 lembar)',
          quantity: '6',
          unit: 'lembar',
          unitPrice: '250000',
          plannedTotal: '1500000',
          realizedTotal: '0',
          sortOrder: 1,
        },
        {
          budgetId: b2.id,
          label: 'ID Card Anggota & Tali Lanyard Resmi (25 pcs)',
          quantity: '25',
          unit: 'pcs',
          unitPrice: '30000',
          plannedTotal: '750000',
          realizedTotal: '0',
          sortOrder: 2,
        },
        {
          budgetId: b2.id,
          label: 'Sewa Lensa & Mikrofon Wireless (14 hari survei)',
          quantity: '1',
          unit: 'paket',
          unitPrice: '1250000',
          plannedTotal: '1250000',
          realizedTotal: '0',
          sortOrder: 3,
        },
      ]);

      await tx.insert(transactions).values([
        {
          transactionType: 'income',
          category: 'Iuran Kas Anggota',
          amount: '12000000',
          transactionDate: '2026-09-10',
          picId: sekbend.id,
          counterparty: 'Rekening Bersama KKN',
          paymentMethod: 'Transfer Mandiri',
          status: 'recorded',
          verified: true,
          verifiedBy: sekbend.id,
          periodId: activePeriod.id,
        },
        {
          transactionType: 'income',
          category: 'Sponsorship PT Bank Daerah Termin 1',
          amount: '20000000',
          transactionDate: '2026-09-15',
          picId: sponsor.id,
          counterparty: 'PT Bank Pembangunan Daerah',
          paymentMethod: 'Transfer Giro',
          status: 'recorded',
          verified: true,
          verifiedBy: sekbend.id,
          periodId: activePeriod.id,
        },
        {
          transactionType: 'expense',
          category: 'Pengadaan Komponen Solar Cell',
          amount: '14250000',
          transactionDate: '2026-09-18',
          picId: ops.id,
          budgetId: b1.id,
          counterparty: 'Toko Surya Mandiri Ambon',
          paymentMethod: 'Transfer Antar Bank',
          status: 'recorded',
          verified: true,
          verifiedBy: sekbend.id,
          periodId: activePeriod.id,
        },
        {
          transactionType: 'expense',
          category: 'Biaya Cetak Poster Percobaan (Dibatalkan)',
          amount: '250000',
          transactionDate: '2026-09-08',
          picId: medkre.id,
          status: 'recorded',
          periodId: activePeriod.id,
          deletedAt: new Date('2026-09-12T10:00:00Z'), // Recycle bin
        },
      ]);

      // Iuran Anggota (Target: Rp 4.000.000 per anggota aktif)
      const duesProfiles = [
        { p: owner, paid: '4000000', status: 'paid' as const },
        { p: coowner, paid: '2000000', status: 'installment' as const },
        { p: sekbend, paid: '4000000', status: 'paid' as const },
        { p: medkre, paid: '2000000', status: 'installment' as const },
        { p: damar, paid: '1000000', status: 'installment' as const },
        { p: humpub, paid: '0', status: 'unpaid' as const },
        { p: ops, paid: '0', status: 'unpaid' as const },
        { p: sponsor, paid: '0', status: 'unpaid' as const },
      ];

      for (const item of duesProfiles) {
        const dueRow = firstRow(
          await tx
            .insert(memberDues)
            .values({
              profileId: item.p.id,
              periodId: activePeriod.id,
              targetAmount: '4000000',
              paidAmount: item.paid,
              status: item.status,
            })
            .returning(),
        );

        if (item.paid !== '0') {
          // Buat baris bukti pembayaran
          const isVerified = item.p.id !== damar.id; // Damar sengaja pending verification!
          await tx.insert(memberPayments).values({
            memberDuesId: dueRow.id,
            amount: item.paid,
            paidAt: '2026-09-15',
            verified: isVerified,
            verifiedBy: isVerified ? sekbend.id : null,
            note: isVerified ? 'Lunas diverifikasi via m-banking' : 'Menunggu pengecekan rekening koran bendahara',
          });
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // H. Konten & Kreatif (Content & Creative)
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(contentItems).values([
        {
          title: 'Teaser Video Resmi KKN Samudra Karsa 2026/2027',
          platform: 'Instagram Reels',
          plannedDate: '2026-09-20',
          picId: humpub.id,
          brief: 'Video teaser 30 detik pengenalan lokasi KKN di Pulau Moa.',
          status: 'published',
          publishedUrl: 'https://instagram.com/reel/samudrakarsa2026',
          periodId: activePeriod.id,
          createdBy: humpub.id,
        },
        {
          title: 'Carousel Profil Potensi Pariwisata & Alam Pulau Moa',
          platform: 'Instagram Feed Carousel',
          plannedDate: '2026-10-05',
          picId: gita.id,
          brief: '6 slide infografis pesona Pantai Werwaru dan ternak kerbau Moa.',
          status: 'scheduled',
          periodId: activePeriod.id,
          createdBy: gita.id,
        },
        {
          title: 'Liputan Dokumentasi Survei Lokasi Desa Kaiwatu',
          platform: 'TikTok / YouTube Shorts',
          picId: humpub.id,
          brief: 'Highlight wawancara dengan tokoh masyarakat Kaiwatu.',
          status: 'copywriting',
          periodId: activePeriod.id,
          createdBy: humpub.id,
        },
        {
          title: 'Draft Konten Lama yang Dibatalkan',
          platform: 'Twitter',
          status: 'idea',
          periodId: activePeriod.id,
          deletedAt: new Date('2026-09-14T09:00:00Z'),
        },
      ]);

      await tx.insert(creativeRequests).values([
        {
          requestId: req1.id,
          title: 'Desain Feed & Template Instagram Resmi',
          creativeKind: 'design',
          requesterId: humpub.id,
          picId: medkre.id,
          brief: 'Format 1080x1350px, palet warna bahari biru tua dan aksen emas.',
          dueDate: '2026-10-15',
          revisionCount: 1,
          status: 'done',
          periodId: activePeriod.id,
        },
        {
          title: 'Bumper Video Opening & Closing YouTube Dokumenter',
          creativeKind: 'video_editing',
          requesterId: humpub.id,
          picId: citra.id,
          brief: 'Durasi 5 detik dengan audio wave ombak dan logo animasi tim.',
          dueDate: '2026-10-20',
          revisionCount: 2,
          status: 'production',
          periodId: activePeriod.id,
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // I. Kemitraan & Sponsorship (Partners, Benefits, Followups)
      // ───────────────────────────────────────────────────────────────────────
      const partnerRows = await tx
        .insert(partners)
        .values([
          {
            name: 'PT Bank Pembangunan Daerah Maluku',
            category: 'Perbankan & CSR',
            industry: 'Jasa Keuangan',
            contactPerson: 'Bpk. Johanes Pattiasina',
            contactInfo: '0812-4455-6677 / j.pattiasina@bankmaluku.test',
            picId: sponsor.id,
            relationChannel: 'Audiensi Kantor Pusat',
            lastContactAt: '2026-09-14',
            nextFollowUpAt: '2026-10-05',
            targetSupport: '35000000',
            agreedValue: '35000000',
            fundReceived: '20000000',
            status: 'contract_signed',
            fulfillmentStatus: 'in_progress',
            programId: prog1.id,
            periodId: activePeriod.id,
          },
          {
            name: 'Yayasan Konservasi Bahari Nusantara',
            category: 'NGO Lingkungan',
            industry: 'Nirlaba',
            contactPerson: 'Ibu Sarah Mansawan',
            contactInfo: '0821-9988-7766 / sarah@baharinusantara.test',
            picId: sponsor.id,
            relationChannel: 'Email Kemitraan',
            lastContactAt: '2026-09-18',
            nextFollowUpAt: '2026-10-02',
            targetSupport: '15000000',
            status: 'negotiation',
            periodId: activePeriod.id,
          },
          {
            name: 'PT Semen & Konstruksi Timur',
            category: 'Material Bangunan',
            status: 'prospect',
            targetSupport: '10000000',
            picId: sponsor.id,
            periodId: activePeriod.id,
          },
          {
            name: 'Mitra Usaha Lama (Dibatalkan)',
            status: 'prospect',
            periodId: activePeriod.id,
            deletedAt: new Date('2026-09-11T12:00:00Z'),
          },
        ])
        .returning();

      const partner1 = partnerRows[0]!;
      const partner2 = partnerRows[1]!;

      await tx.insert(partnerFollowups).values([
        {
          partnerId: partner1.id,
          followupNote: 'Penyerahan draf addendum MoU termin 2 pencairan dana Rp 15.000.000.',
          followedUpBy: sponsor.id,
        },
        {
          partnerId: partner2.id,
          followupNote: 'Diskusi skema kontraprestasi pencantuman logo di rompi relawan klaster medika.',
          followedUpBy: sponsor.id,
        },
      ]);

      await tx.insert(sponsorBenefits).values([
        {
          partnerId: partner1.id,
          benefitDescription: 'Pemasangan logo Bank Maluku pada spanduk utama seluruh posko KKN.',
          deadline: '2026-12-15',
          status: 'not_fulfilled',
        },
        {
          partnerId: partner1.id,
          benefitDescription: 'Penyebutan nama sponsor pada 3 reels publikasi program pompa air surya.',
          deadline: '2027-01-10',
          status: 'not_fulfilled',
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // J. Operasional (Inventory, Shipments, Trips)
      // ───────────────────────────────────────────────────────────────────────
      const invRows = await tx
        .insert(inventoryItems)
        .values([
          {
            itemCode: 'INV-2026-00001',
            name: 'Tenda Pleton Posko Utama Werwaru (Kapasitas 15 Orang)',
            category: 'Tenda & Perlengkapan Lapangan',
            quantity: 2,
            stock: 2,
            conditionNote: 'Kondisi 95% baik, lengkap pasak dan tiang pancang.',
            location: 'Gudang Posko Utama Werwaru',
            picId: ops.id,
            periodId: activePeriod.id,
          },
          {
            itemCode: 'INV-2026-00002',
            name: 'Megaphone Portable Toa ZR-2015W',
            category: 'Elektronik & Suara',
            quantity: 4,
            stock: 3,
            conditionNote: '1 unit dipinjam Klaster Medika untuk penyuluhan.',
            location: 'Posko Kaiwatu',
            picId: indra.id,
            periodId: activePeriod.id,
          },
          {
            itemCode: 'INV-2026-00003',
            name: 'Toolkit Tukang & Perkakas Pertukangan Lengkap',
            category: 'Perkakas Kerja',
            quantity: 3,
            stock: 3,
            conditionNote: 'Lengkap set kunci pas, bor baterai, dan palu.',
            location: 'Posko Werwaru',
            picId: ops.id,
            periodId: activePeriod.id,
          },
          {
            itemCode: 'INV-2026-00004',
            name: 'Terpal Rusak Tidak Terpakai (Dihapus)',
            category: 'Lain-lain',
            quantity: 1,
            stock: 0,
            periodId: activePeriod.id,
            deletedAt: new Date('2026-09-10T09:00:00Z'),
          },
        ])
        .returning();

      const inv1 = invRows[0]!;
      const inv2 = invRows[1]!;

      await tx.insert(inventoryMovements).values([
        {
          inventoryItemId: inv1.id,
          movementType: 'inbound',
          quantity: 2,
          movedBy: ops.id,
          note: 'Barang baru datang dari pengiriman kapal kargo.',
        },
        {
          inventoryItemId: inv2.id,
          movementType: 'inbound',
          quantity: 4,
          movedBy: indra.id,
          note: 'Pengadaan megaphone posko 4 unit.',
        },
        {
          inventoryItemId: inv2.id,
          movementType: 'borrowed',
          quantity: -1,
          movedBy: psdm.id,
          note: 'Dipinjam Klaster Medika untuk gladi penyuluhan stunting.',
        },
      ]);

      await tx.insert(shipments).values([
        {
          packageName: 'Koli-1 Paket Buku Bacaan & Perpustakaan Desa',
          contentNote: '120 judul buku bacaan anak dan modul pembelajaran.',
          weightKg: '45.50',
          origin: 'Pelabuhan Yos Sudarso Ambon',
          destination: 'Pelabuhan Tiakur / Dermaga Kaiwatu',
          expedition: 'PT Pos Logistik Indonesia',
          trackingNumber: 'POS-MBD-202609001',
          scheduledAt: '2026-10-10',
          cost: '650000',
          status: 'in_transit',
        },
        {
          packageName: 'Koli-2 Paket Bibit & Polybag Pertanian',
          contentNote: 'Bibit sayuran organik dan benih tanaman pangan unggul.',
          weightKg: '28.00',
          origin: 'Pelabuhan Ambon',
          destination: 'Pelabuhan Tiakur',
          expedition: 'JNE Kargo Laut',
          trackingNumber: 'JNE-MBD-889900',
          scheduledAt: '2026-09-22',
          cost: '420000',
          status: 'delivered',
        },
      ]);

      await tx.insert(trips).values([
        {
          tripKind: 'survey',
          title: 'Perjalanan Tim Pendahulu Survei Lokasi Kaiwatu - Werwaru',
          scheduledAt: new Date('2026-09-12T08:00:00Z'),
          vehicleNote: 'Speedboat Dinas Pemda MBD 40 PK',
          passengerCount: 6,
          status: 'completed',
          picId: ops.id,
          note: 'Kondisi ombak tenang, perjalanan memakan waktu 45 menit.',
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // K. Kolaborasi (Meetings, Decisions, Calendar, Milestones, Announcements)
      // ───────────────────────────────────────────────────────────────────────
      const meet1 = firstRow(
        await tx
          .insert(meetings)
          .values([
            {
              title: 'Rapat Pleno Koordinasi Awal Seluruh Divisi KKN',
              meetingType: 'general_meeting',
              heldAt: new Date('2026-09-10T19:00:00Z'),
              locationOrMedia: 'Google Meet & Sekretariat KKN',
              leaderId: owner.id,
              agenda: 'Penyelarasan target program kerja klaster dan timeline persiapan keberangkatan.',
              summary:
                'Seluruh divisi menyepakati batas pengumpulan proposal program kerja adalah pertengahan Oktober.',
              periodId: activePeriod.id,
              createdBy: owner.id,
            },
            {
              title: 'Rapat Koordinasi Logistik Lama (Dihapus)',
              meetingType: 'division_meeting',
              heldAt: new Date('2026-09-02T19:00:00Z'),
              periodId: activePeriod.id,
              deletedAt: new Date('2026-09-04T12:00:00Z'),
            },
          ])
          .returning(),
      );

      await tx.insert(meetingParticipants).values([
        { meetingId: meet1.id, profileId: owner.id },
        { meetingId: meet1.id, profileId: coowner.id },
        { meetingId: meet1.id, profileId: sekbend.id },
        { meetingId: meet1.id, profileId: medkre.id },
        { meetingId: meet1.id, profileId: humpub.id },
        { meetingId: meet1.id, profileId: ops.id },
        { meetingId: meet1.id, profileId: sponsor.id },
        { meetingId: meet1.id, profileId: psdm.id },
      ]);

      await tx.insert(meetingDecisions).values([
        {
          meetingId: meet1.id,
          decisionText: 'Setiap klaster wajib mengumpulkan proposal program fix maksimal 15 Oktober 2026.',
          picId: coowner.id,
          dueDate: '2026-10-15',
          priority: 'urgent',
          status: 'in_progress',
        },
        {
          meetingId: meet1.id,
          decisionText: 'Divisi Operasional menyiapkan daftar inventaris kebutuhan posko minggu depan.',
          picId: ops.id,
          dueDate: '2026-09-18',
          priority: 'high',
          status: 'done',
          workItemId: wi3.id,
        },
      ]);

      const calRows = await tx
        .insert(calendarEvents)
        .values([
          {
            title: 'Rapat Koordinasi Mingguan Tim KKN Samudra Karsa',
            eventType: 'weekly_meeting',
            organizerId: owner.id,
            startAt: new Date('2026-10-05T19:30:00Z'),
            endAt: new Date('2026-10-05T21:30:00Z'),
            timezone: 'Asia/Jakarta',
            location: 'Google Meet',
            meetingLink: 'https://meet.google.com/sam-udra-kar',
            agenda: 'Progres pengadaan barang dan kepastian sponsorship perbankan.',
          },
          {
            title: 'Audiensi Resmi dengan Camat Moa & Kepala Desa Werwaru',
            eventType: 'audience',
            organizerId: owner.id,
            startAt: new Date('2026-10-12T09:00:00Z'),
            endAt: new Date('2026-10-12T12:00:00Z'),
            timezone: 'Asia/Jayapura',
            location: 'Kantor Kecamatan Moa, Tiakur',
            agenda: 'Penyampaian rencana program kerja 5 klaster KKN di hadapan muspika.',
          },
        ])
        .returning();

      const cal1 = calRows[0]!;
      const cal2 = calRows[1]!;

      await tx.insert(calendarEventAttendees).values([
        { eventId: cal1.id, profileId: owner.id, rsvpStatus: 'attending' },
        { eventId: cal1.id, profileId: medkre.id, rsvpStatus: 'attending' },
        { eventId: cal1.id, profileId: citra.id, rsvpStatus: 'maybe' },
        { eventId: cal1.id, profileId: damar.id, rsvpStatus: 'no_response' },
        // External attendee test case (profileId is null)
        {
          eventId: cal2.id,
          profileId: null,
          externalName: 'Drs. B. Silooy (Camat Moa)',
          externalEmail: 'camat.moa@mbd.go.test',
          rsvpStatus: 'attending',
        },
      ]);

      await tx.insert(milestones).values([
        {
          name: 'Pelepasan & Keberangkatan Tim KKN Menuju Lokasi',
          startDate: '2026-12-19',
          endDate: '2026-12-21',
          picId: owner.id,
          divisionId: divisionIdByCode.get('ops')!,
          periodId: activePeriod.id,
          priority: 'urgent',
          status: 'backlog',
          progressPercentage: 20,
          note: 'Pelepasan resmi oleh Rektor dan keberangkatan kapal Pelni.',
        },
        {
          name: 'Pelaksanaan Program Inti Klaster Tahap 1',
          startDate: '2026-12-22',
          endDate: '2027-01-15',
          picId: coowner.id,
          periodId: activePeriod.id,
          priority: 'high',
          status: 'backlog',
          progressPercentage: 0,
          note: 'Fokus instalasi panel surya dan penyuluhan kesehatan posyandu.',
        },
        {
          name: 'Penarikan & Lokakarya Hasil KKN Tingkat Kecamatan',
          startDate: '2027-02-04',
          endDate: '2027-02-06',
          picId: owner.id,
          periodId: activePeriod.id,
          priority: 'medium',
          status: 'backlog',
          progressPercentage: 0,
          note: 'Pameran produk UMKM tenun dan serah terima aset pompa surya.',
        },
      ]);

      await tx.insert(announcements).values([
        {
          title: 'Pengumpulan Berkas Bebas Lab & Surat Izin Orang Tua',
          body: 'Diberitahukan kepada seluruh anggota KKN bahwa batas akhir pengumpulan berkas bebas laboratorium dan surat izin orang tua adalah tanggal 10 Oktober 2026 di sekretariat.',
          pinned: true,
          divisionId: divisionIdByCode.get('sekbend')!,
          periodId: activePeriod.id,
          createdBy: owner.id,
        },
        {
          title: 'Aturan Barang Bawaan Pribadi & Batas Berat Bagasi Kapal',
          body: 'Masing-masing anggota diperbolehkan membawa 1 carrier/koper utama (maks 20 kg) dan 1 tas kabin kecil. Kebutuhan logistik kelompok dilarang dimasukkan bagasi pribadi.',
          pinned: false,
          divisionId: divisionIdByCode.get('ops')!,
          periodId: activePeriod.id,
          createdBy: ops.id,
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // L. Kotak Aspirasi (Feedback) & Notifikasi Ringan
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(feedback).values([
        {
          category: 'criticism_suggestion',
          visibility: 'anonymous', // Anonim test case!
          authorId: damar.id,
          targetNote: 'Divisi Operasional & Konsumsi',
          message: 'Mohon agar jam makan siang selama gladi bersih diperhatikan ketepatannya agar stamina tim terjaga.',
          isPrivate: false,
          periodId: activePeriod.id,
        },
        {
          category: 'criticism_suggestion',
          visibility: 'named', // Bernama test case
          authorId: citra.id,
          targetNote: 'Divisi Humas & Publikasi',
          message: 'Desain dan video teaser yang diunggah sangat profesional dan meningkatkan engagement tim secara signifikan!',
          isPrivate: false,
          periodId: activePeriod.id,
        },
      ]);

      await tx.insert(notifications).values([
        {
          recipientId: medkre.id,
          title: 'Permintaan Desain Baru Diterima',
          body: 'Divisi Humas mengajukan REQ-2026-00001 untuk pembuatan template publikasi.',
          entityType: 'request',
          entityId: req1.id,
          kind: 'assignment',
        },
        {
          recipientId: damar.id,
          title: 'Penugasan Tim Desain Template',
          body: 'Anda telah ditugaskan oleh Bagas pada pekerjaan WI-2026-00002.',
          entityType: 'work_item',
          entityId: wi2.id,
          kind: 'assignment',
        },
        {
          recipientId: sekbend.id,
          title: 'Konfirmasi Pembayaran Kas Masuk',
          body: 'Damar Nugroho telah mengunggah bukti pembayaran kas anggota sebesar Rp 1.000.000.',
          entityType: 'member_payment',
          kind: 'info',
        },
        {
          recipientId: owner.id,
          title: 'Jadwal Rapat Mingguan Terdekat',
          body: 'Rapat koordinasi mingguan dijadwalkan pada hari Senin pukul 19:30 WIB.',
          entityType: 'calendar_event',
          entityId: cal1.id,
          kind: 'meeting_invite',
        },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // M. Penghitung Dokumen (Document Counters Gapless)
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(documentCounters).values([
        { documentType: 'work_item', variant: '', year: 2026, lastNumber: 8 },
        { documentType: 'request', variant: '', year: 2026, lastNumber: 6 },
        { documentType: 'budget', variant: '', year: 2026, lastNumber: 2 },
        { documentType: 'letter', variant: 'UND', year: 2026, lastNumber: 2 },
        { documentType: 'letter', variant: 'PBM', year: 2026, lastNumber: 1 },
        { documentType: 'letter', variant: 'KTR', year: 2026, lastNumber: 1 },
        { documentType: 'inventory_item', variant: '', year: 2026, lastNumber: 4 },
        { documentType: 'program', variant: '', year: 2026, lastNumber: 4 },
      ]);

      // ───────────────────────────────────────────────────────────────────────
      // N. Audit Trail Awal (Activity Logs)
      // ───────────────────────────────────────────────────────────────────────
      await tx.insert(activityLogs).values([
        {
          actorId: owner.id,
          action: 'system.seeded',
          entityType: 'system',
          entityId: activePeriod.id,
          afterData: { message: 'Database operasional berhasil diinisialisasi seeder.' },
          requestId: 'seed-system-init-001',
          ipAddress: '127.0.0.1',
        },
        {
          actorId: sekbend.id,
          action: 'finance.viewed',
          entityType: 'budget',
          entityId: b1.id,
          requestId: 'seed-audit-finance-001',
          ipAddress: '127.0.0.1',
        },
      ]);

      return {
        divisions: divisionRows.length,
        clusters: clusterRows.length,
        subunits: subunitRows.length,
        periods: periodRows.length,
        settings: SETTINGS.length,
        accounts: ACCOUNTS.length,
        programs: 4,
        workItems: 8,
        requests: 6,
        letters: 4,
        budgets: 2,
        transactions: 4,
        partners: 4,
        inventory: 4,
        meetings: 2,
        events: 2,
        milestones: 3,
        announcements: 2,
        feedback: 2,
        notifications: 4,
      };
    });

    console.log('\n  ✓ BASIS DATA BERHASIL DI-SEED SESUAI ALUR & ATURAN SISTEM');
    console.log('  ------------------------------------------------------');
    console.log('  Struktur Master: 6 Divisi, 5 Klaster, 2 Subunit, 1 Periode');
    console.log(`  Akun Tersedia  : 14 Akun Lengkap (Password: ${password})`);
    console.log('  Program Kerja  : 4 Program (Saintek, Agro, Medika, Soshum)');
    console.log('  Pekerjaan (WI) : 8 Item (done, in_progress, on_hold, need_review, tanpa PIC, recycle bin)');
    console.log('  Permintaan REQ : 6 Item (terhubung WI, submitted, need_clarification, sync_conflict, recycle bin)');
    console.log('  Persuratan     : 4 Surat (UND, PBM, KTR, recycle bin)');
    console.log('  Keuangan       : 2 RAB, 4 Transaksi Kas, Iuran & Pembayaran Kas Anggota');
    console.log('  Kemitraan      : 4 Mitra Sponsor, Follow-up, & Sponsor Benefits');
    console.log('  Operasional    : 4 Barang Inventaris, 3 Mutasi, 2 Pengiriman, 1 Log Trip');
    console.log('  Kolaborasi     : Rapat & Keputusan, Kalender & RSVP, Milestone, Pengumuman, Kotak Aspirasi');
    console.log('  Penomoran      : 8 Counter Dokumen Sinkron Gapless');
    console.log('  ======================================================\n');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('\n  ✗ Seeder gagal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
