import { Body, Controller, ForbiddenException, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { QuotationService } from '../quotations/quotation.service';

/**
 * ERPNext -> ACE, per ACE_ERPNext_Writeback_Integration_final.md — configured
 * as an ERPNext Webhook (setup, not code): "secure the endpoints with the
 * Webhook's shared secret." ERPNext's native Webhook doctype doesn't send
 * that secret as a plain query param — it computes an HMAC-SHA256 signature
 * over the raw request body using the configured secret, sent in the
 * `X-Frappe-Webhook-Signature` header (base64). We verify by recomputing the
 * same HMAC over the exact raw bytes and comparing (timing-safe) — not a
 * plaintext string match. No JwtAuthGuard here — the caller is ERPNext, not
 * a logged-in ACE user.
 */
@Controller('webhooks/erpnext')
export class ErpWebhooksController {
  constructor(private readonly quotations: QuotationService) {}

  private assertSignature(req: RawBodyRequest<Request>, signature?: string) {
    const secret = process.env.ERPNEXT_WEBHOOK_SECRET;
    if (!secret || secret === 'change-me') {
      throw new ForbiddenException('ERPNEXT_WEBHOOK_SECRET is not configured');
    }
    if (!signature || !req.rawBody) {
      throw new ForbiddenException('Missing webhook signature');
    }
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }

  @Post('quotation-submitted')
  async quotationSubmitted(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-frappe-webhook-signature') signature: string,
    @Body('name') name: string,
  ) {
    this.assertSignature(req, signature);
    await this.quotations.handleQuotationSubmitted(name);
    return { ok: true };
  }

  @Post('dn-submitted')
  async deliveryNoteSubmitted(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-frappe-webhook-signature') signature: string,
    @Body('name') name: string,
    @Body('sales_order') salesOrder: string,
  ) {
    this.assertSignature(req, signature);
    await this.quotations.handleDeliveryNoteSubmitted(name, salesOrder);
    return { ok: true };
  }
}
