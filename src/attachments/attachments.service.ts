import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { attachments } from '../database/schema/collaboration';
import { StorageService } from '../storage/storage.service';
import type { Actor } from '../policy/resource';
import type { RequestPresignedUrlDto } from './dto/attachments.dto';
import type { WriteContext } from '../meetings/meetings.service';

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async listByEntity(entityType: string, entityId: string) {
    const rows = await this.db
      .select({
        id: attachments.id,
        entityType: attachments.entityType,
        entityId: attachments.entityId,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        fileSize: attachments.fileSize,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.entityType, entityType),
          eq(attachments.entityId, entityId),
          isNull(attachments.deletedAt),
        ),
      );

    return rows;
  }

  async getUploadUrl(
    dto: RequestPresignedUrlDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const key = `attachments/${dto.entityType}/${dto.entityId}/${randomUUID()}-${dto.fileName}`;
    const contentType = dto.mimeType ?? 'application/octet-stream';

    const url = await this.storage.getPresignedUploadUrl(key, contentType);

    const [row] = await this.db
      .insert(attachments)
      .values({
        entityType: dto.entityType,
        entityId: dto.entityId,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        storagePath: key,
        uploadedBy: actor.id,
      })
      .returning({ id: attachments.id });

    if (!row) throw new Error('Gagal membuat lampiran');

    await this.audit.record({
      ...context,
      action: 'create',
      entityType: 'attachments',
      entityId: row.id,
      afterData: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        fileName: dto.fileName,
      },
    });

    return { uploadUrl: url, attachmentId: row.id };
  }

  async getDownloadUrl(id: string, actor: Actor, context: WriteContext) {
    const row = await this.db
      .select({ storagePath: attachments.storagePath })
      .from(attachments)
      .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!row) {
      throw new NotFoundException(`Lampiran ${id} tidak ditemukan`);
    }

    const url = await this.storage.getPresignedDownloadUrl(row.storagePath);

    await this.audit.record({
      ...context,
      action: 'read',
      entityType: 'attachments',
      entityId: id,
    });

    return { downloadUrl: url };
  }

  async remove(id: string, actor: Actor, context: WriteContext) {
    const current = await this.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
      .limit(1)
      .then((res) => res[0]);

    if (!current) {
      throw new NotFoundException(`Lampiran ${id} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(eq(attachments.id, id));

      await this.audit.record({
        ...context,
        action: 'delete',
        entityType: 'attachments',
        entityId: id,
      });
    });
  }
}
