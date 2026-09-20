import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { systemSettings } from '../database/schema/organization';
import type { WriteContext } from '../profiles/profiles.service';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db.select().from(systemSettings);

    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return settings;
  }

  async update(key: string, value: unknown, context: WriteContext) {
    // Cari yang lama untuk keperluan log
    const [existing] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));

    if (!existing) {
      throw new NotFoundException(
        `Pengaturan dengan key '${key}' tidak ditemukan.`,
      );
    }

    const [updated] = await this.db
      .update(systemSettings)
      .set({
        value: sql`${value}::jsonb`,
        updatedAt: new Date(),
        updatedBy: context.actorId,
      })
      .where(eq(systemSettings.key, key))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      action: 'update',
      entityType: 'system_settings',
      entityId: key,
      beforeData: existing,
      afterData: updated,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });

    return updated;
  }
}
