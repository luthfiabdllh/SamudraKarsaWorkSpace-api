import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { profiles } from '../database/schema/organization';
import { recordVersions } from '../database/schema/system';
import { requests, workItems } from '../database/schema/work';
import type { DbExecutor } from '../numbering/numbering.service';
import type { RequestStatus, WorkStatus } from '../policy/resource';
import {
  REQUEST_ACTIONS,
  REQUEST_ENTITY,
} from '../requests/requests.constants';
import {
  WORK_ITEM_ACTIONS,
  WORK_ITEM_ENTITY,
} from '../work-items/work-items.constants';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import {
  REQUEST_STATUS_FOR_WORK,
  SYNC_ERRORS,
  WORK_STATUS_FOR_REQUEST,
} from './request-sync.constants';

/**
 * Satu baris audit yang **harus** ditulis pemanggilnya, setelah commit.
 *
 * Sinkronisasi berjalan di dalam transaksi pemanggilnya, sedangkan `AuditService`
 * menulis lewat koneksi global. Menulis audit dari sini berarti perubahan yang
 * bergulung balik tetap meninggalkan catatan — dan catatan yang menyatakan
 * sesuatu yang tidak pernah terjadi lebih buruk daripada catatan yang hilang.
 *
 * Karena itu sinkronisasi **memutuskan** apa yang perlu dicatat lalu
 * menyerahkannya; yang menuliskannya adalah pemanggilnya, sesudah transaksinya
 * berhasil.
 */
export interface SyncAuditEntry {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly beforeData: Record<string, unknown> | null;
  readonly afterData: Record<string, unknown> | null;
}

/** Alasan sinkronisasi tidak bisa diterapkan tanpa keputusan manusia. */
export type SyncBlockReason = 'work_item_pic_missing';

interface SyncOutcomeBase {
  readonly audits: readonly SyncAuditEntry[];
}

/**
 * Hasil satu langkah sinkronisasi.
 *
 * Lima kemungkinan, dan kelimanya benar-benar terjadi:
 *
 * | `kind` | Artinya |
 * |---|---|
 * | `no_link` | Tidak ada pasangan — pekerjaan yang berdiri sendiri, atau permintaan yang belum diajukan |
 * | `in_sync` | Pasangannya sudah sepakat; tidak ada yang ditulis |
 * | `applied` | Sisi seberang dipindahkan, dan sekarang keduanya sepakat |
 * | `blocked` | Tidak bisa diterapkan karena syarat di sisi seberang belum terpenuhi — **bukan** konflik, dan penyebabnya diperbaiki di tempat lain |
 * | `conflict` | Kedua sisi tidak sepakat, dan tidak ada langkah otomatis yang bisa mendamaikan (keputusan 49) |
 *
 * `blocked` dipisahkan dari `conflict` karena **yang harus dilakukan
 * penggunanya berbeda**. Konflik diselesaikan dengan memilih status yang benar;
 * `blocked` diselesaikan dengan menetapkan PIC pada pekerjaan terhubung. Pesan
 * yang menyamakan keduanya akan menyuruh orang memilih status untuk masalah yang
 * bukan tentang status.
 */
export type SyncOutcome =
  | (SyncOutcomeBase & { readonly kind: 'no_link' })
  | (SyncOutcomeBase & { readonly kind: 'in_sync' })
  | (SyncOutcomeBase & { readonly kind: 'applied' })
  | (SyncOutcomeBase & {
      readonly kind: 'blocked';
      readonly reason: SyncBlockReason;
      readonly targetId: string;
    })
  | (SyncOutcomeBase & {
      readonly kind: 'conflict';
      readonly requestId: string;
      readonly workItemId: string;
      readonly note: string;
    });

const NO_AUDIT: readonly SyncAuditEntry[] = [];

