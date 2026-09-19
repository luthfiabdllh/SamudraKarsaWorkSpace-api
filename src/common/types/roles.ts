/**
 * Kosakata peran — satu-satunya definisi di seluruh repo.
 *
 * Diletakkan di `common/`, bukan di `policy/`, karena tiga lapisan berbeda
 * memakainya: identitas (`AuthenticatedUser`), penegakan izin (`policy/`), dan
 * setiap modul domain nanti. Kalau ia tinggal di `policy/`, maka `common/`
 * harus mengimpor ke atas hanya untuk menamai medan `roles` pada request —
 * dan arah ketergantungannya jadi terbalik.
 *
 * Perannya sendiri berasal dari `PRD-REVAMP.md` §7.9.
 */
export type Role = 'owner' | 'co_owner' | 'kadiv' | 'member';

/**
 * Urutannya adalah urutan kekuasaan, dari terluas ke tersempit.
 *
 * Urutan ini dipakai saat satu akun memegang lebih dari satu peran dan perlu
 * ditentukan mana yang mewakilinya. Karena itu jangan diurutkan ulang menurut
 * abjad.
 */
export const ROLES = [
  'owner',
  'co_owner',
  'kadiv',
  'member',
] as const satisfies readonly Role[];
