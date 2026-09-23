import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { divisions, periods, profiles } from '../database/schema/organization';
import { recordVersions } from '../database/schema/system';
import {
  workItemAssignees,
  workItemStatusHistory,
  workItems,
} from '../database/schema/work';
import {
  NumberingService,
  type DbExecutor,
} from '../numbering/numbering.service';
import {
  canChangePic,
  canDeleteWorkItem,
  canEditWorkItem,
  isOwnerOrCoOwner,
  type Actor,
  type PolicyResult,
} from '../policy/resource';
import {
  RequestSyncService,
  type SyncOutcome,
} from '../request-sync/request-sync.service';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import {
  WORK_ITEM_ACTIONS,
  WORK_ITEM_ENTITY,
  WORK_ITEM_ERRORS,
} from './work-items.constants';
import type {
  CreateStoryWithTasksDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  SetWorkItemPicDto,
  TransitionWorkItemDto,
  UpdateWorkItemDto,
} from './dto/work-item.dto';

/**
 * Isian pembuatan pekerjaan **dari dalam sistem**, bukan dari HTTP.
 *
 * Bentuknya `CreateWorkItemDto` ditambah satu kolom yang sengaja tidak ada di
 * DTO-nya: `sourceRequestId`. Ia tidak boleh datang dari klien — pekerjaan yang
 * mengaku berasal dari permintaan yang tidak ada akan membuat sinkronisasi
 * menulis ke baris yang salah, dan `PATCH` yang bisa menetapkannya berarti ada
 * dua jalan menuju satu kolom dengan aturan yang berbeda.
 *
 * Karena itu ia bukan bagian dari skema Zod, melainkan parameter yang hanya
 * bisa diisi modul yang benar-benar membuat pekerjaan itu — di sini, modul
 * permintaan, saat `draft → submitted` (§5.2.4).
 */
export type CreateWorkItemWithinDto = CreateWorkItemDto & {
  readonly sourceRequestId?: string | null;
};

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

/**
 * Pekerjaan — modul inti Fase 3.
 *
 * ## Yang dijaga modul ini, dan di mana penjaganya
 *
 * | Aturan | Tempatnya |
 * |---|---|
 * | Peran boleh membuka modulnya? | `@Policy` di controller |
 * | Boleh menyentuh **baris ini**? | `resource.ts`, dipanggil dari sini |
 * | Perpindahan status sah? | `WorkflowService`, dibaca dari tabel |
 * | Kolom wajib per status terisi? | `WorkflowService`, dari `required_fields` |
 * | Bentuk isian benar? | `ZodValidationPipe` |
 *
 * Tidak ada satu pun aturan yang diperiksa di dua tempat, dan itu disengaja:
 * aturan yang diperiksa dua kali akan berbeda, dan yang berbeda akan menjadi
 * yang tidak dipercaya keduanya.
 *
 * ## Kenapa `deny` dari `resource.ts` menjadi `404`, bukan `403`
 *
 * `PRD-REVAMP.md` §7.3: aktor yang ditolak **tidak boleh tahu barisnya ada**.
 * Alasan penolakannya hanya dicatat ke log teknis, tidak pernah ke jawabannya.
 * Lihat `assertAllowed` di bawah.
 */