/**
 * Sinkronisasi dua arah antara permintaan dan pekerjaan terhubungnya (§5.2.3).
 *
 * ## Kenapa ada modul tersendiri
 *
 * Karena ia milik **kedua** sisi, dan tidak satu pun boleh memilikinya. Kalau
 * kode ini tinggal di `requests`, `WorkItemsService` harus mengimpor modul
 * permintaan — sedangkan modul permintaan sudah mengimpor modul pekerjaan untuk
 * membuat pekerjaan terhubung (§5.2.4). Itu lingkaran, dan lingkaran modul
 * dipecahkan dengan **memindahkan yang dipakai bersama ke tempat ketiga**,
 * bukan dengan `forwardRef()` — alasannya sama dengan yang tertulis di
 * `profiles.module.ts`: `forwardRef()` menyembunyikan lingkaran yang nyata
 * alih-alih menghapusnya.
 *
 * Ketergantungannya karena itu satu arah dan bisa dibaca:
 *
 * ```
 * RequestsModule ──▶ WorkItemsModule ──▶ RequestSyncModule
 *        └──────────────────────────────────────▶┘
 * ```
 *
 * ## Yang tidak dilakukannya
 *
 * - **Tidak memeriksa peran.** Aktor sudah lolos `canEditWorkItem` /
 *   `canTransitionRequest` pada sisi yang ia bertindak, dan itulah pemeriksaan
 *   yang menentukan. Sisi seberang **tidak boleh** diperiksa ulang perannya:
 *   kalau ia lebih ketat, pasangan yang sah pun tidak bisa dijaga oleh
 *   orang-orang yang berwenang menjaganya — dan hasilnya adalah konflik yang
 *   muncul setiap kali seseorang memakai haknya sendiri. Yang diperiksa di sini
 *   hanyalah **bentuk perpindahannya** — apakah langkah itu ada di
 *   `status_transitions` — karena aturan alur tetap berlaku untuk semua orang.
 * - **Tidak memutuskan siapa yang benar.** Saat langkahnya tidak ada, ia
 *   **menandai konflik** dan berhenti. Yang memutuskan adalah manusia
 *   (`resolveWithin`), sesuai keputusan 49.
 * - **Tidak menulis audit.** Lihat `SyncAuditEntry`.
 *
 * ## Kenapa membaca barisnya sendiri, bukan menerima dari pemanggil
 *
 * Pemanggil memegang salinan baris yang dibacanya beberapa milidetik lebih awal.
 * Untuk memutuskan apakah sisi seberang sudah sepakat, yang dibutuhkan adalah
 * keadaannya **sekarang** — dan pada `max: 1` koneksi, "sekarang" berarti di
 * dalam transaksi ini. Salinan yang basi akan menghasilkan penilaian sepakat
 * atas keadaan yang sudah berubah.
 */
