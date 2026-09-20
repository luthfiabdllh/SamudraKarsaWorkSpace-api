import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import { notifications } from '../database/schema/collaboration';
import type { Actor } from '../policy/resource';

@Injectable()
export class NotificationsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async list(actor: Actor, since?: string) {
    const conditions: SQL[] = [eq(notifications.recipientId, actor.id)];

    if (since) {
      conditions.push(gt(notifications.createdAt, new Date(since)));
    }

    const rows = await this.db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        kind: notifications.kind,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50); // Batasi agar tidak terlalu banyak jika without since

    return rows;
  }

  // Notifikasi jarang di-create lewat API langsung oleh user, biasanya via service internal / event bus
  // Fungsi markAsRead di-update via PATCH atau endpoint khusus,
  // namun untuk requirement minimal saat ini kita biarkan fungsi read-only.
}
