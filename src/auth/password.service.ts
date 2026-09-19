import { Injectable, Logger } from '@nestjs/common';
import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * Hash dan verifikasi password dengan **argon2id**.
 *
 * Bukan bcrypt, dan itu keputusan yang perlu disebut: bcrypt memotong password
 * pada 72 bita dan tidak punya pertahanan terhadap penyerang yang punya GPU.
 * Argon2id memenangkan kompetisi Password Hashing dan menjadi rekomendasi
 * OWASP — dengan parameter yang membuat biaya menebaknya ditentukan oleh memori,
 * bukan hanya oleh waktu.
 *
 * Parameternya mengikuti rekomendasi OWASP:
 *
 * | Parameter | Nilai | Artinya |
 * |---|---|---|
 * | `memoryCost` | 19456 KiB (19 MiB) | biaya utama — ruang yang harus disiapkan |
 * | `timeCost` | 2 | dua lintasan |
 * | `parallelism` | 1 | satu jalur |
 *
 * Angka-angka ini **tidak** dinaikkan lebih tinggi dengan alasan "lebih aman".
 * Setiap kenaikan juga menaikkan biaya setiap login yang sah, dan di bentuk
 * serverless biaya itu dibayar pada fungsi yang dibatasi CPU. 19 MiB × dua
 * lintasan adalah titik yang disepakati untuk perangkat server biasa.
 *
 * Algoritmanya ditulis eksplisit meski ia bawaan pustakanya. Bawaan adalah
 * default yang berubah saat pustakanya naik versi; yang ini tidak.
 *
 * ## Kenapa algoritmanya berupa angka, bukan `Algorithm.Argon2id`
 *
 * `@node-rs/argon2` mendeklarasikan `Algorithm` sebagai `declare const enum` —
 * enum ambient. Dengan `isolatedModules` menyala, TypeScript menolak setiap
 * pembacaan **nilai** anggotanya, dan errornya `TS2748`: nilai anggota enum
 * ambient hanya diketahui kalau seluruh program dibaca, sedangkan
 * `isolatedModules` justru menjanjikan setiap berkas bisa dikompilasi sendiri.
 *
 * Yang diganti adalah cara membacanya, bukan `isolatedModules`-nya. Menyalakan
 * kembali pembacaan itu berarti mematikan `isolatedModules`, dan itu menyentuh
 * seluruh proyek demi satu konstanta.
 *
 * Angka `2` di bawah bukan angka ajaib. Di spesifikasi argon2 urutannya
 * `Argon2d = 0`, `Argon2i = 1`, `Argon2id = 2`, dan `@node-rs/argon2` memakai
 * urutan itu apa adanya — ia tercatat di `index.d.ts` pustakanya. Tipenya
 * diambil dari `Options['algorithm']`, sehingga kalau pustakanya suatu saat
 * mengubah angkanya, baris itu gagal dikompilasi alih-alih diam-diam menghitung
 * dengan algoritma yang berbeda.
 */
const ARGON2ID: NonNullable<Options['algorithm']> = 2;

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  /**
   * `satisfies Options` bukan hiasan.
   *
   * Tanpa itu, objek ini hanya diperiksa terhadap tipe yang **disimpulkan**
   * darinya sendiri — dan salah ketik nama kunci tidak akan ketahuan di mana
   * pun. `hash(plain, this.options)` menerima `Options`, tapi pemeriksaan
   * properti berlebih tidak berlaku untuk sebuah variabel, hanya untuk literal
   * yang langsung ditugaskan. Akibatnya `memorycost: 19456` akan lolos
   * kompilasi, diabaikan pustakanya, dan hashing berjalan dengan biaya bawaan
   * yang jauh lebih murah — tanpa satu pun error.
   */
  private readonly options = {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  } as const satisfies Options;

  async hashPassword(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  /**
   * Memverifikasi password terhadap hash-nya.
   *
   * **Mengembalikan `false`, bukan melempar.** Hash yang rusak atau kosong juga
   * menjawab `false` — bagi pemanggilnya tidak ada bedanya dengan password yang
   * salah, dan memperlakukan keduanya berbeda hanya akan membuat satu di antaranya
   * bisa dibedakan dari luar.
   */
  async verifyPassword(hashString: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashString, plain);
    } catch (error) {
      // Hash yang tidak bisa diurai berarti barisnya rusak, bukan passwordnya
      // salah. Yang rusak perlu diperbaiki orang, jadi ia masuk log.
      this.logger.error(
        'Hash password tidak bisa diverifikasi — barisnya mungkin rusak',
        error as Error,
      );
      return false;
    }
  }
}
