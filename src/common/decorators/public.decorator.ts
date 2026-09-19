import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../constants';

/**
 * Menandai rute (atau seluruh controller) sebagai boleh diakses tanpa token.
 *
 * Daftar pemakaiannya harus tetap **pendek dan bisa ditinjau dalam satu layar**
 * (`PRD-BACKEND.md` §7.2): `/health`, `/health/ready`, dua rute auth, refresh,
 * dan `/docs`. Kalau daftar itu memanjang, itu tandanya ada yang salah.
 *
 * Yang berbahaya bukan lupa memasang `@Policy` — itu akan ditolak saat boot
 * oleh `PolicyBootCheck`. Yang berbahaya justru **`@Public()` yang salah
 * pasang**: rute terbuka tanpa peringatan apa pun.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
