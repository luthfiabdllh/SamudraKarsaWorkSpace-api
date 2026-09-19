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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { requireIfMatch } from '../common/http/if-match';
import { clientIp } from '../common/http/request-context';
import type { AuthenticatedUser } from '../common/types/express';
import { Policy } from '../policy/policy.decorator';
import {
  CreateRequestDto,
  ListRequestsDto,
  ResolveSyncConflictDto,
  TransitionRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { REQUEST_ERRORS } from './requests.constants';
import { RequestsService } from './requests.service';
import type { WriteContext } from '../work-items/work-items.service';

/**
 * Permintaan lintas divisi — modul inti Fase 3.
 *
 * | Rute | Penjagaan | Diperiksa lagi per baris |
 * |---|---|---|
 * | `GET /requests` | `request:read` | — |
 * | `GET /requests/:id` | `request:read` | — |
 * | `POST /requests` | `request:create` | — |
 * | `PATCH /requests/:id` | `request:write` | `canEditRequest` |
 * | `POST /requests/:id/transitions` | `request:write` | `canTransitionRequest` + penutupan konflik |
 * | `POST /requests/:id/sync-conflict` | `request:write` | `canEditRequest` |
 * | `DELETE /requests/:id` | `request:delete` | `canDeleteRequest` |
 *
 * Bentuknya sengaja sebaris dengan `WorkItemsController`, dan itu bukan
 * kebetulan: keduanya modul yang sama dengan entitas yang berbeda, dan
 * perbedaan bentuk di antara keduanya akan dibaca sebagai perbedaan aturan.
 *
 * ## Kenapa `sync-conflict` mendapat rute tersendiri
 *
 * Karena konflik sinkronisasi **menutup perpindahan status bagi semua peran,
 * termasuk owner** (keputusan 49). Tanpa rute ini, konflik menjadi jalan buntu:
 * satu-satunya cara keluar adalah memindahkan status, dan memindahkan status
 * ditolak selama konfliknya ada.
 *
 * Ia bukan `POST /transitions` dengan bendera, dan itu disengaja. Perpindahan
 * status menuntut langkahnya **ada** di aturan alur; penyelesaian konflik justru
 * terjadi ketika langkah itu **tidak ada**. Menyatukan keduanya berarti satu rute
 * yang kadang memeriksa state machine dan kadang tidak — dan rute yang aturannya
 * bergantung pada isi badan permintaannya adalah rute yang tidak bisa diperiksa
 * dengan membacanya.
 *
 * ## Kenapa `request:write` untuk tiga rute sekaligus
 *
 * Sama alasannya dengan `work-item:write`: §7.9 tidak membedakan siapa yang
 * boleh mengubah isi sebuah permintaan dari siapa yang boleh memindahkan
 * statusnya. Yang membedakan bukan perannya, melainkan **barisnya** — apakah ia
 * pemohonnya, penanggung jawabnya, atau kepala divisi yang dituju. Jawaban itu
 * ada di `resource.ts`, dan `PolicyGuard` sengaja belum bisa membacanya.
 *
 * Karena itu: **`@Policy` yang lolos bukan berarti permisinya lolos.** Ketiga
 * rute ber-`request:write` masih bisa menjawab `404` dari service, dan itu
 * jawaban yang benar (§7.3).
 *
 * ## Kenapa `GET` tidak memeriksa barisnya
 *
 * §7.9 memberi ✓ kepada kelima peran pada baris "Lihat permintaan", tanpa syarat
 * apa pun tentang barisnya — dan permintaan lintas divisi justru inti fiturnya.
 * Yang dibatasi per baris adalah **mengubahnya**.
 */
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @Policy('request:read')
  list(@Query() dto: ListRequestsDto) {
    return this.requests.list(dto);
  }

  @Get(':id')
  @Policy('request:read')
  detail(@Param('id') id: string, @Req() request: Request) {
    return this.requests.detail(id, this.actor(request));
  }

  /**
   * Mengajukan permintaan — `201`, selalu berstatus `draft`.
   *
   * Tanpa `If-Match`: tidak ada baris yang bisa ditimpa. `status` dan
   * `linkedWorkItemId` tidak ada di DTO-nya, sehingga tidak ada cara membuat
   * permintaan yang sudah diajukan atau yang sudah punya pekerjaan terhubung —
   * pekerjaannya dibuat saat **pengajuan** (§5.2.4), bukan saat pembuatan.
   */
  @Post()
  @Policy('request:create')
  create(@Body() dto: CreateRequestDto, @Req() request: Request) {
    return this.requests.create(
      dto,
      this.actor(request),
      this.context(request),
    );
  }

  @Patch(':id')
  @Policy('request:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @Req() request: Request,
  ) {
    return this.requests.update(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Memindahkan status — `POST`, bukan `PATCH`, dengan alasan yang sama seperti
   * pada pekerjaan: yang dikirim adalah **perintah**, dan rute tersendiri dengan
   * kata kerja tersendiri menjaga agar tidak ada jalur penulisan status selain
   * yang melewati state machine.
   *
   * `200`, bukan `201`: tidak ada resource baru. Yang kembali adalah barisnya
   * dengan `version` yang sudah naik.
   *
   * Pada `draft → submitted`, rute inilah yang **membuat pekerjaan terhubung**
   * (§5.2.4) — di dalam transaksi yang sama, lalu langsung memindahkannya ke
   * `submitted` lewat sinkronisasi. Kalau pekerjaan itu belum punya PIC aktif
   * saat dibutuhkan, seluruhnya ditolak dengan `422`: permintaan yang diajukan
   * tanpa pekerjaan yang bisa dikerjakan adalah ketidaksepakatan yang baru saja
   * dibuat sendiri.
   */
  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('request:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionRequestDto,
    @Req() request: Request,
  ) {
    return this.requests.transition(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Menyelesaikan konflik sinkronisasi — keputusan 49.
   *
   * Satu-satunya rute di seluruh sistem yang menulis status **tanpa** melewati
   * state machine, dan alasannya ada di `RequestSyncService.resolveWithin`:
   * konflik muncul justru karena tidak ada langkah otomatis yang bisa
   * mendamaikan kedua sisi.
   *
   * `If-Match` tetap wajib di sini meski statusnya sedang tidak menentu. Justru
   * karena keputusannya menimpa keadaan yang belum sepakat: menyelesaikannya di
   * atas baris yang sudah bergerak lagi berarti memutuskan untuk keadaan yang
   * belum pernah dilihat siapa pun.
   */
  @Post(':id/sync-conflict')
  @HttpCode(HttpStatus.OK)
  @Policy('request:write')
  resolveSyncConflict(
    @Param('id') id: string,
    @Body() dto: ResolveSyncConflictDto,
    @Req() request: Request,
  ) {
    return this.requests.resolveSyncConflict(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Menghapus permintaan — `204`, tanpa isi.
   *
   * Soft delete, dan **pekerjaan terhubungnya dibiarkan hidup**: ia dokumen
   * tersendiri dengan pekerjaannya sendiri. Alasannya di `RequestsService.remove`.
   *
   * Ini rute permintaan yang dijaga policy peran yang berbeda dari
   * `request:write`, karena §7.9 tidak memuat barisnya dan pola keputusan 36
   * yang dipakai: anggota ❌, sama seperti penghapusan pekerjaan.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('request:delete')
  remove(@Param('id') id: string, @Req() request: Request) {
    return this.requests.remove(
      id,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Konteks permintaan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Versi baris yang diharapkan klien, dari header `If-Match`.
   *
   * `428` kalau headernya tidak ada, `400` kalau isinya tidak terbaca. Dipanggil
   * dari controller, bukan dari service, karena ia membaca **header**.
   */
  private expectedVersion(request: Request): number {
    return requireIfMatch(
      request,
      REQUEST_ERRORS.versionRequired,
      'Perubahan permintaan',
    );
  }

  private actor(request: Request): AuthenticatedUser {
    const actor: AuthenticatedUser | undefined = request.user;

    if (!actor) {
      throw new Error(
        'Aktor diminta pada permintaan tanpa aktor — ' +
          'rute ini seharusnya dijaga, bukan @Public().',
      );
    }

    return actor;
  }

  private context(request: Request): WriteContext {
    return {
      actorId: this.actor(request).id,
      requestId: request.requestId ?? null,
      ipAddress: clientIp(request),
    };
  }
}
