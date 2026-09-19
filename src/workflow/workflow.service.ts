import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Role } from '../common/types/roles';
import { DRIZZLE } from '../database/database.constants';
import { statusTransitions } from '../database/schema/system';
import {
  WORKFLOW_ERRORS,
  type TransitionEntityType,
} from './workflow.constants';

/**
 * Satu langkah yang sah dari sebuah status.
 *
 * `requiredFields` berisi **nama kolom** (`snake_case`) pada tabelnya, bukan
 * nama medan JSON. Itu disengaja: yang menyimpan daftarnya adalah tabel
 * `status_transitions`, dan tabel menyebut kolomnya dengan nama kolomnya.
 * Penerjemahan ke `camelCase` dilakukan pemanggilnya, yang memang sudah
 * memegang nama kedua bentuk itu.
 */
export interface TransitionEdge {
  readonly to: string;
  readonly requiredFields: readonly string[];
  readonly sortOrder: number;
}

/**
 * State machine — membaca aturannya, tidak menulisnya.
 *
 * ## Kenapa tidak ada cache
 *
 * Tabel `status_transitions` berisi sekitar dua puluh baris, dibaca lewat
 * indeks `(entity_type, from_status)`, dan hanya berubah kalau ada yang
 * mengubah aturan alurnya — yaitu hampir tidak pernah.
 *
 * Cache akan menghilangkan satu query kecil itu dan menggantinya dengan
 * kemungkinan bahwa aturan yang baru diubah belum berlaku sampai cache-nya
 * kedaluwarsa. Untuk aplikasi dengan `max: 1` koneksi per instans, satu query
 * berindeks pada tabel dua puluh baris bukan biaya yang perlu dihemat. Yang
 * dibeli dengan cache adalah **aturan yang basi**, dan itu justru kelas
 * kesalahan yang paling sulit ditelusuri: tombol muncul, penolakan tidak,
 * dan keduanya berasal dari aturan yang berbeda umurnya.
 *
 * Kalau nanti terbukti menjadi beban, yang benar bukan cache waktu, melainkan
 * memuatnya sekali saat boot dan menyegarkannya saat tabelnya berubah.
 *
 * ## Kenapa penyaringan peran di JavaScript, bukan di SQL
 *
 * `arrayOverlaps` bisa mengerjakannya di database. Yang membuatnya tidak
 * dipakai di sini adalah ukuran hasilnya: paling banyak lima baris per
 * pemanggilan. Menyaringnya di sini membuat aturan perannya terbaca sebagai
 * satu baris `some(...)` yang jelas, bukan sebagai operator `&&` PostgreSQL
 * yang harus dibaca dua kali untuk dipastikan artinya.
 */
