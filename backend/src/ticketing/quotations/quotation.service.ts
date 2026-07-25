import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../tickets/tickets.service';
import { ErpWritebackService } from '../erp-writeback/erp-writeback.service';
import { AddQuotationItemDto, CreateQuotationDto, UpdateDeliveryDto, UpdateQuotationDto } from './dto/quotation.dto';

async function nextQuotationNo(prisma: PrismaService): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QTN-${year}-`;
  const count = await prisma.quotation.count({ where: { quotationNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

/**
 * Per Shivam's ACE_ERPNext_Writeback_Integration_final.md (2026-07-23):
 * ACE's job shrinks to creating an initial DRAFT Quotation — all negotiation
 * (price/qty edits) happens IN ERPNEXT from that point on, not in this
 * screen. Once negotiated and submitted there, a webhook/poll auto-creates
 * the Sales Order; a manual Delivery Note in ERPNext then auto-creates a
 * draft Sales Invoice once the SO reaches status "To Bill". None of that is
 * a button click in ACE anymore — see handleQuotationSubmitted/
 * handleDeliveryNoteSubmitted/pollPending below.
 */
@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly erpWriteback: ErpWritebackService,
  ) {}

  /**
   * §14.5/ACE_Ticket_Master_Flow.png's "Chargeable?" decision: not chargeable
   * if the ticket is warranty-eligible, or its equipment is currently covered
   * by an active AMC contract (start_date <= today <= end_date). No
   * equipment (e.g. Spares Supply tickets) falls back to warrantyEligible alone.
   */
  async isChargeable(ticketId: string): Promise<boolean> {
    return (await this.getChargeability(ticketId)).chargeable;
  }

  /**
   * Same decision as isChargeable(), but returns *why* — so the ticket UI can
   * show "Under Warranty (until 15 Jan 2026)" or "Covered by AMC 12345 (until
   * 12 Jul 2028)" instead of a generic "warranty/AMC" label. Note
   * warrantyEligible is a snapshot frozen at ticket creation (from
   * Equipment.warrantyStatus at that moment) — it does not get recomputed if
   * the equipment's warranty later expires; the nightly warranty-recompute
   * engine that would keep it live isn't built yet (Build Plan T2).
   */
  async getChargeability(ticketId: string): Promise<{
    chargeable: boolean;
    reason: 'WARRANTY' | 'AMC' | null;
    warrantyEndDate: Date | null;
    amcContractRef: string | null;
    amcEndDate: Date | null;
  }> {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { equipment: { include: { amcContracts: true } } },
    });

    if (ticket.warrantyEligible) {
      return {
        chargeable: false,
        reason: 'WARRANTY',
        warrantyEndDate: ticket.equipment?.warrantyEndDate ?? null,
        amcContractRef: null,
        amcEndDate: null,
      };
    }

    const now = new Date();
    const activeAmc = ticket.equipment?.amcContracts.find((c) => c.startDate <= now && c.endDate >= now);
    if (activeAmc) {
      return {
        chargeable: false,
        reason: 'AMC',
        warrantyEndDate: null,
        amcContractRef: activeAmc.contractReferenceNo,
        amcEndDate: activeAmc.endDate,
      };
    }

    return { chargeable: true, reason: null, warrantyEndDate: null, amcContractRef: null, amcEndDate: null };
  }

  async create(ticketId: string, dto: CreateQuotationDto, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (!(await this.isChargeable(ticketId))) {
      throw new BadRequestException(
        'This ticket is warranty/AMC-covered — use the direct Sales Order path instead of a Quotation',
      );
    }

    const quotationNo = await nextQuotationNo(this.prisma);
    return this.prisma.quotation.create({
      data: {
        quotationNo,
        ticketId,
        customerId: ticket.customerId,
        createdByUserId: actor.userId,
        validUntil: new Date(dto.validUntil),
        labourCharges: dto.labourCharges,
        notesToCustomer: dto.notesToCustomer,
        termsAndConditions: dto.termsAndConditions,
        amcContractId: dto.amcContractId,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.quotation.findUniqueOrThrow({
      where: { id },
      include: { items: true, deliveries: true, customer: true, ticket: true },
    });
  }

  listForTicket(ticketId: string) {
    return this.prisma.quotation.findMany({ where: { ticketId }, include: { items: true } });
  }

  /** Editable only before it's been pushed to ERPNext — after that, negotiation happens there. */
  private assertEditable(quotation: { erpnextQuotationId: string | null }) {
    if (quotation.erpnextQuotationId) {
      throw new BadRequestException('This quotation is already in ERPNext — edit it there, not in ACE');
    }
  }

  async update(id: string, dto: UpdateQuotationDto) {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({ where: { id } });
    this.assertEditable(quotation);
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        labourCharges: dto.labourCharges,
        notesToCustomer: dto.notesToCustomer,
        termsAndConditions: dto.termsAndConditions,
      },
    });
    return this.recomputeTotals(updated.id);
  }

  async addItem(id: string, dto: AddQuotationItemDto) {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({ where: { id } });
    this.assertEditable(quotation);
    const taxAmount = dto.taxAmount ?? 0;
    const lineTotal = dto.qty * dto.unitPrice + taxAmount;
    await this.prisma.quotationItem.create({ data: { quotationId: id, ...dto, taxAmount, lineTotal } });
    return this.recomputeTotals(id);
  }

  async removeItem(id: string, itemId: string) {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({ where: { id } });
    this.assertEditable(quotation);
    await this.prisma.quotationItem.delete({ where: { id: itemId } });
    return this.recomputeTotals(id);
  }

  private async recomputeTotals(id: string) {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const subtotal = quotation.items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unitPrice), 0);
    const taxAmount = quotation.items.reduce((sum, it) => sum + Number(it.taxAmount), 0);
    const grandTotal = subtotal + taxAmount + Number(quotation.labourCharges ?? 0);
    return this.prisma.quotation.update({
      where: { id },
      data: { subtotal, taxAmount, grandTotal },
      include: { items: true },
    });
  }

  /**
   * ACE "Create Quotation" push — creates a DRAFT ERPNext Quotation from the
   * items assembled here, then hands off entirely: negotiation/submission
   * happens in ERPNext from this point on, not in ACE. Status moves to SENT,
   * meaning "living in ERPNext, awaiting negotiation + submission there" —
   * not "sent to the customer" in the old sense.
   */
  async pushToErpNext(id: string) {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({
      where: { id },
      include: { items: true, customer: true },
    });
    if (quotation.erpnextQuotationId) throw new BadRequestException('Already pushed to ERPNext');
    if (quotation.items.length === 0) throw new BadRequestException('Add at least one item first');
    if (!quotation.customer.erpnextCustomerId) {
      throw new BadRequestException('This customer has no erpnextCustomerId — cannot create a Quotation in ERPNext');
    }

    const erpnextQuotationId = await this.erpWriteback.quotationDraft(
      quotation.ticketId,
      quotation.customer.erpnextCustomerId,
      quotation.items.map((it) => ({ itemCode: it.itemCode, qty: Number(it.qty), rate: Number(it.unitPrice), uom: it.uom })),
      quotation.validUntil.toISOString().slice(0, 10),
    );

    return this.prisma.quotation.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), erpnextQuotationId },
    });
  }

  /**
   * Webhook (or poll) target: the Quotation was submitted in ERPNext after
   * negotiation there. Idempotent — only acts if no Sales Order id is
   * stored yet. Uses ERPNext's own make_sales_order mapper, so the SO
   * carries whatever rates were actually negotiated in ERPNext, not ACE's
   * original proposed rates.
   */
  async handleQuotationSubmitted(erpnextQuotationId: string) {
    const quotation = await this.prisma.quotation.findFirst({ where: { erpnextQuotationId } });
    if (!quotation) {
      this.logger.warn(`No ACE quotation found for ERPNext Quotation ${erpnextQuotationId}`);
      return;
    }
    if (quotation.erpnextSalesOrderId) return; // already handled — idempotency guard

    const erpnextSalesOrderId = await this.erpWriteback.salesOrderFromQuotation(erpnextQuotationId);
    await this.prisma.quotation.update({
      where: { id: quotation.id },
      data: { status: 'CONVERTED_TO_SALES_ORDER', erpnextSalesOrderId },
    });
  }

  /**
   * Webhook (or poll) target: a Delivery Note was submitted manually in
   * ERPNext against this Sales Order. Stores its id, then checks whether
   * the SO has reached exactly "To Bill" (not "To Deliver and Bill" —
   * that's the partial-delivery trap) to auto-create the draft invoice.
   */
  async handleDeliveryNoteSubmitted(deliveryNoteName: string, erpnextSalesOrderId: string) {
    const quotation = await this.prisma.quotation.findFirst({ where: { erpnextSalesOrderId } });
    if (!quotation) {
      this.logger.warn(`No ACE quotation found for ERPNext Sales Order ${erpnextSalesOrderId}`);
      return;
    }
    await this.prisma.quotation.update({ where: { id: quotation.id }, data: { erpnextDeliveryNoteId: deliveryNoteName } });

    if (quotation.erpnextInvoiceId) return; // idempotency guard
    const soStatus = await this.erpWriteback.getDocStatus('Sales Order', erpnextSalesOrderId);
    if (soStatus.status === 'To Bill') {
      const erpnextInvoiceId = await this.erpWriteback.draftSalesInvoiceFromSalesOrder(erpnextSalesOrderId);
      await this.prisma.quotation.update({ where: { id: quotation.id }, data: { erpnextInvoiceId } });
      await this.prisma.ticket.update({ where: { id: quotation.ticketId }, data: { erpnextInvoiceId } });
    }
  }

  /**
   * Polling fallback (webhook backstop) — same two steps as the webhook
   * handlers above, driven by re-checking ERPNext status directly instead
   * of waiting for a push. Same idempotency guards apply.
   */
  async pollPending() {
    const awaitingSalesOrder = await this.prisma.quotation.findMany({
      where: { erpnextQuotationId: { not: null }, erpnextSalesOrderId: null },
    });
    for (const q of awaitingSalesOrder) {
      try {
        const status = await this.erpWriteback.getDocStatus('Quotation', q.erpnextQuotationId!);
        if (status.docstatus === 1 && status.status !== 'Ordered') {
          await this.handleQuotationSubmitted(q.erpnextQuotationId!);
        }
      } catch (err: any) {
        this.logger.error(`Poll (Quotation->SO) failed for ${q.quotationNo}`, err?.message ?? err);
      }
    }

    const awaitingInvoice = await this.prisma.quotation.findMany({
      where: { erpnextSalesOrderId: { not: null }, erpnextInvoiceId: null },
    });
    for (const q of awaitingInvoice) {
      try {
        const status = await this.erpWriteback.getDocStatus('Sales Order', q.erpnextSalesOrderId!);
        if (status.status === 'To Bill' && (status.per_billed ?? 0) === 0) {
          const erpnextInvoiceId = await this.erpWriteback.draftSalesInvoiceFromSalesOrder(q.erpnextSalesOrderId!);
          await this.prisma.quotation.update({ where: { id: q.id }, data: { erpnextInvoiceId } });
          await this.prisma.ticket.update({ where: { id: q.ticketId }, data: { erpnextInvoiceId } });
        }
      } catch (err: any) {
        this.logger.error(`Poll (SO->Invoice) failed for ${q.quotationNo}`, err?.message ?? err);
      }
    }
  }

  /**
   * Diagram's non-chargeable branch: "Chargeable? No" -> straight to
   * "ERPNext Sales Order (zero value, warranty/AMC)" — no Quotation at all,
   * not covered by Shivam's chargeable-pipeline doc. Delivery links
   * directly via ticketId (Delivery.quotationId stays null). Items come
   * from whatever's been logged on the ticket's FSVs so far (zero-rate,
   * since this is FOC) — there's no quote to source items from on this
   * branch, and no real customer PO either (warranty/AMC coverage
   * substitutes for one), so po_no/po_date are ACE-generated placeholders.
   */
  /**
   * Attempts the ERPNext write for the direct (non-chargeable) Sales Order
   * path. Returns either the created erpnextSalesOrderId or a human-readable
   * note explaining why it didn't happen — never both, and never silent.
   * Shared by createDirectSalesOrder() (first attempt) and
   * retryDirectSalesOrder() (once the missing precondition is fixed, e.g.
   * FSV parts get logged after the Delivery record already exists).
   */
  private async attemptDirectSalesOrderWriteback(
    ticketId: string,
  ): Promise<{ erpnextSalesOrderId?: string; erpnextSyncNote?: string }> {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { customer: true, visits: { include: { parts: true } } },
    });

    if (!ticket.customer.erpnextCustomerId) {
      const note = 'Not synced — customer has no erpnextCustomerId';
      this.logger.warn(`Customer ${ticket.customerId} has no erpnextCustomerId — skipping ERPNext Sales Order write-back`);
      return { erpnextSyncNote: note };
    }

    const parts = ticket.visits.flatMap((v) => v.parts);
    if (parts.length === 0) {
      return { erpnextSyncNote: 'Not synced — no FSV parts logged yet. Log parts, then retry.' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7);
    try {
      const erpnextSalesOrderId = await this.erpWriteback.salesOrderDirect(
        ticketId,
        ticket.customer.erpnextCustomerId,
        parts.map((p) => ({ itemCode: p.itemCode, qty: Number(p.qty), rate: 0, uom: p.uom })),
        `WARRANTY-AMC-${ticket.ticketNo}`,
        today,
        deliveryDate.toISOString().slice(0, 10),
      );
      return { erpnextSalesOrderId };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.error(`ERPNext direct Sales Order write-back failed for ticket ${ticket.ticketNo}`, message);
      return { erpnextSyncNote: `Sync failed: ${message.slice(0, 300)}` };
    }
  }

  async createDirectSalesOrder(ticketId: string) {
    if (await this.isChargeable(ticketId)) {
      throw new BadRequestException('This ticket is chargeable — use the Quotation path instead of a direct Sales Order');
    }
    const existing = await this.prisma.delivery.findFirst({ where: { ticketId } });
    if (existing) throw new BadRequestException('A direct Sales Order already exists for this ticket');

    const { erpnextSalesOrderId, erpnextSyncNote } = await this.attemptDirectSalesOrderWriteback(ticketId);
    return this.prisma.delivery.create({ data: { ticketId, erpnextSalesOrderId, erpnextSyncNote } });
  }

  /** Retries the ERPNext write for a Delivery whose first attempt was skipped/failed. */
  async retryDirectSalesOrder(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    if (delivery.erpnextSalesOrderId) {
      throw new BadRequestException('This Sales Order already synced to ERPNext');
    }
    if (!delivery.ticketId) {
      throw new BadRequestException('This Delivery has no direct ticket to retry against');
    }

    const { erpnextSalesOrderId, erpnextSyncNote } = await this.attemptDirectSalesOrderWriteback(delivery.ticketId);
    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { erpnextSalesOrderId, erpnextSyncNote: erpnextSalesOrderId ? null : erpnextSyncNote },
    });
  }

  listDeliveriesForTicket(ticketId: string) {
    return this.prisma.delivery.findMany({
      where: { OR: [{ ticketId }, { quotation: { ticketId } }] },
    });
  }

  async updateDelivery(id: string, dto: UpdateDeliveryDto) {
    return this.prisma.delivery.update({
      where: { id },
      data: {
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        status: dto.status,
        trackingNotes: dto.trackingNotes,
        erpnextDeliveryNoteId: dto.erpnextDeliveryNoteId,
      },
    });
  }
}
