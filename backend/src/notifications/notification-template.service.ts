import { Injectable } from '@nestjs/common';
import { NotifChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-editable notification content (2026-07-30, FSD §5.2 + screen W-23).
 * Trigger call-sites (TicketsService, WorkflowService, QuotationService,
 * FsvService, SlaBreachCron) call `render()` to get the current
 * Admin-edited subject/body with merge fields substituted, then pass that
 * straight to NotificationService.send() — the two services are deliberately
 * separate (this one owns *what* the message says, NotificationService owns
 * *how* it's delivered).
 */
@Injectable()
export class NotificationTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ triggerCode: 'asc' }, { channel: 'asc' }] });
  }

  update(id: string, data: { subject?: string; body: string }) {
    return this.prisma.notificationTemplate.update({ where: { id }, data });
  }

  /**
   * Looks up the (triggerCode, channel) template and substitutes
   * `{{merge_field}}` placeholders from `vars`. Returns null if no template
   * row exists for this trigger/channel combination (e.g. a trigger that
   * doesn't use that channel) — callers should skip sending in that case,
   * not treat it as an error.
   */
  async render(triggerCode: string, channel: NotifChannel, vars: Record<string, string | number | null | undefined>) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { triggerCode_channel: { triggerCode, channel } },
    });
    if (!template) return null;

    const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
    return {
      subject: template.subject ? fill(template.subject) : undefined,
      body: fill(template.body),
    };
  }
}