@Injectable()
export class WorkflowService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Langkah-langkah yang sah dari `from`, **untuk peran ini**.
   *
   * Inilah yang mengisi `availableTransitions` di setiap respons detail
   * (`PRD-BACKEND.md` §9.1). Dikembalikan sebagai daftar status tujuan saja,
   * sesuai bentuk yang diminta §9.1 — bukan sebagai objek, supaya frontend
   * tidak punya pilihan selain memakai daftar dari backend. Di `sksks`,
   * `allowedNextRequestStatuses()` hanya dipakai di satu komponen dan
   * `REQUEST_WORKFLOW` bahkan kode mati; dengan bentuk ini aturan alurnya tidak
   * bisa lagi hidup di UI saja.
   */
  async availableFor(
    entityType: TransitionEntityType,
    from: string,
    roles: readonly Role[],
  ): Promise<TransitionEdge[]> {
    const edges = await this.edgesFrom(entityType, from, roles);

    return edges.map((edge) => ({
      to: edge.to,
      requiredFields: edge.requiredFields,
      sortOrder: edge.sortOrder,
    }));
  }

  /**
   * Daftar status tujuan saja — bentuk yang diminta `PRD-BACKEND.md` §9.1.
   *
   * Dipisahkan dari `availableFor` supaya pemanggil yang hanya butuh daftarnya
   * tidak ikut membawa `requiredFields` ke dalam bentuk jawabannya.
   */
  async availableStatuses(
    entityType: TransitionEntityType,
    from: string,
    roles: readonly Role[],
  ): Promise<string[]> {
    const edges = await this.edgesFrom(entityType, from, roles);

    return edges.map((edge) => edge.to);
  }

  /**
   * Memastikan perpindahan `from → to` sah bagi peran ini, dan kolom yang
   * dituntutnya sudah terisi.
   *
   * `values` berisi nilai **calon** untuk setiap kolom yang mungkin dituntut,
   * dengan kunci berupa nama kolom (`snake_case`). Nilainya boleh berasal dari
   * DTO, dari baris yang sekarang, atau gabungan keduanya — service pemanggil
   * yang tahu mana yang benar untuk kolomnya masing-masing.
   *
   * ## Kenapa 422, bukan 403, saat perannya tidak boleh
   *
   * Karena aktornya **sudah bisa melihat baris ini**. Ia baru sampai ke sini
   * setelah lolos `canEditWorkItem`, yang berarti barisnya bukan rahasia
   * baginya. Tidak ada yang dibocorkan dengan mengatakan "peranmu tidak bisa
   * memindahkan ke sini" — sedangkan 403 akan menyembunyikan daftar langkah
   * yang justru ia butuhkan untuk melanjutkan.
   *
   * Yang tetap 404 adalah penolakan **sebelum** barisnya diketahui, dan itu
   * dikerjakan `resource.ts`, bukan di sini.
   */
  async assertCanTransition(
    entityType: TransitionEntityType,
    from: string,
    to: string,
    roles: readonly Role[],
    values: Readonly<Record<string, unknown>>,
  ): Promise<TransitionEdge> {
    const edges = await this.edgesFrom(entityType, from, roles);

    // Dua kegagalan yang berbeda, dan dibedakan meski sama-sama 422.
    //
    // `edges` sudah tersaring peran, jadi tidak ditemukannya `to` di sana berarti
    // salah satu dari dua hal: langkahnya memang tidak ada, atau langkahnya ada
    // tetapi bukan untuk peran ini. Keduanya memberi jawaban yang sama kepada
    // pengguna — daftar langkah yang tersedia — tetapi `code`-nya berbeda, dan
    // itulah yang dibaca log dan laporan. Pemeriksaan tambahannya hanya berjalan
    // di jalur kegagalan, jadi jalur yang berhasil tidak membayarnya.
    const edge = edges.find((candidate) => candidate.to === to);

    if (!edge) {
      const allowed = edges.map((candidate) => candidate.to);
      const exists = await this.edgeExists(entityType, from, to);

      throw this.reject(
        exists
          ? WORKFLOW_ERRORS.roleNotAllowed
          : WORKFLOW_ERRORS.unknownTransition,
        exists
          ? `Peranmu tidak bisa memindahkan dari "${from}" ke "${to}".`
          : `Tidak ada langkah dari "${from}" ke "${to}".`,
        allowed.length === 0
          ? 'Tidak ada langkah berikutnya yang tersedia untukmu dari status ini.'
          : `Langkah yang tersedia: ${allowed.join(', ')}.`,
        { availableTransitions: allowed },
      );
    }

    const missing = edge.requiredFields.filter(
      (field) => !this.isFilled(values[field]),
    );

    if (missing.length > 0) {
      throw this.reject(
        WORKFLOW_ERRORS.missingFields,
        'Ada isian yang harus dilengkapi sebelum status ini bisa dipindahkan.',
        `Isi dulu: ${missing.join(', ')}.`,
        { errors: missing.map((field) => ({ field })) },
      );
    }

    return edge;
  }

  /**
   * Memastikan pasangan `from → to` ada di tabelnya, **tanpa memandang peran**.
   *
   * Dipakai untuk memeriksa bahwa aturan yang ditulis memang mencakup langkah
   * yang diminta, terpisah dari pertanyaan siapa yang boleh menjalankannya.
   * Berguna saat menelusuri masalah: "langkahnya tidak ada" dan "langkahnya ada
   * tetapi kamu tidak boleh" adalah dua hal yang berbeda, dan pesan galat yang
   * menyamakan keduanya membuat keduanya sama-sama tidak bisa diperiksa.
   */
  async edgeExists(
    entityType: TransitionEntityType,
    from: string,
    to: string,
  ): Promise<boolean> {
    const found = await this.db
      .select({ id: statusTransitions.id })
      .from(statusTransitions)
      .where(
        and(
          eq(statusTransitions.entityType, entityType),
          eq(statusTransitions.fromStatus, from),
          eq(statusTransitions.toStatus, to),
        ),
      )
      .limit(1);

    return found.length > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Isi
  // ───────────────────────────────────────────────────────────────────────────

  private async edgesFrom(
    entityType: TransitionEntityType,
    from: string,
    roles: readonly Role[],
  ): Promise<TransitionEdge[]> {
    // Peran kosong berarti tidak ada langkah yang tersedia — bukan semua
    // langkah. Sebuah token tanpa peran yang dikenali tidak boleh mendapat apa
    // pun, dan memeriksanya lebih awal membuat keadaan itu tidak bergantung
    // pada hasil query.
    if (roles.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({
        to: statusTransitions.toStatus,
        allowedRoles: statusTransitions.allowedRoles,
        requiredFields: statusTransitions.requiredFields,
        sortOrder: statusTransitions.sortOrder,
      })
      .from(statusTransitions)
      .where(
        and(
          eq(statusTransitions.entityType, entityType),
          eq(statusTransitions.fromStatus, from),
        ),
      )
      .orderBy(
        asc(statusTransitions.sortOrder),
        asc(statusTransitions.toStatus),
      );

    return rows
      .filter((row) => row.allowedRoles.some((role) => roles.includes(role)))
      .map((row) => ({
        to: row.to,
        requiredFields: row.requiredFields,
        sortOrder: row.sortOrder,
      }));
  }

  /**
   * Apakah sebuah kolom dianggap terisi.
   *
   * Teks kosong dihitung **belum terisi**, dan itu bukan kelengkapan: `check`
   * constraint di tabel `work_items` menyatakan `hold_reason <> ''` untuk alasan
   * yang sama. Kalau keduanya berbeda pendapat, yang terjadi adalah `422` di
   * sini lalu `500` dari database untuk isian yang sama — dan yang membaca
   * laporannya akan mencari kesalahan di tempat yang salah.
   *
   * `0` dan `false` dihitung **terisi**: keduanya nilai yang sah untuk kolom
   * yang mungkin dituntut suatu saat, dan memperlakukannya sebagai kosong akan
   * menolak isian yang benar.
   */
  private isFilled(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      return value.trim() !== '';
    }

    return true;
  }

  private reject(
    code: string,
    title: string,
    detail: string,
    extra: Record<string, unknown>,
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, title, detail, ...extra });
  }
}
