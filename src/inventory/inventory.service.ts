import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import {
  inventoryItems,
  inventoryMovements,
} from '../database/schema/operations';
import { profiles } from '../database/schema/organization';
import { NumberingService } from '../numbering/numbering.service';
import { canEditInventoryItem, type Actor } from '../policy/resource';
import type {
  AddMovementDto,
  CreateInventoryItemDto,
  ListInventoryQueryDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar inventaris.
   *
   * Bacaan terbuka (`inventory:read` di guard), bisa difilter kategori, periode, dan PIC.
   */
  async list(query: ListInventoryQueryDto) {
    const conditions: SQL[] = [isNull(inventoryItems.deletedAt)];
    if (query.category)
      conditions.push(eq(inventoryItems.category, query.category));
    if (query.periodId)
      conditions.push(eq(inventoryItems.periodId, query.periodId));
    if (query.picId) conditions.push(eq(inventoryItems.picId, query.picId));

    return this.db
      .select({
        id: inventoryItems.id,
        itemCode: inventoryItems.itemCode,
        name: inventoryItems.name,
        category: inventoryItems.category,
        stock: inventoryItems.stock,
        picId: inventoryItems.picId,
        picName: profiles.fullName,
        location: inventoryItems.location,
        periodId: inventoryItems.periodId,
        createdAt: inventoryItems.createdAt,
        version: inventoryItems.version,
      })
      .from(inventoryItems)
      .leftJoin(profiles, eq(inventoryItems.picId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryItems.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  /**
   * Detail barang, lengkap dengan log pergerakannya (movements).
   */
  async detail(id: string) {
    const row = await this.findOne(id);

    const movements = await this.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.inventoryItemId, id))
      .orderBy(desc(inventoryMovements.createdAt));

    return { ...row, movements };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tulis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mendaftarkan barang inventaris baru.
   * Menghasilkan nomor otomatis `INV-YYYY-#####`. Jika ada stok awal, otomatis
   * mencatat movement tipe `initial`. Semuanya berjalan dalam satu transaksi.
   */
  async create(dto: CreateInventoryItemDto, context: WriteContext) {
    const created = await this.db.transaction(async (tx) => {
      const itemCode = await this.numbering.next(tx, 'inventory_item');

      const rows = await tx
        .insert(inventoryItems)
        .values({
          itemCode,
          name: dto.name,
          category: dto.category ?? null,
          stock: dto.initialStock,
          picId: dto.picId ?? null,
          periodId: dto.periodId ?? null,
          location: dto.storageLocation ?? null,
          conditionNote: dto.note ?? null,
          version: 1,
        })
        .returning();

      // Catat pergerakan awal kalau stok > 0
      if (dto.initialStock > 0) {
        await tx.insert(inventoryMovements).values({
          inventoryItemId: rows[0]!.id,
          movementType: 'inbound',
          quantity: dto.initialStock,
          movedBy: context.actorId,
          note: 'Stok awal saat barang didaftarkan.',
        });
      }

      return rows[0]!;
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'inventory.created',
      entityType: 'inventory_item',
      entityId: created.id,
      afterData: created,
    });

    return created;
  }

  /**
   * Mengubah detail profil barang inventaris (bukan stoknya).
   */
  async update(
    id: string,
    dto: UpdateInventoryItemDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(
      canEditInventoryItem(actor, { ...row, divisionCode: null }),
    );
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(inventoryItems)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'inventory.updated',
      entityType: 'inventory_item',
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  /**
   * Soft-delete barang.
   */
  async remove(id: string, context: WriteContext) {
    const row = await this.findOne(id);
    await this.db
      .update(inventoryItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryItems.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'inventory.deleted',
      entityType: 'inventory_item',
      entityId: id,
      beforeData: row,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pergerakan (Movements)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mencatat keluar masuk barang.
   * `dto.quantity` positif artinya masuk, negatif artinya keluar.
   * Transaksi ini menolak jika stok tidak mencukupi untuk dikeluarkan.
   */
  async addMovement(
    id: string,
    dto: AddMovementDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const item = await this.findOne(id);

    // Mencegah stok menjadi negatif.
    // Ini dievaluasi secara manual di kode sebelum transaksi,
    // meski ideally bisa dicek via constraint SQL `stock >= 0`.
    if (dto.quantity < 0 && item.stock + dto.quantity < 0) {
      throw new ConflictException(
        `Stok tidak mencukupi. Tersedia: ${item.stock}, diminta keluar: ${Math.abs(dto.quantity)}.`,
      );
    }

    const movement = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(inventoryMovements)
        .values({
          inventoryItemId: id,
          movementType: dto.movementType,
          quantity: dto.quantity,
          createdAt: dto.movementDate ? new Date(dto.movementDate) : new Date(),
          movedBy: dto.movedBy ?? context.actorId,
          note: dto.note ?? null,
        })
        .returning();

      // Memperbarui total stok barang
      // Menggunakan SQL operator + untuk menjaga dari race conditions
      await tx
        .update(inventoryItems)
        .set({
          stock: sql`${inventoryItems.stock} + ${dto.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, id));

      return rows[0]!;
    });

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'inventory_movement.added',
      entityType: 'inventory_movement',
      entityId: movement.id,
      afterData: movement,
    });

    return movement;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pembantu
  // ───────────────────────────────────────────────────────────────────────────

  private async findOne(id: string) {
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), isNull(inventoryItems.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Barang ${id} tidak ditemukan.`);
    return row;
  }

  private assertAllowed(result: ReturnType<typeof canEditInventoryItem>) {
    if (result.effect === 'deny') {
      throw new NotFoundException('Barang tidak ditemukan.');
    }
  }

  private assertVersion(current: number, ifMatch: string | null) {
    if (ifMatch === null) {
      throw new PreconditionFailedException(
        'Header If-Match wajib disertakan untuk mengubah baris ini.',
      );
    }
    const expected = Number(ifMatch.replace(/"/g, ''));
    if (expected !== current) {
      throw new ConflictException(
        'Versi tidak cocok. Data telah diubah oleh orang lain.',
      );
    }
  }
}
