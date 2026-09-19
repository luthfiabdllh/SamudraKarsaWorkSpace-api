import type { Role } from '../common/types/roles';
import {
  FINANCE_DIVISION_CODE,
  canChangePic,
  canDeleteWorkItem,
  canEditWorkItem,
  canExportFinance,
  canReadFeedback,
  canReadFinance,
  canTransitionRequest,
  canTransitionWorkItem,
  isDivisionLead,
  leadsDivisionOf,
  type Actor,
  type FeedbackForPolicy,
  type PolicyResult,
  type RequestForPolicy,
  type WorkItemForPolicy,
} from './resource';

/**
 * Uji policy resource-scoped.
 *
 * ## Kenapa berkas ini ada, padahal tes ditunda
 *
 * Keputusan 7 menunda **tes sebagai gerbang mutu**, dan penundaan itu tetap
 * berlaku: tidak ada uji integrasi, tidak ada uji end-to-end baru, dan tidak ada
 * ambang cakupan. Yang ada di sini bukan itu.
 *
 * `docs/INVENTARIS-ATURAN.md` §14.1 dan `src/policy/matrix.ts` sama-sama
 * menuliskan satu syarat yang tidak bisa dipenuhi dengan cara lain: **setiap
 * fungsi policy yang memeriksa "kepala divisi baris ini" wajib punya uji yang
 * memakai aktor `division_deputy`.** Alasannya ada di kedua tempat itu, dan
 * ringkasnya begini — `division_deputy` adalah peran yang hilang tanpa suara.
 * Fungsi yang hanya memeriksa `division_head` tidak gagal kompilasi, tidak
 * melempar error, dan tidak muncul di log. Ia hanya diam-diam mencabut wewenang
 * seluruh wakil kepala divisi, dan tidak ada yang tahu sampai ada wakil kepala
 * divisi yang mengeluh — kalau ia tahu bahwa ia seharusnya boleh.
 *
 * Sebuah komentar tidak bisa menahan itu. Uji bisa.
 *
 * ## Yang diuji di sini bukan semuanya
 *
 * Yang diuji adalah **percabangan yang keputusannya diperdebatkan**: siapa yang
 * boleh atas baris siapa, dan kapan konflik menutup transisi. Yang tidak diuji
 * adalah hal yang sudah dijaga tipe — misalnya bahwa nilai yang tidak ada di enum
 * tidak bisa dikirim. Menulis uji untuk sesuatu yang tidak bisa gagal hanya
 * menambah kode yang harus dibaca saat mencari yang gagal.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Penolong
// ─────────────────────────────────────────────────────────────────────────────

const OWNER: Actor = { id: 'p-owner', roles: ['owner'], divisionCodes: [] };

const CO_OWNER: Actor = {
  id: 'p-coowner',
  roles: ['co_owner'],
  divisionCodes: [],
};

/** Kepala divisi Media Kreatif. */
const HEAD_MEDKRE: Actor = {
  id: 'p-head-medkre',
  roles: ['division_head'],
  divisionCodes: ['medkre'],
};

/** Wakil kepala divisi Media Kreatif — aktor yang paling mudah kehilangan hak. */
const DEPUTY_MEDKRE: Actor = {
  id: 'p-deputy-medkre',
  roles: ['division_deputy'],
  divisionCodes: ['medkre'],
};

/** Kepala divisi Sekretaris & Bendahara. */
const HEAD_SEKBEND: Actor = {
  id: 'p-head-sekbend',
  roles: ['division_head'],
  divisionCodes: [FINANCE_DIVISION_CODE],
};

/** Anggota biasa di Media Kreatif — perhatikan `divisionCodes` yang kosong. */
const MEMBER: Actor = { id: 'p-member', roles: ['member'], divisionCodes: [] };

const OTHER_MEMBER: Actor = {
  id: 'p-other',
  roles: ['member'],
  divisionCodes: [],
};

/** Satu akun yang memegang dua peran sekaligus, dengan peran lemah lebih dulu. */
const MEMBER_THEN_CO_OWNER: Actor = {
  id: 'p-member-coowner',
  roles: ['member', 'co_owner'],
  divisionCodes: [],
};

const workItem = (
  overrides: Partial<WorkItemForPolicy> = {},
): WorkItemForPolicy => ({
  id: 'w-1',
  type: 'task',
  status: 'in_progress',
  divisionCode: 'medkre',
  primaryPicId: null,
  createdBy: null,
  assigneeIds: [],
  syncConflictAt: null,
  ...overrides,
});

