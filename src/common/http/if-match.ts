import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

import { IF_MATCH_HEADER } from '../constants';

/**
 * Pembacaan `If-Match` untuk penguncian optimistis (§7.16).
 *
 * ## Bentuk yang diterima
 *
 * RFC 9110 menyatakan `If-Match` berisi daftar *entity-tag*, masing-masing
 * dalam tanda kutip dan boleh berawalan `W/` untuk tag lemah:
 *
 * ```
 * If-Match: "3"
 * If-Match: W/"3"
 * ```
 *
 * Yang dikirim frontend kemungkinan besar `"3"` atau `3`. Menerima keduanya
 * lebih murah daripada memaksa satu bentuk dan menegakkannya di setiap klien —
 * dan **menolak** bentuk yang tidak dikenal, bukan mengabaikannya. Header yang
 * salah bentuk lalu diabaikan berarti setiap penulisan berjalan **tanpa**
 * penguncian, sementara pemanggilnya mengira sudah memakainya. Itu justru
 * keadaan yang paling berbahaya: pengaman yang tampak terpasang.
 *
 * ## Kenapa `W/` diterima meski versinya kuat
 *
 * Versi di sini bilangan bulat, jadi tidak ada perbedaan kuat/lemah yang
 * sesungguhnya. Yang penting adalah **angkanya sampai**, bukan pungtuasinya.
 * Menolak `W/"3"` hanya akan membuat sebagian klien gagal karena alasan yang
 * tidak berarti apa-apa bagi mereka.
 */
export const INVALID_IF_MATCH = 'invalid_if_match';

const ETAG_PATTERN = /^(?:W\/)?"?(\d{1,15})"?$/;

/**
 * Membaca versi yang diharapkan dari header `If-Match`.
 *
 * Mengembalikan `null` kalau headernya **tidak ada** — dan itu bukan kesalahan
 * di sini, karena tidak setiap endpoint menuntutnya. Yang menuntutnya adalah
 * service-nya, yang tahu apakah penulisan itu memang bisa bertabrakan.
 *
 * Header yang **ada** tetapi tidak bisa dibaca selalu `400`. Diam-diam
 * memperlakukannya sebagai "tidak ada" berarti penguncian yang gagal dibedakan
 * dari penguncian yang tidak diminta — dan pemanggil tidak akan pernah tahu.
 */
export function parseIfMatch(request: Request): number | null {
  // Dibaca sebagai `unknown`, bukan sebagai `string | string[] | undefined`.
  // `request.headers` bertipe longgar, dan mempercayai tipenya di sini berarti
  // mempercayai bahwa tidak ada perantara yang mengubah bentuk header sebelum
  // sampai — persis asumsi yang tidak boleh dibuat untuk nilai yang menentukan
  // apakah sebuah penulisan diizinkan berjalan.
  const raw: unknown = request.headers[IF_MATCH_HEADER];

  if (raw === undefined) {
    return null;
  }

  // Beberapa header `If-Match` sekaligus berarti kliennya mengirim sesuatu yang
  // tidak pernah kita minta. Ditolak, bukan digabung: menggabung berarti
  // menebak mana yang dimaksud.
  if (typeof raw !== 'string') {
    throw invalidIfMatch();
  }

  const value = raw.trim();

  if (value === '') {
    return null;
  }

  const matched = ETAG_PATTERN.exec(value);

  if (!matched?.[1]) {
    throw invalidIfMatch();
  }

  return Number(matched[1]);
}

function invalidIfMatch(): BadRequestException {
  return new BadRequestException({
    code: INVALID_IF_MATCH,
    title: 'Header If-Match tidak bisa dibaca.',
    detail:
      'Isinya harus versi baris yang kamu baca, misalnya "3". ' +
      'Ambil dari medan `version` pada jawaban sebelumnya.',
  });
}

/**
 * Menuntut `If-Match`, dan menolak permintaan yang tidak membawanya.
 *
 * `428 Precondition Required` (RFC 6585 §3) — bukan `400`. Bedanya penting:
 * `400` berarti "permintaanmu salah", sedangkan `428` berarti "permintaanmu
 * benar, tetapi kamu harus mengirimkannya secara bersyarat". Klien yang
 * menerima `400` akan mencari kesalahan pada isinya; klien yang menerima `428`
 * tahu persis apa yang kurang.
 *
 * `code` diambil dari modul pemanggil supaya pesannya bisa menyebut data apa
 * yang sedang diperebutkan — "profil sudah berubah" lebih berguna daripada
 * "data sudah berubah".
 */
export function requireIfMatch(
  request: Request,
  code: string,
  label: string,
): number {
  const version = parseIfMatch(request);

  if (version === null) {
    throw new HttpException(
      {
        code,
        title: `${label} harus disertai header If-Match.`,
        detail:
          'Sertakan versi baris yang kamu baca pada header If-Match, ' +
          'misalnya "3". Ini yang mencegah perubahanmu menimpa perubahan ' +
          'orang lain tanpa diketahui.',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }

  return version;
}