@Injectable()
export class RequestSyncService {
  private readonly logger = new Logger(RequestSyncService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly workflow: WorkflowService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Arah permintaan → pekerjaan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menyusulkan status permintaan `to` kepada pekerjaan terhubungnya.
   *
   * Dipanggil **sesudah** baris permintaannya ditulis, di dalam transaksi yang
   * sama. `workItemId` dioper pemanggilnya, bukan dibaca dari kolomnya, karena
   * pada `draft → submitted` pekerjaannya **baru saja dibuat di langkah yang
   * sama** (§5.2.4) — kolomnya sudah terisi saat ini dipanggil, tetapi
   * mengandalkan urutan penulisan akan membuat fungsi ini bergantung pada
   * sesuatu yang tidak dinyatakannya.
   */
  async syncFromRequestWithin(
    tx: DbExecutor,
    input: {
      readonly requestId: string;
      readonly workItemId: string | null;
      readonly to: RequestStatus;
      readonly actorId: string;
    },
  ): Promise<SyncOutcome> {
    if (input.workItemId === null) {
      return { kind: 'no_link', audits: NO_AUDIT };
    }

    const work = await this.loadWorkItem(tx, input.workItemId);

    if (!work) {
      return { kind: 'no_link', audits: NO_AUDIT };
    }

    const target = WORK_STATUS_FOR_REQUEST[input.to];

    if (work.status === target) {
      return { kind: 'in_sync', audits: NO_AUDIT };
    }

    /**
     * Pekerjaan yang berpindah **menuju** `in_progress` harus punya PIC aktif.
     *
     * Diperiksa di sini pula meski `WorkItemsService.transition` sudah
     * memeriksanya, karena jalur ini **bukan** jalur itu: yang memindahkan
     * pekerjaannya adalah permintaan, dan aturan PIC adalah aturan yang dimiliki
     * pekerjaan — bukan sesuatu yang boleh dilewati karena pemindahnya orang
     * lain.
     *
     * Yang dilakukan bukan sekadar menolak diam-diam: seluruh permintaan itu
     * dibatalkan (pemanggilnya melempar, transaksinya bergulung balik) dengan
     * pesan yang menyebut pekerjaan mana yang harus diberi PIC lebih dulu.
     * Alternatifnya — meneruskan perpindahannya lalu menandai konflik — akan
     * menghasilkan pekerjaan `in_progress` tanpa penanggung jawab, yaitu tepat
     * keadaan yang `assertPicReady` ada untuk mencegahnya.
     */
    if (
      target === 'in_progress' &&
      !(await this.hasActivePic(tx, work.primaryPicId))
    ) {
      return {
        kind: 'blocked',
        reason: 'work_item_pic_missing',
        targetId: work.id,
        audits: NO_AUDIT,
      };
    }

    if (
      !(await this.workflow.edgeExists(
        TRANSITION_ENTITY.workItem,
        work.status,
        target,
        tx,
      ))
    ) {
      return this.flagConflict(tx, {
        requestId: input.requestId,
        workItemId: work.id,
        note:
          `Permintaan dipindahkan ke "${input.to}", yang berarti pekerjaannya ` +
          `harus menjadi "${target}" — tetapi pekerjaan ini sedang "${work.status}", ` +
          `dan perpindahan itu tidak ada di aturan alurnya.`,
        actorId: input.actorId,
      });
    }

    const now = new Date();

    const updated = await tx
      .update(workItems)
      .set({
        status: target,

        // Kolom yang ditegakkan `check` constraint saat statusnya tertentu.
        // Tanpa salinan ini, pemindahannya ditolak database sebagai `500` —
        // dan yang ditolak adalah perpindahan yang sah.
        ...(target === 'blocked' && {
          holdReason: work.holdReason,
        }),
        ...(target === 'done' && {
          completionSummary: work.completionSummary,
          completedAt: now,
          progressPercentage: 100,
        }),
        ...(work.status === 'done' && {
          completedAt: null,
          progressPercentage: 0,
        }),

        syncConflictAt: null,
        syncConflictNote: null,
        updatedBy: input.actorId,
        version: sql`${workItems.version} + 1`,
        updatedAt: now,
      })
      .where(eq(workItems.id, work.id))
      .returning({ version: workItems.version });

    const afterVersion = updated[0]?.version ?? work.version + 1;

    await this.snapshot(tx, WORK_ITEM_ENTITY, work, input.actorId);

    return {
      kind: 'applied',
      audits: [
        {
          action: WORK_ITEM_ACTIONS.transitioned,
          entityType: WORK_ITEM_ENTITY,
          entityId: work.id,
          beforeData: { status: work.status, version: work.version },
          afterData: {
            status: target,
            version: afterVersion,
            derivedFrom: {
              entityType: REQUEST_ENTITY,
              entityId: input.requestId,
            },
          },
        },
      ],
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Arah pekerjaan → permintaan
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menyampaikan status pekerjaan `to` kepada permintaan asalnya.
   *
   * Inilah arah yang **tidak ada** di `sksks` (§5.2.3): memindahkan status
   * pekerjaan tidak menyentuh permintaannya, sehingga dua catatan bisa berbeda
   * status tanpa ada yang tahu. Di sini pekerjaan yang dipindahkan langsung
   * memindahkan permintaannya, dan kalau tidak bisa, konfliknya ditandai.
   */
  async syncFromWorkItemWithin(
    tx: DbExecutor,
    input: {
      readonly workItemId: string;
      readonly sourceRequestId: string | null;
      readonly to: WorkStatus;
      readonly actorId: string;
    },
  ): Promise<SyncOutcome> {
    if (input.sourceRequestId === null) {
      return { kind: 'no_link', audits: NO_AUDIT };
    }

    const request = await this.loadRequest(tx, input.sourceRequestId);

    if (!request) {
      // Permintaannya sudah dihapus permanen. Pekerjaannya tetap berdiri —
      // `source_request_id` memang `on delete set null` — jadi tidak ada yang
      // perlu disinkronkan lagi.
      return { kind: 'no_link', audits: NO_AUDIT };
    }

    const target = REQUEST_STATUS_FOR_WORK[input.to];

    if (request.status === target) {
      return { kind: 'in_sync', audits: NO_AUDIT };
    }

    if (
      !(await this.workflow.edgeExists(
        TRANSITION_ENTITY.request,
        request.status,
        target,
        tx,
      ))
    ) {
      return this.flagConflict(tx, {
        requestId: request.id,
        workItemId: input.workItemId,
        note:
          `Pekerjaan dipindahkan ke "${input.to}", yang berarti permintaannya ` +
          `harus menjadi "${target}" — tetapi permintaan ini sedang ` +
          `"${request.status}", dan perpindahan itu tidak ada di aturan alurnya.`,
        actorId: input.actorId,
      });
    }

    const now = new Date();

    const updated = await tx
      .update(requests)
      .set({
        status: target,

        // Sama seperti arah sebaliknya: `requests` punya tiga `check` constraint
        // yang menuntut kolomnya terisi saat statusnya tertentu, dan nilainya
        // disalin dari pekerjaannya — bukan dikarang. Bedanya dengan `sksks`:
        // di sana `assistance_needed` diisi teks tetap `'Menunggu tindak
        // lanjut request'` hanya supaya validasinya lolos
        // (`docs/INVENTARIS-ATURAN.md` §4).
        ...(target === 'on_hold' && { holdReason: request.holdReason }),
        ...(target === 'done' && {
          resultSummary: request.resultSummary,
          completedAt: now,
        }),
        ...(request.status === 'done' && { completedAt: null }),

        syncConflictAt: null,
        syncConflictNote: null,
        updatedBy: input.actorId,
        version: sql`${requests.version} + 1`,
        updatedAt: now,
      })
      .where(eq(requests.id, request.id))
      .returning({ version: requests.version });

    const afterVersion = updated[0]?.version ?? request.version + 1;

    await this.snapshot(tx, REQUEST_ENTITY, request, input.actorId);

    return {
      kind: 'applied',
      audits: [
        {
          action: REQUEST_ACTIONS.transitioned,
          entityType: REQUEST_ENTITY,
          entityId: request.id,
          beforeData: { status: request.status, version: request.version },
          afterData: {
            status: target,
            version: afterVersion,
            derivedFrom: {
              entityType: WORK_ITEM_ENTITY,
              entityId: input.workItemId,
            },
          },
        },
      ],
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Penyelesaian konflik
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menyelesaikan konflik dengan **memilih** status yang benar (keputusan 49).
   *
   * ## Ini satu-satunya jalur yang menulis status tanpa state machine
   *
   * Dan itu bukan kelonggaran, melainkan definisi dari apa yang sedang
   * dikerjakan. Konflik muncul justru **karena** tidak ada langkah otomatis yang
   * bisa mendamaikan kedua sisi — memindahkannya lewat state machine berarti
   * meminta mesin melakukan hal yang tadi sudah ia nyatakan tidak bisa. Yang
   * bisa menyelesaikannya adalah manusia yang tahu keadaan sebenarnya, dan ia
   * menyatakannya di sini: "status permintaannya yang benar adalah ini".
   *
   * Karena itu seluruh langkahnya dicatat dengan aksi tersendiri
   * (`request.sync_conflict.resolved`) dan **wajib beralasan** — sama seperti
   * penahanan pekerjaan (keputusan 48). Tindakan yang melewati aturan harus
   * meninggalkan alasan mengapa ia melewatinya; tanpa itu, satu-satunya cara
   * mengetahui kenapa sebuah status melompat adalah menebak.
   *
   * ## Kenapa yang dipilih hanya sisi permintaan
   *
   * Karena status pekerjaannya **tidak perlu dipilih** — ia ditentukan oleh
   * peta: begitu permintaannya `accepted`, pekerjaannya `approved`. Membiarkan
   * keduanya dipilih membuka kemungkinan memilih pasangan yang tidak ada di
   * peta, yaitu memilih ketidaksepakatan baru. Satu pilihan, satu pasangan.
   *
   * `blocked` dikembalikan — bukan dilempar — supaya pemanggilnya yang menyusun
   * `422`-nya, karena hanya pemanggilnya yang tahu nama medan JSON yang harus
   * disebut.
   */
  async resolveWithin(
    tx: DbExecutor,
    input: {
      readonly requestId: string;
      readonly workItemId: string | null;
      readonly chosen: RequestStatus;
      readonly note: string;
      readonly actorId: string;
    },
  ): Promise<SyncOutcome> {
    const request = await this.loadRequest(tx, input.requestId);

    if (!request) {
      return { kind: 'no_link', audits: NO_AUDIT };
    }

    const target = WORK_STATUS_FOR_REQUEST[input.chosen];
    const work =
      input.workItemId === null
        ? null
        : await this.loadWorkItem(tx, input.workItemId);

    if (
      target === 'in_progress' &&
      work &&
      !(await this.hasActivePic(tx, work.primaryPicId))
    ) {
      return {
        kind: 'blocked',
        reason: 'work_item_pic_missing',
        targetId: work.id,
        audits: NO_AUDIT,
      };
    }

    const now = new Date();
    const audits: SyncAuditEntry[] = [];

    const requestRows = await tx
      .update(requests)
      .set({
        status: input.chosen,
        ...(input.chosen === 'done' ? { completedAt: now } : {}),
        ...(request.status === 'done' && input.chosen !== 'done'
          ? { completedAt: null }
          : {}),
        syncConflictAt: null,
        syncConflictNote: null,
        updatedBy: input.actorId,
        version: sql`${requests.version} + 1`,
        updatedAt: now,
      })
      .where(eq(requests.id, request.id))
      .returning({ version: requests.version });

    await this.snapshot(tx, REQUEST_ENTITY, request, input.actorId);

    audits.push({
      action: REQUEST_ACTIONS.syncConflictResolved,
      entityType: REQUEST_ENTITY,
      entityId: request.id,
      beforeData: {
        status: request.status,
        version: request.version,
        syncConflictNote: request.syncConflictNote,
      },
      afterData: {
        status: input.chosen,
        version: requestRows[0]?.version ?? request.version + 1,
        workItemStatus: work ? target : null,
        note: input.note,
      },
    });

    if (!work) {
      return { kind: 'applied', audits };
    }

    const workRows = await tx
      .update(workItems)
      .set({
        status: target,
        ...(target === 'blocked' && { holdReason: request.holdReason }),
        ...(target === 'done' && {
          completionSummary: request.resultSummary,
          completedAt: now,
          progressPercentage: 100,
        }),
        ...(work.status === 'done' && target !== 'done'
          ? { completedAt: null, progressPercentage: 0 }
          : {}),
        syncConflictAt: null,
        syncConflictNote: null,
        updatedBy: input.actorId,
        version: sql`${workItems.version} + 1`,
        updatedAt: now,
      })
      .where(eq(workItems.id, work.id))
      .returning({ version: workItems.version });

    await this.snapshot(tx, WORK_ITEM_ENTITY, work, input.actorId);

    audits.push({
      action: WORK_ITEM_ACTIONS.transitioned,
      entityType: WORK_ITEM_ENTITY,
      entityId: work.id,
      beforeData: { status: work.status, version: work.version },
      afterData: {
        status: target,
        version: workRows[0]?.version ?? work.version + 1,
        note: input.note,
        reason: 'sync_conflict_resolved',
      },
    });

    return { kind: 'applied', audits };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Dalaman
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menandai kedua sisi berkonflik, dan **tidak** memindahkan apa pun.
   *
   * Yang dinaikkan hanya `version`, bukan statusnya. Itu disengaja: barisnya
   * memang berubah — ada penanda baru di dalamnya — sehingga klien yang
   * memegang versi lama harus ditolak saat menyimpan. Tanpa kenaikan itu,
   * seseorang yang membuka halaman sebelum konflik muncul akan bisa menyimpan
   * di atas keadaan yang belum pernah ia lihat.
   */
  private async flagConflict(
    tx: DbExecutor,
    input: {
      readonly requestId: string;
      readonly workItemId: string;
      readonly note: string;
      readonly actorId: string;
    },
  ): Promise<SyncOutcome> {
    const now = new Date();

    const set = {
      syncConflictAt: now,
      syncConflictNote: input.note,
      updatedBy: input.actorId,
      updatedAt: now,
    };

    await tx
      .update(requests)
      .set({ ...set, version: sql`${requests.version} + 1` })
      .where(eq(requests.id, input.requestId));

    await tx
      .update(workItems)
      .set({ ...set, version: sql`${workItems.version} + 1` })
      .where(eq(workItems.id, input.workItemId));

    this.logger.warn(
      `Konflik sinkronisasi: permintaan ${input.requestId} ↔ pekerjaan ${input.workItemId}. ${input.note}`,
    );

    return {
      kind: 'conflict',
      requestId: input.requestId,
      workItemId: input.workItemId,
      note: input.note,
      audits: [
        {
          action: REQUEST_ACTIONS.syncConflictFlagged,
          entityType: REQUEST_ENTITY,
          entityId: input.requestId,
          beforeData: null,
          afterData: {
            syncConflictNote: input.note,
            workItemId: input.workItemId,
            code: SYNC_ERRORS.conflictFlagged,
          },
        },
      ],
    };
  }

  /** Baris pekerjaan selengkapnya — dipakai untuk memutuskan **dan** bercuplik. */
  private async loadWorkItem(tx: DbExecutor, id: string) {
    const rows = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  private async loadRequest(tx: DbExecutor, id: string) {
    const rows = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Apakah profil ini ada dan berstatus `active`.
   *
   * `null` berarti pekerjaannya memang belum punya PIC — dan itu bukan "PIC yang
   * tidak aktif", melainkan keadaan yang berbeda. Keduanya menghalangi
   * perpindahan ke `in_progress`, tetapi pesannya berbeda, dan pesan yang
   * menyamakan keduanya akan menyuruh orang mencari PIC untuk pekerjaan yang
   * sebenarnya sudah punya.
   */
  private async hasActivePic(
    tx: DbExecutor,
    profileId: string | null,
  ): Promise<boolean> {
    if (profileId === null) {
      return false;
    }

    const rows = await tx
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    return rows[0]?.status === 'active';
  }

  /**
   * Cuplikan versi baris sisi seberang (§10, `record_versions`).
   *
   * Ditulis di sini meski `WorkItemsService.saveVersion` melakukan hal yang
   * sama, karena `entity_type`-nya berbeda dan tabelnya berbeda — dan satu
   * penolong bersama untuk dua entitas berarti penolong yang harus tahu tentang
   * keduanya. Yang perlu sama hanyalah **bentuknya**, dan `record_versions`
   * sudah memaksakan bentuk itu.
   */
  private async snapshot(
    tx: DbExecutor,
    entityType: string,
    row: { id: string; version: number },
    actorId: string,
  ): Promise<void> {
    await tx
      .insert(recordVersions)
      .values({
        entityType,
        entityId: row.id,
        versionNumber: row.version,
        snapshot: row,
        changedBy: actorId,
      })
      .onConflictDoNothing();
  }
}
