/**
 * Kosakata peran — satu-satunya definisi di seluruh repo.
 *
 * Diletakkan di `common/`, bukan di `policy/`, karena tiga lapisan berbeda
 * memakainya: identitas (`AuthenticatedUser`), penegakan izin (`policy/`), dan
 * setiap modul domain nanti. Kalau ia tinggal di `policy/`, maka `common/`
 * harus mengimpor ke atas hanya untuk menamai medan `roles` pada request —
 * dan arah ketergantungannya jadi terbalik.
 *
 * ## Bahasanya Inggris, dan itu keputusan
 *
 * Nilai-nilai di bawah adalah **kosakata penyimpanan dan kontrak**: yang
 * tersimpan di database, yang dikirim di JSON, dan yang dipakai kode. Label
 * yang dilihat pengguna tetap Indonesia (`division_head` ditampilkan sebagai
 * "Kadiv") — UI berbahasa Indonesia sepenuhnya, sesuai keputusan 15.
 *
 * Alasannya bukan selera. `sksks` mencampur keduanya: nama tabelnya Inggris
 * (`work_items`, `letters`) sementara nilai enum-nya Indonesia (`diajukan`,
 * `menunggu_ttd`). Justru campuran itu yang menyulitkan — seseorang harus
 * menguasai dua bahasa untuk membaca satu baris. Satu bahasa di lapisan
 * penyimpanan, satu bahasa di lapisan tampilan, dan tidak ada pencampuran di
 * keduanya.
 *
 * ## Limanya, bukan empatnya
 *
 * `PRD-REVAMP.md` §7.9 semula menyebut **empat** peran. Repo ini memakai
 * **lima**, dan itu keputusan sadar dari inventaris Fase 1 (keputusan 46).
 *
 * Alasannya ada di `sksks`. Di sana peran tidak pernah muat dalam satu kolom:
 * `app_role` hanya berisi `owner`, `co_owner`, `member`, sementara kepala
 * divisi hidup di kolom terpisah `profiles.division_role` berisi `kadiv` dan
 * `wakadiv`. Jadi sistem yang berjalan sebenarnya punya lima tingkat, dan
 * wakil kepala divisi adalah salah satunya.
 *
 * Menyatukannya ke `division_head` berarti membuang informasi yang sudah ada
 * di data, dan tidak bisa dikembalikan setelahnya. Karena itu ia dipertahankan
 * sebagai peran kelima, **dengan wewenang yang untuk sekarang sama persis
 * dengan `division_head`** — persis seperti `is_division_lead()` di `sksks`
 * yang memperlakukan keduanya identik. Yang didapat bukan wewenang berbeda
 * hari ini, melainkan kemampuan membedakannya nanti tanpa migrasi data.
 */
export type Role =
  'owner' | 'co_owner' | 'division_head' | 'division_deputy' | 'member';

/**
 * Urutannya adalah urutan kekuasaan, dari terluas ke tersempit.
 *
 * Urutan ini dipakai saat satu akun memegang lebih dari satu peran dan perlu
 * ditentukan mana yang mewakilinya. Karena itu jangan diurutkan ulang menurut
 * abjad — `division_deputy` berada di antara `division_head` dan `member`
 * karena ia wakil kepala divisi, bukan sekadar anggota.
 */
export const ROLES = [
  'owner',
  'co_owner',
  'division_head',
  'division_deputy',
  'member',
] as const satisfies readonly Role[];
