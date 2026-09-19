import type { Request } from 'express';

/**
 * Alamat IP pemanggil, untuk penghitung batas laju.
 *
 * ## Kenapa `x-forwarded-for` dibaca lebih dulu, dan kenapa yang paling kiri
 *
 * Topologinya adalah: browser → BFF Next.js → backend. Artinya backend
 * **tidak pernah** melihat alamat IP penggunanya; yang ia lihat adalah alamat
 * BFF. Kalau penghitung per-IP memakai `request.ip`, seluruh pengguna akan
 * berbagi satu penghitung — dan batas lima percobaan per IP akan mengunci
 * seluruh organisasi sekaligus.
 *
 * Karena itu yang dibaca adalah entri **paling kiri** dari `x-forwarded-for`,
 * yaitu alamat yang diteruskan BFF dari permintaan aslinya. BFF adalah milik
 * kita sendiri, jadi isinya bisa dipercaya — sejauh BFF memang yang mengisinya.
 *
 * ## Batas yang perlu disadari
 *
 * Header itu datang dari pemanggil, dan alamat backend di Vercel bisa dijangkau
 * langsung tanpa lewat BFF. Pemanggil yang langsung bisa mengarang isinya dan
 * menghindari batas per-IP.
 *
 * Yang menahan itu bukan header ini, melainkan penghitung **per akun** yang
 * berjalan berdampingan dengannya — ia tidak bisa dikarang, karena kuncinya
 * adalah alamat surel yang sedang dicoba. Ini alasan kedua batas itu dipasang
 * bersama-sama, bukan salah satu saja.
 *
 * Kalau suatu saat alamat IP ini dipakai untuk memutuskan **izin** dan bukan
 * sekadar membatasi laju, kepercayaan pada header ini harus ditinjau ulang
 * lebih dulu — batas laju yang bocor tidak berbahaya, keputusan izin yang bocor
 * berbahaya.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];

  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  if (typeof raw === 'string') {
    const first = raw.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  // `request.ip` bisa `undefined` kalau Express-nya tidak punya `trust proxy`
  // dan soketnya sudah tertutup. Bukan kegagalan: pemanggilnya memperlakukan
  // `null` sebagai "tidak ada alamat", dan penghitung per-IP cukup dilewati.
  return request.ip ?? null;
}

/**
 * Membaca satu nilai dari header `Cookie`.
 *
 * Ditulis sendiri alih-alih memakai `cookie-parser`, dan itu bukan penolakan
 * terhadap pustaka: parser penuh harus menangani penyandian, tanda kutip, dan
 * atribut cookie yang tidak pernah dikirim klien ke sini. Yang dibutuhkan
 * hanyalah satu nilai yang **kita sendiri** yang membuatnya — token base64url
 * 43 karakter, tanpa karakter yang perlu disandikan.
 *
 * Parser sendiri yang mengurai lebih banyak daripada yang dibutuhkan adalah
 * parser yang punya jalur yang tidak pernah diuji.
 */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;

  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();

      return value.length > 0 ? value : null;
    }
  }

  return null;
}

/**
 * Mengambil access token dari header `Authorization`.
 *
 * Hanya dari header — **tidak** dari cookie. Yang memanggil backend ini adalah
 * BFF lewat permintaan server-ke-server; ia membaca cookienya sendiri lalu
 * memasang header ini. Menambahkan jalur kedua untuk token yang sama akan
 * menggandakan tempat yang harus diperiksa saat menelusuri masalah auth.
 */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (typeof header !== 'string') {
    return null;
  }

  const [scheme, ...rest] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  const token = rest.join(' ').trim();

  return token.length > 0 ? token : null;
}