@Injectable()
export class WorkItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly numbering: NumberingService,
    private readonly sync: RequestSyncService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar pekerjaan.
   *
   * ## Penyaring divisi **tidak** dipasang otomatis
   *
   * `work-item:read` di §7.9 terbuka untuk kelima peran tanpa syarat baris,
   * sehingga daftar ini mengembalikan seluruh pekerjaan yang cocok dengan
   * penyaring yang dikirim pemanggilnya. Itu bacaan yang disengaja atas §7.9:
   * papan pekerjaan adalah papan bersama, dan anggaran yang tidak terlihat oleh
   * yang menjalankannya bukan anggaran.
   *
   * Yang **dibatasi per baris** adalah mengubahnya, dan itu dijaga
   * `canEditWorkItem` di setiap rute tulis. Kalau suatu saat pembacaan perlu
   * dipersempit — misalnya pekerjaan bertanda khusus yang hanya boleh dilihat
   * divisinya — tempatnya di sini, bukan di frontend.
   *
   * Yang dihapus (`deleted_at`) **tidak pernah** muncul; yang diarsipkan muncul
   * kalau diminta. Keduanya mekanisme yang berbeda dan §14.2 memisahkannya
   * dengan tegas.
   */
  async list(query: ListWorkItemsDto, actor?: Actor) {
    const conditions = this.listConditions(query);

    // Scoped RBAC: jika aktor bukan owner/co_owner, wajib batasi hanya divisi miliknya
    if (actor && !isOwnerOrCoOwner(actor)) {
      if (actor.divisionId) {
        conditions.push(eq(workItems.divisionId, actor.divisionId));
      } else {
        // Anggota tanpa divisi tidak dapat melihat task divisi manapun
        conditions.push(sql`1 = 0`);
      }
    }

    const rows = await this.db
      .select(this.listSelection())
      .from(workItems)
      .leftJoin(divisions, eq(workItems.divisionId, divisions.id))
      .leftJoin(profiles, eq(workItems.primaryPicId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(workItems.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows;
  }

  /**
   * Mengambil daftar Story dan Task yang terikat pada suatu Permintaan (Request).
   */
  async listByRequest(requestId: string) {
    const items = await this.db
      .select({
        ...this.listSelection(),
        parentTitle: sql<string | null>`(SELECT p.title FROM work_items p WHERE p.id = ${workItems.parentId})`,
      })
      .from(workItems)
      .leftJoin(divisions, eq(workItems.divisionId, divisions.id))
      .leftJoin(profiles, eq(workItems.primaryPicId, profiles.id))
      .where(
        and(
          eq(workItems.sourceRequestId, requestId),
          isNull(workItems.deletedAt),
        ),
      )
      .orderBy(asc(workItems.createdAt));

    const stories = items.filter((item) => item.type === 'story');
    const tasks = items.filter((item) => item.type === 'task');

    return {
      stories: stories.map((story) => ({
        ...story,
        tasks: tasks.filter((task) => task.parentId === story.id),
      })),
      orphanTasks: tasks.filter((task) => !task.parentId),
    };
  }

  /**
   * Satu pekerjaan, lengkap dengan langkah berikutnya yang tersedia.
   *
   * `availableTransitions` bukan pelengkap tampilan — ia yang membuat aturan
   * alur tidak bisa hidup di UI saja (`PRD-BACKEND.md` §9.1). Frontend tidak
   * punya pilihan selain memakai daftar ini, karena ia tidak punya cara lain
   * mengetahui aturannya.
   */
  async detail(id: string, actor: Actor) {
    const row = await this.findDetail(id);

    // Membaca tidak menuntut izin baris: `work-item:read` sudah memutuskan di
    // guard. Yang diperiksa di sini hanyalah apakah barisnya ada.
    const edges = await this.workflow.availableFor(
      TRANSITION_ENTITY.workItem,
      row.status,
      actor.roles,
    );

    return {
      ...row,
      availableTransitions: edges.map((edge) => edge.to),

      /**
       * Kolom yang dituntut tiap langkah, untuk langkah yang menuntut sesuatu.
       *
       * **Tambahan di luar §9.1, bukan penggantinya.** §9.1 hanya menyebut
       * `availableTransitions`, dan itu tetap dikirim apa adanya. Tanpa
       * tambahan ini, `required_fields` yang disimpan sebagai data tidak pernah
       * sampai ke siapa pun — frontend hanya tahu bahwa `on_hold` tersedia,
       * lalu mendapat `422` saat menekannya, dan tidak ada cara mengetahui
       * kolom apa yang kurang selain mencoba.
       *
       * Langkah yang tidak menuntut apa pun tidak muncul di sini, supaya
       * bentuknya tetap kecil: yang biasanya kosong lebih baik tidak ada
       * daripada ada dan kosong.
       */
      transitionRequirements: Object.fromEntries(
        edges
          .filter((edge) => edge.requiredFields.length > 0)
          .map((edge) => [edge.to, [...edge.requiredFields]]),
      ),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tulis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Membuat pekerjaan — membuka transaksinya sendiri.
   *
   * Pemeriksaan izin baris tidak ada di sini, dan tidak bisa ada: barisnya belum
   * lahir. Yang menjaga adalah `work-item:create` di guard — kelima peran boleh
   * membuat pekerjaan, dan itu memang yang diinginkan: setiap anggota punya
   * tugas, dan menuntut kepala divisi membuatkan barisnya untuk setiap tugas
   * akan membuat pekerjaan berhenti di antrean satu orang.
   */
  async create(dto: CreateWorkItemDto, actor: Actor, context: WriteContext) {
    const created = await this.db.transaction((tx) =>
      this.createWithin(tx, dto, context),
    );

    // Audit ditulis **setelah** transaksinya berhasil, bukan di dalamnya.
    // `AuditService` memakai koneksi global, bukan `tx` — dan itu memang benar:
    // perubahan yang bergulung balik tidak boleh meninggalkan catatan bahwa ia
    // pernah terjadi.
    await this.record(context, WORK_ITEM_ACTIONS.created, created.id, {
      afterData: created,
    });

    return created;
  }

  /**
   * Membuat Story beserta Task-task di bawahnya dalam satu transaksi.
   */
  async createStoryWithTasks(
    dto: CreateStoryWithTasksDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const result = await this.db.transaction(async (tx) => {
      // 1. Buat parent story
      const storyDto: CreateWorkItemWithinDto = {
        title: dto.title,
        type: 'story',
        description: dto.description ?? null,
        primaryPicId: dto.primaryPicId ?? null,
        divisionId: dto.divisionId ?? actor.divisionId ?? null,
        clusterId: dto.clusterId ?? null,
        subunitId: dto.subunitId ?? null,
        priority: dto.priority ?? 'medium',
        sourceRequestId: dto.sourceRequestId ?? null,
        startDate: dto.startDate ?? null,
        dueDate: dto.dueDate ?? null,
        progressPercentage: 0,
        isRecurring: false,
        storyPoints: 0,
        assigneeIds: dto.assigneeIds ?? [],
      };

      const story = await this.createWithin(tx, storyDto, context);

      // 2. Buat child tasks di bawah story
      const createdTasks = [];
      for (const taskItem of dto.tasks) {
        const taskDto: CreateWorkItemWithinDto = {
          title: taskItem.title,
          type: 'task',
          description: taskItem.description ?? null,
          primaryPicId: taskItem.primaryPicId ?? null,
          divisionId: story.divisionId,
          clusterId: story.clusterId,
          subunitId: story.subunitId,
          priority: taskItem.priority ?? story.priority ?? 'medium',
          sourceRequestId: dto.sourceRequestId ?? null,
          parentId: story.id,
          storyPoints: taskItem.storyPoints ?? 0,
          startDate: taskItem.startDate ?? story.startDate ?? null,
          dueDate: taskItem.dueDate ?? story.dueDate ?? null,
          progressPercentage: 0,
          isRecurring: false,
          assigneeIds: taskItem.assigneeIds ?? [],
        };
        const task = await this.createWithin(tx, taskDto, context);
        createdTasks.push(task);
      }

      await this.recalculateParentStoryPoints(tx, story.id);

      const updatedStory = await tx
        .select(this.detailSelection())
        .from(workItems)
        .where(eq(workItems.id, story.id))
        .limit(1);

      return {
        story: updatedStory[0] ?? story,
        tasks: createdTasks,
      };
    });

    await this.record(context, WORK_ITEM_ACTIONS.created, result.story.id, {
      afterData: result.story,
    });

    return result;
  }

  /**
   * Isi pembuatan pekerjaan, di dalam transaksi milik pemanggilnya.
   *
   * ## Kenapa dipisah, bukan sekadar `create` yang menerima `tx`
   *
   * Karena menulis audit harus terjadi **sesudah commit**, dan hanya pemanggil
   * yang memegang transaksinya yang tahu kapan itu. `create` menutup transaksi
   * lalu menulis auditnya; `createWithin` tidak menutup apa pun dan tidak
   * menulis audit — ia menyerahkan barisnya kepada pemanggilnya, yang akan
   * mencatatnya sendiri kalau transaksinya berhasil.
   *
   * ## Kenapa ini bukan kerapian belaka: `max: 1`
   *
   * Kolam koneksinya berisi **satu** koneksi per instans fungsi. Kalau
   * `RequestsService` memanggil `create()` dari dalam transaksinya sendiri,
   * `create()` akan meminta koneksi kedua sambil yang pertama masih ditahan
   * transaksi luarnya — dan pada `max: 1` koneksi kedua itu tidak akan pernah
   * datang. Bukan galat, bukan timeout yang jelas: **permintaan yang menggantung
   * selamanya**. Karena itu tipe `tx` di sini bukan kemudahan, melainkan
   * satu-satunya bentuk yang bisa dipanggil dari dalam transaksi.
   *
   * Seluruh isinya berjalan dalam satu transaksi: nomor, barisnya, penerima
   * tugas, dan baris pertama riwayat statusnya. Nomornya **harus** di dalam
   * transaksi yang sama — `NumberingService.next()` menaikkan penghitungnya, dan
   * kegagalan setelah itu akan meninggalkan nomor terpakai tanpa dokumen (§8.2).
   */
  async createWithin(
    tx: DbExecutor,
    dto: CreateWorkItemWithinDto,
    context: WriteContext,
  ) {
    const periodId = await this.resolvePeriod(tx, dto.periodId ?? null);

    await this.assertPicIsActive(tx, dto.primaryPicId ?? null);

    const workNumber = await this.numbering.next(tx, 'work_item');

    const inserted = await tx
      .insert(workItems)
      .values({
        workNumber,
        title: dto.title,
        type: dto.type,
        description: dto.description ?? null,
        primaryPicId: dto.primaryPicId ?? null,
        divisionId: dto.divisionId ?? null,
        clusterId: dto.clusterId ?? null,
        subunitId: dto.subunitId ?? null,
        programId: dto.programId ?? null,
        periodId,
        priority: dto.priority,
        status: 'backlog',
        moduleStatus: dto.moduleStatus ?? null,
        startDate: dto.startDate ?? null,
        dueDate: dto.dueDate ?? null,
        progressPercentage: dto.progressPercentage,
        parentId: dto.parentId ?? null,
        storyPoints: dto.storyPoints ?? 0,
        isRecurring: dto.isRecurring,
        recurrenceRule: dto.recurrenceRule ?? null,

        /**
         * Hanya terisi kalau pekerjaannya lahir dari sebuah permintaan
         * (§5.2.4), dan sejak itu ia tidak pernah berubah — tidak lewat DTO,
         * tidak lewat `PATCH`. Kolom ini yang membuat sinkronisasi tahu ada
         * pasangan di seberang, jadi kolom yang bisa diubah berarti pasangan
         * yang bisa dipindahkan tanpa persetujuan sisi yang lain.
         */
        sourceRequestId: dto.sourceRequestId ?? null,

        createdBy: context.actorId,
        updatedBy: context.actorId,
      })
      .returning(this.detailSelection());

    const row = this.mustFound(inserted[0]);

    if (row.parentId) {
      await this.recalculateParentStoryPoints(tx, row.parentId);
    }

    await this.replaceAssignees(tx, row.id, dto.assigneeIds ?? []);

    /**
     * Baris pertama riwayat status, dan `from_status`-nya `null`.
     *
     * Bukan hiasan: tanpa baris ini, "sejak kapan pekerjaan ini ada" hanya
     * terjawab oleh `created_at`, sedangkan "status apa yang berlaku
     * sebelumnya" tidak terjawab sama sekali. Kolom `from_status` memang
     * nullable untuk alasan ini — baris pertama tidak punya asal.
     */
    await tx.insert(workItemStatusHistory).values({
      workItemId: row.id,
      fromStatus: null,
      toStatus: 'backlog',
      note: 'Pekerjaan dibuat',
      changedBy: context.actorId,
    });

    return row;
  }

  /**
   * Mengubah isi pekerjaan.
   *
   * `expectedVersion` datang dari `If-Match` (§7.16). Pemeriksaannya **dua
   * lapis dan keduanya disengaja**: `assertVersion` memberi `409` yang menyebut
   * kedua angkanya sebelum menulis, dan `eq(version, expectedVersion)` di
   * `WHERE` menutup celah antara pemeriksaan dan penulisan. Yang pertama untuk
   * pesan yang berguna, yang kedua untuk kebenarannya.
   */
  async update(
    id: string,
    dto: UpdateWorkItemDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canEditWorkItem(actor, before));

    this.assertVersion(before.version, expectedVersion);

    const after = await this.db.transaction(async (tx) => {
      await this.assertPicIsActive(tx, dto.primaryPicId ?? null);

      const rows = await tx
        .update(workItems)
        .set({
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.primaryPicId !== undefined && {
            primaryPicId: dto.primaryPicId,
          }),
          ...(dto.divisionId !== undefined && { divisionId: dto.divisionId }),
          ...(dto.clusterId !== undefined && { clusterId: dto.clusterId }),
          ...(dto.subunitId !== undefined && { subunitId: dto.subunitId }),
          ...(dto.programId !== undefined && { programId: dto.programId }),
          ...(dto.periodId !== undefined && { periodId: dto.periodId }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.moduleStatus !== undefined && {
            moduleStatus: dto.moduleStatus,
          }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate }),
          ...(dto.progressPercentage !== undefined && {
            progressPercentage: dto.progressPercentage,
          }),
          ...(dto.blockerReason !== undefined && {
            blockerReason: dto.blockerReason,
          }),
          ...(dto.assistanceNeeded !== undefined && {
            assistanceNeeded: dto.assistanceNeeded,
          }),
          ...(dto.completionSummary !== undefined && {
            completionSummary: dto.completionSummary,
          }),
          ...(dto.holdReason !== undefined && { holdReason: dto.holdReason }),
          ...(dto.parentId !== undefined && { parentId: dto.parentId }),
          ...(dto.storyPoints !== undefined && {
            storyPoints: dto.storyPoints,
          }),
          ...(dto.isRecurring !== undefined && {
            isRecurring: dto.isRecurring,
          }),
          ...(dto.recurrenceRule !== undefined && {
            recurrenceRule: dto.recurrenceRule,
          }),
          updatedBy: context.actorId,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workItems.id, id), eq(workItems.version, expectedVersion)),
        )
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      if (before.parentId) {
        await this.recalculateParentStoryPoints(tx, before.parentId);
      }
      if (row.parentId && row.parentId !== before.parentId) {
        await this.recalculateParentStoryPoints(tx, row.parentId);
      }

      if (dto.assigneeIds !== undefined) {
        await this.replaceAssignees(tx, id, dto.assigneeIds);
      }

      await this.saveVersion(tx, before, context.actorId);

      return row;
    });

    await this.record(context, WORK_ITEM_ACTIONS.updated, id, {
      beforeData: before,
      afterData: after,
    });

    return after;
  }

  /**
   * Memindahkan status — `POST /work-items/{id}/transitions`.
   *
   * Urutan pemeriksaannya tetap, dan urutannya yang membuat pesannya berguna:
   *
   * 1. **Izin baris** (`canEditWorkItem`) — `404` kalau ditolak, dan tidak ada
   *    yang boleh tahu lebih jauh.
   * 2. **Konflik sinkronisasi** — `409`, dan **setelah** izin baris diperiksa.
   *    Urutan itu wajib: `409` menyebutkan bahwa barisnya ada, jadi ia hanya
   *    boleh sampai kepada orang yang memang berhak atas baris itu. Yang tidak
   *    berhak menerima `404` dari langkah 1 dan tidak tahu apa-apa.
   *
   *    Keputusan 49 menutup transisi selama konflik belum selesai, untuk semua
   *    peran termasuk owner. Yang ditutup adalah **perpindahannya**, bukan
   *    kewenangannya — owner tetap boleh menyunting isi pekerjaan itu selama
   *    konfliknya berjalan, karena yang harus diselesaikan adalah konfliknya,
   *    bukan pekerjaannya.
   *
   * 3. **Aturan transisinya** — `422`, lengkap dengan daftar langkah yang
   *    tersedia.
   * 4. **Kolom wajibnya** — `422`, menyebut kolom mana yang kurang.
   *
   * ## Kenapa dipecah, bukan `canTransitionWorkItem` apa adanya
   *
   * `canTransitionWorkItem` adalah gabungan dari langkah 1 dan 2. Yang dipakai
   * di sini adalah **bagian-bagiannya**, dan itu bukan pengulangan aturan
   * melainkan pemisahan kode status: penolakan izin baris harus `404` (§7.3 —
   * yang ditolak tidak boleh tahu barisnya ada), sedangkan penolakan karena
   * konflik harus `409`. Satu fungsi tidak bisa mengembalikan dua kode status
   * tanpa tahu tentang HTTP, dan `resource.ts` sengaja tidak tahu.
   *
   * Karena langkah 2 melempar saat konfliknya ada, `before.syncConflictAt` sudah
   * pasti `null` pada titik di mana langkah 1 dinilai — sehingga
   * `canEditWorkItem` dan `canTransitionWorkItem` menghasilkan jawaban yang sama
   * persis di titik itu.
   *
   * Fungsi gabungannya tetap dipakai **frontend**, untuk memutuskan apakah
   * tombol transisinya bisa ditekan. Lihat catatan di `policy/matrix.ts`.
   */
  async transition(
    id: string,
    dto: TransitionWorkItemDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canEditWorkItem(actor, before));

    this.assertNoSyncConflict(before);

    this.assertVersion(before.version, expectedVersion);

    // Pemeriksaan tujuannya **sebelum** transaksinya dibuka. Kalau ia di dalam,
    // transaksinya mengunci baris penghitung nomor untuk sesuatu yang sudah
    // pasti ditolak — dan pada `max: 1` koneksi per instans, kunci yang ditahan
    // lebih lama dari perlu adalah antrean untuk semua orang.
    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.workItem,
      before.status,
      dto.to,
      actor.roles,
      {
        blocker_reason: dto.blockerReason ?? before.blockerReason,
        assistance_needed: dto.assistanceNeeded ?? before.assistanceNeeded,
        hold_reason: dto.holdReason ?? before.holdReason,
        completion_summary: dto.completionSummary ?? before.completionSummary,
      },
    );

    const { after, outcome } = await this.db.transaction(async (tx) => {
      /**
       * `approved → in_progress` menuntut PIC yang benar-benar bisa bekerja.
       *
       * Syarat ini **tidak bisa** dinyatakan di `status_transitions.required_fields`,
       * karena kolom itu menyebut kolom pada barisnya sendiri sedangkan yang
       * diperiksa di sini adalah baris **lain** (`profiles.status`). Karena itu
       * ia hidup di sini, dan hanya di sini.
       *
       * Diperiksa juga pada perpindahan lain yang menuju `in_progress` — dari
       * `on_hold` dan dari `need_review` — karena PIC-nya bisa saja
       * dinonaktifkan selagi pekerjaannya ditahan. Memeriksanya hanya di jalur
       * `approved` akan membuat penahannya menjadi jalan masuk bagi pekerjaan
       * tanpa PIC aktif.
       */
      if (dto.to === 'in_progress') {
        await this.assertPicReady(tx, before);
      }

      const done = dto.to === 'done';

      const rows = await tx
        .update(workItems)
        .set({
          status: dto.to,

          ...(dto.blockerReason !== undefined && {
            blockerReason: dto.blockerReason,
          }),
          ...(dto.assistanceNeeded !== undefined && {
            assistanceNeeded: dto.assistanceNeeded,
          }),
          ...(dto.holdReason !== undefined && { holdReason: dto.holdReason }),
          ...(dto.completionSummary !== undefined && {
            completionSummary: dto.completionSummary,
          }),

          /**
           * §12 — transisi otomatis.
           *
           * `done` selalu berarti selesai penuh: `completed_at` terisi dan
           * progresnya 100. Progres yang dikirim klien **diabaikan** di sini,
           * dan itu disengaja: pekerjaan selesai yang progresnya 80% adalah
           * baris yang bertentangan dengan dirinya sendiri, dan setiap laporan
           * yang membacanya harus memutuskan angka mana yang dipercaya.
           *
           * Untuk tujuan lain, progres hanya ikut kalau memang dikirim.
           * Menaikkannya otomatis berdasarkan status akan menebak — `in_progress`
           * tidak memberi tahu seberapa jauh pekerjaannya berjalan.
           */
          ...(done
            ? { completedAt: new Date(), progressPercentage: 100 }
            : {
                ...(dto.progressPercentage !== undefined && {
                  progressPercentage: dto.progressPercentage,
                }),

                /**
                 * Meninggalkan `done` **membersihkan jejak selesainya**.
                 *
                 * Dibuka kembali berarti belum selesai, dan baris yang statusnya
                 * `in_progress` sementara `completed_at`-nya terisi dan
                 * progresnya 100 adalah baris yang bertentangan dengan dirinya
                 * sendiri. Setiap laporan yang membacanya harus memutuskan angka
                 * mana yang dipercaya, dan tidak ada aturan yang bisa
                 * menjawabnya.
                 *
                 * `completion_summary` **tidak** ikut dibersihkan meski ia juga
                 * ditulis saat menyelesaikan. Isinya adalah keterangan tentang
                 * apa yang sudah dikerjakan, dan itu tetap benar setelah
                 * pekerjaannya dibuka kembali — biasanya justru alasan ia dibuka
                 * ("yang kemarin dikerjakan ternyata belum cukup"). `check`
                 * constraint-nya hanya berlaku selama statusnya `done`, jadi
                 * teks yang tertinggal tidak melanggar apa pun.
                 */
                ...(before.status === 'done' && {
                  completedAt: null,
                  progressPercentage: 0,
                }),
              }),

          updatedBy: context.actorId,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workItems.id, id), eq(workItems.version, expectedVersion)),
        )
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      // Roll-up ke Story jika semua child task berstatus done
      if (row.parentId && dto.to === 'done') {
        const siblings = await tx
          .select({ id: workItems.id, status: workItems.status })
          .from(workItems)
          .where(
            and(
              eq(workItems.parentId, row.parentId),
              isNull(workItems.deletedAt),
            ),
          );

        const allDone = siblings.every((s) =>
          s.id === row.id ? true : s.status === 'done',
        );
        if (allDone) {
          await tx
            .update(workItems)
            .set({
              status: 'done',
              progressPercentage: 100,
              completedAt: new Date(),
              completionSummary: 'Semua sub-task selesai dikerjakan.',
              updatedBy: context.actorId,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(workItems.id, row.parentId));

          await tx.insert(workItemStatusHistory).values({
            workItemId: row.parentId,
            fromStatus: null,
            toStatus: 'done',
            note: 'Otomatis selesai: seluruh task dalam story ini telah selesai.',
            changedBy: context.actorId,
          });
        }
      } else if (
        row.parentId &&
        before.status === 'done' &&
        dto.to !== 'done'
      ) {
        const [parent] = await tx
          .select({ status: workItems.status })
          .from(workItems)
          .where(eq(workItems.id, row.parentId));

        if (parent && parent.status === 'done') {
          await tx
            .update(workItems)
            .set({
              status: 'in_progress',
              completedAt: null,
              progressPercentage: 50,
              updatedBy: context.actorId,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(workItems.id, row.parentId));

          await tx.insert(workItemStatusHistory).values({
            workItemId: row.parentId,
            fromStatus: 'done',
            toStatus: 'in_progress',
            note: 'Otomatis dibuka kembali: salah satu task dalam story dibuka kembali.',
            changedBy: context.actorId,
          });
        }
      }

      await tx.insert(workItemStatusHistory).values({
        workItemId: id,
        fromStatus: before.status,
        toStatus: dto.to,
        note: dto.note ?? null,
        changedBy: context.actorId,
      });

      await this.saveVersion(tx, before, context.actorId);

      /**
       * Arah pekerjaan → permintaan (§5.2.3) — yang **tidak ada** di `sksks`.
       *
       * Dipanggil di dalam transaksi yang sama, sesudah barisnya berpindah.
       * Kalau ia gagal karena sesuatu yang tidak bisa didamaikan, ia menandai
       * konflik pada **kedua** baris dan tetap mengembalikan baris yang sudah
       * berpindah — konflik bukan kegagalan, ia keadaan yang harus terlihat.
       *
       * `sourceRequestId` dibaca dari barisnya, bukan dari DTO: pekerjaan yang
       * tidak berasal dari permintaan tidak punya pasangan, dan itulah mayoritas
       * pekerjaan. `null` di sini berarti sinkronisasinya berhenti sebelum
       * menyentuh apa pun.
       */
      const outcome = await this.sync.syncFromWorkItemWithin(tx, {
        workItemId: id,
        sourceRequestId: row.sourceRequestId,
        to: dto.to,
        actorId: context.actorId,
      });

      return { after: row, outcome };
    });

    await this.runSyncAudits(outcome, context);

    await this.record(context, WORK_ITEM_ACTIONS.transitioned, id, {
      beforeData: { status: before.status, version: before.version },
      afterData: { status: after.status, version: after.version },
    });

    /**
     * Saat konflik ditandai, barisnya dibaca ulang.
     *
     * `flagConflict` menaikkan `version` **kedua** baris, termasuk baris
     * pekerjaan yang baru saja diperbarui di transaksi ini — sehingga `after`
     * yang dipegang di sini tertinggal satu angka dari yang tersimpan. Klien
     * yang memakai angka itu untuk `If-Match` berikutnya akan ditolak `409`
     * untuk perubahan yang tidak pernah terjadi, dan `409` palsu adalah cara
     * tercepat membuat orang berhenti mempercayai penguncian optimistis.
     *
     * Hanya pada jalur konflik, karena hanya jalur itulah yang menulis lagi
     * setelah barisnya dikembalikan. Membacanya ulang pada setiap perpindahan
     * berarti satu query tambahan untuk semua orang, demi kasus yang jarang.
     */
    const fresh =
      outcome.kind === 'conflict' ? await this.findDetail(id) : after;

    return fresh;
  }

  /**
   * Menetapkan atau melepas PIC — `PATCH /work-items/{id}/pic`.
   *
   * Rute tersendiri karena wewenangnya berbeda: `canChangePic` membuka "klaim
   * pekerjaan tanpa PIC" bagi anggota biasa (§9.3 M2), sedangkan
   * `canEditWorkItem` tidak. Menggabungkannya berarti anggota yang boleh
   * mengklaim pekerjaan jadi boleh mengubah seluruh isinya.
   */
  async setPic(
    id: string,
    dto: SetWorkItemPicDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canChangePic(actor, before));

    this.assertVersion(before.version, expectedVersion);

    const after = await this.db.transaction(async (tx) => {
      await this.assertPicIsActive(tx, dto.primaryPicId);

      const rows = await tx
        .update(workItems)
        .set({
          primaryPicId: dto.primaryPicId,
          updatedBy: context.actorId,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workItems.id, id), eq(workItems.version, expectedVersion)),
        )
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      await this.saveVersion(tx, before, context.actorId);

      return row;
    });

    await this.record(context, WORK_ITEM_ACTIONS.picChanged, id, {
      beforeData: { primaryPicId: before.primaryPicId },
      afterData: { primaryPicId: after.primaryPicId, note: dto.note ?? null },
    });

    return after;
  }

  /**
   * Menghapus pekerjaan — **soft delete**.
   *
   * `deleted_at`, bukan `DELETE FROM`. Baris yang hilang tanpa jejak membuat
   * setiap laporan yang menyebutnya berubah angkanya tanpa penjelasan, dan
   * lampiran serta riwayat statusnya ikut lenyap lewat `ON DELETE CASCADE`.
   *
   * Yang terhapus tidak muncul di daftar mana pun. Ia **bukan** arsip: §14.2
   * memisahkan keduanya dengan tegas — `archived_at` berarti "disembunyikan
   * dari daftar aktif", `deleted_at` berarti "sampah".
   */
  async remove(
    id: string,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canDeleteWorkItem(actor, before));

    this.assertVersion(before.version, expectedVersion);

    const after = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(workItems)
        .set({
          deletedAt: new Date(),
          updatedBy: context.actorId,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workItems.id, id), eq(workItems.version, expectedVersion)),
        )
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      if (before.parentId) {
        await this.recalculateParentStoryPoints(tx, before.parentId);
      }

      await this.saveVersion(tx, before, context.actorId);

      return row;
    });

    await this.record(context, WORK_ITEM_ACTIONS.deleted, id, {
      beforeData: before,
      afterData: { deletedAt: after.deletedAt },
    });

    return after;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Kolom yang dipilih
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Kolom untuk daftar — lebih sempit daripada detail.
   *
   * `work_items` tidak punya kolom yang harus disembunyikan seperti
   * `password_hash` di profil, jadi ini bukan pengamanan melainkan **bentuk
   * jawaban**: daftar dikirim untuk digulir, dan mengirim deskripsi lima ribu
   * karakter untuk dua ratus baris adalah jawaban yang tidak akan dibaca
   * habis oleh siapa pun — termasuk oleh frontend yang menyimpannya di memori.
   */
  private listSelection() {
    return {
      id: workItems.id,
      workNumber: workItems.workNumber,
      title: workItems.title,
      type: workItems.type,
      status: workItems.status,
      priority: workItems.priority,
      divisionId: workItems.divisionId,
      divisionName: divisions.name,
      primaryPicId: workItems.primaryPicId,
      primaryPicName: profiles.fullName,
      parentId: workItems.parentId,
      storyPoints: workItems.storyPoints,
      sourceRequestId: workItems.sourceRequestId,
      startDate: workItems.startDate,
      dueDate: workItems.dueDate,
      progressPercentage: workItems.progressPercentage,
      completedAt: workItems.completedAt,
      archivedAt: workItems.archivedAt,
      version: workItems.version,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
    };
  }

  /**
   * Seluruh kolom barisnya, kecuali yang memang bukan milik tabelnya.
   *
   * Ditulis satu per satu, bukan `select()` tanpa argumen. Bukan karena ada
   * yang disembunyikan hari ini — melainkan karena `select()` tanpa argumen
   * berarti **setiap kolom yang ditambahkan nanti otomatis ikut terkirim**, dan
   * keputusan tentang apakah sebuah kolom boleh keluar adalah keputusan yang
   * harus diambil sadar, bukan bawaan.
   */
  private detailSelection() {
    return {
      id: workItems.id,
      workNumber: workItems.workNumber,
      title: workItems.title,
      type: workItems.type,
      description: workItems.description,
      primaryPicId: workItems.primaryPicId,
      divisionId: workItems.divisionId,
      clusterId: workItems.clusterId,
      subunitId: workItems.subunitId,
      programId: workItems.programId,
      periodId: workItems.periodId,
      priority: workItems.priority,
      status: workItems.status,
      moduleStatus: workItems.moduleStatus,
      parentId: workItems.parentId,
      storyPoints: workItems.storyPoints,
      startDate: workItems.startDate,
      dueDate: workItems.dueDate,
      progressPercentage: workItems.progressPercentage,
      blockerReason: workItems.blockerReason,
      assistanceNeeded: workItems.assistanceNeeded,
      completionSummary: workItems.completionSummary,
      holdReason: workItems.holdReason,
      sourceRequestId: workItems.sourceRequestId,
      sourceMeetingDecisionId: workItems.sourceMeetingDecisionId,
      syncConflictAt: workItems.syncConflictAt,
      syncConflictNote: workItems.syncConflictNote,
      isRecurring: workItems.isRecurring,
      recurrenceRule: workItems.recurrenceRule,
      createdBy: workItems.createdBy,
      updatedBy: workItems.updatedBy,
      completedAt: workItems.completedAt,
      archivedAt: workItems.archivedAt,
      deletedAt: workItems.deletedAt,
      version: workItems.version,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Memuat
  // ───────────────────────────────────────────────────────────────────────────

  private listConditions(query: ListWorkItemsDto): SQL[] {
    const conditions: SQL[] = [isNull(workItems.deletedAt)];

    if (!query.includeArchived) {
      conditions.push(isNull(workItems.archivedAt));
    }

    if (query.divisionId) {
      conditions.push(eq(workItems.divisionId, query.divisionId));
    }

    if (query.clusterId) {
      conditions.push(eq(workItems.clusterId, query.clusterId));
    }

    if (query.subunitId) {
      conditions.push(eq(workItems.subunitId, query.subunitId));
    }

    if (query.programId) {
      conditions.push(eq(workItems.programId, query.programId));
    }

    if (query.periodId) {
      conditions.push(eq(workItems.periodId, query.periodId));
    }

    if (query.status) {
      conditions.push(eq(workItems.status, query.status));
    }

    if (query.type) {
      conditions.push(eq(workItems.type, query.type));
    }

    if (query.priority) {
      conditions.push(eq(workItems.priority, query.priority));
    }

    if (query.picId) {
      conditions.push(eq(workItems.primaryPicId, query.picId));
    }

    if (query.parentId) {
      conditions.push(eq(workItems.parentId, query.parentId));
    }

    if (query.sourceRequestId) {
      conditions.push(eq(workItems.sourceRequestId, query.sourceRequestId));
    }

    // Daftar "pekerjaan menggantung" §5.2.8. Dibiarkan bisa digabung dengan
    // `divisionId` — lihat catatan di `ListWorkItemsSchema`.
    if (query.withoutPic) {
      conditions.push(isNull(workItems.primaryPicId));
    }

    if (query.q) {
      const pattern = `%${query.q}%`;
      const search = or(
        ilike(workItems.title, pattern),
        ilike(workItems.workNumber, pattern),
      );

      if (search) {
        conditions.push(search);
      }
    }

    return conditions;
  }

  /** Barisnya saja, tanpa penerima tugas — untuk jawaban `detail`. */
  private async findDetail(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select(this.detailSelection())
      .from(workItems)
      .where(and(eq(workItems.id, id), isNull(workItems.deletedAt)))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  /**
   * Barisnya, dalam bentuk yang dibutuhkan `resource.ts`.
   *
   * `divisionCode` menuntut satu join, dan join itu bukan biaya sia-sia: setiap
   * layar yang menampilkan sebuah pekerjaan hampir selalu menampilkan nama
   * divisinya juga, dan policy membandingkannya dengan kode divisi yang
   * dinaungi aktor — bukan dengan uuid.
   *
   * `assigneeIds` menuntut satu query tambahan ke `work_item_assignees`. Itu
   * disengaja: alternatifnya adalah tidak mengizinkan penerima tugas mengubah
   * pekerjaannya, dan itu akan membuat janji "edit bebas DALAM divisinya"
   * (§9.3) tidak berlaku bagi orang yang justru ditugaskan mengerjakannya.
   */
  private async findForPolicy(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select({
        ...this.detailSelection(),
        divisionCode: divisions.code,
      })
      .from(workItems)
      .leftJoin(divisions, eq(workItems.divisionId, divisions.id))
      .where(and(eq(workItems.id, id), isNull(workItems.deletedAt)))
      .limit(1);

    const row = this.mustFound(rows[0]);

    const assignees = await this.db
      .select({ profileId: workItemAssignees.profileId })
      .from(workItemAssignees)
      .where(eq(workItemAssignees.workItemId, id));

    return {
      ...row,
      assigneeIds: assignees.map((assignee) => assignee.profileId),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Penjaga
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menerjemahkan penolakan `resource.ts` menjadi `404` tanpa keterangan.
   *
   * `reason` sengaja **tidak** ikut ke jawabannya. Ia ada untuk log dan audit —
   * dan karena `AllExceptionsFilter` meneruskan medan tambahan apa adanya,
   * menuliskannya di sini akan mengirimnya ke klien, yang mengubah `404` menjadi
   * `403` dengan kode status berbeda. Seluruh gunanya hilang.
   */
  private assertAllowed(result: PolicyResult): void {
    if (result.effect === 'allow') {
      return;
    }

    throw new NotFoundException({
      code: WORK_ITEM_ERRORS.notFound,
      title: 'Pekerjaan tidak ditemukan.',
    });
  }

  /**
   * Konflik sinkronisasi menutup transisi (keputusan 49).
   *
   * `409`, bukan `404`. `canTransitionWorkItem` juga menolaknya, tetapi di sana
   * penolakannya menjadi `404` bersama seluruh penolakan lain di `resource.ts` —
   * dan `404` di sini akan berbunyi "pekerjaan tidak ditemukan" untuk pekerjaan
   * yang sedang terbuka di layar orangnya. Yang ia butuhkan adalah "selesaikan
   * dulu konfliknya", dan itu `409`.
   *
   * Aman memberi `409` di sini karena pemanggilnya sudah memeriksa izin baris
   * lebih dulu: yang sampai ke sini adalah orang yang memang berhak atas baris
   * itu, sehingga menyebutkan bahwa barisnya ada tidak membocorkan apa pun.
   * Urutan pemanggilannya bukan kebetulan — lihat catatan di `transition()`.
   */
  private assertNoSyncConflict(item: { syncConflictAt: Date | null }): void {
    if (item.syncConflictAt === null) {
      return;
    }

    throw new ConflictException({
      code: WORK_ITEM_ERRORS.syncConflict,
      title: 'Pekerjaan ini dan permintaan asalnya belum sepakat.',
      detail:
        'Status tidak bisa dipindahkan selama konfliknya belum diselesaikan. ' +
        'Konflik muncul karena permintaan asalnya berubah status tanpa lewat ' +
        'pekerjaan ini. Selesaikan dulu di halaman konflik, lalu ulangi.',
    });
  }

  /**
   * PIC harus ada di database dan berstatus `active`.
   *
   * Diperiksa dengan **membaca barisnya**, bukan dengan mempercayai klien.
   * Mempercayai id yang dikirim berarti menerima penugasan kepada akun yang
   * sudah dinonaktifkan — yaitu tepat keadaan yang §5.2.8 keluhkan, dimasukkan
   * kembali lewat pintu depan.
   */
  private async assertPicIsActive(
    tx: DbExecutor,
    primaryPicId: string | null,
  ): Promise<void> {
    if (primaryPicId === null) {
      return;
    }

    const rows = await tx
      .select({ id: profiles.id, status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, primaryPicId))
      .limit(1);

    const pic = rows[0];

    if (!pic) {
      throw new UnprocessableEntityException({
        code: WORK_ITEM_ERRORS.picInvalid,
        title: 'PIC yang dipilih tidak ada.',
        detail: 'Pilih anggota yang benar-benar terdaftar.',
        errors: [{ field: 'primaryPicId' }],
      });
    }

    if (pic.status !== 'active') {
      throw new UnprocessableEntityException({
        code: WORK_ITEM_ERRORS.picInvalid,
        title: 'PIC yang dipilih tidak aktif.',
        detail:
          'Hanya anggota berstatus aktif yang bisa menjadi penanggung jawab. ' +
          'Menugaskan kepada akun yang tidak aktif membuat pekerjaannya tidak ' +
          'dikerjakan siapa pun.',
        errors: [{ field: 'primaryPicId' }],
      });
    }
  }

  /**
   * Pekerjaan yang mulai dikerjakan harus punya PIC aktif.
   *
   * Dipanggil hanya saat tujuannya `in_progress`. Untuk tujuan lain, pekerjaan
   * tanpa PIC adalah keadaan yang sah — justru itu yang membuat daftar
   * "pekerjaan menggantung" §5.2.8 punya isi.
   */
  private async assertPicReady(
    tx: DbExecutor,
    item: { primaryPicId: string | null },
  ): Promise<void> {
    if (item.primaryPicId === null) {
      throw new UnprocessableEntityException({
        code: WORK_ITEM_ERRORS.picRequired,
        title: 'Pekerjaan ini belum punya penanggung jawab.',
        detail:
          'Tetapkan PIC lebih dulu lewat PATCH /work-items/{id}/pic. ' +
          'Pekerjaan yang berjalan tanpa penanggung jawab tidak dikerjakan ' +
          'siapa pun, dan tidak ada yang tahu.',
        errors: [{ field: 'primaryPicId' }],
      });
    }

    await this.assertPicIsActive(tx, item.primaryPicId);
  }

  /**
   * Periode pekerjaan: yang diminta, atau yang sedang aktif.
   *
   * Ditolak kalau keduanya tidak ada. Pekerjaan tanpa periode tidak bisa
   * ditanyakan "periode mana", dan itu pertanyaan pertama setiap laporan —
   * membiarkannya `null` hanya memindahkan kegagalannya ke laporan yang
   * angkanya tidak cocok, tempat yang jauh lebih sulit diperiksa.
   */
  private async resolvePeriod(
    tx: DbExecutor,
    requested: string | null,
  ): Promise<string> {
    if (requested !== null) {
      return requested;
    }

    const rows = await tx
      .select({ id: periods.id })
      .from(periods)
      .where(eq(periods.isActive, true))
      .limit(1);

    const active = rows[0];

    if (!active) {
      throw new UnprocessableEntityException({
        code: WORK_ITEM_ERRORS.periodRequired,
        title: 'Belum ada periode yang aktif.',
        detail:
          'Pekerjaan harus menjadi milik satu periode. Aktifkan satu periode ' +
          'lebih dulu, atau sebutkan periodenya saat membuat pekerjaan.',
        errors: [{ field: 'periodId' }],
      });
    }

    return active.id;
  }

  /**
   * Mengganti seluruh penerima tugas.
   *
   * Hapus lalu isi, bukan selisih — dan itu disengaja meski lebih boros satu
   * query. Menghitung selisihnya menuntut membaca daftar sekarang, lalu
   * memutuskan mana yang ditambah dan mana yang dibuang; keputusan itu bisa
   * salah, dan salahnya adalah tugas yang tidak pernah dicabut dari orang yang
   * sudah tidak mengerjakannya lagi. Daftar penerima tugas berukuran paling
   * banyak dua puluh baris, jadi yang dihemat tidak sebanding.
   *
   * Duplikat di dalam kiriman dibuang lebih dulu. Kunci primanya gabungan, jadi
   * duplikat akan ditolak database sebagai `500` — padahal itu isian yang salah
   * bentuk, dan tempatnya `422`.
   */
  private async replaceAssignees(
    tx: DbExecutor,
    workItemId: string,
    assigneeIds: readonly string[],
  ): Promise<void> {
    await tx
      .delete(workItemAssignees)
      .where(eq(workItemAssignees.workItemId, workItemId));

    const unique = [...new Set(assigneeIds)];

    if (unique.length === 0) {
      return;
    }

    await tx
      .insert(workItemAssignees)
      .values(unique.map((profileId) => ({ workItemId, profileId })))
      .onConflictDoNothing();
  }

  /**
   * Cuplikan versi baris sebelum perubahan (§10, `record_versions`).
   *
   * `versionNumber` diambil dari `version` barisnya, bukan dari hitungan
   * tersendiri. Kolom `version` hanya bergerak saat penulisan berhasil, jadi
   * nilainya unik per baris — dan indeks uniknya `(entity_type, entity_id,
   * version_number)` memang menuntut itu.
   *
   * `assigneeIds` ikut disimpan meski ia bukan kolom tabelnya. Tanpa itu,
   * cuplikannya tidak bisa menjawab "siapa saja yang mengerjakan ini saat itu",
   * dan itulah pertanyaan yang membuat cuplikan versi berguna saat ada yang
   * mempertanyakan pembagian tugas di masa lalu.
   *
   * `divisionCode` juga ikut, dan yang itu **bukan** pilihan melainkan akibat:
   * ia menempel pada barisnya karena `findForPolicy` mengambilnya lewat join,
   * sedangkan `resource.ts` membutuhkannya untuk memutuskan izin. Ia tidak
   * mengubah arti cuplikannya — nilai itu turunan dari `divisionId` yang sudah
   * ada di situ — tetapi pembaca cuplikan sebaiknya tahu bahwa satu medannya
   * datang dari tabel lain.
   */
  private async saveVersion(
    tx: DbExecutor,
    before: unknown,
    actorId: string,
  ): Promise<void> {
    const snapshot = before as Record<string, unknown>;

    await tx
      .insert(recordVersions)
      .values({
        entityType: WORK_ITEM_ENTITY,
        entityId: String(snapshot.id),
        versionNumber: Number(snapshot.version),
        snapshot,
        changedBy: actorId,
      })
      .onConflictDoNothing();
  }

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new ConflictException({
        code: WORK_ITEM_ERRORS.versionMismatch,
        title: 'Pekerjaan ini sudah berubah sejak kamu membacanya.',
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
        code: WORK_ITEM_ERRORS.notFound,
        title: 'Pekerjaan tidak ditemukan.',
      });
    }
  }

  private mustFound<T>(row: T | undefined): T {
    if (!row) {
      throw new NotFoundException({
        code: WORK_ITEM_ERRORS.notFound,
        title: 'Pekerjaan tidak ditemukan.',
      });
    }

    return row;
  }

  private mustUpdated<T>(row: T | undefined): T {
    if (!row) {
      throw new ConflictException({
        code: WORK_ITEM_ERRORS.versionMismatch,
        title: 'Pekerjaan ini sudah berubah sejak kamu membacanya.',
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
      entityType: WORK_ITEM_ENTITY,
      entityId,
      beforeData: (data.beforeData ?? null) as Record<string, unknown> | null,
      afterData: (data.afterData ?? null) as Record<string, unknown> | null,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Menjalankan catatan audit yang **diputuskan** sinkronisasi.
   *
   * Sinkronisasi berjalan di dalam transaksi, sedangkan `AuditService` menulis
   * lewat koneksi global — jadi ia tidak boleh menulisnya sendiri, dan ia
   * mengembalikan apa yang perlu dicatat. Yang mencatatnya adalah metode ini,
   * sesudah transaksinya berhasil: perubahan yang bergulung balik tidak boleh
   * meninggalkan catatan bahwa ia pernah terjadi.
   *
   * `entityType`-nya datang dari catatannya, bukan dari `record()` di atas —
   * pada arah pekerjaan → permintaan, yang berpindah **permintaannya**, dan
   * catatan itu milik `request`, bukan `work_item`.
   */
  private async runSyncAudits(
    outcome: SyncOutcome,
    context: WriteContext,
  ): Promise<void> {
    for (const entry of outcome.audits) {
      await this.audit.record({
        actorId: context.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeData: entry.beforeData,
        afterData: entry.afterData,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });
    }
  }

  private async recalculateParentStoryPoints(
    tx: DbExecutor,
    parentId: string,
  ): Promise<void> {
    const [result] = await tx
      .select({
        totalPoints: sql<number>`COALESCE(SUM(${workItems.storyPoints}), 0)`,
      })
      .from(workItems)
      .where(
        and(
          eq(workItems.parentId, parentId),
          isNull(workItems.deletedAt),
        ),
      );

    const total = Number(result?.totalPoints ?? 0);

    await tx
      .update(workItems)
      .set({
        storyPoints: total,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, parentId));
  }
}
