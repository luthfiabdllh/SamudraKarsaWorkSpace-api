import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { MIN_PASSWORD_LENGTH } from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { normalizeEmail } from '../auth/email';
import { DRIZZLE } from '../database/database.constants';
import { profiles } from '../database/schema/organization';
import { WorkReleaseService } from '../work-items/work-release.service';
import type {
  CreateProfileDto,
  ListProfilesDto,
  UpdateProfileDto,
  UpdateSelfProfileDto,
} from './dto/profile.dto';
import {
  PROFILE_ACTIONS,
  PROFILE_ERRORS,
  TEMPORARY_PASSWORD_BYTES,
} from './profiles.constants';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

/**
 * Profil anggota.
 *
 * ## Dua bentuk jawaban, dan kenapa bukan satu
 *
 * `directorySelection()` dan `fullSelection()` di bawah adalah satu-satunya
 * tempat kolom profil dipilih, dan keduanya **menyebut kolomnya satu per satu**.
 *
 * Alternatifnya — mengambil seluruh baris lalu membuang `passwordHash` di
 * JavaScript — terlihat lebih pendek dan justru itu bahayanya: ia gagal
 * **terbuka**. Setiap kolom yang ditambahkan ke tabel nanti otomatis ikut
 * terkirim, dan yang menentukan apakah itu boleh adalah ada-tidaknya seseorang
 * yang ingat menambahkannya ke daftar buang. Daftar yang disebut satu per satu
 * gagal **tertutup**: kolom baru tidak ikut terkirim sampai seseorang
 * memutuskan bahwa ia boleh.
 *
 * Untuk kolom yang isinya hash password dan subjek Google, arah kegagalannya
 * tidak boleh ditentukan oleh ingatan.
 *
 * ## Kenapa `version` selalu ikut
 *
 * `version` ada di kedua bentuk jawaban meski ia bukan data yang ditampilkan.
 * Ia satu-satunya cara klien mengisi `If-Match` pada penulisan berikutnya
 * (§7.16) — dan klien yang tidak bisa membacanya tidak bisa menulis sama sekali.
 */
