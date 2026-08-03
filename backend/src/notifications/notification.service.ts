import { Injectable, Logger } from '@nestjs/common';
import { NotifChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

export interface SendNotificationParams {
  channel: NotifChannel;
  recipient: string;
  templateName: string;
  /** Email subject / WhatsApp not applicable / Push notification title. */
  subject?: string;
  body: string;
  /** Links the NotificationLog + (on failure) TicketAuditLog entry to a ticket, for Admin visibility. Optional — not every notification is ticket-scoped. */
  ticketId?: string;
  /** Push only — a specific device's FCM token, if you already have one (e.g. a one-off test send). Prefer `userId` for real triggers — sends to every device that user has registered. */
  deviceToken?: string;
  /** Push only — sends to every `UserPushToken` on file for this user (multiple browsers/devices supported), pruning any FCM reports as invalid/unregistered. Takes precedence over `deviceToken` if both are given. */
  userId?: string;
  /** System-actor user id for the TicketAuditLog entry on failure — same PARTNER_ACTOR_USER_ID-or-first-ADMIN pattern used elsewhere (e.g. SlaBreachCron). */
  systemActorUserId?: string;
  /** Email only — e.g. Scheduled Reports' Excel/PDF export. Nodemailer supports this natively; unused by every other trigger so far. */
  attachments?: { filename: string; content: Buffer }[];
}

/**
 * Notification gateway core (2026-07-30, client request — build the module now
 * even without real credentials yet; wire real triggers later). Channels:
 * Email (Microsoft 365 SMTP), Push (Firebase Cloud Messaging), WhatsApp
 * (Meta WhatsApp Business Cloud API). SMS deliberately excluded per this
 * request — client said WhatsApp/Email can cover what SMS would have,
 * pending MSG91 credentials indefinitely.
 *
 * Hard rule per client instruction: **never throws**. Every send is wrapped;
 * on any failure (missing config, network/auth error) this logs a warning
 * and writes both a NotificationLog(FAILED) row and, if ticketId is given, a
 * TicketAuditLog entry — so Admin can see it failed without the caller
 * (whatever business flow triggered the notification) ever needing its own
 * try/catch or being blocked by a notification failure.
 *
 * Scope boundary: this is the gateway itself (channel senders + fail-safe
 * logging), not the 23 FSD trigger call-sites — those still need to be wired
 * to call `send()` as each one gets built. Push token registration/storage
 * (`UserPushToken`, 2026-07-30) is real — pass `userId` to reach every device
 * a user has registered.
 *
 * All three channels are configured via env vars, deliberately left blank in
 * .env until the client has real credentials — see the env comments next to
 * each block below for exactly what's needed.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private emailTransport: nodemailer.Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async send(params: SendNotificationParams): Promise<void> {
    let gatewayMessageId: string | null = null;
    let failureReason: string | null = null;

    try {
      switch (params.channel) {
        case 'EMAIL':
          gatewayMessageId = await this.sendEmail(params);
          break;
        case 'PUSH':
          gatewayMessageId = await this.sendPush(params);
          break;
        case 'WHATSAPP':
          gatewayMessageId = await this.sendWhatsApp(params);
          break;
        case 'SMS':
          throw new Error('SMS channel not implemented — client decision 2026-07-30, use WhatsApp/Email instead');
      }
    } catch (err: any) {
      failureReason = err?.message ?? String(err);
      this.logger.warn(`Notification failed [${params.channel} -> ${params.recipient}, template "${params.templateName}"]: ${failureReason}`);
    }

    try {
      await this.prisma.notificationLog.create({
        data: {
          ticketId: params.ticketId,
          channel: params.channel,
          recipient: params.recipient,
          templateName: params.templateName,
          deliveryStatus: failureReason ? 'FAILED' : 'SENT',
          gatewayMessageId: gatewayMessageId ?? undefined,
        },
      });

      if (failureReason && params.ticketId) {
        const actorUserId = await this.resolveSystemActor(params.systemActorUserId);
        await this.prisma.auditLog.create({
          data: {
            entityType: 'TICKET',
            entityId: params.ticketId,
            fieldName: 'notification_failed',
            oldValue: null,
            newValue: `${params.channel} notification "${params.templateName}" to ${params.recipient} failed: ${failureReason}`,
            changedByUserId: actorUserId,
            changeSource: 'SYSTEM_JOB',
          },
        });
      }
    } catch (logErr) {
      // Logging/audit itself must never throw back to the caller either —
      // the whole point of this service is that a notification problem
      // never blocks or crashes whatever business flow triggered it.
      this.logger.error('Failed to write NotificationLog/TicketAuditLog for a notification attempt', logErr as Error);
    }
  }

  // --------------------------------------------------------------- Email (Microsoft 365 SMTP)
  // Env needed (client decision 2026-07-30 — SMTP over Graph API):
  //   SMTP_HOST=smtp.office365.com
  //   SMTP_PORT=587
  //   SMTP_USER=<shared/service mailbox address>
  //   SMTP_PASSWORD=<mailbox password, or an app password if MFA is enabled on it>
  //   SMTP_FROM_NAME=ACE Service (display name, optional)
  // If SMTP AUTH turns out to be disabled tenant-wide, the documented fallback
  // is Graph API — see the build plan's Notification Module section.
  private getEmailTransport(): nodemailer.Transporter {
    if (this.emailTransport) return this.emailTransport;
    this.emailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false, // STARTTLS on 587, not implicit TLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    return this.emailTransport;
  }

  private async sendEmail(params: SendNotificationParams): Promise<string> {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      throw new Error('Email not configured — SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing from .env');
    }
    const info = await this.getEmailTransport().sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'ACE Service'}" <${process.env.SMTP_USER}>`,
      to: params.recipient,
      subject: params.subject || params.templateName,
      text: params.body,
      attachments: params.attachments,
    });
    return info.messageId;
  }

  // --------------------------------------------------------------- Push (Firebase Cloud Messaging)
  // Env needed:
  //   FIREBASE_PROJECT_ID=
  //   FIREBASE_CLIENT_EMAIL=
  //   FIREBASE_PRIVATE_KEY=       (service account JSON's private_key — keep the \n escapes, see below)
  // Token registration is real (UserPushToken, registered by the frontend
  // service worker on permission grant) — pass `userId` to send to every
  // device that user has registered; pass `deviceToken` directly only for a
  // one-off send to a specific token.
  private ensureFirebaseInitialized() {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Push not configured — FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY missing from .env');
    }
    // Lazy app init: avoids initializing firebase-admin (and failing on
    // missing creds) until the first time Push is actually used.
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  private async sendPush(params: SendNotificationParams): Promise<string> {
    this.ensureFirebaseInitialized();
    const notification = { title: params.subject || params.templateName, body: params.body };

    if (!params.userId) {
      if (!params.deviceToken) {
        throw new Error('Push requires either userId or deviceToken');
      }
      return getMessaging().send({ token: params.deviceToken, notification });
    }

    const tokens = await this.prisma.userPushToken.findMany({ where: { userId: params.userId } });
    if (tokens.length === 0) {
      throw new Error(`No registered push tokens for user ${params.userId}`);
    }

    let lastSuccessId: string | null = null;
    let lastError: string | null = null;
    for (const t of tokens) {
      try {
        lastSuccessId = await getMessaging().send({ token: t.token, notification });
      } catch (err: any) {
        lastError = err?.message ?? String(err);
        // FCM's own signal for "this token is dead" — prune it rather than
        // leaving a stale registration that'll just fail again next time.
        if (err?.code === 'messaging/registration-token-not-registered' || err?.code === 'messaging/invalid-argument') {
          await this.prisma.userPushToken.deleteMany({ where: { id: t.id } });
        }
      }
    }
    if (!lastSuccessId) throw new Error(lastError ?? 'All registered push tokens failed');
    return lastSuccessId;
  }

  // --------------------------------------------------------------- WhatsApp (Meta WhatsApp Business Cloud API)
  // Env needed:
  //   WHATSAPP_PHONE_NUMBER_ID=   (from the Meta app's WhatsApp product setup)
  //   WHATSAPP_ACCESS_TOKEN=      (permanent system-user token, not the 24h temp one)
  // `recipient` must be the customer's WhatsApp-registered phone number
  // (E.164 format, e.g. "91XXXXXXXXXX" — no leading +).
  private async sendWhatsApp(params: SendNotificationParams): Promise<string> {
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error('WhatsApp not configured — WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN missing from .env');
    }
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.recipient,
        type: 'text',
        text: { body: params.body },
      }),
    });
    const json: any = await res.json();
    if (!res.ok) {
      throw new Error(json?.error?.message || `WhatsApp API returned ${res.status}`);
    }
    return json?.messages?.[0]?.id ?? 'unknown';
  }

  /** Same PARTNER_ACTOR_USER_ID-or-first-ADMIN pattern as SlaBreachCron/TicketsService.createFromPartner. */
  private async resolveSystemActor(preferred?: string): Promise<string> {
    if (preferred) return preferred;
    const envActor = process.env.PARTNER_ACTOR_USER_ID;
    if (envActor) return envActor;
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) throw new Error('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute this audit entry to');
    return admin.id;
  }
}
