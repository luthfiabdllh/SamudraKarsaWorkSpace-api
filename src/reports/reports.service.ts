import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';

import { DRIZZLE } from '../database/database.constants';
import * as collaboration from '../database/schema/collaboration';
import * as organization from '../database/schema/organization';
import * as work from '../database/schema/work';
import { StorageService } from '../storage/storage.service';

const EXPORTABLE_TABLES: Record<string, PgTableWithColumns<any>> = {
  profiles: organization.profiles,
  work_items: work.workItems,
  requests: work.requests,
  milestones: work.milestones,
  meetings: collaboration.meetings,
};

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly storage: StorageService,
  ) {}

  async exportTable(tableName: string) {
    const table = EXPORTABLE_TABLES[tableName];
    if (!table) {
      throw new NotFoundException(
        `Ekspor untuk tabel ${tableName} tidak didukung.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const orderByColumn = table.createdAt ?? table.id;

    const list = await this.db
      .select()
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .orderBy(desc(orderByColumn));

    if (list.length === 0) {
      throw new NotFoundException('Tidak ada data untuk diekspor.');
    }

    // Ambil header dari row pertama
    const firstRow = list[0] as Record<string, unknown>;
    const headers = Object.keys(firstRow);

    // Konversi ke CSV
    const csvRows = [headers.join(',')];
    for (const row of list) {
      const record = row as Record<string, unknown>;
      const values = headers.map((header) => {
        const val = record[header];
        if (val === null || val === undefined) return '';
        // Hindari bentrok koma dalam teks
        const str =
          typeof val === 'object' && val !== null
            ? JSON.stringify(val)
            : // eslint-disable-next-line @typescript-eslint/no-base-to-string
              String(val);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\n');
    const fileName = `exports/${tableName}-${Date.now()}.csv`;

    const url = await this.storage.uploadAndGetDownloadUrl(
      fileName,
      csvContent,
      'text/csv',
      3600, // presigned 1 jam
    );

    return { url };
  }
}
