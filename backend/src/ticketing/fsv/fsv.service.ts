import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { RequestUser } from '../tickets/tickets.service';
import { CreateFsvDto, UpdateFsvDto, AddFsvPartDto, AddFsvPhotoDto } from './dto/fsv.dto';

const MIN_WORK_PERFORMED_LENGTH = 20;

/** FSV-YYYY-NNNNNN, sequential per year — same pattern as ticket numbering. */
async function nextVisitNo(prisma: PrismaService): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FSV-${year}-`;
  const count = await prisma.fieldServiceVisit.count({ where: { visitNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

@Injectable()
export class FsvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  async listForTicket(ticketId: string) {
    return this.prisma.fieldServiceVisit.findMany({
      where: { ticketId },
      include: { parts: true, photos: true },
      orderBy: { visitNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.fieldServiceVisit.findUniqueOrThrow({
      where: { id },
      include: { parts: true, photos: true, ticket: true },
    });
  }

  /** Opens a new Draft FSV — matches ACE_Ticket_Master_Flow.png's "Reached Site → opens FSV". */
  async createDraft(ticketId: string, dto: CreateFsvDto, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ticket.assignedEngineerId !== actor.userId) {
      throw new ForbiddenException('Only the assigned engineer can open a Field Service Visit for this ticket');
    }

    const visitNumber = (await this.prisma.fieldServiceVisit.count({ where: { ticketId } })) + 1;
    const visitNo = await nextVisitNo(this.prisma);

    return this.prisma.fieldServiceVisit.create({
      data: {
        visitNo,
        ticketId,
        visitNumber,
        engineerId: actor.userId,
        visitDate: new Date(dto.visitDate),
      },
    });
  }

  /** Live autosave — matches the diagram's "work → FSV update (live)" dashed link. Draft-only. */
  async update(id: string, dto: UpdateFsvDto) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({ where: { id } });
    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted and is immutable');
    }

    return this.prisma.fieldServiceVisit.update({
      where: { id },
      data: {
        travelStartTime: dto.travelStartTime ? new Date(dto.travelStartTime) : undefined,
        siteArrivalTime: dto.siteArrivalTime ? new Date(dto.siteArrivalTime) : undefined,
        workStartTime: dto.workStartTime ? new Date(dto.workStartTime) : undefined,
        workEndTime: dto.workEndTime ? new Date(dto.workEndTime) : undefined,
        workPerformed: dto.workPerformed,
        findingsRootCause: dto.findingsRootCause,
        recommendations: dto.recommendations,
        customerRepName: dto.customerRepName,
        customerRepDesignation: dto.customerRepDesignation,
        customerSignOff: dto.customerSignOff,
        customerSignatureUrl: dto.customerSignatureUrl,
        noPartsUsed: dto.noPartsUsed,
        gpsLatAtCheckin: dto.gpsLatAtCheckin,
        gpsLongAtCheckin: dto.gpsLongAtCheckin,
      },
      include: { parts: true, photos: true, ticket: true },
    });
  }

  async setSignature(id: string, url: string) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({ where: { id } });
    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted and is immutable');
    }
    return this.prisma.fieldServiceVisit.update({
      where: { id },
      data: { customerSignatureUrl: url },
      include: { parts: true, photos: true, ticket: true },
    });
  }

  async addPart(id: string, dto: AddFsvPartDto) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({ where: { id } });
    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted and is immutable');
    }
    const amount = dto.qty * dto.sellingRate;
    return this.prisma.fsvPartConsumed.create({
      data: { visitId: id, ...dto, amount },
    });
  }

  async removePart(id: string, partId: string) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({ where: { id } });
    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted and is immutable');
    }
    return this.prisma.fsvPartConsumed.delete({ where: { id: partId } });
  }

  async addPhoto(id: string, dto: AddFsvPhotoDto) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({ where: { id } });
    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted and is immutable');
    }
    return this.prisma.fsvPhoto.create({ data: { visitId: id, ...dto } });
  }

  /**
   * §14.2 rules 22-26: validates, locks (immutable), and — per
   * ACE_Ticket_Master_Flow.png's "FSV submitted → resolve" link — moves the
   * ticket straight to Engineer Resolved. Replaces the old placeholder
   * tickets.service.ts resolve() direct action, which never required an FSV
   * to exist at all.
   *
   * No ERPNext write-back here — per Shivam's revised pipeline
   * (2026-07-23), Stock Entry is retired. Parts leave stock via a manual
   * Delivery Note raised in ERPNext against the Sales Order instead.
   */
  async submit(id: string, actor: RequestUser) {
    const visit = await this.prisma.fieldServiceVisit.findUniqueOrThrow({
      where: { id },
      include: { parts: true, photos: true, ticket: true },
    });

    if (visit.status === 'SUBMITTED') {
      throw new BadRequestException('This Field Service Visit has already been submitted');
    }
    if (visit.engineerId !== actor.userId) {
      throw new ForbiddenException('Only the visiting engineer can submit this Field Service Visit');
    }
    if (!visit.workPerformed || visit.workPerformed.trim().length < MIN_WORK_PERFORMED_LENGTH) {
      throw new BadRequestException(`Work performed must be at least ${MIN_WORK_PERFORMED_LENGTH} characters`);
    }
    if (visit.parts.length === 0 && !visit.noPartsUsed) {
      throw new BadRequestException('Log parts consumed, or explicitly confirm no parts were used');
    }
    if (!visit.customerRepName?.trim()) {
      throw new BadRequestException('Customer representative name is required');
    }
    if (!visit.customerSignOff) {
      throw new BadRequestException('Customer sign-off is required before submitting');
    }
    if (visit.ticket.serviceType === 'BREAKDOWN_CHARGEABLE' && visit.photos.length === 0) {
      throw new BadRequestException('At least one photo is required for Breakdown tickets');
    }

    const submitted = await this.prisma.fieldServiceVisit.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), submittedBy: actor.userId },
    });

    await this.workflow.transition({
      ticketId: visit.ticketId,
      targetStatus: 'ENGINEER_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      resolutionSummary: visit.workPerformed,
    });

    return submitted;
  }
}
