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
  CreateStoryWithTasksDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  SetWorkItemPicDto,
  TransitionWorkItemDto,
  UpdateWorkItemDto,
} from './dto/work-item.dto';
import { WORK_ITEM_ERRORS } from './work-items.constants';
import { WorkItemsService, type WriteContext } from './work-items.service';

/**
 * Pekerjaan — modul inti Fase 3.
 *
 * | Rute | Penjagaan | Diperiksa lagi per baris |
 * |---|---|---|
 * | `GET /work-items` | `work-item:read` | — |
 * | `GET /work-items/:id` | `work-item:read` | — |
 * | `POST /work-items` | `work-item:create` | — |
 * | `PATCH /work-items/:id` | `work-item:write` | `canEditWorkItem` |
 * | `PATCH /work-items/:id/pic` | `work-item:write` | `canChangePic` |
 * | `POST /work-items/:id/transitions` | `work-item:write` | `canEditWorkItem` + penutupan konflik |
 * | `DELETE /work-items/:id` | `work-item:delete` | `canDeleteWorkItem` |
 *
 * ## Dua lapis, dan kenapa lapis keduanya tidak di sini
 *
 * `@Policy` di controller hanya bisa menjawab pertanyaan yang jawabannya ada di
 * dalam peran: **"bolehkah peran ini menyentuh pekerjaan sama sekali?"** Guard
 * tidak melihat barisnya — ia hanya melihat HTTP.
 *
 * Pertanyaan yang sebenarnya menentukan, "bolehkah **orang ini** mengubah
 * **pekerjaan ini**?", menuntut barisnya dibaca lebih dulu. Itu terjadi di
 * service, lewat `canEditWorkItem` dan kerabatnya di `policy/resource.ts`.
 * Pembagiannya bukan pilihan gaya: `PolicyGuard` **menolak** policy
 * resource-scoped secara sengaja selama paket `@samudrakarsa/shared` belum ada
 * — lihat catatan di `matrix.ts`.
 *
 * Akibat yang perlu disadari pembaca controller ini: **`@Policy` yang lolos
 * bukan berarti permisinya lolos.** Ketiga rute ber-`work-item:write` masih bisa
 * menjawab `404` dari service, dan itu memang jawaban yang benar.
 *
 * ## Kenapa `POST /transitions` memakai `canEditWorkItem`, bukan
 * `canTransitionWorkItem`
 *
 * `canTransitionWorkItem` adalah **gabungan** dari keduanya: izin mengubah baris
 * ditambah penutupan karena konflik sinkronisasi. Gabungan itu yang dipakai
 * **frontend** untuk memutuskan apakah tombolnya bisa ditekan sama sekali, dan
 * itulah alasan ia tetap ada meski backend memecahnya.
 *
 * Backend memecahnya karena kedua penolakan itu menuntut kode status yang
 * berbeda: "kamu tidak boleh menyentuh baris ini" adalah `404` (§7.3 — aktor
 * yang ditolak tidak boleh tahu barisnya ada), sedangkan "pekerjaan ini sedang
 * berkonflik" adalah `409` — dan `409` hanya boleh diberikan kepada orang yang
 * **memang** berhak atas barisnya, karena `409` menyebutkan bahwa barisnya ada.
 * Dua kode status dari satu fungsi berarti fungsinya harus tahu tentang HTTP,
 * dan `resource.ts` sengaja tidak tahu.
 *
 * ## Kenapa `work-item:read` tidak memeriksa barisnya
 *
 * §7.9 memberi ✓ kepada kelima peran pada baris "Lihat pekerjaan", tanpa syarat
 * apa pun tentang barisnya. Papan pekerjaan adalah papan bersama. Yang dibatasi
 * per baris adalah **mengubahnya**, bukan membacanya.
 *
 * ## Kenapa tidak ada `GET /work-items/:id/transitions`
 *
 * Karena `availableTransitions` sudah ikut pada `GET /work-items/:id`. Rute
 * tersendiri untuk daftar yang selalu dibutuhkan bersama barisnya hanya akan
 * menambah satu perjalanan bolak-balik yang tidak perlu — dan dua rute yang
 * menjawab pertanyaan yang sama adalah dua tempat yang bisa berbeda jawabannya.
 */
