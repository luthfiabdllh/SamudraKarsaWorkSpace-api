import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, isNotNull, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';

import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { DRIZZLE } from '../database/database.constants';
import * as collaboration from '../database/schema/collaboration';
import * as content from '../database/schema/content';
import * as finance from '../database/schema/finance';
import * as internal from '../database/schema/internal';
import * as letters from '../database/schema/letters';
import * as operations from '../database/schema/operations';
import * as partners from '../database/schema/partners';
import * as work from '../database/schema/work';
import type { WriteContext } from '../profiles/profiles.service';

/**
 * Daftar tabel yang mendukung fitur Soft Delete (hidingColumns).
 * Mendaftarkannya secara eksplisit mencegah penyerang mengirimkan nama tabel
 * sensitif (seperti `profiles` atau `secrets`) ke endpoint ini.
 */
const TRASHABLE_TABLES: Record<string, PgTableWithColumns<any>> = {
  meetings: collaboration.meetings,
  meeting_decisions: collaboration.meetingDecisions,
  calendar_events: collaboration.calendarEvents,
  feedback: internal.feedback,
  announcements: collaboration.announcements,

  work_items: work.workItems,
  requests: work.requests,
  milestones: work.milestones,

  letters: letters.letters,
  finance_transactions: finance.transactions,
  inventory_items: operations.inventoryItems,
  logistics_trips: operations.trips,
  partners: partners.partners,
  content_posts: content.contentItems,
};

@Injectable()
export class RecycleBinService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(tableName: string) {
    const table = this.resolveTable(tableName);

    // Any column can be read, but we just need id, deletedAt, and generic fields
    // Because schema types are dynamic, we just select all or partial fields manually.
    const rows = await this.db
      .select()
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .where(isNotNull(table.deletedAt))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .orderBy(desc(table.deletedAt))
      .limit(100);

    return rows;
  }

  async restore(tableName: string, id: string, context: WriteContext) {
    const table = this.resolveTable(tableName);

    const rows = await this.db
      .update(table)
      .set({
        deletedAt: null,
        // Kita juga tambahkan updatedAt jika tersedia di tabel ini (semua tabel soft delete pasti punya timestamps)
        updatedAt: new Date(),
        version: sql`${table.version} + 1`,
      })
      .where(eq(table.id, id))
      .returning();

    if (rows.length === 0) {
      throw new NotFoundException(
        `Baris ${id} di tabel ${tableName} tidak ditemukan atau tidak di tong sampah.`,
      );
    }

    const restoredRow = rows[0];

    await this.audit.record({
      actorId: context.actorId,
      action: 'restore',
      entityType: tableName,
      entityId: id,
      afterData: restoredRow,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });

    return restoredRow;
  }

  async permanentlyDelete(
    tableName: string,
    id: string,
    passwordToVerify: string,
    context: WriteContext,
  ) {
    // 1. Verifikasi re-auth password melalui AuthService
    await this.auth.verifyReauthPassword(context.actorId, passwordToVerify);

    const table = this.resolveTable(tableName);

    // 2. Lakukan Hard Delete
    const rows = await this.db
      .delete(table)
      .where(eq(table.id, id))
      .returning();

    if (rows.length === 0) {
      throw new NotFoundException(
        `Baris ${id} di tabel ${tableName} tidak ditemukan.`,
      );
    }

    const deletedRow = rows[0];

    // 3. Catat di audit log bahwa data ini dihancurkan selamanya
    await this.audit.record({
      actorId: context.actorId,
      action: 'hard_delete',
      entityType: tableName,
      entityId: id,
      beforeData: deletedRow,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });

    return { deleted: true, id };
  }

  private resolveTable(tableName: string) {
    const table = TRASHABLE_TABLES[tableName];
    if (!table) {
      throw new NotFoundException(
        `Tabel ${tableName} tidak ditemukan atau tidak mendukung Recycle Bin.`,
      );
    }
    return table;
  }
}