const request = (
  overrides: Partial<RequestForPolicy> = {},
): RequestForPolicy => ({
  id: 'r-1',
  status: 'draft',
  requesterId: null,
  targetDivisionCode: 'medkre',
  // Ditulis eksplisit meski bawaannya `null` — sama seperti `primaryPicId` di
  // atas. Tanpa baris ini medannya hanya datang dari `...overrides`, dan
  // `Partial` membuatnya bertipe `string | null | undefined`; yang membuat
  // seluruh literalnya tidak lagi bisa ditugaskan ke `RequestForPolicy`.
  assignedPicId: null,
  syncConflictAt: null,
  ...overrides,
});

const feedback = (
  overrides: Partial<FeedbackForPolicy> = {},
): FeedbackForPolicy => ({
  id: 'f-1',
  authorId: null,
  isPrivate: false,
  ...overrides,
});

const allowed = (result: PolicyResult): boolean => result.effect === 'allow';

const reasonOf = (result: PolicyResult): string =>
  result.effect === 'deny' ? result.reason : 'allow';

// ─────────────────────────────────────────────────────────────────────────────

describe('peran kepala divisi', () => {
  it('memperlakukan division_deputy setara division_head', () => {
    expect(isDivisionLead(HEAD_MEDKRE)).toBe(true);
    expect(isDivisionLead(DEPUTY_MEDKRE)).toBe(true);
  });

  it('mengenali keduanya sebagai pemimpin divisi yang sama', () => {
    expect(leadsDivisionOf(HEAD_MEDKRE, 'medkre')).toBe(true);
    expect(leadsDivisionOf(DEPUTY_MEDKRE, 'medkre')).toBe(true);
  });

  it('tidak mengenali anggota biasa sebagai pemimpin, walau di divisi itu', () => {
    // `divisionCodes` anggota biasa kosong — inilah yang membuat pemeriksaan
    // keuangan di bawah tidak bisa dilewati hanya karena berada di sekbend.
    expect(leadsDivisionOf(MEMBER, 'medkre')).toBe(false);
    expect(leadsDivisionOf(MEMBER, null)).toBe(false);
  });

  it('tidak mengenali kepala divisi lain sebagai pemimpin divisi ini', () => {
    expect(leadsDivisionOf(HEAD_SEKBEND, 'medkre')).toBe(false);
    expect(leadsDivisionOf(HEAD_MEDKRE, 'sekbend')).toBe(false);
  });
});

describe('canEditWorkItem', () => {
  it('mengizinkan owner dan co-owner atas pekerjaan divisi mana pun', () => {
    expect(allowed(canEditWorkItem(OWNER, workItem()))).toBe(true);
    expect(allowed(canEditWorkItem(CO_OWNER, workItem()))).toBe(true);
  });

  it('mengizinkan kepala divisi atas pekerjaan divisinya', () => {
    expect(allowed(canEditWorkItem(HEAD_MEDKRE, workItem()))).toBe(true);
  });

  it('mengizinkan wakil kepala divisi atas pekerjaan divisinya', () => {
    // Uji ini yang menahan `division_deputy` agar tidak hilang dari fungsi ini.
    expect(allowed(canEditWorkItem(DEPUTY_MEDKRE, workItem()))).toBe(true);
  });

  it('menolak kepala divisi lain atas pekerjaan divisi ini', () => {
    expect(allowed(canEditWorkItem(HEAD_SEKBEND, workItem()))).toBe(false);
  });

  it('mengizinkan pembuat, PIC, dan penerima tugas mengubah pekerjaannya', () => {
    expect(
      allowed(canEditWorkItem(MEMBER, workItem({ createdBy: MEMBER.id }))),
    ).toBe(true);
    expect(
      allowed(canEditWorkItem(MEMBER, workItem({ primaryPicId: MEMBER.id }))),
    ).toBe(true);
    expect(
      allowed(canEditWorkItem(MEMBER, workItem({ assigneeIds: [MEMBER.id] }))),
    ).toBe(true);
  });

  it('menolak anggota yang bukan pembuat, PIC, maupun penerima tugas', () => {
    const result = canEditWorkItem(MEMBER, workItem());
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('not_creator_pic_or_assignee');
  });

  it('menolak siapa pun yang bukan pemimpin saat divisi pekerjaan kosong', () => {
    expect(
      allowed(canEditWorkItem(HEAD_MEDKRE, workItem({ divisionCode: null }))),
    ).toBe(false);
  });

  it('memakai peran mana pun yang dimiliki aktor, bukan hanya yang pertama', () => {
    // `member` lebih dulu di daftar perannya, dan `member` tidak boleh menghapus.
    // Yang menyelamatkannya adalah `co_owner` di urutan kedua — jadi pencarian
    // peran harus menelusuri seluruh daftar, bukan membaca yang pertama.
    expect(allowed(canDeleteWorkItem(MEMBER_THEN_CO_OWNER, workItem()))).toBe(
      true,
    );
    expect(allowed(canDeleteWorkItem(MEMBER, workItem()))).toBe(false);
  });
});

