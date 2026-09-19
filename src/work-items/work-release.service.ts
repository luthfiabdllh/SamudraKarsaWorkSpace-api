import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import {
  requests,
  workItemAssignees,
  workItems,
} from '../database/schema/work';
import type { DbExecutor } from '../numbering/numbering.service';
import {
  REQUEST_ACTIONS,
  REQUEST_ENTITY,
} from '../requests/requests.constants';
import { WORK_ITEM_ACTIONS, WORK_ITEM_ENTITY } from './work-items.constants';

/**
 * Satu pekerjaan yang lepas dari seorang anggota yang dinonaktifkan.
 *
 * Dua penanda, bukan satu, karena dua hal yang berbeda bisa terjadi pada satu
 * pekerjaan yang sama: PIC-nya dilepas, penerima tugasnya dicabut, atau
 * keduanya. Menggabungkannya menjadi satu penanda akan menyembunyikan yang
 * kedua — dan yang menyembunyikan perubahan adalah yang membuat catatan audit
 * tidak bisa dipakai menjawab "kenapa saya tidak lagi ada di pekerjaan itu".
 */
export interface ReleasedWorkItem {
  readonly id: string;
  readonly workNumber: string;
  readonly title: string;
  /**
   * Versi baris **sesudah** perubahan. Untuk yang hanya kehilangan penerima
   * tugas, nilainya tidak bergerak — lihat catatan di `releaseWithin`.
   */
  readonly version: number;
  /** `primary_pic_id` dikosongkan pada perubahan ini. */
  readonly picReleased: boolean;
  /** Barisnya di `work_item_assignees` dihapus pada perubahan ini. */
  readonly assigneeRemoved: boolean;
}

/** Satu permintaan yang penanggung jawabnya dilepas. */
export interface ReleasedRequest {
  readonly id: string;
  readonly requestNumber: string;
  readonly title: string;
  readonly version: number;
}

export interface ReleaseResult {
  readonly workItems: ReleasedWorkItem[];
  readonly requests: ReleasedRequest[];
}

