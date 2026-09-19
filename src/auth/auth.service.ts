import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import type { Role } from '../common/types/roles';
import { DRIZZLE } from '../database/database.constants';
import { divisions, profiles } from '../database/schema/organization';
import { RateLimitedException } from '../rate-limit/rate-limited.exception';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUDIT_ACTIONS,
  LOGIN_FAILED_MESSAGE,
  LOGIN_LIMIT_PER_ACCOUNT,
  LOGIN_LIMIT_PER_IP,
  LOGIN_WINDOW_SECONDS,
} from './auth.constants';
import type {
  ChangePasswordDto,
  GoogleLoginDto,
  PasswordLoginDto,
} from './dto/auth.dto';
import { normalizeEmail } from './email';
import { GoogleVerifierService } from './google-verifier.service';
import { PasswordService } from './password.service';
import {
  RefreshRejectedException,
  TokenService,
  type IssuedRefreshToken,
  type TokenContext,
} from './token.service';

/** Aktor yang sedang masuk — bentuknya sama dengan `Actor` di openapi. */
export interface Actor {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  /**
   * Bertipe `Role`, bukan `string`.
   *
   * Ini bukan kerapian: `JwtAuthVerifier` mengembalikan aktor ini sebagai
   * `AuthenticatedUser`, yang mensyaratkan `readonly Role[]`. Dengan `string`,
   * penugasannya gagal dikompilasi — dan kalau ditambal dengan `as`, seluruh
   * pemeriksaan peran di `PolicyGuard` berhenti diperiksa tipe: salah ketik
   * `'division_head'` menjadi `'divison_head'` akan lolos kompilasi dan baru
   * ketahuan sebagai "kepala divisi tidak bisa mengakses apa pun".
   */
  readonly roles: readonly Role[];
  readonly divisionCodes: readonly string[];
  readonly mustChangePassword: boolean;
}

/** Hasil masuk yang berhasil. */
export interface AuthResult {
  readonly actor: Actor;
  readonly accessToken: string;
  readonly expiresIn: number;
  /** Diteruskan BFF ke cookie `httpOnly`; tidak pernah menyentuh JavaScript. */
  readonly refreshToken: string;
}

/**
 * Kolom yang dibaca untuk setiap pemuatan profil.
 *
 * Dipisahkan sebagai konstanta supaya kedua pemuatnya — lewat email dan lewat
 * id — tidak bisa menyimpang satu sama lain. Dua daftar kolom yang berbeda akan
 * menghasilkan aktor yang berbeda tergantung dari mana ia dimuat, dan itu jenis
 * perbedaan yang baru ketahuan saat ada yang aneh tetapi tidak bisa ditunjuk.
 *
 * `passwordHash` ikut di sini meski ia tidak pernah keluar dari kelas ini:
 * `toActor()` tidak memasukkannya, dan `loadActor()` mengembalikan `Actor`.
 * Yang membutuhkannya hanya dua jalur — masuk dengan password, dan ganti
 * password — dan keduanya ada di berkas ini.
 */
const PROFILE_COLUMNS = {
  id: profiles.id,
  email: profiles.email,
  fullName: profiles.fullName,
  roles: profiles.roles,
  status: profiles.status,
  mustChangePassword: profiles.mustChangePassword,
  passwordHash: profiles.passwordHash,
  googleSub: profiles.googleSub,
  divisionCode: divisions.code,
} as const;

/**
 * Bentuk baris profil sebagaimana dibaca kelas ini.
 *
 * Ditulis sebagai antarmuka biasa, bukan diturunkan dari `PROFILE_COLUMNS`
 * lewat tipe turunan. Tipe turunan akan ikut berubah diam-diam setiap kali ada
 * kolom ditambahkan ke konstanta itu — termasuk menjadi `string` lebar begitu
 * ada kolom yang tipenya tidak terbaca. Ditulis begini, menambah kolom menuntut
 * satu baris di sini juga, dan baris itu terlihat saat ditinjau.
 */
interface ProfileSnapshot {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly roles: readonly Role[];
  readonly status: 'invited' | 'active' | 'inactive';
  readonly mustChangePassword: boolean;
  readonly passwordHash: string | null;
  readonly googleSub: string | null;
  readonly divisionCode: string | null;
}

