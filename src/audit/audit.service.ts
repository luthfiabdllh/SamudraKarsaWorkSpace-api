import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { activityLogs } from '../database/schema/system';

/**
 * Satu baris catatan audit.
 *
 * `entityId` wajib meski terdengar aneh untuk peristiwa seperti "login gagal":
 * kolomnya `notNull` di database, dan mengendurkannya demi beberapa peristiwa
 * akan membuat kolomnya jadi opsional untuk semuanya. Untuk login yang gagal,
 * yang menjadi entitasnya adalah profil yang **dicoba** dimasuki — bukan
 * aktornya, karena untuk percobaan yang gagal aktornya justru tidak diketahui.
 */
export interface AuditEntry {
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly beforeData?: Record<string, unknown> | null;
  readonly afterData?: Record<string, unknown> | null;
  readonly requestId?: string | null;
  readonly ipAddress?: string | null;
}

/**
 * Menulis ke `activity_logs`.
 *
 * Dipisahkan dari `AuthService` karena audit bukan urusan auth — ia dipakai
 * setiap modul yang mengubah keadaan. Menaruhnya di dalam auth berarti modul
 * berikutnya akan menyalinnya, lalu salinannya menyimpang.
 *
 * ## Kenapa kegagalan menulis audit tidak menggagalkan permintaan
 *
 * Setiap metode di sini menelan error dan mencatatnya ke log. Itu keputusan
 * sadar: kalau tabel audit sedang tidak bisa ditulis, menolak login anggota
 * yang passwordnya benar adalah kerugian nyata, sedangkan kehilangan satu baris
 * catatan adalah kerugian yang terlihat di log dan bisa ditindaklanjuti.
 *
 * **Batasnya penting.** Ini berlaku untuk audit *setelah* tindakan berhasil.
 * Kalau suatu saat ada tindakan yang keamanannya **bergantung** pada tercatatnya
 * ia — dan untuk sekarang tidak ada — menelan errornya di sini akan salah.
 * Saat itu terjadi, panggil `recordOrThrow` yang belum ada di berkas ini.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(activityLogs).values({
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeData: entry.beforeData ?? null,
        afterData: entry.afterData ?? null,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Gagal menulis catatan audit ${entry.action} untuk ${entry.entityType}/${entry.entityId}`,
        error as Error,
      );
    }
  }
}
