import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import {
  clusters,
  divisions,
  periods,
  subunits,
} from '../database/schema/organization';
import type {
  CreateClusterDto,
  CreateDivisionDto,
  CreatePeriodDto,
  CreateSubunitDto,
  UpdateClusterDto,
  UpdateDivisionDto,
  UpdatePeriodDto,
  UpdateSubunitDto,
} from './dto/organization.dto';
import {
  ORGANIZATION_ACTIONS,
  ORGANIZATION_ERRORS,
} from './organization.constants';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

/** Satu tabel yang masih merujuk baris yang hendak dihapus. */
export interface Reference {
  readonly table: string;
  readonly count: number;
}

/**
 * Data acuan organisasi: periode, divisi, cluster, subunit.
 *
 * ## Kenapa keempatnya satu service
 *
 * Bukan karena bentuknya mirip, melainkan karena **aturannya sama**: keempatnya
 * adalah tabel yang dirujuk tabel lain, hanya boleh ditulis `owner`/`co_owner`,
 * dan tidak boleh hilang selama masih ada yang menunjuknya. Aturan yang sama di
 * empat tempat adalah aturan yang akan berbeda di salah satunya.
 *
 * ## Kenapa tidak ada penguncian optimistis di sini
 *
 * `_columns.ts` menyatakan sendiri bahwa `version()` dipasang di tabel yang
 * **bisa diedit bersamaan**, bukan di mana-mana. Keempat tabel ini hanya ditulis
 * `owner`/`co_owner`, dan tidak ada layar yang membiarkan dua orang menyunting
 * satu divisi pada saat yang sama. Menambahkan `version` di sini berarti satu
 * `UPDATE` tambahan di setiap penulisan, untuk balapan yang tidak terjadi.
 *
 * Yang **tidak** hilang karenanya: pemeriksaan kode ganda. Dua owner yang
 * membuat divisi berkode sama pada saat yang sama tetap ditolak — bukan oleh
 * pemeriksaan di aplikasi, melainkan oleh indeks unik di database, yang memang
 * satu-satunya yang tidak bisa dilewati balapan.
 *
 * ## Kenapa penghapusan menolak, bukan menghapus paksa
 *
 * `divisions` dirujuk delapan tabel, `periods` enam belas, dan sebagian besar
 * kuncinya `on delete set null`. Artinya menghapus satu divisi akan **diam-diam
 * mengosongkan** `division_id` setiap anggota dan pekerjaan yang menunjuknya —
 * tanpa error, dan tanpa cara mengetahui apa nilai sebelumnya.
 *
 * Karena itu penghapusan diperiksa lebih dulu dan dijawab `409` bila masih ada
 * yang merujuk. Ini penerapan §5.2.9 di luar jalur keuangan: gagal berisik lebih
 * baik daripada berhasil diam-diam dengan akibat yang tidak diminta.
 */