describe('canDeleteWorkItem', () => {
  it('mengizinkan owner, co-owner, dan pemimpin divisi', () => {
    expect(allowed(canDeleteWorkItem(OWNER, workItem()))).toBe(true);
    expect(allowed(canDeleteWorkItem(HEAD_MEDKRE, workItem()))).toBe(true);
    expect(allowed(canDeleteWorkItem(DEPUTY_MEDKRE, workItem()))).toBe(true);
  });

  it('menolak anggota, bahkan yang membuat pekerjaannya sendiri', () => {
    // §7.9 memberi `member` tanda ❌ pada baris DELETE. Berbeda dari canEdit.
    expect(allowed(canDeleteWorkItem(MEMBER, workItem()))).toBe(false);
    expect(
      allowed(canDeleteWorkItem(MEMBER, workItem({ createdBy: MEMBER.id }))),
    ).toBe(false);
  });
});

describe('canChangePic', () => {
  it('mengizinkan pemimpin divisi — kepala maupun wakilnya', () => {
    expect(allowed(canChangePic(HEAD_MEDKRE, workItem()))).toBe(true);
    expect(allowed(canChangePic(DEPUTY_MEDKRE, workItem()))).toBe(true);
  });

  it('mengizinkan anggota mengklaim task yang belum punya PIC', () => {
    expect(
      allowed(
        canChangePic(MEMBER, workItem({ type: 'task', primaryPicId: null })),
      ),
    ).toBe(true);
  });

  it('menolak anggota mengklaim task yang sudah punya PIC', () => {
    expect(
      allowed(
        canChangePic(MEMBER, workItem({ primaryPicId: OTHER_MEMBER.id })),
      ),
    ).toBe(false);
  });

  it('menolak anggota mengklaim pekerjaan yang bukan task', () => {
    const item = workItem({ type: 'program_need', primaryPicId: null });
    expect(allowed(canChangePic(MEMBER, item))).toBe(false);
  });
});

describe('canTransitionWorkItem', () => {
  it('menutup transisi saat konflik sinkronisasi menyala', () => {
    const conflicted = workItem({ syncConflictAt: new Date() });

    const result = canTransitionWorkItem(
      HEAD_MEDKRE,
      conflicted,
      'need_review',
    );
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('sync_conflict_unresolved');
  });

  it('menutup transisi karena konflik bahkan bagi owner', () => {
    // Keputusan 49 sengaja tidak memberi jalan pintas kepada siapa pun. Kalau
    // owner bisa melewatinya, jalan tercepat menyelesaikan konflik adalah
    // mengabaikannya.
    const conflicted = workItem({ syncConflictAt: new Date() });
    expect(allowed(canTransitionWorkItem(OWNER, conflicted, 'done'))).toBe(
      false,
    );
  });

  it('tidak menghalangi penulisan ulang status yang sama', () => {
    const conflicted = workItem({
      status: 'on_hold',
      syncConflictAt: new Date(),
    });
    expect(
      allowed(canTransitionWorkItem(HEAD_MEDKRE, conflicted, 'on_hold')),
    ).toBe(true);
  });

  it('mengikuti wewenang canEditWorkItem saat tidak ada konflik', () => {
    expect(
      allowed(canTransitionWorkItem(DEPUTY_MEDKRE, workItem(), 'done')),
    ).toBe(true);
    expect(allowed(canTransitionWorkItem(MEMBER, workItem(), 'done'))).toBe(
      false,
    );
  });
});

