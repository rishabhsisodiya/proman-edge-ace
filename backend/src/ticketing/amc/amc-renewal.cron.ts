import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { NotificationTemplateService } from '../../notifications/notification-template.service';

/**
 * AMC renewal alert ladder + lapse handling (FSD §7.2 rules 7-11, N-18/19/20/21
 * — was ❌ pending, `AmcContract.renewalStatus` never transitioned past its
 * default ACTIVE). Runs daily: fires the 30/15/7-day pre-expiry alerts (each
 * exactly once, tracked via `renewalAlert30SentAt`/`15SentAt`/`7SentAt` rather
 * than folding all 3 into `renewalStatus`, since there are only 2 meaningful
 * pre-lapse statuses — RENEWAL_DUE/FINAL_NOTICE — for 3 alert points), and
 * flips a contract to LAPSED once `endDate` passes without renewal.
 *
 * Internal recipients (ASM/Manager/Admin) have no phone/WhatsApp number on
 * file — same substitution already established for N-17: FSD's WhatsApp/SMS
 * channel becomes PUSH for these triggers, WhatsApp is only used for
 * genuinely customer-facing notifications elsewhere.
 */
@Injectable()
export class AmcRenewalCron {
  private readonly logger = new Logger(AmcRenewalCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly notificationTemplates: NotificationTemplateService,
  ) {}

  @Cron('30 1 * * *', { timeZone: 'Asia/Kolkata' }) // 1:30 AM IST daily, after the AMC visit cron
  async run() {
    const now = new Date();
    const contracts = await this.prisma.amcContract.findMany({
      where: { renewalStatus: { notIn: ['LAPSED', 'RENEWED'] } },
      include: { customer: true, owningAsm: true },
    });

    let alerted = 0;
    let lapsed = 0;

    for (const contract of contracts) {
      const daysUntilExpiry = (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const vars = {
        customer_name: contract.customer.customerName,
        contract_ref: contract.contractReferenceNo,
        contract_value: contract.contractValue.toString(),
        end_date: contract.endDate.toISOString().slice(0, 10),
      };

      try {
        if (daysUntilExpiry <= 0) {
          await this.fireLapsed(vars);
          await this.prisma.amcContract.update({ where: { id: contract.id }, data: { renewalStatus: 'LAPSED' } });
          lapsed++;
          continue;
        }

        if (daysUntilExpiry <= 7 && !contract.renewalAlert7SentAt) {
          await this.fireRenewalAlert('N-20', contract, vars, ['PUSH_ADMIN']);
          await this.prisma.amcContract.update({ where: { id: contract.id }, data: { renewalAlert7SentAt: now } });
          alerted++;
        } else if (daysUntilExpiry <= 15 && !contract.renewalAlert15SentAt) {
          await this.fireRenewalAlert('N-19', contract, vars);
          await this.prisma.amcContract.update({
            where: { id: contract.id },
            data: { renewalAlert15SentAt: now, renewalStatus: 'FINAL_NOTICE' },
          });
          alerted++;
        } else if (daysUntilExpiry <= 30 && !contract.renewalAlert30SentAt) {
          await this.fireRenewalAlert('N-18', contract, vars);
          await this.prisma.amcContract.update({
            where: { id: contract.id },
            data: { renewalAlert30SentAt: now, renewalStatus: 'RENEWAL_DUE' },
          });
          alerted++;
        }
      } catch (err) {
        this.logger.error(`Failed to process renewal alert for contract ${contract.id}`, err);
      }
    }

    this.logger.log(`AMC renewal cron complete — ${contracts.length} contract(s) checked, ${alerted} alert(s) sent, ${lapsed} lapsed`);
  }

  /** N-18 (30d) + N-19 (15d): ASM (owning) + Manager. N-20 (7d, passed via includeAdmin) also includes Admin. */
  private async fireRenewalAlert(
    triggerCode: 'N-18' | 'N-19' | 'N-20',
    contract: { owningAsm: { id: string; email: string } | null },
    vars: Record<string, string>,
    flags: ('PUSH_ADMIN')[] = [],
  ) {
    const recipients: { email: string; userId: string }[] = [];
    if (contract.owningAsm) recipients.push({ email: contract.owningAsm.email, userId: contract.owningAsm.id });
    recipients.push(...(await this.usersByRole('MANAGER')).map((u) => ({ email: u.email, userId: u.id })));
    if (flags.includes('PUSH_ADMIN')) {
      recipients.push(...(await this.usersByRole('ADMIN')).map((u) => ({ email: u.email, userId: u.id })));
    }
    for (const r of recipients) {
      await this.notificationTemplates
        .render(triggerCode, 'EMAIL', vars)
        .then((t) => t && this.notifications.send({ channel: 'EMAIL', recipient: r.email, templateName: triggerCode, subject: t.subject, body: t.body }));
      await this.notificationTemplates
        .render(triggerCode, 'PUSH', vars)
        .then((t) => t && this.notifications.send({ channel: 'PUSH', recipient: r.email, templateName: triggerCode, subject: t.subject, body: t.body, userId: r.userId }));
    }
  }

  /** N-21: Manager + Admin, Email only (per FSD — no WhatsApp/Push row exists for this trigger). */
  private async fireLapsed(vars: Record<string, string>) {
    const recipients = [...(await this.usersByRole('MANAGER')), ...(await this.usersByRole('ADMIN'))];
    for (const r of recipients) {
      const template = await this.notificationTemplates.render('N-21', 'EMAIL', vars);
      if (!template) continue;
      await this.notifications.send({ channel: 'EMAIL', recipient: r.email, templateName: 'N-21', subject: template.subject, body: template.body });
    }
  }

  private usersByRole(role: 'MANAGER' | 'ADMIN') {
    return this.prisma.user.findMany({ where: { role, isActive: true } });
  }
}