/**
 * Melepas seluruh tanggung jawab seorang anggota yang dinonaktifkan (§5.2.8).
 *
 * ## Masalah yang dipecahkan
 *
 * Temuan §5.2.8 berbunyi, tentang `sksks`:
 *
 * > *"`primary_pic_id` tetap menunjuk akun nonaktif. Notifikasi tetap dikirim ke
 * > sana. Tidak ada daftar 'pekerjaan menggantung'."*
 *
 * Tiga akibatnya berurutan: pekerjaan yang tidak dikerjakan siapa pun tetap
 * **terlihat** dikerjakan seseorang, pengingatnya dikirim ke akun yang tidak
 * akan pernah membukanya, dan tidak ada satu layar pun yang bisa dipakai untuk
 * menemukannya. Yang paling berbahaya adalah yang pertama: papan pekerjaan
 * menunjukkan PIC yang namanya sudah tidak ada di daftar anggota, dan setiap
 * orang yang melihatnya mengira ada yang mengurusnya.
 *
 * ## Yang dipilih, dan yang **tidak** dipilih
 *
 * Yang dipilih: **tanggung jawabnya dilepas**, dan yang dilepas muncul di daftar
 * "pekerjaan menggantung" (`GET /work-items?withoutPic=true`,
 * `GET /requests?withoutPic=true`) untuk ditindaklanjuti.
 *
 * Yang tidak dipilih, dan alasannya:
 *
 * - **Memindahkan ke orang lain secara otomatis.** Ke siapa? Pertanyaan itu
 *   tidak punya jawaban yang bisa dihitung. Menunjuk kepala divisinya berarti
 *   menambahkan pekerjaan ke orang yang tidak memintanya, dan ia akan
 *   mengetahuinya dari daftar tugasnya sendiri — bukan dari percakapan.
 *   `ALUR-PER-ROLE.md` §3.7 meminta daftar yang bisa ditindaklanjuti owner,
 *   bukan pengalihan otomatis.
 * - **Menolak menonaktifkan akun yang masih memegang pekerjaan.** Itu mengubah
 *   satu masalah kecil menjadi satu masalah besar: anggota yang keluar dari
 *   kepanitiaan akan menahan pekerjaan seluruh organisasi sampai seseorang
 *   memindahkan setiap pekerjaannya satu per satu.
 * - **Kolom baru `former_pic_id`.** Menambah kolom untuk menyimpan sesuatu yang
 *   sudah disimpan `activity_logs` dan `record_versions` berarti dua catatan
 *   atas kejadian yang sama — dan yang lebih baru akan dipercaya, meski yang
 *   lebih lengkap adalah yang lama.
 *
 * ## Cakupannya, dan batasnya
 *
 * Yang dilepas, untuk pekerjaan **dan** permintaan:
 *
 * | Yang dibersihkan | Kolom / tabel |
 * |---|---|
 * | Penanggung jawab pekerjaan | `work_items.primary_pic_id` |
 * | Penerima tugas | baris `work_item_assignees` miliknya |
 * | Penanggung jawab permintaan | `requests.assigned_pic_id` |
 *
 * Yang **tidak** disentuh, dan ketiganya disengaja:
 *
 * - **Yang sudah dihapus** (`deleted_at`) — sampah. Membersihkannya menghasilkan
 *   catatan audit tentang baris yang tidak bisa dibuka siapa pun.
 * - **Yang sudah diarsipkan** (`archived_at`) — arsip berarti "disimpan apa
 *   adanya", dan itu berlaku untuk seluruh barisnya, bukan hanya untuk
 *   statusnya. Membersihkan sebagian dari baris yang diarsipkan membuat arsip
 *   berubah isi tanpa ada yang membukanya.
 * - **Pekerjaan yang sudah `done` pun ikut dilepas** — lihat catatan tersendiri
 *   di `releaseWithin`, karena keputusan ini pernah dibalik.
 *
 * `requests` **tidak** punya kolom penerima tugas tambahan; yang ada hanya
 * `assigned_pic_id`, dan itulah satu-satunya yang dilepas di sana.
 *
 * ## Kenapa audit ditulis pemanggilnya, bukan di sini
 *
 * Karena `AuditService` menulis lewat koneksi **global**, bukan lewat `tx`.
 * Kalau pelepasan ini berjalan di dalam transaksi `ProfilesService.update` dan
 * auditnya ditulis di sini, lalu transaksi itu bergulung balik — penonaktifan
 * akunnya batal, tetapi catatan "PIC-nya dilepas" sudah tersimpan dan tidak
 * bisa ditarik. Satu baris audit yang menyatakan sesuatu yang tidak pernah
 * terjadi lebih buruk daripada satu baris audit yang hilang: yang pertama
 * membuat orang berhenti mempercayai seluruh tabelnya.
 *
 * Karena itu pembagiannya: `releaseWithin` mengubah datanya di dalam transaksi
 * dan mengembalikan apa yang berubah; `auditReleases` menulis catatannya
 * sesudahnya, di luar. Yang menjaganya tetap satu langkah adalah pemanggilnya —
 * dan pemanggilnya hari ini hanya satu.
 */
@Injectable()
export class WorkReleaseService {
  private readonly logger = new Logger(WorkReleaseService.name);

  constructor(private readonly audit: AuditService) {}

