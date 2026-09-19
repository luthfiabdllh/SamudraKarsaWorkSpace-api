import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  ilike,
  isNull,
  isNotNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { divisions, periods, profiles } from '../database/schema/organization';
import { recordVersions } from '../database/schema/system';
import { requests } from '../database/schema/work';
import {
  NumberingService,
  type DbExecutor,
} from '../numbering/numbering.service';
import {
  canDeleteRequest,
  canEditRequest,
  canTransitionRequest,
  type Actor,
  type PolicyResult,
  type RequestStatus,
} from '../policy/resource';
import { REQUEST_STATUS_REQUIRED_FIELDS } from '../request-sync/request-sync.constants';
import {
  RequestSyncService,
  type SyncOutcome,
} from '../request-sync/request-sync.service';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import {
  WorkItemsService,
  type WriteContext,
} from '../work-items/work-items.service';
import { WORK_ITEM_ENTITY } from '../work-items/work-items.constants';
import {
  REQUEST_ACTIONS,
  REQUEST_ENTITY,
  REQUEST_ERRORS,
} from './requests.constants';
import type {
  CreateRequestDto,
  ListRequestsDto,
  ResolveSyncConflictDto,
  TransitionRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';

/**
 * Permintaan lintas divisi — modul inti Fase 3.
 *
 * ## Yang dijaga modul ini, dan di mana penjaganya
 *
 * | Aturan | Tempatnya |
 * |---|---|
 * | Peran boleh membuka modulnya? | `@Policy` di controller |
 * | Boleh menyentuh **baris ini**? | `resource.ts`, dipanggil dari sini |
 * | Perpindahan status sah? | `WorkflowService`, dibaca dari tabel |
 * | Kolom wajib per status terisi? | `WorkflowService`, dari `required_fields` |
 * | Kedua sisi sepakat? | `RequestSyncService` |
 * | Bentuk isian benar? | `ZodValidationPipe` |
 *
 * ## Kenapa `POST /requests/{id}/sync-conflict` ada
 *
 * Karena konflik sinkronisasi **menutup transisi bagi semua peran, termasuk
 * owner** (keputusan 49), sehingga tanpa rute ini konflik menjadi jalan buntu:
 * satu-satunya cara keluar adalah mengubah status, dan mengubah status
 * ditolak selama konfliknya ada. Rute itu adalah jalan keluarnya, dan ia
 * sengaja bukan `POST /transitions` dengan bendera — ia tindakan yang berbeda,
 * dengan wewenang yang berbeda dan akibat yang berbeda.
 */
@Injectable()
export class RequestsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly numbering: NumberingService,
    private readonly sync: RequestSyncService,
    private readonly workItems: WorkItemsService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar permintaan.
   *
   * Penyaring divisi **tidak** dipasang otomatis, mengikuti bacaan yang sama
   * dengan daftar pekerjaan: `request:read` di §7.9 terbuka untuk kelima peran,
   * dan permintaan lintas divisi justru inti fiturnya.
   *
   * `hasSyncConflict` ada karena konflik menutup transisi: tanpa penyaring ini,
   * satu-satunya cara menemukan permintaan yang macet adalah membukanya satu
   * per satu dan melihat apakah tombolnya bisa ditekan.
   */
  async list(query: ListRequestsDto) {
    const conditions = this.listConditions(query);

    const pic = alias(profiles, 'assigned_pic');
    const requester = alias(profiles, 'requester');

    const rows = await this.db
      .select(
        this.listSelection({
          assignedPicName: pic.fullName,
          requesterName: requester.fullName,
        }),
      )
      .from(requests)
      .leftJoin(divisions, eq(requests.targetDivisionId, divisions.id))
      .leftJoin(pic, eq(requests.assignedPicId, pic.id))
      .leftJoin(requester, eq(requests.requesterId, requester.id))
      .where(and(...conditions))
      .orderBy(desc(requests.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows;
  }

  /**
   * Satu permintaan, lengkap dengan langkah berikutnya yang tersedia.
   *
   * Bentuknya sama persis dengan detail pekerjaan (§9.1), dan itu disengaja:
   * frontend tidak boleh punya dua cara membaca aturan alur yang sama.
   */
  async detail(id: string, actor: Actor) {
    const row = await this.findDetail(id);

    const edges = await this.workflow.availableFor(
      TRANSITION_ENTITY.request,
      row.status,
      actor.roles,
    );

    return {
      ...row,
      availableTransitions: edges.map((edge) => edge.to),
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
   * Mengajukan permintaan — **draft**, dan pekerjaannya **belum** dibuat.
   *
   * §5.2.4: pekerjaan terhubung dibuat saat permintaan **diajukan**, bukan saat
   * disimpan sebagai draft. Di `sksks` trigger `AFTER INSERT` membuatnya tanpa
   * memandang status, sehingga setiap draft yang tidak jadi diajukan
   * meninggalkan pekerjaan hantu — dan pekerjaan hantu tidak bisa dibedakan
   * dari pekerjaan sungguhan oleh siapa pun yang melihat papannya.
   */
  async create(dto: CreateRequestDto, actor: Actor, context: WriteContext) {
    const created = await this.db.transaction(async (tx) => {
      const periodId = await this.resolvePeriod(tx, dto.periodId ?? null);

      await this.assertPicIsActive(tx, dto.assignedPicId ?? null);

      const requestNumber = await this.numbering.next(tx, 'request');

      /**
       * Divisi pemohon **disalin**, bukan diambil lewat join saat dibaca.
       *
       * Ia menjawab "dari divisi mana permintaan ini datang", dan itu pertanyaan
       * tentang **saat diajukan**, bukan tentang sekarang. Anggota yang pindah
       * divisi tidak mengubah asal permintaan yang sudah terkirim, dan laporan
       * yang membacanya lewat join akan mengubah angka bulan lalu setiap kali
       * ada yang berpindah.
       */
      const requesterDivisionId = await this.actorDivision(tx, actor.id);

      const rows = await tx
        .insert(requests)
        .values({
          requestNumber,
          requesterId: actor.id,
          requesterDivisionId,
          targetDivisionId: dto.targetDivisionId,
          type: dto.type,
          title: dto.title,
          description: dto.description ?? null,
          programId: dto.programId ?? null,
          subunitId: dto.subunitId ?? null,
          assignedPicId: dto.assignedPicId ?? null,
          periodId,
          priority: dto.priority,
          dueDate: dto.dueDate ?? null,
          status: 'draft',
          extraFields: dto.extraFields,
          createdBy: context.actorId,
          updatedBy: context.actorId,
        })
        .returning(this.detailSelection());

      return this.mustFound(rows[0]);
    });

    await this.record(context, REQUEST_ACTIONS.created, created.id, {
      afterData: created,
    });

    return created;
  }

  /**
   * Mengubah isi permintaan.
   *
   * `expectedVersion` dari `If-Match` (§7.16), diperiksa **dua lapis**:
   * `assertVersion` memberi `409` yang menyebut kedua angkanya sebelum menulis,
   * dan `eq(version, expectedVersion)` di `WHERE` menutup celah di antaranya.
   * Yang pertama untuk pesan yang berguna, yang kedua untuk kebenarannya.
   */
  async update(
    id: string,
    dto: UpdateRequestDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canEditRequest(actor, before));

    this.assertVersion(before.version, expectedVersion);

    this.assertTargetDivisionUnlocked(before, dto);

    const after = await this.db.transaction(async (tx) => {
      await this.assertPicIsActive(tx, dto.assignedPicId ?? null);

      const rows = await tx
        .update(requests)
        .set({
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.targetDivisionId !== undefined && {
            targetDivisionId: dto.targetDivisionId,
          }),
          ...(dto.programId !== undefined && { programId: dto.programId }),
          ...(dto.subunitId !== undefined && { subunitId: dto.subunitId }),
          ...(dto.assignedPicId !== undefined && {
            assignedPicId: dto.assignedPicId,
          }),
          ...(dto.periodId !== undefined && { periodId: dto.periodId }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate }),
          ...(dto.extraFields !== undefined && {
            extraFields: dto.extraFields,
          }),
          ...(dto.clarificationNote !== undefined && {
            clarificationNote: dto.clarificationNote,
          }),
          ...(dto.resultSummary !== undefined && {
            resultSummary: dto.resultSummary,
          }),
          ...(dto.holdReason !== undefined && { holdReason: dto.holdReason }),
          updatedBy: context.actorId,
          version: sql`${requests.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(requests.id, id), eq(requests.version, expectedVersion)))
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      await this.saveVersion(tx, before, context.actorId);

      return row;
    });

    await this.record(context, REQUEST_ACTIONS.updated, id, {
      beforeData: before,
      afterData: after,
    });

    return after;
  }

  /**
   * Memindahkan status — `POST /requests/{id}/transitions`.
   *
   * Urutan pemeriksaannya tetap, dan urutannya yang membuat pesannya benar:
   *
   * 1. **Izin baris** — `404` kalau ditolak, dan tidak ada yang boleh tahu lebih
   *    jauh.
   * 2. **Konflik sinkronisasi** — `409`, dan **setelah** izin baris diperiksa,
   *    karena `409` menyebutkan bahwa barisnya ada.
   * 3. **Aturan transisinya** — `422`, lengkap dengan daftar langkah tersedia.
   * 4. **Kolom wajibnya** — `422`, menyebut kolom mana yang kurang.
   *
   * ## Kenapa konfliknya disamarkan saat memeriksa izin
   *
   * `canTransitionRequest` menolak **dua** hal sekaligus: peran yang tidak
   * berhak, dan konflik yang belum selesai. Yang pertama harus `404` (§7.3 —
   * yang ditolak tidak boleh tahu barisnya ada), yang kedua harus `409`. Satu
   * fungsi tidak bisa mengembalikan dua kode status tanpa tahu tentang HTTP, dan
   * `resource.ts` sengaja tidak tahu.
   *
   * Memeriksanya berurutan tidak cukup, karena `canTransitionRequest` memeriksa
   * konfliknya **lebih dulu** di dalam dirinya: aktor yang tidak berhak atas
   * baris yang sedang berkonflik akan menerima `sync_conflict_unresolved` — dan
   * meneruskannya sebagai `409` berarti memberi tahu orang yang tidak berhak
   * bahwa baris itu ada.
   *
   * Karena itu konfliknya **disamarkan** pada pemanggilan pertama
   * (`syncConflictAt: null`), sehingga hasilnya adalah keputusan peran murni:
   * ditolak berarti `404` tanpa keterangan. Kalau lolos, konfliknya diperiksa
   * sungguhan — dan `409` aman, karena yang menerimanya sudah terbukti berhak
   * atas baris itu.
   */
  async transition(
    id: string,
    dto: TransitionRequestDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(
      canTransitionRequest(actor, { ...before, syncConflictAt: null }, dto.to),
    );

    this.assertNoSyncConflict(before);

    this.assertVersion(before.version, expectedVersion);

    // Sebelum transaksinya dibuka: menolak sesuatu yang sudah pasti ditolak
    // tidak boleh mengunci baris penghitung nomor (§8.2).
    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.request,
      before.status,
      dto.to,
      actor.roles,
      {
        clarification_note: dto.clarificationNote ?? before.clarificationNote,
        result_summary: dto.resultSummary ?? before.resultSummary,
        hold_reason: dto.holdReason ?? before.holdReason,
      },
    );

    const { after, outcome, linkedWorkItemId } = await this.db.transaction(
      async (tx) => {
        /**
         * Pekerjaan terhubung dibuat **saat diajukan** (§5.2.4).
         *
         * Dibuat di dalam transaksi yang sama dengan perpindahan statusnya
         * (temuan #16) — bukan sesudahnya. Urutan itu yang membuat "permintaan
         * yang diajukan selalu punya pekerjaan" menjadi sifat sistem, bukan
         * kemungkinan: kalau pembuatannya terpisah dan gagal, permintaannya
         * sudah terlanjur diajukan tanpa pekerjaan, dan tidak ada yang tahu.
         *
         * Dibuat `draft` lalu **dipindahkan** oleh sinkronisasi di bawah, bukan
         * langsung `submitted`. Bukan kerapian: statusnya harus melewati state
         * machine yang sama dengan pekerjaan lain, dan melompatinya berarti ada
         * satu jalur penulisan status yang tidak diperiksa siapa pun.
         */
        const created =
          dto.to === 'submitted' && before.linkedWorkItemId === null
            ? await this.workItems.createWithin(
                tx,
                {
                  title: before.title,
                  type: 'request',
                  description: before.description,
                  primaryPicId: before.assignedPicId,
                  divisionId: before.targetDivisionId,
                  subunitId: before.subunitId,
                  programId: before.programId,
                  periodId: before.periodId,
                  priority: before.priority,
                  dueDate: before.dueDate,
                  progressPercentage: 0,
                  isRecurring: false,
                  sourceRequestId: before.id,
                },
                context,
              )
            : null;

        const linkedWorkItemId = created?.id ?? before.linkedWorkItemId;

        const rows = await tx
          .update(requests)
          .set({
            status: dto.to,
            ...(linkedWorkItemId !== null && { linkedWorkItemId }),

            ...(dto.clarificationNote !== undefined && {
              clarificationNote: dto.clarificationNote,
            }),
            ...(dto.resultSummary !== undefined && {
              resultSummary: dto.resultSummary,
            }),
            ...(dto.holdReason !== undefined && { holdReason: dto.holdReason }),

            /**
             * §12 — transisi otomatis. `done` selalu berarti selesai penuh;
             * meninggalkannya membersihkan jejaknya. Alasannya sama dengan
             * pekerjaan: baris yang statusnya `in_progress` sementara
             * `completed_at`-nya terisi adalah baris yang bertentangan dengan
             * dirinya sendiri.
             */
            ...(dto.to === 'done' && { completedAt: new Date() }),
            ...(before.status === 'done' &&
              dto.to !== 'done' && {
                completedAt: null,
              }),

            updatedBy: context.actorId,
            version: sql`${requests.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(requests.id, id), eq(requests.version, expectedVersion)),
          )
          .returning(this.detailSelection());

        const row = this.mustUpdated(rows[0]);

        await this.saveVersion(tx, before, context.actorId);

        const outcome = await this.sync.syncFromRequestWithin(tx, {
          requestId: id,
          workItemId: linkedWorkItemId,
          to: dto.to,
          actorId: context.actorId,
        });

        // Melempar di dalam transaksi menggulung balik **seluruhnya** —
        // termasuk perpindahan status permintaannya. Itu yang diinginkan:
        // permintaan yang berpindah tanpa diikuti pekerjaannya adalah
        // ketidaksepakatan yang baru saja dibuat sendiri.
        if (outcome.kind === 'blocked') {
          this.rejectBlocked(outcome);
        }

        return { after: row, outcome, linkedWorkItemId };
      },
    );

    if (linkedWorkItemId !== before.linkedWorkItemId && linkedWorkItemId) {
      await this.audit.record({
        actorId: context.actorId,
        action: REQUEST_ACTIONS.linkedWorkItemCreated,
        entityType: WORK_ITEM_ENTITY,
        entityId: linkedWorkItemId,
        beforeData: null,
        afterData: { sourceRequestId: id, requestNumber: before.requestNumber },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });
    }

    await this.runAudits(outcome, context);

    await this.record(context, REQUEST_ACTIONS.transitioned, id, {
      beforeData: { status: before.status, version: before.version },
      afterData: {
        status: after.status,
        version: after.version,
        note: dto.note ?? null,
      },
    });

    /**
     * Saat konflik ditandai, barisnya dibaca ulang.
     *
     * `flagConflict` menaikkan `version` **kedua** baris, termasuk baris
     * permintaan yang baru saja diperbarui di transaksi ini — sehingga `after`
     * yang dipegang di sini tertinggal satu angka dari yang tersimpan. Klien
     * yang memakai angka itu untuk `If-Match` berikutnya akan ditolak `409`
     * untuk perubahan yang tidak pernah terjadi.
     *
     * Yang dibaca ulang sekaligus membawa `syncConflictAt` yang baru terpasang,
     * sehingga pemanggilnya langsung tahu bahwa barisnya sekarang berkonflik —
     * tanpa itu, satu-satunya petunjuknya adalah `409` pada percobaan berikutnya.
     */
    const fresh =
      outcome.kind === 'conflict' ? await this.findDetail(id) : after;

    return fresh;
  }

  /**
   * Menyelesaikan konflik sinkronisasi — keputusan 49.
   *
   * Satu-satunya rute yang boleh menulis status **tanpa** melewati state
   * machine, dan itu memang definisinya: konflik muncul karena tidak ada langkah
   * otomatis yang bisa mendamaikan kedua sisi, sehingga memindahkannya lewat
   * state machine berarti meminta mesin melakukan hal yang tadi sudah ia nyatakan
   * tidak bisa.
   *
   * Yang dipilih hanya **status permintaan**; status pekerjaannya ditentukan
   * peta. Lihat `ResolveSyncConflictSchema`.
   */
  async resolveSyncConflict(
    id: string,
    dto: ResolveSyncConflictDto,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canEditRequest(actor, before));

    this.assertVersion(before.version, expectedVersion);

    if (before.syncConflictAt === null) {
      throw new ConflictException({
        code: REQUEST_ERRORS.notInConflict,
        title: 'Permintaan ini tidak sedang berkonflik.',
        detail:
          'Penyelesaian hanya berlaku untuk permintaan yang punya penanda ' +
          'konflik sinkronisasi. Kalau statusnya memang ingin diubah, pakai ' +
          'POST /requests/{id}/transitions.',
      });
    }

    /**
     * Kolom yang dituntut status yang dipilih diperiksa **sebelum** menulis.
     *
     * `check` constraint di tabelnya juga menegakkannya, tetapi ia menolak
     * sebagai `500` yang tidak menyebut kolom — untuk isian yang sepenuhnya ada
     * di sisi pemanggil. Pemeriksaan ini yang membuatnya `422` yang menyebut
     * kolomnya.
     */
    const merged = {
      clarification_note: dto.clarificationNote ?? before.clarificationNote,
      result_summary: dto.resultSummary ?? before.resultSummary,
      hold_reason: dto.holdReason ?? before.holdReason,
    };

    const missing = (REQUEST_STATUS_REQUIRED_FIELDS[dto.status] ?? []).filter(
      (field) => {
        const value = merged[field as keyof typeof merged];
        return value === null || value === undefined || value === '';
      },
    );

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: REQUEST_ERRORS.requiredFieldMissing,
        title: 'Ada isian yang harus dilengkapi untuk status itu.',
        detail: `Isi dulu: ${missing.join(', ')}.`,
        errors: missing.map((field) => ({ field })),
      });
    }

    const outcome = await this.db.transaction(async (tx) => {
      // Kolom yang dikirim lebih dulu, karena nilainya **disalin** ke
      // pekerjaannya oleh sinkronisasi di bawah (`hold_reason`, `result_summary`)
      // — dan salinan yang diambil sebelum kolomnya ditulis akan menyalin yang
      // lama.
      if (
        dto.clarificationNote !== undefined ||
        dto.resultSummary !== undefined ||
        dto.holdReason !== undefined
      ) {
        await tx
          .update(requests)
          .set({
            ...(dto.clarificationNote !== undefined && {
              clarificationNote: dto.clarificationNote,
            }),
            ...(dto.resultSummary !== undefined && {
              resultSummary: dto.resultSummary,
            }),
            ...(dto.holdReason !== undefined && {
              holdReason: dto.holdReason,
            }),
            updatedBy: context.actorId,
            updatedAt: new Date(),
          })
          .where(eq(requests.id, id));
      }

      const result = await this.sync.resolveWithin(tx, {
        requestId: id,
        workItemId: before.linkedWorkItemId,
        chosen: dto.status,
        note: dto.note,
        actorId: context.actorId,
      });

      if (result.kind === 'blocked') {
        this.rejectBlocked(result);
      }

      return result;
    });

    await this.runAudits(outcome, context);

    const rows = await this.db
      .select(this.detailSelection())
      .from(requests)
      .where(eq(requests.id, id))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  /**
   * Menghapus permintaan — **soft delete**.
   *
   * `deleted_at`, bukan `DELETE FROM`: laporan yang menyebutnya akan berubah
   * angkanya tanpa penjelasan.
   *
   * Pekerjaan terhubungnya **dibiarkan hidup**, dan itu disengaja. Ia dokumen
   * tersendiri dengan pekerjaannya sendiri; `source_request_id`-nya tetap
   * menunjuk baris permintaan yang masih ada (soft delete tidak menghapus
   * barisnya), sehingga riwayat pekerjaannya tetap bisa ditelusuri. Menghapus
   * pekerjaannya juga berarti pekerjaan yang sudah berjalan berhenti karena
   * dokumen asalnya dirapikan — dan itu bukan hubungan yang diminta siapa pun.
   */
  async remove(
    id: string,
    expectedVersion: number,
    actor: Actor,
    context: WriteContext,
  ) {
    const before = await this.findForPolicy(id);

    this.assertAllowed(canDeleteRequest(actor, before));

    this.assertVersion(before.version, expectedVersion);

    const after = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(requests)
        .set({
          deletedAt: new Date(),
          updatedBy: context.actorId,
          version: sql`${requests.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(requests.id, id), eq(requests.version, expectedVersion)))
        .returning(this.detailSelection());

      const row = this.mustUpdated(rows[0]);

      await this.saveVersion(tx, before, context.actorId);

      return row;
    });

    await this.record(context, REQUEST_ACTIONS.deleted, id, {
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
   * Nama pemohon dan nama PIC datang sebagai **kolom**, bukan sebagai tabel
   * alias, dan itu disengaja: `profiles` di-join dua kali di sini — sekali
   * sebagai pemohon, sekali sebagai penanggung jawab — dan tipe hasil `alias()`
   * tidak bisa dinyatakan sebagai `typeof profiles` tanpa memaksa tipe. Yang
   * sesungguhnya dibutuhkan metode ini hanyalah dua kolom teks, jadi itulah yang
   * dimintanya; pemanggilnya yang tahu alias mana yang benar untuk masing-masing.
   */
  private listSelection(names: {
    assignedPicName: AnyPgColumn;
    requesterName: AnyPgColumn;
  }) {
    return {
      id: requests.id,
      requestNumber: requests.requestNumber,
      title: requests.title,
      type: requests.type,
      status: requests.status,
      priority: requests.priority,
      targetDivisionId: requests.targetDivisionId,
      targetDivisionName: divisions.name,
      requesterId: requests.requesterId,
      requesterName: names.requesterName,
      assignedPicId: requests.assignedPicId,
      assignedPicName: names.assignedPicName,
      dueDate: requests.dueDate,
      syncConflictAt: requests.syncConflictAt,
      completedAt: requests.completedAt,
      archivedAt: requests.archivedAt,
      version: requests.version,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
    };
  }

  /**
   * Seluruh kolom barisnya, kecuali yang memang bukan milik tabelnya.
   *
   * Ditulis satu per satu, bukan `select()` tanpa argumen: yang terakhir berarti
   * setiap kolom yang ditambahkan nanti otomatis ikut terkirim, dan keputusan
   * tentang apakah sebuah kolom boleh keluar adalah keputusan yang harus diambil
   * sadar.
   */
  private detailSelection() {
    return {
      id: requests.id,
      requestNumber: requests.requestNumber,
      requesterId: requests.requesterId,
      requesterDivisionId: requests.requesterDivisionId,
      targetDivisionId: requests.targetDivisionId,
      type: requests.type,
      title: requests.title,
      description: requests.description,
      programId: requests.programId,
      subunitId: requests.subunitId,
      assignedPicId: requests.assignedPicId,
      periodId: requests.periodId,
      priority: requests.priority,
      dueDate: requests.dueDate,
      status: requests.status,
      extraFields: requests.extraFields,
      clarificationNote: requests.clarificationNote,
      resultSummary: requests.resultSummary,
      holdReason: requests.holdReason,
      linkedWorkItemId: requests.linkedWorkItemId,
      syncConflictAt: requests.syncConflictAt,
      syncConflictNote: requests.syncConflictNote,
      createdBy: requests.createdBy,
      updatedBy: requests.updatedBy,
      completedAt: requests.completedAt,
      archivedAt: requests.archivedAt,
      deletedAt: requests.deletedAt,
      version: requests.version,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Memuat
  // ───────────────────────────────────────────────────────────────────────────

  private listConditions(query: ListRequestsDto): SQL[] {
    const conditions: SQL[] = [isNull(requests.deletedAt)];

    if (!query.includeArchived) {
      conditions.push(isNull(requests.archivedAt));
    }

    if (query.targetDivisionId) {
      conditions.push(eq(requests.targetDivisionId, query.targetDivisionId));
    }

    if (query.requesterId) {
      conditions.push(eq(requests.requesterId, query.requesterId));
    }

    if (query.assignedPicId) {
      conditions.push(eq(requests.assignedPicId, query.assignedPicId));
    }

    if (query.programId) {
      conditions.push(eq(requests.programId, query.programId));
    }

    if (query.subunitId) {
      conditions.push(eq(requests.subunitId, query.subunitId));
    }

    if (query.periodId) {
      conditions.push(eq(requests.periodId, query.periodId));
    }

    if (query.status) {
      conditions.push(eq(requests.status, query.status));
    }

    if (query.type) {
      conditions.push(eq(requests.type, query.type));
    }

    if (query.priority) {
      conditions.push(eq(requests.priority, query.priority));
    }

    // Daftar "permintaan menggantung" §5.2.8.
    if (query.withoutPic) {
      conditions.push(isNull(requests.assignedPicId));
    }

    if (query.hasSyncConflict) {
      conditions.push(isNotNull(requests.syncConflictAt));
    }

    if (query.q) {
      const pattern = `%${query.q}%`;
      const search = or(
        ilike(requests.title, pattern),
        ilike(requests.requestNumber, pattern),
      );

      if (search) {
        conditions.push(search);
      }
    }

    return conditions;
  }

  private async findDetail(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select(this.detailSelection())
      .from(requests)
      .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  /**
   * Barisnya, dalam bentuk yang dibutuhkan `resource.ts`.
   *
   * `targetDivisionCode` menuntut satu join, dan join itu bukan biaya sia-sia:
   * §7.9 membandingkan divisi **tujuan** dengan kode divisi yang dinaungi aktor,
   * bukan dengan uuid.
   */
  private async findForPolicy(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select({
        ...this.detailSelection(),
        targetDivisionCode: divisions.code,
      })
      .from(requests)
      .leftJoin(divisions, eq(requests.targetDivisionId, divisions.id))
      .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
      .limit(1);

    return this.mustFound(rows[0]);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Penjaga
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menerjemahkan penolakan `resource.ts` menjadi `404` tanpa keterangan.
   *
   * `reason` sengaja **tidak** ikut ke jawabannya: ia ada untuk log dan audit,
   * dan `AllExceptionsFilter` meneruskan medan tambahan apa adanya — sehingga
   * menuliskannya di sini akan mengirimnya ke klien, yang mengubah `404` menjadi
   * `403` dengan kode status berbeda.
   */
  private assertAllowed(result: PolicyResult): void {
    if (result.effect === 'allow') {
      return;
    }

    throw new NotFoundException({
      code: REQUEST_ERRORS.notFound,
      title: 'Permintaan tidak ditemukan.',
    });
  }

  /**
   * Konflik sinkronisasi menutup transisi (keputusan 49).
   *
   * `409`, bukan `404` — lihat catatan yang sama di `WorkItemsService`. Aman
   * karena pemanggilnya sudah memeriksa izin baris lebih dulu.
   */
  private assertNoSyncConflict(request: { syncConflictAt: Date | null }): void {
    if (request.syncConflictAt === null) {
      return;
    }

    throw new ConflictException({
      code: REQUEST_ERRORS.syncConflict,
      title: 'Permintaan ini dan pekerjaan terhubungnya belum sepakat.',
      detail:
        'Status tidak bisa dipindahkan selama konfliknya belum diselesaikan. ' +
        'Selesaikan dulu lewat POST /requests/{id}/sync-conflict, lalu ulangi.',
    });
  }

  /**
   * Sinkronisasi tidak bisa diterapkan karena pekerjaannya belum punya PIC.
   *
   * Dilempar **di dalam** transaksi pemanggilnya, sehingga seluruh perpindahan
   * statusnya ikut bergulung balik. Itu yang diinginkan: permintaan yang
   * berpindah ke `in_progress` tanpa pekerjaan yang bisa dikerjakan adalah
   * ketidaksepakatan yang baru saja dibuat sendiri, dan ketidaksepakatan itu
   * lebih murah dicegah di sini daripada ditandai sebagai konflik.
   */
  private rejectBlocked(outcome: SyncOutcome): never {
    if (outcome.kind !== 'blocked') {
      throw new Error(
        'rejectBlocked dipanggil untuk hasil yang bukan blocked.',
      );
    }

    throw new UnprocessableEntityException({
      code: REQUEST_ERRORS.linkedWorkItemPicMissing,
      title: 'Pekerjaan terhubungnya belum punya penanggung jawab.',
      detail:
        'Status ini menuntut pekerjaannya ikut berjalan, dan pekerjaan yang ' +
        'berjalan tanpa penanggung jawab tidak dikerjakan siapa pun. Tetapkan ' +
        'PIC-nya lebih dulu lewat PATCH /work-items/{id}/pic, lalu ulangi.',
      errors: [{ field: 'assignedPicId', workItemId: outcome.targetId }],
    });
  }

  /**
   * Divisi tujuan tidak boleh berpindah setelah permintaan diajukan.
   *
   * Alasannya bukan kerapian: divisi tujuan menentukan **siapa yang boleh
   * memindahkan statusnya** (`canTransitionRequest` memakai divisi tujuan),
   * sehingga memindahkannya berarti memindahkan wewenang atas baris itu — dari
   * kepala divisi yang sedang mengerjakannya kepada orang lain. Selama masih
   * `draft` belum ada yang mengerjakannya, jadi tidak ada wewenang yang
   * berpindah.
   */
  private assertTargetDivisionUnlocked(
    before: { status: RequestStatus; targetDivisionId: string },
    dto: UpdateRequestDto,
  ): void {
    if (
      dto.targetDivisionId === undefined ||
      dto.targetDivisionId === before.targetDivisionId ||
      before.status === 'draft'
    ) {
      return;
    }

    throw new UnprocessableEntityException({
      code: REQUEST_ERRORS.targetDivisionLocked,
      title: 'Divisi tujuan tidak bisa dipindahkan setelah diajukan.',
      detail:
        `Permintaan ini sudah berstatus "${before.status}". Divisi tujuan ` +
        'menentukan siapa yang berwenang memindahkan statusnya, sehingga ' +
        'memindahkannya berarti memindahkan wewenang itu. Ubah hanya selama ' +
        'statusnya masih draft.',
      errors: [{ field: 'targetDivisionId' }],
    });
  }

  /** Penanggung jawab harus ada dan berstatus `active`. */
  private async assertPicIsActive(
    tx: DbExecutor,
    assignedPicId: string | null,
  ): Promise<void> {
    if (assignedPicId === null) {
      return;
    }

    const rows = await tx
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, assignedPicId))
      .limit(1);

    const pic = rows[0];

    if (!pic || pic.status !== 'active') {
      throw new UnprocessableEntityException({
        code: REQUEST_ERRORS.picInvalid,
        title: pic
          ? 'Penanggung jawab yang dipilih tidak aktif.'
          : 'Penanggung jawab yang dipilih tidak ada.',
        detail:
          'Hanya anggota berstatus aktif yang bisa menjadi penanggung jawab. ' +
          'Menugaskan kepada akun yang tidak aktif membuat permintaannya tidak ' +
          'dikerjakan siapa pun.',
        errors: [{ field: 'assignedPicId' }],
      });
    }
  }

  /**
   * Periode permintaan: yang diminta, atau yang sedang aktif.
   *
   * Sama seperti pekerjaan, dan itu bukan kebetulan: pekerjaan terhubungnya
   * mewarisi periode ini, dan pekerjaan **wajib** punya periode. Kalau
   * permintaannya boleh tanpa periode, kewajiban itu berpindah ke saat
   * pengajuan — dan pengajuan akan gagal karena sesuatu yang tidak disebutkan
   * di layar permintaan.
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
        code: REQUEST_ERRORS.periodRequired,
        title: 'Belum ada periode yang aktif.',
        detail:
          'Permintaan harus menjadi milik satu periode. Aktifkan satu periode ' +
          'lebih dulu, atau sebutkan periodenya saat membuat permintaan.',
        errors: [{ field: 'periodId' }],
      });
    }

    return active.id;
  }

  private async actorDivision(
    tx: DbExecutor,
    actorId: string,
  ): Promise<string | null> {
    const rows = await tx
      .select({ divisionId: profiles.divisionId })
      .from(profiles)
      .where(eq(profiles.id, actorId))
      .limit(1);

    return rows[0]?.divisionId ?? null;
  }

  /**
   * Cuplikan versi baris sebelum perubahan (§10, `record_versions`).
   *
   * `targetDivisionCode` ikut tersimpan karena ia menempel pada barisnya lewat
   * join `findForPolicy` — sama seperti pada pekerjaan.
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
        entityType: REQUEST_ENTITY,
        entityId: String(snapshot.id),
        versionNumber: Number(snapshot.version),
        snapshot,
        changedBy: actorId,
      })
      .onConflictDoNothing();
  }

  /**
   * Menjalankan catatan audit yang **diputuskan** sinkronisasi.
   *
   * Sinkronisasi berjalan di dalam transaksi, sedangkan `AuditService` menulis
   * lewat koneksi global — jadi ia tidak boleh menulisnya sendiri. Ia
   * mengembalikan apa yang perlu dicatat, dan pemanggilnya mencatatnya di sini,
   * setelah transaksinya berhasil.
   */
  private async runAudits(
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

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new ConflictException({
        code: REQUEST_ERRORS.versionMismatch,
        title: 'Permintaan ini sudah berubah sejak kamu membacanya.',
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
        code: REQUEST_ERRORS.notFound,
        title: 'Permintaan tidak ditemukan.',
      });
    }
  }

  private mustFound<T>(row: T | undefined): T {
    if (!row) {
      throw new NotFoundException({
        code: REQUEST_ERRORS.notFound,
        title: 'Permintaan tidak ditemukan.',
      });
    }

    return row;
  }

  private mustUpdated<T>(row: T | undefined): T {
    if (!row) {
      throw new ConflictException({
        code: REQUEST_ERRORS.versionMismatch,
        title: 'Permintaan ini sudah berubah sejak kamu membacanya.',
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
      entityType: REQUEST_ENTITY,
      entityId,
      beforeData: (data.beforeData ?? null) as Record<string, unknown> | null,
      afterData: (data.afterData ?? null) as Record<string, unknown> | null,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }
}
