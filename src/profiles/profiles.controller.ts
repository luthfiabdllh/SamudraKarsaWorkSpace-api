import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { requireIfMatch } from '../common/http/if-match';
import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateProfileDto,
  ListProfilesDto,
  UpdateProfileDto,
  UpdateSelfProfileDto,
} from './dto/profile.dto';
import { PROFILE_ERRORS } from './profiles.constants';
import { ProfilesService, type WriteContext } from './profiles.service';

/**
 * Profil anggota.
 *
 * | Rute | Penjagaan | Bentuk jawaban |
 * |---|---|---|
 * | `GET /profiles` | `profile:read` | ringkas |
 * | `GET /profiles/:id` | `profile:read` | ringkas |
 * | `GET /profiles/me` | `profile:read` | lengkap, milik sendiri |
 * | `GET /profiles/admin` | `member:admin` | lengkap, semua |
 * | `PATCH /profiles/me` | `profile:write-self` | lengkap |
 * | `POST /profiles` | `member:admin` | lengkap |
 * | `PATCH /profiles/:id` | `member:admin` | lengkap |
 * | `POST /profiles/:id/reset-password` | `member:admin` | password sementara |
 *
 * ## Kenapa bentuk lengkap punya endpointnya sendiri
 *
 * Tidak ada satu pun rute di sini yang **bentuk jawabannya bergantung pada
 * peran pemanggilnya**. Yang menentukan adalah rutenya: `/profiles/admin`
 * dijaga `member:admin`, sisanya tidak.
 *
 * Itu dipilih dengan sengaja. Rute yang jawabannya bercabang menurut peran
 * adalah rute yang kebocorannya cukup disebabkan satu `if` yang terbalik —
 * dan `PolicyGuard` tidak akan menangkapnya, karena perannya memang boleh
 * masuk. Dua rute dengan dua `@Policy` berbeda menuntut dua kesalahan yang
 * keduanya harus terjadi bersamaan.
 *
 * ## Urutan deklarasi rute
 *
 * `me` dan `admin` didaftarkan **sebelum** `:id`. Nest mencocokkan rute
 * menurut urutan deklarasi, jadi `GET /profiles/me` yang didaftarkan setelah
 * `GET /profiles/:id` akan terbaca sebagai permintaan profil dengan id `"me"`
 * — dan jawabannya `404` dari `assertUuid`, bukan profil orangnya.
 */
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  @Policy('profile:read')
  me(@Req() request: Request) {
    return this.profiles.me(this.actorId(request));
  }

  @Get('admin')
  @Policy('member:admin')
  listAdmin(@Query() dto: ListProfilesDto) {
    return this.profiles.listAdmin(dto);
  }

  @Get()
  @Policy('profile:read')
  list(@Query() dto: ListProfilesDto) {
    return this.profiles.listDirectory(dto);
  }

  @Get(':id')
  @Policy('profile:read')
  getOne(@Param('id') id: string) {
    return this.profiles.getDirectory(id);
  }

  /**
   * `PATCH /profiles/me` — satu-satunya tempat anggota mengubah dirinya sendiri.
   *
   * `If-Match` **wajib** di sini, dan itu bukan formalitas: dua perangkat milik
   * orang yang sama membuka halaman profil adalah hal yang biasa, dan tanpa
   * penguncian, yang menyimpan belakangan menghapus isian yang satunya tanpa
   * satu pun pesan (§5.2.12).
   */
  @Patch('me')
  @Policy('profile:write-self')
  updateSelf(@Body() dto: UpdateSelfProfileDto, @Req() request: Request) {
    return this.profiles.updateSelf(
      this.actorId(request),
      dto,
      this.expectedVersion(request),
      this.context(request),
    );
  }

  @Post()
  @Policy('member:admin')
  create(@Body() dto: CreateProfileDto, @Req() request: Request) {
    return this.profiles.create(dto, this.context(request));
  }

  @Patch(':id')
  @Policy('member:admin')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @Req() request: Request,
  ) {
    return this.profiles.update(
      id,
      dto,
      this.expectedVersion(request),
      this.context(request),
    );
  }

  /**
   * `POST`, bukan `PATCH`, dan tanpa `If-Match`.
   *
   * Yang dilakukan rute ini bukan menyunting baris, melainkan menggantinya
   * dengan password baru. Tidak ada tulisan yang bisa hilang, jadi tidak ada
   * yang perlu dikunci — alasannya lengkap di `ProfilesService.resetPassword`.
   *
   * `200`, bukan `201`: tidak ada resource baru yang dibuat, dan `Location`
   * tidak menunjuk apa pun yang bisa diambil kembali.
   */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Policy('member:admin')
  resetPassword(@Param('id') id: string, @Req() request: Request) {
    return this.profiles.resetPassword(id, this.context(request));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Konteks permintaan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Versi baris yang diharapkan klien, dari header `If-Match`.
   *
   * `requireIfMatch` melempar `428` kalau headernya tidak ada dan `400` kalau
   * isinya tidak terbaca — lihat `common/http/if-match.ts` untuk alasannya.
   * Dipanggil dari controller, bukan dari service, karena ia membaca **header**;
   * service-nya menerima angka, sehingga bisa diuji tanpa request sama sekali.
   */
  private expectedVersion(request: Request): number {
    return requireIfMatch(
      request,
      PROFILE_ERRORS.versionRequired,
      'Perubahan profil',
    );
  }

  private context(request: Request): WriteContext {
    return {
      actorId: this.actorId(request),
      requestId: request.requestId ?? null,
      ipAddress: clientIp(request),
    };
  }

  /**
   * `profiles.id` aktor yang sedang menulis.
   *
   * `throw` di bawah tidak seharusnya pernah terjadi: tidak ada rute di
   * controller ini yang `@Public()`. Kalau terjadi, penyebabnya adalah rute
   * yang ditandai publik padahal seharusnya dijaga — dan gagal berisik di sini
   * jauh lebih baik daripada menulis baris audit dengan `actor_id` kosong, yang
   * membuat perubahan itu tampak tidak pernah terjadi.
   */
  private actorId(request: Request): string {
    const actor: AuthenticatedUser | undefined = request.user;

    if (!actor) {
      throw new Error(
        'Konteks profil diminta pada permintaan tanpa aktor — ' +
          'rute ini seharusnya dijaga, bukan @Public().',
      );
    }

    return actor.id;
  }
}