@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly workItems: WorkItemsService) {}

  @Get()
  @Policy('work-item:read')
  list(@Query() dto: ListWorkItemsDto, @Req() request: Request) {
    return this.workItems.list(dto, this.actor(request));
  }

  @Get('by-request/:requestId')
  @Policy('work-item:read')
  listByRequest(@Param('requestId') requestId: string) {
    return this.workItems.listByRequest(requestId);
  }

  @Get(':id')
  @Policy('work-item:read')
  detail(@Param('id') id: string, @Req() request: Request) {
    return this.workItems.detail(id, this.actor(request));
  }

  /**
   * Membuat Story beserta Task-task di bawahnya.
   */
  @Post('stories')
  @Policy('work-item:create')
  createStoryWithTasks(
    @Body() dto: CreateStoryWithTasksDto,
    @Req() request: Request,
  ) {
    return this.workItems.createStoryWithTasks(
      dto,
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Membuat pekerjaan — `201`, dengan `workNumber` yang sudah dihasilkan.
   *
   * Tanpa `If-Match`: tidak ada baris yang bisa ditimpa. Nomor pekerjaannya
   * dibuat di dalam transaksi yang sama, jadi tidak ada dua pembuatan bersamaan
   * yang bisa mendapat nomor yang sama (`PRD-BACKEND.md` §8.2).
   */
  @Post()
  @Policy('work-item:create')
  create(@Body() dto: CreateWorkItemDto, @Req() request: Request) {
    return this.workItems.create(
      dto,
      this.actor(request),
      this.context(request),
    );
  }

  @Patch(':id')
  @Policy('work-item:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkItemDto,
    @Req() request: Request,
  ) {
    return this.workItems.update(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Memindahkan status — `POST`, bukan `PATCH`.
   *
   * Yang dikirim adalah **perintah**, bukan isi baris: "pindahkan ke
   * `in_progress`". Bedanya bukan kerapian kata. `PATCH { "status": "done" }`
   * akan menyiratkan bahwa status adalah salah satu kolom yang boleh disetel
   * seperti kolom lain — dan begitu itu tersirat, tidak ada lagi yang menghalangi
   * seseorang menambahkan `status` ke `UpdateWorkItemSchema`. Rute tersendiri
   * dengan kata kerja tersendiri menjaga agar tidak ada jalur penulisan status
   * selain yang melewati state machine.
   *
   * `200`, bukan `201`: tidak ada resource baru. Yang kembali adalah barisnya
   * dengan `version` yang sudah naik dan `availableTransitions` yang sudah
   * dihitung ulang dari status barunya.
   */
  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Policy('work-item:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionWorkItemDto,
    @Req() request: Request,
  ) {
    return this.workItems.transition(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Menetapkan atau melepas PIC — `PATCH`, bukan `POST`.
   *
   * Yang dikirim adalah keadaan baru dari satu medan, dan `null` adalah nilai
   * yang sah untuknya (melepas PIC). Itu `PATCH` menurut artinya: sebagian isi
   * baris diganti, dan nilai `null` menyatakan "kosongkan", bukan "jangan
   * sentuh" — yang terakhir diwakili oleh medan yang **tidak dikirim**, dan
   * medan itu wajib ada di sini sehingga tidak ada keraguan mana yang dimaksud.
   */
  @Patch(':id/pic')
  @Policy('work-item:write')
  setPic(
    @Param('id') id: string,
    @Body() dto: SetWorkItemPicDto,
    @Req() request: Request,
  ) {
    return this.workItems.setPic(
      id,
      dto,
      this.expectedVersion(request),
      this.actor(request),
      this.context(request),
    );
  }

  /**
   * Menghapus pekerjaan — `204`, tanpa isi.
   *
   * Yang terjadi adalah **soft delete**: `deleted_at` diisi, barisnya tetap ada
   * beserta riwayat status dan lampirannya. Alasannya di
   * `WorkItemsService.remove`.
   *
   * Ini satu-satunya rute pekerjaan yang dijaga policy peran yang **berbeda**
   * dari `work-item:write`, karena §7.9 memang berbeda: `member` mendapat ✓ pada
   * pengubahan dan ❌ pada penghapusan. Karena `work-item:delete` juga terdaftar
   * sebagai policy resource-scoped, penghapusan diperiksa **dua kali** — peran
   * di guard, baris di service. Lihat catatannya di `matrix.ts`.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Policy('work-item:delete')
  remove(@Param('id') id: string, @Req() request: Request) {
    return this.workItems.remove(
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
   * `requireIfMatch` melempar `428` kalau headernya tidak ada dan `400` kalau
   * isinya tidak terbaca — lihat `common/http/if-match.ts`. Dipanggil dari
   * controller, bukan dari service, karena ia membaca **header**; service-nya
   * menerima angka, sehingga bisa diuji tanpa request sama sekali.
   *
   * Pada modul ini `If-Match` wajib di **setiap** penulisan baris, termasuk
   * penghapusan. Penghapusan ikut terkunci karena ia pun menulis: dua orang yang
   * menekan hapus bersamaan pada baris yang sama akan membuat yang kedua
   * menghapus baris yang sudah tidak ada — dan tanpa penguncian, yang kedua
   * tidak akan tahu bahwa yang ia lihat sudah tidak berlaku.
   */
  private expectedVersion(request: Request): number {
    return requireIfMatch(
      request,
      WORK_ITEM_ERRORS.versionRequired,
      'Perubahan pekerjaan',
    );
  }

  /**
   * Aktor lengkap — bukan hanya id, dan itu yang membedakannya dari
   * `ProfilesController`.
   *
   * Modul ini memutuskan izin **per baris**, dan keputusan itu menuntut `roles`
   * dan `divisionCodes`. Mengambil hanya `id`-nya di sini lalu membacanya ulang
   * di service berarti satu query tambahan pada setiap permintaan — untuk data
   * yang sudah ada di dalam token yang baru saja diverifikasi.
   *
   * `AuthenticatedUser` memenuhi `Actor` di `policy/resource.ts` secara
   * struktural, jadi ia dioper apa adanya; tidak ada penyalinan medan yang bisa
   * ketinggalan saat `Actor` bertambah medan.
   */
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
