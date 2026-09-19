import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditService } from '../audit/audit.service';
import { DRIZZLE } from '../database/database.constants';
import { partnerFollowups, partners, sponsorBenefits } from '../database/schema/partners';
import { profiles } from '../database/schema/organization';
import { canEditPartner, type Actor } from '../policy/resource';
import { TRANSITION_ENTITY } from '../workflow/workflow.constants';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  AddBenefitDto,
  AddFollowupDto,
  CreatePartnerDto,
  ListPartnersQueryDto,
  TransitionPartnerDto,
  UpdateBenefitDto,
  UpdatePartnerDto,
} from './dto/partners.dto';

/** Konteks permintaan yang ikut dicatat ke audit. */
export interface WriteContext {
  readonly actorId: string;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class PartnersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Baca
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daftar mitra sponsorship.
   *
   * Bacaan terbuka (`partner:read` di guard), bisa disaring status, PIC, dan periode.
   */
  async list(query: ListPartnersQueryDto) {
    const conditions: SQL[] = [isNull(partners.deletedAt)];
    if (query.status) conditions.push(eq(partners.status, query.status));
    if (query.periodId) conditions.push(eq(partners.periodId, query.periodId));
    if (query.picId) conditions.push(eq(partners.picId, query.picId));

    return this.db
      .select({
        id: partners.id,
        name: partners.name,
        category: partners.category,
        status: partners.status,
        targetSupport: partners.targetSupport,
        agreedValue: partners.agreedValue,
        picId: partners.picId,
        picName: profiles.fullName,
        periodId: partners.periodId,
        createdAt: partners.createdAt,
        version: partners.version,
      })
      .from(partners)
      .leftJoin(profiles, eq(partners.picId, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(partners.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  /**
   * Detail mitra beserta riwayat followup (append-only) dan daftar kontraprestasi (benefits).
   * Juga memberikan status transisi yang sah untuk aktor saat ini.
   */
  async detail(id: string, actor: Actor) {
    const row = await this.findOne(id);

    const [followups, benefits, edges] = await Promise.all([
      this.db
        .select()
        .from(partnerFollowups)
        .where(eq(partnerFollowups.partnerId, id))
        .orderBy(desc(partnerFollowups.followedUpAt)),
      this.db
        .select()
        .from(sponsorBenefits)
        .where(eq(sponsorBenefits.partnerId, id))
        .orderBy(sponsorBenefits.createdAt),
      this.workflow.availableFor(
        TRANSITION_ENTITY.partner,
        row.status,
        actor.roles,
      ),
    ]);

    return {
      ...row,
      followups,
      benefits,
      availableTransitions: edges.map((e) => e.to),
      transitionRequirements: Object.fromEntries(
        edges
          .filter((e) => e.requiredFields.length > 0)
          .map((e) => [e.to, [...e.requiredFields]]),
      ),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tulis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Membuka hubungan / prospek mitra baru.
   */
  async create(dto: CreatePartnerDto, context: WriteContext) {
    const rows = await this.db
      .insert(partners)
      .values({
        name: dto.name,
        category: dto.category ?? null,
        industry: dto.industry ?? null,
        contactPerson: dto.contactPerson ?? null,
        contactInfo: dto.contactInfo ?? null,
        picId: dto.picId ?? null,
        relationChannel: dto.relationChannel ?? null,
        targetSupport: dto.targetSupport ?? null,
        agreedValue: dto.agreedValue ?? null,
        fundReceived: dto.fundReceived ?? '0',
        inKindSupport: dto.inKindSupport ?? null,
        programId: dto.programId ?? null,
        periodId: dto.periodId ?? null,
        status: 'prospect',
        version: 1,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'partner.created',
      entityType: TRANSITION_ENTITY.partner,
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  /**
   * Mengubah isian mitra.
   * Optimistic locking dan wewenang `canEditPartner` dijaga (mengembalikan 404 jika ditolak).
   */
  async update(
    id: string,
    dto: UpdatePartnerDto,
    ifMatch: string | null,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditPartner(actor, { ...row, divisionCode: null }));
    this.assertVersion(row.version, ifMatch);

    const updated = await this.db
      .update(partners)
      .set({ ...dto, version: row.version + 1, updatedAt: new Date() })
      .where(eq(partners.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'partner.updated',
      entityType: TRANSITION_ENTITY.partner,
      entityId: id,
      beforeData: row,
      afterData: updated[0],
    });

    return updated[0];
  }

  /**
   * Memindahkan status mitra (misal prospect -> proposal_sent).
   * Validitas status dijaga tabel state machine.
   */
  async transition(
    id: string,
    dto: TransitionPartnerDto,
    actor: Actor,
    context: WriteContext,
  ) {
    const row = await this.findOne(id);
    this.assertAllowed(canEditPartner(actor, { ...row, divisionCode: null }));

    await this.workflow.assertCanTransition(
      TRANSITION_ENTITY.partner,
      row.status,
      dto.to,
      actor.roles,
      row,
    );

    const updated = await this.db
      .update(partners)
      .set({ status: dto.to, version: row.version + 1, updatedAt: new Date() })
      .where(eq(partners.id, id))
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'partner.transitioned',
      entityType: TRANSITION_ENTITY.partner,
      entityId: id,
      beforeData: { status: row.status },
      afterData: { status: dto.to },
    });

    return updated[0];
  }

  /**
   * Menghapus (soft delete) mitra.
   */
  async remove(id: string, context: WriteContext) {
    const row = await this.findOne(id);
    await this.db
      .update(partners)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(partners.id, id));

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'partner.deleted',
      entityType: TRANSITION_ENTITY.partner,
      entityId: id,
      beforeData: row,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Followup (Append-Only)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mencatat interaksi dengan mitra.
   * Followup bersifat append-only: tidak ada PATCH atau DELETE, sesuai sifat CRM sederhana.
   */
  async addFollowup(
    id: string,
    dto: AddFollowupDto,
    actor: Actor,
    context: WriteContext,
  ) {
    await this.findOne(id);

    const rows = await this.db
      .insert(partnerFollowups)
      .values({
        partnerId: id,
        followupNote: dto.followupNote,
        followedUpBy: context.actorId,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'partner_followup.added',
      entityType: 'partner_followup',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Kontraprestasi (Benefits)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Menambahkan janji kontraprestasi ke mitra ini.
   */
  async addBenefit(
    id: string,
    dto: AddBenefitDto,
    actor: Actor,
    context: WriteContext,
  ) {
    await this.findOne(id);

    const rows = await this.db
      .insert(sponsorBenefits)
      .values({
        partnerId: id,
        benefitDescription: dto.benefitDescription,
        deadline: dto.deadline ?? null,
        status: dto.status ?? 'not_fulfilled',
        proofUrl: dto.proofUrl ?? null,
      })
      .returning();

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'sponsor_benefit.created',
      entityType: 'sponsor_benefit',
      entityId: rows[0]!.id,
      afterData: rows[0],
    });

    return rows[0];
  }

  async updateBenefit(
    id: string,
    benefitId: string,
    dto: UpdateBenefitDto,
    actor: Actor,
    context: WriteContext,
  ) {
    await this.findOne(id);

    const updated = await this.db
      .update(sponsorBenefits)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(sponsorBenefits.id, benefitId), eq(sponsorBenefits.partnerId, id)))
      .returning();

    if (!updated[0]) {
      throw new NotFoundException(`Kontraprestasi ${benefitId} tidak ditemukan.`);
    }

    return updated[0];
  }

  async removeBenefit(
    id: string,
    benefitId: string,
    actor: Actor,
    context: WriteContext,
  ) {
    await this.findOne(id);

    const deleted = await this.db
      .delete(sponsorBenefits)
      .where(and(eq(sponsorBenefits.id, benefitId), eq(sponsorBenefits.partnerId, id)))
      .returning();

    if (!deleted[0]) {
      throw new NotFoundException(`Kontraprestasi ${benefitId} tidak ditemukan.`);
    }

    await this.audit.record({
      actorId: context.actorId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      action: 'sponsor_benefit.deleted',
      entityType: 'sponsor_benefit',
      entityId: benefitId,
      beforeData: deleted[0],
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pembantu
  // ───────────────────────────────────────────────────────────────────────────

  private async findOne(id: string) {
    const rows = await this.db
      .select()
      .from(partners)
      .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException(`Mitra ${id} tidak ditemukan.`);
    return row;
  }

  private assertAllowed(result: ReturnType<typeof canEditPartner>) {
    if (result.effect === 'deny') {
      throw new NotFoundException('Mitra tidak ditemukan.');
    }
  }

  private assertVersion(current: number, ifMatch: string | null) {
    if (ifMatch === null) {
      throw new PreconditionFailedException('Header If-Match wajib disertakan untuk mengubah baris ini.');
    }
    const expected = Number(ifMatch.replace(/"/g, ''));
    if (expected !== current) {
      throw new ConflictException('Versi tidak cocok. Data telah diubah oleh orang lain.');
    }
  }
}