@Injectable()
export class OrganizationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Periode
  // ───────────────────────────────────────────────────────────────────────────

  listPeriods() {
    return this.db
      .select()
      .from(periods)
      .orderBy(sql`${periods.startsOn} desc`);
  }

  /**
   * Periode yang sedang berlaku.
   *
   * Hampir setiap formulir membutuhkannya dan hampir tidak ada yang boleh
   * menebaknya, jadi ia punya endpoint sendiri. Mengembalikan `null` — bukan
   * `404` — kalau belum ada yang aktif: "belum ada periode aktif" adalah keadaan
   * yang sah pada sistem yang baru dipasang, dan `404` akan membuat frontend
   * memperlakukannya sebagai kesalahan.
   */
  async getActivePeriod() {
    const rows = await this.db
      .select()
      .from(periods)
      .where(eq(periods.isActive, true))
      .limit(1);

    return rows[0] ?? null;
  }

  async createPeriod(dto: CreatePeriodDto, context: WriteContext) {
    this.assertPeriodOrder(dto.startsOn, dto.endsOn);
    await this.assertCodeFree('periods', 'code', dto.code);

    const rows = await this.db
      .insert(periods)
      .values({
        code: dto.code,
        name: dto.name,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        phase: dto.phase,
      })
      .returning();

    const created = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.periodCreated,
      'periods',
      created.id,
      {
        afterData: created,
      },
    );

    return created;
  }

  async updatePeriod(id: string, dto: UpdatePeriodDto, context: WriteContext) {
    const before = await this.findPeriod(id);

    if (dto.code !== undefined && dto.code !== before.code) {
      await this.assertCodeFree('periods', 'code', dto.code);
    }

    this.assertPeriodOrder(
      dto.startsOn ?? before.startsOn,
      dto.endsOn ?? before.endsOn,
    );

    const rows = await this.db
      .update(periods)
      .set({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.startsOn !== undefined && { startsOn: dto.startsOn }),
        ...(dto.endsOn !== undefined && { endsOn: dto.endsOn }),
        ...(dto.phase !== undefined && { phase: dto.phase }),
        updatedAt: new Date(),
      })
      .where(eq(periods.id, id))
      .returning();

    const after = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.periodUpdated,
      'periods',
      id,
      {
        beforeData: before,
        afterData: after,
      },
    );

    return after;
  }

  /**
   * Menjadikan satu periode sebagai periode aktif.
   *
   * ## Kenapa transaksi, dan kenapa urutannya begitu
   *
   * `periods_active_key` adalah indeks unik **parsial** pada `is_active`: hanya
   * satu baris yang boleh bernilai benar. Karena itu menaikkan periode baru
   * sebelum menurunkan yang lama akan ditolak database — dan urutan sebaliknya,
   * kalau gagal di tengah, meninggalkan sistem **tanpa** periode aktif sama
   * sekali.
   *
   * Keduanya hanya bisa dihindari dengan satu transaksi. Urutan di dalamnya
   * tetap menurunkan-dulu: kalau transaksinya benar, urutannya tidak terlihat
   * dari luar, tetapi urutan yang salah akan gagal pada setiap percobaan dan
   * menyisakan pesan error dari indeks yang menyesatkan.
   */
  async activatePeriod(id: string, context: WriteContext) {
    const before = await this.findPeriod(id);

    const after = await this.db.transaction(async (tx) => {
      await tx
        .update(periods)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(periods.isActive, true), ne(periods.id, id)));

      const rows = await tx
        .update(periods)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(periods.id, id))
        .returning();

      return this.mustExist(rows[0]);
    });

    await this.record(
      context,
      ORGANIZATION_ACTIONS.periodActivated,
      'periods',
      id,
      {
        beforeData: { isActive: before.isActive },
        afterData: { isActive: true, code: after.code },
      },
    );

    return after;
  }

  async removePeriod(id: string, context: WriteContext) {
    const before = await this.findPeriod(id);

    // Periode aktif tidak dihapus, dan itu bukan kehati-hatian berlebihan:
    // seluruh sistem menganggap "periode yang berlaku" selalu ada. Menghapusnya
    // membuat setiap formulir kehilangan acuan periode tanpa satu pun pesan.
    if (before.isActive) {
      throw new ConflictException({
        code: ORGANIZATION_ERRORS.activePeriod,
        title: 'Periode yang sedang aktif tidak bisa dihapus.',
        detail: 'Aktifkan periode lain lebih dulu, lalu hapus yang ini.',
      });
    }

    await this.assertNotReferenced('periods', id);

    await this.db.delete(periods).where(eq(periods.id, id));

    await this.record(
      context,
      ORGANIZATION_ACTIONS.periodDeleted,
      'periods',
      id,
      {
        beforeData: before,
      },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Divisi · Cluster · Subunit
  // ───────────────────────────────────────────────────────────────────────────

  listDivisions() {
    return this.db
      .select()
      .from(divisions)
      .orderBy(asc(divisions.sortOrder), asc(divisions.name));
  }

  listClusters() {
    return this.db
      .select()
      .from(clusters)
      .orderBy(asc(clusters.sortOrder), asc(clusters.name));
  }

  listSubunits() {
    return this.db
      .select()
      .from(subunits)
      .orderBy(asc(subunits.sortOrder), asc(subunits.name));
  }

  async createDivision(dto: CreateDivisionDto, context: WriteContext) {
    await this.assertCodeFree('divisions', 'code', dto.code);

    const rows = await this.db
      .insert(divisions)
      .values({
        code: dto.code,
        name: dto.name,
        icon: dto.icon ?? null,
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    const created = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.divisionCreated,
      'divisions',
      created.id,
      { afterData: created },
    );

    return created;
  }

  async updateDivision(
    id: string,
    dto: UpdateDivisionDto,
    context: WriteContext,
  ) {
    const before = await this.findDivision(id);

    if (dto.code !== undefined && dto.code !== before.code) {
      await this.assertCodeFree('divisions', 'code', dto.code);
    }

    const rows = await this.db
      .update(divisions)
      .set({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.icon !== undefined && { icon: dto.icon ?? null }),
        ...(dto.description !== undefined && {
          description: dto.description ?? null,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedAt: new Date(),
      })
      .where(eq(divisions.id, id))
      .returning();

    const after = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.divisionUpdated,
      'divisions',
      id,
      {
        beforeData: before,
        afterData: after,
      },
    );

    return after;
  }

  async removeDivision(id: string, context: WriteContext) {
    const before = await this.findDivision(id);

    await this.assertNotReferenced('divisions', id);
    await this.db.delete(divisions).where(eq(divisions.id, id));

    await this.record(
      context,
      ORGANIZATION_ACTIONS.divisionDeleted,
      'divisions',
      id,
      {
        beforeData: before,
      },
    );
  }

  async createCluster(dto: CreateClusterDto, context: WriteContext) {
    await this.assertCodeFree('clusters', 'code', dto.code);

    const rows = await this.db
      .insert(clusters)
      .values({
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    const created = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.clusterCreated,
      'clusters',
      created.id,
      { afterData: created },
    );

    return created;
  }

  async updateCluster(
    id: string,
    dto: UpdateClusterDto,
    context: WriteContext,
  ) {
    const before = await this.findCluster(id);

    if (dto.code !== undefined && dto.code !== before.code) {
      await this.assertCodeFree('clusters', 'code', dto.code);
    }

    const rows = await this.db
      .update(clusters)
      .set({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedAt: new Date(),
      })
      .where(eq(clusters.id, id))
      .returning();

    const after = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.clusterUpdated,
      'clusters',
      id,
      {
        beforeData: before,
        afterData: after,
      },
    );

    return after;
  }

  async removeCluster(id: string, context: WriteContext) {
    const before = await this.findCluster(id);

    await this.assertNotReferenced('clusters', id);
    await this.db.delete(clusters).where(eq(clusters.id, id));

    await this.record(
      context,
      ORGANIZATION_ACTIONS.clusterDeleted,
      'clusters',
      id,
      {
        beforeData: before,
      },
    );
  }

  async createSubunit(dto: CreateSubunitDto, context: WriteContext) {
    await this.assertCodeFree('subunits', 'code', dto.code);

    const rows = await this.db
      .insert(subunits)
      .values({
        code: dto.code,
        name: dto.name,
        villageName: dto.villageName ?? null,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    const created = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.subunitCreated,
      'subunits',
      created.id,
      { afterData: created },
    );

    return created;
  }

  async updateSubunit(
    id: string,
    dto: UpdateSubunitDto,
    context: WriteContext,
  ) {
    const before = await this.findSubunit(id);

    if (dto.code !== undefined && dto.code !== before.code) {
      await this.assertCodeFree('subunits', 'code', dto.code);
    }

    const rows = await this.db
      .update(subunits)
      .set({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.villageName !== undefined && {
          villageName: dto.villageName ?? null,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedAt: new Date(),
      })
      .where(eq(subunits.id, id))
      .returning();

    const after = this.mustExist(rows[0]);

    await this.record(
      context,
      ORGANIZATION_ACTIONS.subunitUpdated,
      'subunits',
      id,
      {
        beforeData: before,
        afterData: after,
      },
    );

    return after;
  }

  async removeSubunit(id: string, context: WriteContext) {
    const before = await this.findSubunit(id);

    await this.assertNotReferenced('subunits', id);
    await this.db.delete(subunits).where(eq(subunits.id, id));

    await this.record(
      context,
      ORGANIZATION_ACTIONS.subunitDeleted,
      'subunits',
      id,
      {
        beforeData: before,
      },
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pemeriksaan bersama
  // ───────────────────────────────────────────────────────────────────────────

  private async findPeriod(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select()
      .from(periods)
      .where(eq(periods.id, id))
      .limit(1);

    return this.mustFound(rows[0], 'Periode');
  }

  private async findDivision(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select()
      .from(divisions)
      .where(eq(divisions.id, id))
      .limit(1);

    return this.mustFound(rows[0], 'Divisi');
  }

  private async findCluster(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select()
      .from(clusters)
      .where(eq(clusters.id, id))
      .limit(1);

    return this.mustFound(rows[0], 'Cluster');
  }

  private async findSubunit(id: string) {
    this.assertUuid(id);

    const rows = await this.db
      .select()
      .from(subunits)
      .where(eq(subunits.id, id))
      .limit(1);

    return this.mustFound(rows[0], 'Subunit');
  }

  /**
   * Menolak id yang bukan UUID sebelum ia sampai ke database.
   *
   * `id` bertipe `uuid`, dan PostgreSQL menolak `'abc'` dengan `22P02` — yang
   * sampai ke pemanggil sebagai `500`. Artinya permintaan yang jelas salah
   * bentuk tercatat sebagai **kesalahan server**, dan itu dua kerugian
   * sekaligus: pemantauan error dipenuhi hal yang bukan error, dan yang benar
   * benar error tenggelam di antaranya.
   *
   * Jawabannya `404`, bukan `400`, dan itu memang yang paling tepat: id yang
   * bukan UUID **tidak mungkin ada**. Tidak ada bedanya bagi pemanggil antara
   * "tidak ada baris dengan id itu" dan "id itu bahkan tidak berbentuk id".
   * Keduanya sama-sama berarti "tidak ada apa-apa di sini".
   */
  private assertUuid(id: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw new NotFoundException({
        code: ORGANIZATION_ERRORS.notFound,
        title: 'Data tidak ditemukan.',
      });
    }
  }

  /**
   * Menolak periode yang berakhir sebelum dimulai.
   *
   * Diperiksa di service, bukan di skema Zod, karena hanya di sini kedua
   * nilainya diketahui bersama. Pada `PATCH`, salah satunya boleh tidak dikirim
   * — dan `z.refine` hanya bisa memeriksa yang ada di badan permintaan, sehingga
   * `{ endsOn: <lebih awal> }` akan lolos validasi lalu tersimpan.
   */
  private assertPeriodOrder(startsOn: Date, endsOn: Date): void {
    if (endsOn.getTime() <= startsOn.getTime()) {
      throw new ConflictException({
        code: ORGANIZATION_ERRORS.periodOrder,
        title: 'Tanggal selesai harus setelah tanggal mulai.',
      });
    }
  }

  /**
   * Menolak kode yang sudah dipakai.
   *
   * Pemeriksaan ini **tidak** menggantikan indeks unik, dan tidak dimaksudkan
   * begitu. Ia ada supaya jawabannya `409` dengan pesan yang bisa dibaca, bukan
   * error `23505` dari PostgreSQL. Balapan dua permintaan yang bersamaan tetap
   * dimenangkan indeksnya — dan itu memang pembatas yang sebenarnya.
   *
   * Nama tabel dan kolomnya berupa teks, bukan objek kolom Drizzle, karena
   * keempat pemanggilnya memakai tabel yang berbeda dan keempatnya ingin
   * jawaban yang sama. Menulisnya sebagai teks membuat satu pemeriksaan ini
   * cukup untuk semuanya — dan `sql.identifier` mengutipnya, jadi tidak ada
   * yang dirangkai mentah ke dalam SQL.
   */
  private async assertCodeFree(
    table: string,
    column: string,
    code: string,
  ): Promise<void> {
    const found = await this.db.execute(sql`
      select 1
      from ${sql.identifier(table)}
      where ${sql.identifier(column)} = ${code}
      limit 1
    `);

    if (found.rows.length > 0) {
      throw new ConflictException({
        code: ORGANIZATION_ERRORS.duplicateCode,
        title: `Kode "${code}" sudah dipakai.`,
        detail: 'Kode harus unik karena dipakai untuk merujuk data ini.',
      });
    }
  }

  /**
   * Mencari seluruh tabel yang masih merujuk sebuah baris.
   *
   * ## Kenapa ditanyakan ke database, bukan ditulis di kode
   *
   * `periods` dirujuk enam belas tabel dan `divisions` delapan. Daftar sepanjang
   * itu di dalam kode adalah daftar yang akan tertinggal setiap kali ada tabel
   * baru — dan yang tertinggal bukan sekadar kurang rapi: ia membuat
   * penghapusan lolos pada tabel yang tidak diperiksa, lalu mengosongkan kolom
   * di sana lewat `on delete set null`.
   *
   * `pg_constraint` tidak pernah tertinggal. Ia **adalah** definisinya. Ini
   * prinsip yang sama dengan `PolicyBootCheck`: penegakan lewat struktur, bukan
   * lewat disiplin.
   *
   * Nama tabel dan kolom di bawah berasal dari katalog PostgreSQL, bukan dari
   * pemanggil, sehingga aman dirangkai sebagai identifier — dan `sql.identifier`
   * mengutipnya, jadi tabel bernama aneh pun tidak menjadi masalah. Nilai `id`
   * tetap dikirim sebagai parameter, seperti semua nilai lain.
   */
  private async findReferences(
    table: string,
    id: string,
  ): Promise<Reference[]> {
    const fks = await this.db.execute(sql`
      select src.relname as table_name, att.attname as column_name
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and tgt.relname = ${table}
        and array_length(con.conkey, 1) = 1
    `);

    // `execute` mengembalikan baris bertipe `Record<string, unknown>`. Bentuk
    // sesungguhnya ditentukan katalog PostgreSQL di atas, bukan oleh tipe yang
    // bisa diperiksa TypeScript — jadi penyempitannya dilakukan di sini, sekali,
    // dengan jarak sependek mungkin dari query-nya.
    const foreignKeys = fks.rows as unknown as {
      table_name: string;
      column_name: string;
    }[];

    const references: Reference[] = [];

    for (const fk of foreignKeys) {
      const counted = await this.db.execute(sql`
        select count(*)::int as n
        from ${sql.identifier(fk.table_name)}
        where ${sql.identifier(fk.column_name)} = ${id}
      `);

      const row = counted.rows[0] as unknown as { n: number } | undefined;
      const count = Number(row?.n ?? 0);

      if (count > 0) {
        references.push({ table: fk.table_name, count });
      }
    }

    return references;
  }

  private async assertNotReferenced(table: string, id: string): Promise<void> {
    const references = await this.findReferences(table, id);

    if (references.length === 0) {
      return;
    }

    // Rinciannya ikut dikirim supaya frontend bisa menyebutkan yang mana —
    // "masih dipakai 3 anggota dan 5 pekerjaan" jauh lebih berguna daripada
    // "masih dipakai". Nama tabelnya tetap nama tabel: menerjemahkannya di sini
    // berarti menaruh kamus label di backend, dan keputusan 47 menaruhnya di
    // frontend.
    throw new ConflictException({
      code: ORGANIZATION_ERRORS.stillReferenced,
      title: 'Data ini masih dipakai dan tidak bisa dihapus.',
      detail:
        'Pindahkan atau hapus dulu data yang menunjuknya, lalu coba lagi. ' +
        'Menghapusnya sekarang akan mengosongkan rujukan itu tanpa pemberitahuan.',
      references,
    });
  }

  private mustFound<T>(row: T | undefined, label: string): T {
    if (!row) {
      // 404, bukan 403 — §7.3. Membalas 403 akan memberi tahu pemanggil bahwa
      // barisnya ada, dan itu satu-satunya hal yang tidak perlu ia ketahui.
      //
      // 404 juga yang benar untuk pengguna yang tidak berhak, dan itu bukan
      // kebetulan: pada data acuan organisasi, "tidak ada" dan "tidak untukmu"
      // memang harus tidak bisa dibedakan dari luar. Yang berhak menulis hanya
      // `owner`/`co_owner`, dan mereka melihat seluruh daftarnya lewat `list` —
      // jadi tidak ada kasus sah di mana seseorang perlu tahu bahwa sebuah
      // divisi ada tetapi tidak boleh ia lihat.
      throw new NotFoundException({
        code: ORGANIZATION_ERRORS.notFound,
        title: `${label} tidak ditemukan.`,
      });
    }

    return row;
  }

  private mustExist<T>(row: T | undefined): T {
    if (!row) {
      // Tidak mungkin terjadi: `RETURNING` selalu mengembalikan baris yang baru
      // saja ditulis. Kalau toh terjadi, lebih baik gagal berisik daripada
      // mengembalikan `undefined` yang menjalar ke pemanggil.
      throw new Error('Penulisan tidak mengembalikan baris');
    }

    return row;
  }

  private async record(
    context: WriteContext,
    action: string,
    entityType: string,
    entityId: string,
    data: {
      beforeData?: unknown;
      afterData?: unknown;
    },
  ): Promise<void> {
    await this.audit.record({
      actorId: context.actorId,
      action,
      entityType,
      entityId,
      beforeData: (data.beforeData ?? null) as Record<string, unknown> | null,
      afterData: (data.afterData ?? null) as Record<string, unknown> | null,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }
}