@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly release: WorkReleaseService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Pembacaan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar anggota — bentuk yang boleh dibaca siapa saja yang sudah masuk.
   *
   * Tanpa email dan tanpa nomor telepon. Untuk organisasi seukuran ini, nomor
   * telepon seluruh panitia yang terbuka bagi seluruh panitia adalah kebocoran
   * yang nyata, bukan teoretis — dan yang membutuhkannya (menghubungi anggota
   * divisi) mendapatkannya lewat halaman admin atau lewat kesepakatan langsung,
   * bukan lewat daftar yang bisa diambil siapa pun satu kali `curl`.
   */
  async listDirectory(dto: ListProfilesDto) {
    return this.db
      .select(this.directorySelection())
      .from(profiles)
      .where(this.filters(dto))
      .orderBy(asc(profiles.fullName))
      .limit(dto.limit);
  }

  /**
   * Daftar anggota — bentuk lengkap, hanya `owner`/`co_owner`.
   *
   * Dibuat sebagai endpoint tersendiri alih-alih satu penyaring pada endpoint
   * di atas. Penyaring akan berarti bentuk jawabannya bergantung pada peran
   * pemanggilnya, dan itu jenis perbedaan yang mudah salah dibaca: satu cabang
   * `if` yang terbalik, dan seluruh email serta nomor telepon terkirim ke
   * semua orang — tanpa error, tanpa gejala, dan hanya ketahuan kalau ada yang
   * memeriksa isi jawabannya.
   *
   * Dua endpoint membuat kebocoran itu menuntut dua kesalahan, bukan satu, dan
   * keduanya dijaga `@Policy` yang berbeda.
   */
  async listAdmin(dto: ListProfilesDto) {
    return this.db
      .select(this.fullSelection())
      .from(profiles)
      .where(this.filters(dto))
      .orderBy(asc(profiles.fullName))
      .limit(dto.limit);
  }

  async getDirectory(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select(this.directorySelection())
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  /** Profil diri sendiri — bentuk lengkap, tanpa hash password dan subjek Google. */
  async me(actorId: string) {
    return this.findFull(actorId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Penulisan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mengubah profil diri sendiri.
   *
   * ## Kenapa `.set()` disusun medan demi medan, bukan disebar
   *
   * `...dto` akan lebih pendek, dan ia juga akan tetap aman selama tipe DTO-nya
   * benar. Yang membedakan keduanya adalah apa yang terjadi **setelah** seseorang
   * menambahkan medan ke DTO-nya: dengan sebaran, medan itu langsung ikut
   * tertulis tanpa ada satu baris pun yang berubah di sini — sehingga peninjau
   * yang membaca fungsi ini tidak melihatnya.
   *
   * Ditulis satu per satu, setiap kolom yang bisa berubah **terlihat di fungsi
   * ini**. Dan `roles`, `status`, `divisionId`, `isKormasit` tidak ada di
   * daftarnya — bukan karena diperiksa di suatu tempat, melainkan karena tidak
   * ada baris untuk menuliskannya. Itulah bentuk §5.1.1 yang benar.
   */
  async updateSelf(
    actorId: string,
    dto: UpdateSelfProfileDto,
    expectedVersion: number,
    context: WriteContext,
  ) {
    const before = await this.findFull(actorId);

    this.assertVersion(before.version, expectedVersion);

    const rows = await this.db
      .update(profiles)
      .set({
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.nickname !== undefined && { nickname: dto.nickname }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.facultyMajor !== undefined && {
          facultyMajor: dto.facultyMajor,
        }),
        ...(dto.batchYear !== undefined && { batchYear: dto.batchYear }),
        ...(dto.socialLinks !== undefined && {
          socialLinks: dto.socialLinks ?? {},
        }),
        ...(dto.skills !== undefined && { skills: dto.skills ?? [] }),
        ...(dto.hobbies !== undefined && { hobbies: dto.hobbies ?? [] }),
        ...(dto.availabilityNote !== undefined && {
          availabilityNote: dto.availabilityNote,
        }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName,
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone,
        }),
        version: sql`${profiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(profiles.id, actorId), eq(profiles.version, expectedVersion)),
      )
      .returning(this.fullSelection());

    // Nol baris berarti versinya sudah berubah sejak klien membacanya — atau
    // barisnya hilang. Keduanya dijawab sama, karena dari sisi klien keduanya
    // berarti "yang kamu pegang sudah tidak berlaku": baca ulang, lalu ulangi.
    const after = this.mustUpdated(rows[0]);

    await this.record(context, PROFILE_ACTIONS.selfUpdated, actorId, {
      beforeData: before,
      afterData: after,
    });

    return after;
  }

  /** Membuat profil baru — undangan (keputusan 26–28). */
  async create(dto: CreateProfileDto, context: WriteContext) {
    const email = normalizeEmail(dto.email);

    await this.assertEmailFree(email);

    const rows = await this.db
      .insert(profiles)
      .values({
        email,
        fullName: dto.fullName,
        nickname: dto.nickname ?? null,
        phone: dto.phone ?? null,
        roles: dto.roles,
        status: dto.status,
        divisionId: dto.divisionId ?? null,
        clusterId: dto.clusterId ?? null,
        subunitId: dto.subunitId ?? null,
        teamRole: dto.teamRole ?? null,
        isKormasit: dto.isKormasit,
      })
      .returning(this.fullSelection());

    const created = this.mustUpdated(rows[0]);

    await this.record(context, PROFILE_ACTIONS.created, created.id, {
      afterData: created,
    });

    return created;
  }

  /**
   * Mengubah profil orang lain — hanya `member:admin`.
   *
   * Di sinilah satu-satunya tempat sah untuk mengubah peran, status, dan unit
   * kerja. Dua pemeriksaan di bawah bukan kelengkapan: keduanya menutup cara
   * sistem ini bisa membuat dirinya sendiri tidak bisa dipakai lagi.
   */
  async update(
    id: string,
    dto: UpdateProfileDto,
    expectedVersion: number,
    context: WriteContext,
  ) {
    const before = await this.findFull(id);

    this.assertVersion(before.version, expectedVersion);

    if (dto.email !== undefined && dto.email !== before.email) {
      await this.assertEmailFree(dto.email);
    }

    if (dto.status !== undefined) {
      this.assertStatusTransition(before.status, dto.status);
      await this.assertNotLastOwner(before, dto);
    }

    /**
     * Penulisan profil dan pelepasan PIC berjalan dalam **satu transaksi**.
     *
     * Keduanya adalah satu kejadian bagi penggunanya: "akun ini
     * dinonaktifkan". Kalau penulisan profilnya berhasil lalu pelepasan PIC-nya
     * gagal, yang tersisa adalah keadaan yang justru §5.2.8 keluhkan — akun yang
     * tidak bisa masuk, tetapi masih tercatat sebagai penanggung jawab pekerjaan,
     * dan notifikasinya tetap dikirim ke sana.
     *
     * `revokeAllForProfile` sengaja **di luar** transaksi: ia menyentuh
     * `refresh_tokens` lewat layanan lain, dan yang penting ia berjalan setelah
     * perubahannya benar-benar tersimpan. Lihat catatan di bawah.
     */
    const { after, released } = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(profiles)
        .set({
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.nickname !== undefined && { nickname: dto.nickname }),
          ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.facultyMajor !== undefined && {
            facultyMajor: dto.facultyMajor,
          }),
          ...(dto.batchYear !== undefined && { batchYear: dto.batchYear }),
          ...(dto.roles !== undefined && { roles: dto.roles }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.divisionId !== undefined && { divisionId: dto.divisionId }),
          ...(dto.clusterId !== undefined && { clusterId: dto.clusterId }),
          ...(dto.subunitId !== undefined && { subunitId: dto.subunitId }),
          ...(dto.teamRole !== undefined && { teamRole: dto.teamRole }),
          ...(dto.isKormasit !== undefined && { isKormasit: dto.isKormasit }),
          ...(dto.mustChangePassword !== undefined && {
            mustChangePassword: dto.mustChangePassword,
          }),
          version: sql`${profiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(profiles.id, id), eq(profiles.version, expectedVersion)))
        .returning(this.fullSelection());

      const updated = this.mustUpdated(rows[0]);

      /**
       * Menonaktifkan anggota **melepas pekerjaan yang dipimpinnya** (§5.2.8).
       *
       * Hanya pada perpindahan **menuju** `inactive`, bukan pada setiap
       * penyuntingan akun yang kebetulan sudah tidak aktif. Menyunting nama
       * anggota yang sudah lama nonaktif tidak boleh mengubah pekerjaan apa pun
       * — dan tanpa syarat itu, mengubah satu huruf pada namanya akan menaikkan
       * `version` setiap pekerjaan yang pernah ia pimpin.
       */
      const released =
        updated.status === 'inactive' && before.status !== 'inactive'
          ? await this.release.releaseWithin(tx, id, context.actorId)
          : null;

      return { after: updated, released };
    });

    /**
     * Menonaktifkan anggota **mencabut seluruh sesinya**.
     *
     * Tanpa ini, "dinonaktifkan" hanya berlaku sampai access token-nya
     * kedaluwarsa — 15 menit — dan selama itu orangnya masih bisa bekerja
     * penuh. Lebih buruk lagi, refresh token-nya masih sah, sehingga ia bisa
     * terus memperbarui aksesnya tanpa pernah kembali ke halaman login.
     *
     * Dinonaktifkan berarti berhenti, dan berhenti berarti sekarang.
     *
     * Diletakkan **setelah** transaksinya berhasil: kalau versinya bentrok dan
     * penulisan dibatalkan, mencabut sesinya lebih dulu akan menendang orang
     * yang tidak jadi dinonaktifkan.
     */
    if (after.status === 'inactive' && before.status !== 'inactive') {
      await this.tokens.revokeAllForProfile(id);
    }

    /**
     * Catatan audit pelepasan ditulis **setelah** transaksinya commit.
     *
     * `AuditService` memakai koneksi global, bukan `tx` — jadi menulisnya di
     * dalam akan meninggalkan catatan "PIC-nya dilepas" meski transaksinya
     * bergulung balik. Urutannya penting dan bukan gaya penulisan.
     *
     * `released` bernilai `null` kalau tidak ada yang dilepas — bukan daftar
     * kosong, karena "tidak ada yang dilepas" dan "pelepasannya tidak dijalankan"
     * adalah dua hal yang berbeda saat menelusuri masalah. Yang membedakannya di
     * sini hanya satu baris, tetapi baris itu ada di jalur yang paling sering
     * diperiksa saat ada pekerjaan yang tiba-tiba tanpa PIC.
     */
    if (released) {
      await this.release.auditReleases(released, id, context.actorId, context);
    }

    await this.record(context, PROFILE_ACTIONS.updated, id, {
      beforeData: before,
      afterData: after,
    });

    return after;
  }

  /**
   * Menetapkan password sementara — keputusan 10.
   *
   * Password dikembalikan **sekali**, di jawaban ini, dan tidak pernah
   * disimpan dalam bentuk terbaca. Yang tersimpan hanya hash-nya, jadi jawaban
   * ini adalah satu-satunya kesempatan owner melihatnya.
   *
   * `mustChangePassword` dinyalakan bersamaan, dan itulah yang membuat password
   * yang dibacakan lewat pesan tidak menjadi password tetap: `PolicyGuard`
   * menolak seluruh endpoint kecuali ganti password sampai ia diganti (§7.8.6).
   *
   * ## Kenapa tidak menuntut `If-Match`
   *
   * Rute ini tidak menyunting isi baris, melainkan **menggantinya dengan nilai
   * baru**. "Perubahan yang hilang" tidak punya arti di sini: dua owner yang
   * menekan tombol ini bersamaan menghasilkan satu password yang menang, dan
   * yang kalah tidak kehilangan tulisan yang dibuatnya — ia hanya perlu
   * membacakan yang menang. Menuntut `If-Match` akan menambah satu langkah
   * tanpa mencegah apa pun.
   */
  async resetPassword(id: string, context: WriteContext) {
    const profile = await this.findFull(id);

    const temporary = randomBytes(TEMPORARY_PASSWORD_BYTES).toString(
      'base64url',
    );

    // Diperiksa, bukan diandalkan. Panjangnya ditentukan `TEMPORARY_PASSWORD_BYTES`,
    // dan kalau suatu saat angka itu diturunkan di bawah minimum, yang terjadi
    // adalah password sementara yang ditolak oleh aturan ganti password —
    // sebuah kebuntuan yang hanya terlihat saat dipakai.
    if (temporary.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password sementara hanya ${temporary.length} karakter, ` +
          `di bawah minimum ${MIN_PASSWORD_LENGTH}. ` +
          'Perbesar TEMPORARY_PASSWORD_BYTES di profiles.constants.ts.',
      );
    }

    const passwordHash = await this.passwords.hashPassword(temporary);

    await this.db
      .update(profiles)
      .set({
        passwordHash,
        mustChangePassword: true,
        version: sql`${profiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, id));

    /**
     * Sesi lama dicabut, dan di sini ia lebih penting daripada saat
     * penonaktifan.
     *
     * Alasan seseorang mengganti password orang lain adalah karena ia menduga
     * akunnya sudah dipegang orang lain. Kalau sesi yang sedang berjalan
     * dibiarkan hidup, orang yang memegangnya **tetap masuk** — dan password
     * baru hanya menutup pintu yang sudah dilewatinya.
     */
    await this.tokens.revokeAllForProfile(id);

    // `afterData` sengaja tidak memuat hash passwordnya. Yang dicatat adalah
    // bahwa passwordnya diganti dan oleh siapa — bukan nilainya. Catatan audit
    // dibaca lebih banyak orang daripada tabel `profiles`, jadi menaruh hash di
    // sana memperluas jangkauannya, bukan mempersempitnya.
    await this.record(context, PROFILE_ACTIONS.passwordReset, id, {
      afterData: { passwordReset: true, mustChangePassword: true },
    });

    return {
      temporaryPassword: temporary,
      profileId: id,
      email: profile.email,
      mustChangePassword: true,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Bentuk jawaban
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Kolom yang boleh dibaca siapa saja yang sudah masuk.
   *
   * `passwordHash` dan `googleSub` tidak ada, dan tidak akan pernah ada. `email`
   * dan `phone` juga tidak — lihat `listDirectory` di atas.
   */
  private directorySelection() {
    return {
      id: profiles.id,
      fullName: profiles.fullName,
      nickname: profiles.nickname,
      photoUrl: profiles.photoUrl,
      roles: profiles.roles,
      status: profiles.status,
      divisionId: profiles.divisionId,
      clusterId: profiles.clusterId,
      subunitId: profiles.subunitId,
      teamRole: profiles.teamRole,
      isKormasit: profiles.isKormasit,
      version: profiles.version,
    };
  }

  /**
   * Kolom lengkap, kecuali dua yang tidak boleh keluar dari server sama sekali.
   *
   * `passwordHash` — hash argon2id yang, kalau bocor, bisa diserang di luar
   *   jalur masuk yang sudah dibatasi laju.
   * `googleSub` — identitas akun Google. Tidak ada layar yang membutuhkannya,
   *   jadi tidak ada alasan mengirimkannya.
   */
  private fullSelection() {
    return {
      id: profiles.id,
      email: profiles.email,
      fullName: profiles.fullName,
      nickname: profiles.nickname,
      photoUrl: profiles.photoUrl,
      phone: profiles.phone,
      facultyMajor: profiles.facultyMajor,
      batchYear: profiles.batchYear,
      mustChangePassword: profiles.mustChangePassword,
      roles: profiles.roles,
      status: profiles.status,
      divisionId: profiles.divisionId,
      clusterId: profiles.clusterId,
      subunitId: profiles.subunitId,
      teamRole: profiles.teamRole,
      isKormasit: profiles.isKormasit,
      socialLinks: profiles.socialLinks,
      skills: profiles.skills,
      hobbies: profiles.hobbies,
      availabilityNote: profiles.availabilityNote,
      emergencyContactName: profiles.emergencyContactName,
      emergencyContactPhone: profiles.emergencyContactPhone,
      version: profiles.version,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pemeriksaan
  // ───────────────────────────────────────────────────────────────────────────

  private filters(dto: ListProfilesDto) {
    const conditions = [
      dto.divisionId !== undefined
        ? eq(profiles.divisionId, dto.divisionId)
        : undefined,
      dto.clusterId !== undefined
        ? eq(profiles.clusterId, dto.clusterId)
        : undefined,
      dto.subunitId !== undefined
        ? eq(profiles.subunitId, dto.subunitId)
        : undefined,
      dto.status !== undefined ? eq(profiles.status, dto.status) : undefined,
      // `= any(kolom)` alih-alih `@> ARRAY[...]`: tidak ada cast tipe enum yang
      // harus ditulis tangan, dan tipenya disimpulkan PostgreSQL dari kolomnya.
      dto.role !== undefined
        ? sql`${dto.role} = any(${profiles.roles})`
        : undefined,
      dto.q !== undefined
        ? or(
            ilike(profiles.fullName, `%${dto.q}%`),
            ilike(profiles.nickname, `%${dto.q}%`),
          )
        : undefined,
    ].filter((condition) => condition !== undefined);

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private async findFull(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select(this.fullSelection())
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  private async assertEmailFree(email: string): Promise<void> {
    const found = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (found.length > 0) {
      throw new ConflictException({
        code: PROFILE_ERRORS.duplicateEmail,
        title: `Email "${email}" sudah dipakai anggota lain.`,
        detail: 'Satu email hanya boleh menunjuk satu profil.',
      });
    }
  }

  /**
   * `invited` tidak boleh dipasang lagi setelah seseorang pernah masuk.
   *
   * `invited` berarti "barisnya dibuat owner, belum diklaim" (keputusan 26–28).
   * Orang yang sudah `active` atau sudah pernah dinonaktifkan sudah **pernah
   * diklaim** — mengembalikannya ke `invited` membuat sistem menyatakan sesuatu
   * yang tidak benar tentang dirinya, dan itu persis temuan §5.2.7 dalam bentuk
   * yang berbeda: badge yang berbohong.
   *
   * `active` dan `inactive` bebas berpindah ke dua arah. Menonaktifkan lalu
   * mengaktifkan kembali adalah hal yang wajar terjadi.
   */
  private assertStatusTransition(
    current: 'invited' | 'active' | 'inactive',
    next: 'invited' | 'active' | 'inactive',
  ): void {
    if (next === 'invited' && current !== 'invited') {
      throw new ConflictException({
        code: PROFILE_ERRORS.statusConflict,
        title:
          'Anggota yang sudah pernah masuk tidak bisa dikembalikan ke "diundang".',
        detail:
          'Gunakan "nonaktif" untuk menghentikan aksesnya. ' +
          '"Diundang" berarti barisnya belum pernah diklaim sama sekali.',
      });
    }
  }

  /**
   * Menolak perubahan yang membuat sistem kehilangan owner aktif terakhirnya.
   *
   * Ini satu-satunya kesalahan di modul ini yang **tidak bisa diperbaiki dari
   * dalam sistem**. `member:admin` hanya dimiliki `owner`/`co_owner`, dan
   * `organization:write` juga. Kalau owner aktif terakhir dinonaktifkan atau
   * perannya dicabut, tidak ada satu pun orang yang tersisa yang bisa
   * mengembalikannya — pemulihannya menuntut akses langsung ke database.
   *
   * Diperiksa dengan menghitung, bukan dengan mengasumsikan: yang menentukan
   * bukan "apakah ini owner terakhir" melainkan "apakah setelah perubahan ini
   * masih ada owner aktif". Cara kedua itu juga menangkap kasus yang tidak
   * terpikirkan — misalnya satu-satunya owner lain ternyata sudah nonaktif.
   */
  private async assertNotLastOwner(
    before: { id: string; roles: readonly string[]; status: string },
    dto: UpdateProfileDto,
  ): Promise<void> {
    const wasActiveOwner =
      before.status === 'active' && before.roles.includes('owner');

    if (!wasActiveOwner) {
      return;
    }

    const nextRoles = dto.roles ?? before.roles;
    const nextStatus = dto.status ?? before.status;

    if (nextStatus === 'active' && nextRoles.includes('owner')) {
      return;
    }

    const rows = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.status, 'active'),
          sql`'owner' = any(${profiles.roles})`,
          sql`${profiles.id} <> ${before.id}`,
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ConflictException({
        code: PROFILE_ERRORS.statusConflict,
        title: 'Ini satu-satunya owner yang masih aktif.',
        detail:
          'Angkat owner lain lebih dulu. Tanpa satu pun owner aktif, ' +
          'tidak ada yang bisa mengelola anggota — termasuk mengembalikan ' +
          'perubahan ini.',
      });
    }
  }

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new ConflictException({
        code: PROFILE_ERRORS.versionMismatch,
        title: 'Profil ini sudah berubah sejak kamu membacanya.',
        detail:
          `Versi yang kamu pegang ${expected}, yang berlaku sekarang ${current}. ` +
          'Baca ulang, gabungkan perubahanmu, lalu kirim lagi dengan versi terbaru.',
      });
    }
  }

  private assertUuid(id: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException({
        code: PROFILE_ERRORS.notFound,
        title: 'Anggota tidak ditemukan.',
      });
    }
  }

  private mustFound<T>(row: T | undefined): T {
    if (!row) {
      throw new NotFoundException({
        code: PROFILE_ERRORS.notFound,
        title: 'Anggota tidak ditemukan.',
      });
    }

    return row;
  }

  private mustUpdated<T>(row: T | undefined): T {
    if (!row) {
      throw new ConflictException({
        code: PROFILE_ERRORS.versionMismatch,
        title: 'Profil ini sudah berubah sejak kamu membacanya.',
        detail: 'Baca ulang, gabungkan perubahanmu, lalu kirim lagi.',
      });
    }

    return row;
  }

  private async record(
    context: WriteContext,
    action: string,
    entityId: string,
    data: { beforeData?: unknown; afterData?: unknown },
  ): Promise<void> {
    await this.audit.record({
      actorId: context.actorId,
      action,
      entityType: 'profiles',
      entityId,
      beforeData: (data.beforeData ?? null) as Record<string, unknown> | null,
      afterData: (data.afterData ?? null) as Record<string, unknown> | null,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }
}
