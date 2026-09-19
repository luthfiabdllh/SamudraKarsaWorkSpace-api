import { SetMetadata } from '@nestjs/common';

import { POLICY_KEY } from '../common/constants';
import type { PolicyName } from './matrix';

/**
 * Menamai policy yang menjaga sebuah rute. Wajib di setiap rute yang tidak
 * `@Public()`.
 *
 * Decorator ini tidak memutuskan apa pun sendiri — ia hanya menempelkan nama.
 * Yang memutuskan adalah `PolicyGuard`. Pemisahan itu disengaja: nama policy
 * harus bisa dibaca manusia dan dibandingkan dengan tabel di
 * `PRD-REVAMP.md` §7.9 tanpa perlu membaca kode guard-nya.
 *
 * Lupa memasang ini **tidak** menghasilkan rute terbuka. `PolicyBootCheck`
 * melempar error saat aplikasi menyala (`PRD-BACKEND.md` §7.1 nomor 4).
 *
 * Berkasnya tinggal di `policy/`, bukan di `common/decorators/`, karena ia
 * bagian dari sistem policy — dan `common/` tidak boleh mengimpor ke atas.
 */
export const Policy = (name: PolicyName) => SetMetadata(POLICY_KEY, name);