  /**
   * Melepas seluruh tanggung jawab profil ini. **Di dalam `tx`.**
   *
   * ## Kenapa `UPDATE` massal, bukan satu per baris
   *
   * Satu pernyataan `UPDATE` berarti seluruhnya berhasil atau seluruhnya tidak,
   * sehingga tidak ada keadaan di mana sebagian pekerjaan orang yang
   * dinonaktifkan sudah dilepas dan sebagian belum — keadaan yang, kalau
   * transaksinya bergulung balik, tidak akan terlihat sebagai apa pun. Jumlahnya
   * kecil (satu anggota memimpin belasan baris paling banyak), jadi yang dibeli
   * bukan kecepatan melainkan ketunggalan hasilnya.
   *
   * ## Pekerjaan yang sudah `done` **ikut** dilepas
   *
   * Awalnya tidak: tanggung jawabnya sudah selesai, dan melepas PIC-nya
   * dianggap menghapus penunjuk "siapa yang mengerjakannya" dari barisnya.
   * Keputusan itu **dibalik**, dan alasannya yang membalikkannya lebih kuat:
   * `primary_pic_id` bukan kolom sejarah, ia kolom **penunjuk tanggung jawab
   * yang berjalan** — dan setelah akunnya dinonaktifkan, tidak ada lagi
   * tanggung jawab yang berjalan di sana. Riwayat "siapa mengerjakan apa"
   * tetap utuh di `activity_logs` dan `work_item_status_history` (`changed_by`),
   * yang memang tempatnya. Membiarkan kolom penunjuk menunjuk akun yang tidak
   * ada berarti daftar anggota dan kolom PIC saling bertentangan selamanya.
   *
   * ## Penerima tugas: dicabut, bukan dibiarkan
   *
   * Baris di `work_item_assignees` **dihapus**, dan itu juga pernah diputuskan
   * sebaliknya. Yang membalikkannya: baris itu bukan penanda sejarah — tidak
   * ada yang membacanya sebagai "pernah mengerjakan", yang membacanya adalah
   * daftar penerima tugas yang berjalan. Baris yang menunjuk akun nonaktif di
   * sana berarti seseorang yang tidak akan pernah membuka pekerjaan itu tetap
   * menerima notifikasinya, yaitu keluhan §5.2.8 yang sama, lewat pintu yang
   * berbeda.
   *
   * ## Versi dinaikkan hanya pada baris yang **isinya** berubah
   *
   * Pelepasan PIC menaikkan `version` pekerjaannya: barisnya memang berubah,
   * dan klien yang memegang versi lama harus ditolak saat menyimpan — yang
   * berubah bukan isian yang mereka lihat, melainkan **PIC yang mereka lihat**.
   *
   * Pencabutan penerima tugas **tidak** menaikkan `version`, karena tidak ada
   * satu pun kolom `work_items` yang berubah karenanya. Menaikkannya akan
   * menghasilkan `409` palsu bagi orang yang sedang menyunting pekerjaan itu
   * tanpa ada sesuatu pun yang berubah baginya — dan `409` palsu adalah cara
   * tercepat membuat orang berhenti mempercayai penguncian optimistis.
   */
  async releaseWithin(
    tx: DbExecutor,
    profileId: string,
    actorId: string,
  ): Promise<ReleaseResult> {
    const releasedWorkItems = await this.releaseWorkItemsWithin(
      tx,
      profileId,
      actorId,
    );

    const releasedRequests = await this.releaseRequestsWithin(
      tx,
      profileId,
      actorId,
    );

    return { workItems: releasedWorkItems, requests: releasedRequests };
  }