/**
 * Seluruh aturan autentikasi.
 *
 * ## Satu fungsi, dua jalur masuk
 *
 * `canAuthenticate(email)` dipanggil oleh **kedua** jalur masuk, dan itu bukan
 * kerapian — `PRD-REVAMP.md` §7.8.1 menyebutnya keamanan. Dua jalur masuk
 * berarti dua tempat aturan "tertutup" harus ditegakkan, dan dua salinan aturan
 * cepat atau lambat menyimpang; jalur yang lebih longgar menjadi pintu
 * masuknya. Satu fungsi berarti tidak ada yang bisa menyimpang.
 *
 * ## Aturannya
 *
 * ```
 * email terdaftar?          tidak → TOLAK
 *       │ ya
 * status bukan inactive?    tidak → TOLAK
 *       │ ya
 *    BOLEH MASUK
 * ```
 *
 * Perhatikan bahwa `invited` **lolos**. Itu memang yang diinginkan: alur
 * pendaftaran (§7.8.5) membuat anggota berstatus `invited`, lalu anggota itu
 * masuk sendiri dengan Google, dan login pertama itulah yang mengubahnya
 * menjadi `active`. Menolak `invited` akan membuat alur itu mustahil.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly google: GoogleVerifierService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Masuk
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Masuk dengan Google.
   *
   * Verifikasi ID token ada di `GoogleVerifierService`; yang tersisa di sini
   * adalah aturan domainnya, dan urutannya penting:
   *
   * 1. `canAuthenticate` — email terdaftar, status bukan `inactive`
   * 2. `sub` dicocokkan; **kalau sudah terisi nilai lain, ditolak**
   * 3. `sub` disimpan kalau masih kosong, `invited` menjadi `active`
   */
  async loginWithGoogle(
    dto: GoogleLoginDto,
    context: TokenContext,
    requestId: string | null,
  ): Promise<AuthResult> {
    const identity = await this.google.verify(dto.credential);
    const profile = await this.canAuthenticate(identity.email);

    // `PRD-REVAMP.md` §7.8.2 nomor 5 — setelah login pertama, pencocokannya
    // lewat `sub`, bukan email.
    //
    // Ini menutup skenario yang langka tetapi nyata: sebuah alamat surel
    // dilepas dari akun Google lama lalu dipakai orang lain. Tanpa pemeriksaan
    // ini, orang itu masuk ke akun anggota sebelumnya — dan pemiliknya tidak
    // pernah tahu.
    if (profile.googleSub !== null && profile.googleSub !== identity.sub) {
      this.logger.warn(
        `Google sub tidak cocok untuk profil ${profile.id}: tersimpan, bukan yang dikirim`,
      );
      await this.recordLoginFailure(profile.id, context, requestId, {
        reason: 'google_sub_mismatch',
      });
      throw this.loginFailed();
    }

    const patch: { googleSub?: string; status?: 'active' } = {};

    if (profile.googleSub === null) {
      patch.googleSub = identity.sub;
    }

    // §7.8.3 — login pertama yang berhasil mengubah `invited` menjadi `active`.
    if (profile.status === 'invited') {
      patch.status = 'active';
    }

    if (Object.keys(patch).length > 0) {
      await this.db
        .update(profiles)
        .set(patch)
        .where(eq(profiles.id, profile.id));
    }

    const result = await this.issueSession(profile.id, profile, context);

    await this.audit.record({
      actorId: profile.id,
      action: AUDIT_ACTIONS.loginGoogle,
      entityType: 'profiles',
      entityId: profile.id,
      afterData: {
        firstLogin: profile.status === 'invited',
        // `sub` sengaja **tidak** dicatat. Ia pengenal tetap yang, kalau
        // tercatat, membuat catatan audit ikut menjadi tempat mencarinya.
        subStored: patch.googleSub !== undefined,
      },
      requestId,
      ipAddress: context.ipAddress,
    });

    return result;
  }

  /**
   * Masuk dengan password.
   *
   * Urutan pemeriksaannya disengaja: **batas percobaan lebih dulu**, baru
   * verifikasi password. Kalau urutannya dibalik, setiap tebakan akan
   * menjalankan argon2 lebih dulu — dan argon2 memang lambat, itulah gunanya —
   * sehingga penyerang bisa menyibukkan CPU fungsi serverless tanpa pernah
   * mencapai pemeriksaan batasnya.
   */
  async loginWithPassword(
    dto: PasswordLoginDto,
    context: TokenContext,
    requestId: string | null,
  ): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);

    await this.assertLoginAllowed(email, context.ipAddress);

    const profile = await this.canAuthenticate(email);

    if (profile.passwordHash === null) {
      await this.recordLoginFailure(profile.id, context, requestId, {
        reason: 'no_password_set',
      });
      throw this.loginFailed();
    }

    const matches = await this.passwords.verifyPassword(
      profile.passwordHash,
      dto.password,
    );

    if (!matches) {
      await this.recordLoginFailure(profile.id, context, requestId, {
        reason: 'bad_password',
      });
      throw this.loginFailed();
    }

    // Percobaan yang berhasil mengosongkan penghitungnya.
    //
    // Penghitung ini menahan tebakan yang salah; begitu tebakannya benar, tidak
    // ada lagi yang perlu ditahan. Membiarkannya naik berarti lima login
    // berhasil dari satu alamat IP akan mengunci seluruh jaringan di belakang
    // alamat itu — dan itu kampus, kantor, atau satu rumah.
    await this.clearLoginCounters(email, context.ipAddress);

    const result = await this.issueSession(profile.id, profile, context);

    await this.audit.record({
      actorId: profile.id,
      action: AUDIT_ACTIONS.loginPassword,
      entityType: 'profiles',
      entityId: profile.id,
      requestId,
      ipAddress: context.ipAddress,
    });

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sesi
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Memutar refresh token dan menerbitkan access token baru.
   *
   * Rotasinya ada di `TokenService`; yang ditambahkan di sini hanyalah dua
   * pemeriksaan yang butuh keadaan profil:
   *
   * - profilnya masih ada, dan
   * - statusnya bukan `inactive`
   *
   * Keduanya **wajib di sini juga**, bukan hanya di verifier access token.
   * Tanpa itu, anggota yang dinonaktifkan bisa terus memperbarui sesinya dengan
   * token penyegar yang masih berlaku tujuh hari — dan pencabutan akses yang
   * butuh seminggu untuk berlaku bukan pencabutan akses.
   */
  async refresh(
    rawToken: string,
    context: TokenContext,
    requestId: string | null,
  ): Promise<AuthResult> {
    let rotated: { token: IssuedRefreshToken; profileId: string };

    try {
      rotated = await this.tokens.rotateRefreshToken(rawToken, context);
    } catch (error) {
      if (
        error instanceof RefreshRejectedException &&
        error.reason === 'reuse'
      ) {
        await this.audit.record({
          actorId: null,
          action: AUDIT_ACTIONS.refreshReuse,
          entityType: 'refresh_tokens',
          // Baris tokennya memang ada — ia yang ditemukan lewat hash. Yang
          // tidak diketahui adalah **siapa** yang memakainya, dan karena itu
          // `actorId` di atas bernilai null.
          entityId: error.tokenId ?? UNKNOWN_ENTITY_ID,
          afterData: { familyId: error.familyId, familyRevoked: true },
          requestId,
          ipAddress: context.ipAddress,
        });
      }
      throw error;
    }

    const profile = await this.loadProfileById(rotated.profileId);

    if (!profile || profile.status === 'inactive') {
      // Seluruh sesinya dicabut, bukan hanya ditolak sekali: kalau pemiliknya
      // dinonaktifkan, tidak ada alasan menyisakan token lain yang masih hidup.
      await this.tokens.revokeAllForProfile(rotated.profileId);
      throw this.refreshRejected();
    }

    const accessToken = await this.tokens.mintAccessToken(profile.id);

    return {
      actor: this.toActor(profile),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rotated.token.raw,
    };
  }

  /**
   * Keluar.
   *
   * Yang dicabut adalah **keluarga** tokennya, bukan hanya token yang dikirim.
   * Kalau hanya satu yang dicabut, salinan yang dibuat sebelumnya tetap berlaku
   * sampai tujuh hari — dan keluar yang tidak benar-benar mengeluarkan adalah
   * tombol yang berbohong.
   */
  async logout(
    rawToken: string | null,
    actorId: string,
    requestId: string | null,
    ipAddress: string | null,
  ): Promise<void> {
    if (rawToken !== null) {
      await this.tokens.revokeFamilyOf(rawToken);
    } else {
      // Tidak ada token penyegar yang dikirim. Yang bisa dilakukan hanyalah
      // mencabut seluruh sesi profil ini — lebih luas dari yang diminta, dan
      // itu memang yang benar: keluar tanpa bukti kepemilikan sesi tertentu
      // tidak boleh menyisakan sesi mana pun.
      await this.tokens.revokeAllForProfile(actorId);
    }

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.logout,
      entityType: 'profiles',
      entityId: actorId,
      requestId,
      ipAddress,
    });
  }

  /**
   * Mengganti password sendiri.
   *
   * Dua akibat yang wajib menyertainya (`PRD-REVAMP.md` §7.8.6):
   *
   * 1. `mustChangePassword` dimatikan — dan ini satu-satunya tempat ia dimatikan
   * 2. **Seluruh refresh token profil dicabut.** Kalau sesi lama bertahan
   *    setelah password berubah, mengganti password bukan tindakan pengamanan,
   *    melainkan tindakan yang tidak mengubah apa pun bagi orang yang sudah
   *    memegang sesinya.
   *
   * `version` sengaja **tidak** dinaikkan meski barisnya berubah. `version`
   * dipakai optimistic locking untuk form yang menampilkan kolom profil
   * (§7.16); menaikkannya di sini akan membuat panel admin menolak penyuntingan
   * yang sedang dibuka hanya karena anggotanya kebetulan mengganti password di
   * ruang lain. Yang berubah di sini tidak ada di form itu.
   */
  async changePassword(
    actorId: string,
    dto: ChangePasswordDto,
    context: TokenContext,
    requestId: string | null,
  ): Promise<void> {
    const profile = await this.loadProfileById(actorId);

    if (!profile || profile.status === 'inactive') {
      throw this.loginFailed();
    }

    if (profile.passwordHash === null) {
      // Anggota yang selama ini hanya masuk lewat Google. Ia tidak punya
      // password saat ini, jadi tidak ada yang bisa diverifikasi — dan
      // memperlakukannya sebagai "password saat ini salah" akan menyesatkan.
      throw new ConflictException({
        code: 'no_password_set',
        title: 'Akun ini belum punya password',
        detail:
          'Akun ini hanya pernah masuk lewat Google. Minta pemilik organisasi ' +
          'menetapkan password sementara lebih dulu.',
      });
    }

    const matches = await this.passwords.verifyPassword(
      profile.passwordHash,
      dto.currentPassword,
    );

    if (!matches) {
      // 409, bukan 401: pemanggilnya **sudah** terautentikasi — yang salah
      // adalah isian di dalam permintaannya, bukan identitasnya. 401 akan
      // membuat frontend mencoba menyegarkan token, dan itu tidak akan menolong.
      throw new ConflictException({
        code: 'current_password_mismatch',
        title: 'Password saat ini tidak cocok',
      });
    }

    const newHash = await this.passwords.hashPassword(dto.newPassword);

    await this.db
      .update(profiles)
      .set({ passwordHash: newHash, mustChangePassword: false })
      .where(eq(profiles.id, actorId));

    await this.tokens.revokeAllForProfile(actorId);

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.passwordChanged,
      entityType: 'profiles',
      entityId: actorId,
      // Passwordnya sendiri **tidak** masuk catatan, dalam bentuk apa pun.
      // Yang berguna untuk audit adalah bahwa perubahannya terjadi, dan siapa
      // yang melakukannya.
      afterData: { mustChangePassword: false, sessionsRevoked: true },
      requestId,
      ipAddress: context.ipAddress,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Dipakai JwtAuthVerifier
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Memuat aktor dari `profiles.id`.
   *
   * Mengembalikan `null` — bukan melempar — karena pemanggilnya adalah
   * verifier, dan verifier yang mengembalikan `null` akan ditolak `PolicyGuard`
   * (`AuthVerifier` mensyaratkan lempar, jadi `JwtAuthVerifier` yang
   * menerjemahkan `null` ini menjadi `UnauthorizedException`).
   */
  async loadActor(profileId: string): Promise<Actor | null> {
    const profile = await this.loadProfileById(profileId);

    if (!profile || profile.status === 'inactive') {
      return null;
    }

    return this.toActor(profile);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Aturan tunggal "siapa yang boleh masuk" — `PRD-REVAMP.md` §7.8.1.
   *
   * Private, dan itu disengaja: satu-satunya cara memakainya adalah lewat kedua
   * jalur masuk di atas. Kalau ia publik, modul lain akan memanggilnya untuk
   * keperluan lain, dan lambat laun artinya melar.
   */
  private async canAuthenticate(email: string): Promise<ProfileSnapshot> {
    const profile = await this.loadProfileByEmail(normalizeEmail(email));

    if (!profile || profile.status === 'inactive') {
      throw this.loginFailed();
    }

    return profile;
  }

  private async issueSession(
    profileId: string,
    profile: ProfileSnapshot,
    context: TokenContext,
  ): Promise<AuthResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.mintAccessToken(profileId),
      this.tokens.issueRefreshToken(profileId, context),
    ]);

    return {
      actor: this.toActor(profile),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: refreshToken.raw,
    };
  }

  private toActor(profile: ProfileSnapshot): Actor {
    const isDivisionLead =
      profile.roles.includes('division_head') ||
      profile.roles.includes('division_deputy');

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      roles: profile.roles,
      // Terisi **hanya** untuk kepala divisi dan wakilnya — lihat `Actor` di
      // openapi. Anggota biasa di divisi Keuangan tidak mengisi ini, dan justru
      // itu yang membuat pemeriksaan keuangan benar: menjadi anggota divisi
      // Keuangan bukanlah wewenang atas keuangannya.
      divisionCodes:
        isDivisionLead && profile.divisionCode ? [profile.divisionCode] : [],
      mustChangePassword: profile.mustChangePassword,
    };
  }

  private async loadProfileByEmail(
    email: string,
  ): Promise<ProfileSnapshot | null> {
    const rows = await this.db
      .select(PROFILE_COLUMNS)
      .from(profiles)
      .leftJoin(divisions, eq(profiles.divisionId, divisions.id))
      .where(eq(profiles.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  private async loadProfileById(
    profileId: string,
  ): Promise<ProfileSnapshot | null> {
    const rows = await this.db
      .select(PROFILE_COLUMNS)
      .from(profiles)
      .leftJoin(divisions, eq(profiles.divisionId, divisions.id))
      .where(eq(profiles.id, profileId))
      .limit(1);

    return rows[0] ?? null;
  }

  private async assertLoginAllowed(
    email: string,
    ipAddress: string | null,
  ): Promise<void> {
    const checks = await Promise.all([
      this.rateLimit.consume(
        `login:email:${email}`,
        LOGIN_LIMIT_PER_ACCOUNT,
        LOGIN_WINDOW_SECONDS,
      ),
      ipAddress === null
        ? Promise.resolve(null)
        : this.rateLimit.consume(
            `login:ip:${ipAddress}`,
            LOGIN_LIMIT_PER_IP,
            LOGIN_WINDOW_SECONDS,
          ),
    ]);

    const blocked = checks.find((check) => check !== null && !check.allowed);

    if (blocked) {
      throw new RateLimitedException(
        Math.max(1, Math.ceil((blocked.resetAt.getTime() - Date.now()) / 1000)),
        'Batas percobaan masuk tercapai. Tunggu beberapa menit lalu coba lagi.',
      );
    }
  }

  private async clearLoginCounters(
    email: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.rateLimit.reset(`login:email:${email}`, LOGIN_WINDOW_SECONDS);

    if (ipAddress !== null) {
      await this.rateLimit.reset(`login:ip:${ipAddress}`, LOGIN_WINDOW_SECONDS);
    }
  }

  private async recordLoginFailure(
    profileId: string,
    context: TokenContext,
    requestId: string | null,
    afterData: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorId: null,
      action: AUDIT_ACTIONS.loginFailed,
      entityType: 'profiles',
      // Entitasnya adalah profil yang **dicoba** dimasuki, bukan aktornya:
      // pada percobaan yang gagal, aktornya justru tidak diketahui.
      entityId: profileId,
      afterData,
      requestId,
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Satu pesan untuk setiap kegagalan masuk — §7.8.4.
   *
   * Pesannya sama untuk email tidak terdaftar, password salah, akun nonaktif,
   * dan `sub` Google yang tidak cocok. Membedakannya memberi tahu penyerang
   * alamat surel mana yang terdaftar.
   */
  private loginFailed(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'login_failed',
      title: LOGIN_FAILED_MESSAGE,
    });
  }

  private refreshRejected(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'not_authenticated',
      title: 'Sesi tidak lagi berlaku. Silakan masuk kembali.',
    });
  }
}

/**
 * Nilai `entity_id` untuk kejadian yang barisnya sudah tidak ada.
 *
 * `activity_logs.entity_id` bertipe `uuid` dan `notNull`, sehingga catatan
 * audit tetap harus menunjuk sesuatu. Uuid nol dipakai karena ia jelas bukan id
 * mana pun — sehingga baris seperti ini gampang dikenali saat menyelidiki,
 * alih-alih tampak seperti menunjuk baris yang kebetulan sudah dihapus.
 */
const UNKNOWN_ENTITY_ID = '00000000-0000-0000-0000-000000000000';
