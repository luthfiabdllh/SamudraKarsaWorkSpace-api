import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateClusterDto,
  CreateDivisionDto,
  CreatePeriodDto,
  CreateSubunitDto,
  UpdateClusterDto,
  UpdateDivisionDto,
  UpdatePeriodDto,
  UpdateSubunitDto,
} from './dto/organization.dto';
import { OrganizationService, type WriteContext } from './organization.service';

/**
 * Data acuan organisasi: periode, divisi, cluster, subunit.
 *
 * | Rute | Penjagaan |
 * |---|---|
 * | `GET /organization/*` | `organization:read` |
 * | `POST · PATCH · DELETE /organization/*` | `organization:write` |
 * | `POST /organization/periods/:id/activate` | `organization:write` |
 *
 * ## Kenapa satu controller, bukan empat
 *
 * Keempatnya adalah tabel acuan yang dibaca hampir setiap layar dan hanya
 * ditulis `owner`/`co_owner`. Memecahnya menjadi empat controller berarti empat
 * tempat yang harus mengingat aturan yang sama — dan yang keempat adalah yang
 * akan lupa.
 *
 * Yang **tidak** dilakukan di sini, dan itu disengaja: penyaringan per peran.
 * `organization:read` terbuka untuk semua yang sudah masuk, jadi tidak ada yang
 * perlu disaring. Kalau suatu saat pembacaan dipersempit, penyaringannya harus
 * masuk ke sini juga — bukan ke frontend.
 *
 * ## Kenapa tidak ada penguncian optimistis
 *
 * Tidak ada satu pun rute di sini yang membaca `If-Match`. Keempat tabel ini
 * tidak punya kolom `version`, dan `_columns.ts` menyatakan sendiri bahwa itu
 * memang untuk tabel yang tidak diedit bersamaan. Yang menggantikannya adalah
 * indeks unik di database untuk kode, dan pemeriksaan rujukan sebelum menghapus.
 * Menambahkan `If-Match` di sini akan menuntut kolomnya ada — dan menambah kolom
 * untuk mencegah balapan yang tidak terjadi adalah biaya tanpa manfaat.
 */
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Periode
  // ───────────────────────────────────────────────────────────────────────────

  @Get('periods')
  @Policy('organization:read')
  listPeriods() {
    return this.organization.listPeriods();
  }

  /**
   * Periode yang sedang berlaku, atau `null`.
   *
   * Didaftarkan **sebelum** rute mana pun yang memakai `:id` supaya
   * `active` tidak pernah terbaca sebagai sebuah id. Hari ini belum ada
   * `GET periods/:id`, jadi belum ada yang bertabrakan — tetapi urutannya
   * ditulis begini sekarang agar penambahan rute itu nanti tidak diam-diam
   * membajak rute ini.
   */
  @Get('periods/active')
  @Policy('organization:read')
  getActivePeriod() {
    return this.organization.getActivePeriod();
  }

  @Post('periods')
  @Policy('organization:write')
  createPeriod(@Body() dto: CreatePeriodDto, @Req() request: Request) {
    return this.organization.createPeriod(dto, this.context(request));
  }

  @Patch('periods/:id')
  @Policy('organization:write')
  updatePeriod(
    @Param('id') id: string,
    @Body() dto: UpdatePeriodDto,
    @Req() request: Request,
  ) {
    return this.organization.updatePeriod(id, dto, this.context(request));
  }

  /**
   * `POST`, bukan `PATCH`.
   *
   * Yang dikirim bukan sebagian isi periode, melainkan **perintah**: jadikan
   * yang ini aktif. Efeknya pun bukan pada baris itu saja — periode yang tadinya
   * aktif ikut dimatikan. `PATCH { "isActive": true }` akan menyiratkan bahwa
   * yang berubah hanya satu baris, dan menyembunyikan separuh kejadiannya.
   */
  @Post('periods/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Policy('organization:write')
  activatePeriod(@Param('id') id: string, @Req() request: Request) {
    return this.organization.activatePeriod(id, this.context(request));
  }

  @Delete('periods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('organization:write')
  removePeriod(@Param('id') id: string, @Req() request: Request) {
    return this.organization.removePeriod(id, this.context(request));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Divisi
  // ───────────────────────────────────────────────────────────────────────────

  @Get('divisions')
  @Policy('organization:read')
  listDivisions() {
    return this.organization.listDivisions();
  }

  @Post('divisions')
  @Policy('organization:write')
  createDivision(@Body() dto: CreateDivisionDto, @Req() request: Request) {
    return this.organization.createDivision(dto, this.context(request));
  }

  @Patch('divisions/:id')
  @Policy('organization:write')
  updateDivision(
    @Param('id') id: string,
    @Body() dto: UpdateDivisionDto,
    @Req() request: Request,
  ) {
    return this.organization.updateDivision(id, dto, this.context(request));
  }

  @Delete('divisions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('organization:write')
  removeDivision(@Param('id') id: string, @Req() request: Request) {
    return this.organization.removeDivision(id, this.context(request));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cluster
  // ───────────────────────────────────────────────────────────────────────────

  @Get('clusters')
  @Policy('organization:read')
  listClusters() {
    return this.organization.listClusters();
  }

  @Post('clusters')
  @Policy('organization:write')
  createCluster(@Body() dto: CreateClusterDto, @Req() request: Request) {
    return this.organization.createCluster(dto, this.context(request));
  }

  @Patch('clusters/:id')
  @Policy('organization:write')
  updateCluster(
    @Param('id') id: string,
    @Body() dto: UpdateClusterDto,
    @Req() request: Request,
  ) {
    return this.organization.updateCluster(id, dto, this.context(request));
  }

  @Delete('clusters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('organization:write')
  removeCluster(@Param('id') id: string, @Req() request: Request) {
    return this.organization.removeCluster(id, this.context(request));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Subunit
  // ───────────────────────────────────────────────────────────────────────────

  @Get('subunits')
  @Policy('organization:read')
  listSubunits() {
    return this.organization.listSubunits();
  }

  @Post('subunits')
  @Policy('organization:write')
  createSubunit(@Body() dto: CreateSubunitDto, @Req() request: Request) {
    return this.organization.createSubunit(dto, this.context(request));
  }

  @Patch('subunits/:id')
  @Policy('organization:write')
  updateSubunit(
    @Param('id') id: string,
    @Body() dto: UpdateSubunitDto,
    @Req() request: Request,
  ) {
    return this.organization.updateSubunit(id, dto, this.context(request));
  }

  @Delete('subunits/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('organization:write')
  removeSubunit(@Param('id') id: string, @Req() request: Request) {
    return this.organization.removeSubunit(id, this.context(request));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Konteks penulisan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menyusun konteks audit dari permintaan yang sedang berjalan.
   *
   * `requestId` boleh `null`, dan `?? null` di bawah bukan kehati-hatian
   * berlebihan: `RequestIdMiddleware` memang selalu mengisinya, tetapi tipe
   * `Request` menyatakan ia opsional — dan `undefined` yang lolos ke kolom
   * `text` akan tersimpan sebagai `NULL` tanpa ada yang tahu bedanya dengan
   * "memang tidak ada".
   *
   * Alamat IP diambil lewat `clientIp()`, yang membaca `x-forwarded-for`
   * paling kiri. Header itu bisa dipalsukan kalau backend dihubungi langsung,
   * dan itu sudah dicatat di `request-context.ts` — yang bertahan terhadap
   * pemalsuan adalah penghitung per akun, bukan per IP.
   */
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
   * Tidak memakai `@CurrentActor()` supaya konteksnya bisa disusun di satu
   * tempat, bukan dioper sebagai argumen tambahan pada belasan metode. Guard
   * sudah memastikan `request.user` terisi sebelum baris mana pun di controller
   * ini berjalan — `organization:read` dan `organization:write` keduanya bukan
   * `@Public()`, jadi tidak ada jalur yang melewatinya.
   *
   * `throw` di bawah karena itu **tidak seharusnya** pernah terjadi. Kalau
   * terjadi, penyebabnya adalah rute yang ditandai `@Public()` padahal
   * seharusnya dijaga — dan gagal berisik di sini jauh lebih baik daripada
   * menulis baris audit dengan `actor_id` kosong, yang membuat perubahan itu
   * tampak tidak pernah terjadi.
   */
  private actorId(request: Request): string {
    const actor: AuthenticatedUser | undefined = request.user;

    if (!actor) {
      throw new Error(
        'Konteks penulisan diminta pada permintaan tanpa aktor — ' +
          'rute ini seharusnya dijaga, bukan @Public().',
      );
    }

    return actor.id;
  }
}