  /** Mengosongkan PIC dan mencabut penerima tugas pada pekerjaan. */
  private async releaseWorkItemsWithin(
    tx: DbExecutor,
    profileId: string,
    actorId: string,
  ): Promise<ReleasedWorkItem[]> {
    const picRows = await tx
      .update(workItems)
      .set({
        primaryPicId: null,
        updatedBy: actorId,
        version: sql`${workItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workItems.primaryPicId, profileId),
          isNull(workItems.deletedAt),
          isNull(workItems.archivedAt),
        ),
      )
      .returning({
        id: workItems.id,
        workNumber: workItems.workNumber,
        title: workItems.title,
        version: workItems.version,
      });

    /**
     * Penerima tugas dibaca lebih dulu, lalu dihapus.
     *
     * Membaca lebih dulu terdengar boros — satu query yang hasilnya langsung
     * dibuang — tetapi yang diambil bukan isinya melainkan **daftar id-nya**,
     * dan daftar itu yang membuat catatan auditnya bisa menyebut nomor dan
     * judul pekerjaannya. Menghapus lebih dulu lalu menebak isinya berarti
     * audit yang berbunyi "seseorang dicabut dari sesuatu".
     *
     * Syarat `deleted_at`/`archived_at`-nya **sama persis** dengan yang dipakai
     * pelepasan PIC. Kalau berbeda, ada baris yang PIC-nya dilepas tetapi
     * penerima tugasnya tertinggal — dan perbedaan aturan antara dua hal yang
     * dijelaskan sebagai satu aturan adalah tempat bug bersembunyi.
     */
    const assigneeRows = await tx
      .select({
        id: workItems.id,
        workNumber: workItems.workNumber,
        title: workItems.title,
        version: workItems.version,
      })
      .from(workItemAssignees)
      .innerJoin(workItems, eq(workItemAssignees.workItemId, workItems.id))
      .where(
        and(
          eq(workItemAssignees.profileId, profileId),
          isNull(workItems.deletedAt),
          isNull(workItems.archivedAt),
        ),
      );

    if (assigneeRows.length > 0) {
      await tx.delete(workItemAssignees).where(
        and(
          eq(workItemAssignees.profileId, profileId),
          inArray(
            workItemAssignees.workItemId,
            assigneeRows.map((row) => row.id),
          ),
        ),
      );
    }

    // Digabung per pekerjaan: satu pekerjaan bisa kehilangan PIC **dan**
    // penerima tugasnya sekaligus, dan itu satu baris di mata pembacanya.
    const merged = new Map<string, ReleasedWorkItem>();

    for (const row of picRows) {
      merged.set(row.id, { ...row, picReleased: true, assigneeRemoved: false });
    }

    for (const row of assigneeRows) {
      const existing = merged.get(row.id);

      merged.set(
        row.id,
        existing
          ? { ...existing, assigneeRemoved: true }
          : { ...row, picReleased: false, assigneeRemoved: true },
      );
    }

    const released = [...merged.values()];

    if (released.length > 0) {
      // Dicatat ke log **selain** dicatat ke `activity_logs`. Yang ini untuk
      // menjawab pertanyaan "kenapa pekerjaannya tiba-tiba tanpa PIC" dari sisi
      // teknis, sebelum ada yang membuka tabel audit — dan jumlahnya disebut,
      // karena jumlah nol dan jumlah dua belas adalah dua keadaan yang berbeda
      // bagi orang yang sedang memeriksa.
      this.logger.log(
        `Melepas ${released.length} pekerjaan dari profil ${profileId} yang dinonaktifkan.`,
      );
    }

    return released;
  }

  /** Mengosongkan penanggung jawab permintaan. */
  private async releaseRequestsWithin(
    tx: DbExecutor,
    profileId: string,
    actorId: string,
  ): Promise<ReleasedRequest[]> {
    const rows = await tx
      .update(requests)
      .set({
        assignedPicId: null,
        updatedBy: actorId,
        version: sql`${requests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(requests.assignedPicId, profileId),
          isNull(requests.deletedAt),
          isNull(requests.archivedAt),
        ),
      )
      .returning({
        id: requests.id,
        requestNumber: requests.requestNumber,
        title: requests.title,
        version: requests.version,
      });

    if (rows.length > 0) {
      this.logger.log(
        `Melepas ${rows.length} permintaan dari profil ${profileId} yang dinonaktifkan.`,
      );
    }

    return rows;
  }

  /**
   * Menulis catatan audit pelepasan. **Setelah** transaksinya berhasil.
   *
   * Satu baris per perubahan, bukan satu baris untuk seluruhnya. Menggabungkannya
   * menjadi satu baris berarti `entity_id`-nya harus menunjuk salah satu baris
   * — atau tidak menunjuk apa pun — sedangkan `activity_logs` dirancang untuk
   * dipecah per entitas: "tampilkan riwayat pekerjaan ini" adalah pertanyaan
   * yang paling sering ditanyakan kepadanya, dan satu baris gabungan tidak akan
   * muncul pada satu pun dari baris yang disebutnya.
   *
   * `actorId` di sini adalah orang yang **menonaktifkan akunnya**, bukan pemilik
   * akunnya. Itu memang yang terjadi: pekerjaan orang lain berpindah status
   * karena tindakan seseorang, dan catatan audit yang menyebut nama orang yang
   * akunnya dinonaktifkan akan menuduhnya melakukan sesuatu yang tidak ia
   * lakukan. Karena itu pelepasan adalah aksi tersendiri, terpisah dari
   * pengalihan biasa — lihat `work-items.constants.ts` dan
   * `requests.constants.ts`.
   */
  async auditReleases(
    result: ReleaseResult,
    profileId: string,
    actorId: string,
    context: { requestId: string | null; ipAddress: string | null },
  ): Promise<void> {
    for (const item of result.workItems) {
      if (item.picReleased) {
        await this.audit.record({
          actorId,
          action: WORK_ITEM_ACTIONS.picReleased,
          entityType: WORK_ITEM_ENTITY,
          entityId: item.id,
          beforeData: { primaryPicId: profileId },
          afterData: {
            primaryPicId: null,
            workNumber: item.workNumber,
            title: item.title,
            version: item.version,
            reason: 'pic_deactivated',
          },
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        });
      }

      if (item.assigneeRemoved) {
        await this.audit.record({
          actorId,
          action: WORK_ITEM_ACTIONS.assigneeReleased,
          entityType: WORK_ITEM_ENTITY,
          entityId: item.id,
          beforeData: { assigneeIds: [profileId] },
          afterData: {
            assigneeIds: [],
            workNumber: item.workNumber,
            title: item.title,
            version: item.version,
            reason: 'assignee_deactivated',
          },
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        });
      }
    }

    for (const item of result.requests) {
      await this.audit.record({
        actorId,
        action: REQUEST_ACTIONS.picReleased,
        entityType: REQUEST_ENTITY,
        entityId: item.id,
        beforeData: { assignedPicId: profileId },
        afterData: {
          assignedPicId: null,
          requestNumber: item.requestNumber,
          title: item.title,
          version: item.version,
          reason: 'pic_deactivated',
        },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });
    }
  }
}
