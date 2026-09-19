import { z } from 'zod';

import { ZodDto } from '../../common/decorators/zod-dto.decorator';
import { MIN_PASSWORD_LENGTH } from '../auth.constants';

/**
 * Batas atas panjang password.
 *
 * Bukan kerapian: argon2 memproses seluruh masukannya, sehingga password
 * sepanjang satu megabita akan menyibukkan CPU fungsi serverless selama
 * beberapa detik. Batas ini menutup jalan itu tanpa mengganggu siapa pun —
 * tidak ada password sungguhan yang panjangnya 256 karakter.
 */
const MAX_PASSWORD_LENGTH = 256;

/**
 * Permintaan masuk dengan Google.
 *
 * **`credential` berisi ID token mentah dari Google**, bukan klaim yang sudah
 * diurai. BFF meneruskan `id_token` dari callback OAuth apa adanya; backend
 * yang memverifikasi tanda tangannya, `aud`, `iss`, dan `exp`-nya.
 *
 * Versi sebelumnya menerima `{email, emailVerified, sub}` sebagai JSON biasa,
 * dan bentuk itu **tidak boleh dikembalikan**: ketiganya teks yang bisa ditulis
 * siapa saja, sehingga siapa pun bisa membuat sesi owner dengan mengirim
 * `{"email": "<email owner>", "emailVerified": true, "sub": "apa saja"}`.
 * Yang tidak bisa dipalsukan hanyalah tanda tangan Google — karena itu yang
 * diterima adalah benda yang ditandatangani.
 *
 * Panjang minimumnya bukan hiasan: ID token Google selalu berupa JWT dengan
 * tiga bagian, dan menolak yang lebih pendek dari ini di batas masuk membuat
 * verifikatornya tidak pernah menerima masukan yang jelas bukan token.
 */
export const GoogleLoginSchema = z.object({
  credential: z
    .string()
    .min(100, 'ID token Google tampak terlalu pendek untuk berupa JWT.')
    .max(8192),
});

@ZodDto(GoogleLoginSchema)
export class GoogleLoginDto {
  declare credential: string;
}

/**
 * Permintaan masuk dengan password.
 *
 * Batas panjangnya sama dengan password baru, dan `password` sengaja **tidak**
 * punya aturan panjang minimum di sini. Password lama yang pendek tetap harus
 * bisa dipakai untuk masuk — menolaknya di validasi akan mengunci anggota yang
 * passwordnya dibuat sebelum aturan ini ada, dan pesannya akan menyesatkan
 * ("password terlalu pendek") padahal yang salah adalah passwordnya.
 */
export const PasswordLoginSchema = z.object({
  email: z.email('Alamat surel tidak sah.'),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

@ZodDto(PasswordLoginSchema)
export class PasswordLoginDto {
  declare email: string;
  declare password: string;
}

/**
 * Permintaan ganti password.
 *
 * `newPassword` minimum 12 karakter — ini satu-satunya tempat aturan itu
 * ditegakkan, dan ia berlaku untuk password **baru** saja.
 *
 * Tidak ada aturan "harus memuat angka dan simbol". Aturan seperti itu
 * terdengar seperti keamanan, tetapi mendorong orang ke pola yang justru mudah
 * ditebak (`Password1!`), dan panjang adalah satu-satunya syarat yang terbukti
 * menaikkan biaya menebak.
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    )
    .max(MAX_PASSWORD_LENGTH),
});

@ZodDto(ChangePasswordSchema)
export class ChangePasswordDto {
  declare currentPassword: string;
  declare newPassword: string;
}
