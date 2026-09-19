/**
 * State machine sebagai data — aturan yang tidak dimiliki `sksks` sama sekali.
 *
 * ## Masalah yang dipecahkan
 *
 * `docs/INVENTARIS-ATURAN.md` §3 mencatatnya sebagai temuan terpenting kedua
 * setelah matriks izin: **tidak ada satu pun aturan transisi.** Kolom status
 * adalah enum biasa, dan nilai apa pun boleh berpindah ke nilai apa pun.
 * `draft` bisa langsung menjadi `done` tanpa melewati satu pun syarat
 * perjalanan. Yang ada hanyalah pencatatan **setelah** kejadian
 * (`work_item_status_history`), bukan penolakan **sebelum** kejadian.
 *
 * ## Kenapa tabelnya ada di database
 *
 * Karena aturan ini dibaca **dua sisi**: backend untuk menolak, frontend untuk
 * menentukan tombol mana yang boleh muncul. Aturannya sendiri ada di
 * `src/database/schema/system.ts` → `status_transitions`; isinya di
 * `src/database/sql/status_transitions_seed.sql`.
 *
 * ## Pembagian tugas yang disengaja
 *
 * Berkas ini dan `workflow.service.ts` tahu **aturannya**. Modul domain
 * (`work-items`, `requests`) tahu **tabelnya**. Yang pertama tidak pernah
 * menulis baris, yang kedua tidak pernah memutuskan bentuk aturannya.
 *
 * Itu bukan pembagian administratif. Kalau aturan transisi ditulis di dalam
 * `WorkItemsService`, maka `RequestsService` akan menyalinnya — atau menulis
 * versinya sendiri, dan cepat atau lambat keduanya berbeda. Setelah berbeda,
 * tidak ada lagi satu tempat yang bisa ditunjuk sebagai "aturan yang berlaku".
 */

/**
 * Jenis entitas yang punya state machine.
 *
 * Berupa teks pendek yang **sama persis** dengan `status_transitions.entity_type`
 * dan dengan `activity_logs.entity_type`, sehingga satu baris audit dan satu
 * baris aturan transisi bisa dirujuk dengan nama yang sama.
 *
 * Nilainya belum lengkap: `letter`, `budget`, `content`, dan `creative` juga
 * akan punya state machine, dan ditambahkan saat modulnya dibangun (Fase 4).
 * Menambahkannya di sini lebih dulu berarti menuliskan aturan untuk tabel yang
 * belum ada — dan aturan yang belum bisa dijalankan tidak pernah diuji.
 */
export const TRANSITION_ENTITY = {
  workItem: 'work_item',
  request: 'request',
  letter: 'letter',
  budget: 'budget',
  content: 'content',
  creative: 'creative',
  partner: 'partner',
  logistics: 'logistics',
} as const;

export type TransitionEntityType =
  (typeof TRANSITION_ENTITY)[keyof typeof TRANSITION_ENTITY];

/**
 * Kode galat transisi.
 *
 * Bahasa Inggris dan bertitik (keputusan 47): `code` dibaca **program** —
 * frontend memetakannya ke kalimat Indonesia, dan klien lain memakainya untuk
 * bercabang. `title` dan `detail` yang dibaca manusia, dan keduanya Indonesia.
 */
export const WORKFLOW_ERRORS = {
  /** `to` tidak ada sebagai tujuan dari status sekarang — untuk peran apa pun. */
  unknownTransition: 'unknown_transition',
  /** Transisinya ada, tetapi tidak untuk peran aktor ini. */
  roleNotAllowed: 'transition_role_not_allowed',
  /** Transisinya sah dan perannya boleh, tetapi ada kolom yang belum diisi. */
  missingFields: 'transition_fields_required',
  /** Pekerjaan dan permintaan asalnya belum sepakat (keputusan 49). */
  syncConflict: 'sync_conflict_unresolved',
} as const;