describe('canTransitionRequest', () => {
  it('mengizinkan owner dan co-owner atas semua transisi', () => {
    const submitted = request({ status: 'submitted' });
    expect(allowed(canTransitionRequest(OWNER, submitted, 'rejected'))).toBe(
      true,
    );
    expect(allowed(canTransitionRequest(CO_OWNER, submitted, 'done'))).toBe(
      true,
    );
  });

  it('mengizinkan pemimpin divisi tujuan — kepala maupun wakilnya', () => {
    const submitted = request({ status: 'submitted' });
    expect(
      allowed(canTransitionRequest(HEAD_MEDKRE, submitted, 'accepted')),
    ).toBe(true);
    expect(
      allowed(canTransitionRequest(DEPUTY_MEDKRE, submitted, 'accepted')),
    ).toBe(true);
  });

  it('menolak pemimpin divisi yang bukan divisi tujuan', () => {
    const submitted = request({ status: 'submitted' });
    expect(
      allowed(canTransitionRequest(HEAD_SEKBEND, submitted, 'accepted')),
    ).toBe(false);
  });

  it('mengizinkan anggota mengajukan draft miliknya sendiri', () => {
    const draft = request({ status: 'draft', requesterId: MEMBER.id });
    expect(allowed(canTransitionRequest(MEMBER, draft, 'submitted'))).toBe(
      true,
    );
  });

  it('menolak anggota mengajukan draft milik orang lain', () => {
    // Pengetatan yang disengaja atas §7.9 — lihat doc-comment fungsinya.
    const draft = request({ status: 'draft', requesterId: OTHER_MEMBER.id });
    const result = canTransitionRequest(MEMBER, draft, 'submitted');
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('not_request_requester');
  });

  it('menolak anggota memindahkan status selain draft → submitted', () => {
    const submitted = request({ status: 'submitted', requesterId: MEMBER.id });
    expect(allowed(canTransitionRequest(MEMBER, submitted, 'accepted'))).toBe(
      false,
    );
    expect(allowed(canTransitionRequest(MEMBER, submitted, 'done'))).toBe(
      false,
    );
  });

  it('menolak draft milik sendiri ke status selain submitted', () => {
    const draft = request({ status: 'draft', requesterId: MEMBER.id });
    const result = canTransitionRequest(MEMBER, draft, 'rejected');
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('transition_not_allowed');
  });

  it('menutup transisi saat konflik sinkronisasi menyala, bagi semua peran', () => {
    const conflicted = request({
      status: 'submitted',
      syncConflictAt: new Date(),
    });

    expect(allowed(canTransitionRequest(OWNER, conflicted, 'accepted'))).toBe(
      false,
    );
    expect(allowed(canTransitionRequest(HEAD_MEDKRE, conflicted, 'done'))).toBe(
      false,
    );
  });
});

describe('canReadFinance', () => {
  it('mengizinkan owner dan co-owner', () => {
    expect(allowed(canReadFinance(OWNER))).toBe(true);
    expect(allowed(canReadFinance(CO_OWNER))).toBe(true);
  });

  it('mengizinkan pemimpin Sekretaris & Bendahara — kepala maupun wakilnya', () => {
    expect(allowed(canReadFinance(HEAD_SEKBEND))).toBe(true);
    expect(
      allowed(canReadFinance({ ...HEAD_SEKBEND, roles: ['division_deputy'] })),
    ).toBe(true);
  });

  it('menolak pemimpin divisi lain dan seluruh anggota', () => {
    // Di `sksks` kelima tabel keuangan terbuka untuk setiap anggota aktif
    // (temuan #2). Ini perubahan yang paling tajam di seluruh revamp.
    expect(allowed(canReadFinance(HEAD_MEDKRE))).toBe(false);
    expect(allowed(canReadFinance(MEMBER))).toBe(false);
  });

  it('menolak anggota yang berada di divisi sekbend tapi bukan pemimpinnya', () => {
    // `divisionCodes` hanya terisi untuk pemimpin divisi. Kalau suatu saat
    // pengisiannya berubah, uji ini yang menangkapnya.
    const memberInSekbend: Actor = {
      id: 'p-member-sekbend',
      roles: ['member'],
      divisionCodes: [],
    };
    expect(allowed(canReadFinance(memberInSekbend))).toBe(false);
  });

  it('menolak peran pemimpin yang tidak punya divisi sama sekali', () => {
    const stranded: Actor = {
      id: 'p-stranded',
      roles: ['division_head'],
      divisionCodes: [],
    };
    expect(allowed(canReadFinance(stranded))).toBe(false);
  });
});

describe('canExportFinance', () => {
  it('mengizinkan owner dan co-owner saja', () => {
    expect(allowed(canExportFinance(OWNER))).toBe(true);
    expect(allowed(canExportFinance(CO_OWNER))).toBe(true);
  });

  it('menolak kepala Sekretaris & Bendahara', () => {
    // §7.9 memberi ❌ pada baris ini — satu-satunya tempat kepala divisi
    // dipisahkan dari orang yang memimpin divisinya.
    const result = canExportFinance(HEAD_SEKBEND);
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('not_owner_or_co_owner');
  });
});

