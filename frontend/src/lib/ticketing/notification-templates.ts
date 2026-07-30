import { apiFetch } from "@/lib/api";

export type NotifChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";

export interface NotificationTemplate {
  id: string;
  triggerCode: string;
  triggerName: string;
  channel: NotifChannel;
  subject: string | null;
  body: string;
  updatedAt: string;
}

export const listNotificationTemplates = () => apiFetch<NotificationTemplate[]>(`/admin/notification-templates`);

export const updateNotificationTemplate = (id: string, params: { subject?: string; body: string }) =>
  apiFetch<NotificationTemplate>(`/admin/notification-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
