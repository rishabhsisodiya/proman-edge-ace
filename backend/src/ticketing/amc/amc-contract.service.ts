import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAmcContractDto, UpdateAmcContractDto } from './dto/amc-contract.dto';

@Injectable()
export class AmcContractService {
  constructor(private readonly prisma: PrismaService) {}

  list(customerId?: string) {
    return this.prisma.amcContract.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: true, coveredEquipment: true, owningAsm: { select: { id: true, fullName: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.amcContract.findUniqueOrThrow({
      where: { id },
      include: { customer: true, coveredEquipment: true, scheduledVisits: true, owningAsm: { select: { id: true, fullName: true } } },
    });
  }

  async create(dto: CreateAmcContractDto) {
    const contract = await this.prisma.amcContract.create({
      data: {
        contractReferenceNo: dto.contractReferenceNo,
        customerId: dto.customerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        contractValue: dto.contractValue,
        visitsIncluded: dto.visitsIncluded,
        partsCoverage: dto.partsCoverage,
        scopeOfServices: dto.scopeOfServices,
        exclusions: dto.exclusions,
        owningAsmId: dto.owningAsmId,
        previousContractId: dto.previousContractId,
        signedAgreementUrl: dto.signedAgreementUrl,
        termsAndConditions: dto.termsAndConditions,
        coveredEquipment: { connect: dto.coveredEquipmentIds.map((id) => ({ id })) },
      },
      include: { customer: true, coveredEquipment: true, owningAsm: { select: { id: true, fullName: true } } },
    });
    const overlapWarnings = await this.findOverlaps(contract.id, dto.coveredEquipmentIds, dto.startDate, dto.endDate);
    await this.generateScheduledVisits(contract.id, dto.visitsIncluded, dto.startDate, dto.endDate, dto.coveredEquipmentIds, dto.visitDates);
    return { contract, overlapWarnings };
  }

  /**
   * Contract renewal (2026-08-03, client-agreed scope) — no dedicated
   * action existed before this; only a passive `previousContractId` field
   * with no automatic status handling on either side. Eligible from any
   * non-`RENEWED` status (client decision — not "Lapsed only," so a
   * Manager can renew proactively during Renewal Due/Final Notice too, not
   * just after it actually lapses). Reuses `create()` verbatim (already
   * handles `previousContractId` + scheduled-visit generation) — the new
   * contract defaults to `renewalStatus: ACTIVE` via the schema default,
   * nothing extra needed there. The old contract's terms/coverage are left
   * completely untouched — only its `renewalStatus` flips to `RENEWED`.
   */
  async renew(oldContractId: string, dto: CreateAmcContractDto) {
    const old = await this.prisma.amcContract.findUniqueOrThrow({ where: { id: oldContractId } });
    if (old.renewalStatus === 'RENEWED') {
      throw new BadRequestException('This contract has already been renewed — renew its replacement instead once that one needs it.');
    }

    const result = await this.create({ ...dto, previousContractId: oldContractId });
    await this.prisma.amcContract.update({ where: { id: oldContractId }, data: { renewalStatus: 'RENEWED' } });
    return result;
  }

  /**
   * Build plan's "scheduled_visits → auto-generate from visits_included"
   * decision, refined per client feedback (2026-07-27): the frontend now
   * sends explicit `visitDates` (one per visit, from the Visit Schedule
   * editor's Monthly/Quarterly-cadence-or-fully-custom picker) — used
   * verbatim if provided. Falls back to even-spacing across the contract
   * period only if the caller omits visitDates (API robustness, not the
   * normal UI path anymore). Equipment assignment is round-robin across
   * covered equipment either way. Only called at creation — an update()
   * doesn't regenerate (would silently discard any actualDate/status/
   * linkedTicketId already recorded on existing rows).
   */
  private async generateScheduledVisits(
    contractId: string,
    visitsIncluded: number,
    startDate: string,
    endDate: string,
    coveredEquipmentIds: string[],
    visitDates?: string[],
  ) {
    if (visitsIncluded <= 0 || coveredEquipmentIds.length === 0) return;

    let plannedDates: Date[];
    if (visitDates && visitDates.length === visitsIncluded) {
      plannedDates = visitDates.map((d) => new Date(d));
    } else {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const intervalMs = (end - start) / (visitsIncluded + 1);
      plannedDates = Array.from({ length: visitsIncluded }, (_, i) => new Date(start + intervalMs * (i + 1)));
    }

    const rows = plannedDates.map((plannedDate, i) => ({
      contractId,
      visitSeqNo: i + 1,
      plannedDate,
      equipmentId: coveredEquipmentIds[i % coveredEquipmentIds.length],
    }));
    await this.prisma.amcScheduledVisit.createMany({ data: rows });
  }

  /**
   * Manual "Generate Schedule" for contracts with zero AmcScheduledVisit rows
   * (either created before auto-generation existed, or created before this
   * client-driven Visit Schedule editor existed) — same Visit Schedule
   * editor UI submits explicit visitDates here too, reusing the exact same
   * generation logic as create(). Guarded: errors if visits already exist —
   * this is a one-time backfill, not a regenerate-and-replace action.
   */
  async generateScheduleForExisting(id: string, visitDates: string[]) {
    const contract = await this.prisma.amcContract.findUniqueOrThrow({
      where: { id },
      include: { coveredEquipment: true, scheduledVisits: true },
    });
    if (contract.scheduledVisits.length > 0) {
      throw new BadRequestException('This contract already has scheduled visits');
    }
    if (visitDates.length !== contract.visitsIncluded) {
      throw new BadRequestException(`Expected ${contract.visitsIncluded} visit dates, got ${visitDates.length}`);
    }
    await this.generateScheduledVisits(
      contract.id,
      contract.visitsIncluded,
      contract.startDate.toISOString(),
      contract.endDate.toISOString(),
      contract.coveredEquipment.map((e) => e.id),
      visitDates,
    );
    return this.findOne(id);
  }

  /** Manual reschedule of one visit (Admin/Manager) — date/notes only, doesn't touch status/linkedTicketId. */
  rescheduleVisit(visitId: string, plannedDate: string, notes?: string) {
    return this.prisma.amcScheduledVisit.update({
      where: { id: visitId },
      data: { plannedDate: new Date(plannedDate), notes, status: 'RESCHEDULED' },
    });
  }

  /**
   * Manually add one more scheduled visit to an existing contract (2026-07-27)
   * — covers "Visits Included / Year" being increased after the schedule
   * already exists, where the original count no longer matches. Appends at
   * the next visitSeqNo.
   */
  async addVisit(contractId: string, equipmentId: string, plannedDate: string) {
    const maxSeq = await this.prisma.amcScheduledVisit.aggregate({
      where: { contractId },
      _max: { visitSeqNo: true },
    });
    await this.prisma.amcScheduledVisit.create({
      data: {
        contractId,
        visitSeqNo: (maxSeq._max.visitSeqNo ?? 0) + 1,
        plannedDate: new Date(plannedDate),
        equipmentId,
      },
    });
    return this.findOne(contractId);
  }

  /**
   * Removes one scheduled visit — covers "Visits Included / Year" being
   * decreased. Blocked once a real Ticket exists for it (TICKET_RAISED) or
   * it's COMPLETED — deleting those would silently orphan real downstream
   * work; only SCHEDULED_PENDING/RESCHEDULED visits are safe to remove.
   */
  async removeVisit(visitId: string) {
    const visit = await this.prisma.amcScheduledVisit.findUniqueOrThrow({ where: { id: visitId } });
    if (visit.status === 'TICKET_RAISED' || visit.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot remove a visit that's already ${visit.status === 'TICKET_RAISED' ? 'raised a ticket' : 'completed'}`);
    }
    await this.prisma.amcScheduledVisit.delete({ where: { id: visitId } });
    return this.findOne(visit.contractId);
  }

  async update(id: string, dto: UpdateAmcContractDto) {
    const contract = await this.prisma.amcContract.update({
      where: { id },
      data: {
        contractReferenceNo: dto.contractReferenceNo,
        customerId: dto.customerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        contractValue: dto.contractValue,
        visitsIncluded: dto.visitsIncluded,
        partsCoverage: dto.partsCoverage,
        scopeOfServices: dto.scopeOfServices,
        exclusions: dto.exclusions,
        owningAsmId: dto.owningAsmId,
        previousContractId: dto.previousContractId,
        signedAgreementUrl: dto.signedAgreementUrl,
        termsAndConditions: dto.termsAndConditions,
        coveredEquipment: { set: dto.coveredEquipmentIds.map((eid) => ({ id: eid })) },
      },
      include: { customer: true, coveredEquipment: true, owningAsm: { select: { id: true, fullName: true } } },
    });
    const overlapWarnings = await this.findOverlaps(contract.id, dto.coveredEquipmentIds, dto.startDate, dto.endDate);
    return { contract, overlapWarnings };
  }

  /**
   * §14.5: overlapping AMC contracts on the same equipment — system uses the
   * one with the later start_date as active, but Admin still gets a warning
   * so it's a visible decision, not a silent one.
   */
  private async findOverlaps(
    excludeContractId: string,
    equipmentIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<{ equipmentId: string; equipmentSerialNo: string; otherContractRefNo: string }[]> {
    if (equipmentIds.length === 0) return [];
    const others = await this.prisma.amcContract.findMany({
      where: {
        id: { not: excludeContractId },
        startDate: { lte: new Date(endDate) },
        endDate: { gte: new Date(startDate) },
        coveredEquipment: { some: { id: { in: equipmentIds } } },
      },
      include: { coveredEquipment: true },
    });

    const warnings: { equipmentId: string; equipmentSerialNo: string; otherContractRefNo: string }[] = [];
    for (const other of others) {
      for (const eq of other.coveredEquipment) {
        if (equipmentIds.includes(eq.id)) {
          warnings.push({ equipmentId: eq.id, equipmentSerialNo: eq.serialNo, otherContractRefNo: other.contractReferenceNo });
        }
      }
    }
    return warnings;
  }

  /** Uploaded AMC contract document (2026-07-27) — stored on the existing signedAgreementUrl field. */
  uploadDocument(id: string, url: string) {
    return this.prisma.amcContract.update({
      where: { id },
      data: { signedAgreementUrl: url },
      include: { customer: true, coveredEquipment: true, owningAsm: { select: { id: true, fullName: true } } },
    });
  }
}