describe('canReadFeedback', () => {
  it('mengizinkan owner dan co-owner membaca yang privat', () => {
    const privat = feedback({ isPrivate: true, authorId: OTHER_MEMBER.id });
    expect(allowed(canReadFeedback(OWNER, privat))).toBe(true);
    expect(allowed(canReadFeedback(CO_OWNER, privat))).toBe(true);
  });

  it('mengizinkan anggota membaca yang tidak privat', () => {
    expect(allowed(canReadFeedback(MEMBER, feedback()))).toBe(true);
  });

  it('mengizinkan penulis membaca masukannya sendiri yang privat', () => {
    const own = feedback({ isPrivate: true, authorId: MEMBER.id });
    expect(allowed(canReadFeedback(MEMBER, own))).toBe(true);
  });

  it('menolak anggota lain membaca masukan privat', () => {
    const privat = feedback({ isPrivate: true, authorId: OTHER_MEMBER.id });
    const result = canReadFeedback(MEMBER, privat);
    expect(allowed(result)).toBe(false);
    expect(reasonOf(result)).toBe('private_feedback_not_author');
  });

  it('menolak kepala divisi membaca masukan privat, termasuk divisinya sendiri', () => {
    // Disengaja: masukan privat yang bisa dibaca pihak yang dikritik berhenti
    // menjadi masukan. §7.9 memberi ❌ pada baris ini untuk kepala divisi.
    const privat = feedback({ isPrivate: true, authorId: OTHER_MEMBER.id });
    expect(allowed(canReadFeedback(HEAD_MEDKRE, privat))).toBe(false);
    expect(allowed(canReadFeedback(DEPUTY_MEDKRE, privat))).toBe(false);
  });

  it('menolak penulis anonim — masukan tanpa penulis hanya untuk owner/co-owner', () => {
    const anonym = feedback({ isPrivate: true, authorId: null });
    expect(allowed(canReadFeedback(MEMBER, anonym))).toBe(false);
    expect(allowed(canReadFeedback(OWNER, anonym))).toBe(true);
  });
});

describe('bentuk penolakan', () => {
  it('selalu 404, tidak pernah 403 — §7.3', () => {
    const denials: PolicyResult[] = [
      canEditWorkItem(MEMBER, workItem()),
      canDeleteWorkItem(MEMBER, workItem()),
      canChangePic(MEMBER, workItem({ type: 'milestone', primaryPicId: 'x' })),
      canReadFinance(MEMBER),
      canExportFinance(HEAD_SEKBEND),
      canReadFeedback(MEMBER, feedback({ isPrivate: true, authorId: 'x' })),
    ];

    for (const result of denials) {
      expect(result.effect).toBe('deny');
      if (result.effect === 'deny') {
        expect(result.status).toBe(404);
      }
    }
  });

  it('membawa alasan mesin, bukan pesan untuk pengguna', () => {
    // Alasannya berakhir di log dan audit; klien hanya menerima "Tidak
    // ditemukan". Sebuah `reason` yang berbentuk kalimat akan cepat atau lambat
    // dikirim ke klien oleh seseorang yang mengira itu pesan error.
    const result = canReadFinance(MEMBER);
    expect(reasonOf(result)).toBe('not_finance_division_lead');
    expect(reasonOf(result)).toMatch(/^[a-z_]+$/);
  });
});

describe('peran yang tidak dikenal', () => {
  it('tidak memberi izin apa pun', () => {
    // Peran datang dari klaim token, dan klaim token tidak dijamin TypeScript —
    // itu alasan yang sama dengan yang membuat `PolicyGuard` menutup cabang
    // `never`-nya dengan penolakan, bukan dengan tebakan.
    //
    // `as unknown as Role[]` — bukan `as unknown as Role`. Yang dipalsukan di
    // sini adalah **isinya sebuah daftar**, jadi yang harus dinyatakan sebagai
    // `Role` adalah elemennya, bukan daftarnya. Bentuk sebelumnya menyatakan
    // seluruh daftar sebagai satu peran, dan itu tidak pernah lolos pemeriksaan
    // tipe: `tsconfig.build.json` mengecualikan berkas spec, sehingga
    // `npm run build` tidak pernah melihatnya — tetapi `tsc --noEmit` dan
    // pemeriksaan tipe di CI mana pun akan berhenti di baris ini.
    const ghost: Actor = {
      id: 'p-ghost',
      roles: ['not_a_role'] as unknown as Role[],
      divisionCodes: ['medkre'],
    };

    expect(allowed(canEditWorkItem(ghost, workItem()))).toBe(false);
    expect(allowed(canReadFinance(ghost))).toBe(false);
    expect(allowed(canDeleteWorkItem(ghost, workItem()))).toBe(false);
    expect(allowed(canExportFinance(ghost))).toBe(false);
  });
});
