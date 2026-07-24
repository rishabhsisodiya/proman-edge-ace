# ACE Ticket Engine — Partner/IoT API Webhook Guide

Companion to `ACE-Ticket-Engine-Build-Plan.md` Phase 2 item 7 ("Partner API webhook —
scaffolding only"). Covers how to generate/revoke an API key from the Admin Console and
how a partner system actually calls the webhook to create tickets.

No real IoT sensor or partner system is confirmed yet as of this writing — this
document describes the working scaffolding, ready for a real adapter once one is
named.

---

## 1. What this is for

A single inbound endpoint that lets an external system (an IoT sensor on a piece of
equipment, or a future third-party partner system) raise ACE tickets automatically,
without a logged-in user. Every ticket created this way is tagged `source: API_PARTNER`
and goes through the exact same `CreateTicket` engine as any other source — dedup,
auto-classification, and auto-routing to an ASM all apply identically.

---

## 2. Generating an API key (Admin only)

1. Log in as **Admin**.
2. Go to **Admin Console → Partner API Keys** (`/dashboard/admin/partner-api-keys`).
3. Enter a **label** identifying who/what this key is for — e.g. `"Acme IoT sensor
   gateway"` or `"NTPC vibration monitor"`. Use one key per partner/system, not one
   shared key for everyone, so a compromised or discontinued integration can be revoked
   without affecting others.
4. Click **Generate Key**.
5. **Copy the raw key immediately** — it's shown exactly once, in an amber callout. Only
   its SHA-256 hash is ever stored; if you navigate away without copying it, there is no
   way to retrieve it again — you'd need to generate a new one.
6. Send the raw key to the partner over a secure channel (not email/chat in plaintext
   if avoidable) — treat it like a password.

### Revoking a key

On the same page, every key shows its label, creation date, last-used timestamp, and
status (Active/Revoked). Click **Revoke** next to any active key to cut off access
immediately — no code change or server restart needed. A revoked key fails every
subsequent request instantly (`403 Invalid or missing API key`); nothing about the key
is deleted, so the label/history remains visible for audit purposes.

**Rotate a key** by generating a new one with a similar label, sending it to the
partner, confirming they've switched over, then revoking the old one — there's no
built-in "rotate in place," each generate produces an entirely new key.

---

## 3. Calling the webhook (for the partner system)

**Endpoint:**
```
POST https://<your-ace-backend-host>/api/v1/webhooks/ticket-sources
```

**Headers:**
```
X-API-Key: <the raw key generated above>
Content-Type: application/json
```

**Body** — only `description` is required:

| Field | Required | Notes |
|---|---|---|
| `description` | Yes | Free text describing the issue. |
| `customerErpId` | One of these two | The customer's ID as it already exists in ERPNext. **Use this, not `customerId`.** |
| `customerId` | | Internal ACE UUID — only useful for a system-to-system import that already knows it; not something a partner system would normally have. |
| `equipmentSerialNo` | Optional | The equipment's serial number, if the ticket is tied to a specific piece of equipment. |
| `equipmentId` | Optional | Internal ACE UUID equivalent of the above — same caveat as `customerId`. |
| `serviceType` | Optional | One of the `ServiceType` enum values (e.g. `BREAKDOWN_CHARGEABLE`). Auto-classified if omitted. |
| `priority` | Optional | One of `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`. Auto-assigned from the priority matrix if omitted. |
| `subject` | Optional | Auto-generated from equipment + service type + customer name if omitted. |

**Example request:**

```bash
curl -X POST https://your-ace-backend-host/api/v1/webhooks/ticket-sources \
  -H "X-API-Key: ace_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Vibration anomaly detected on crusher — threshold exceeded",
    "customerErpId": "ACME-CUST-001",
    "equipmentSerialNo": "SN-JC900-0042",
    "serviceType": "BREAKDOWN_CHARGEABLE",
    "priority": "HIGH"
  }'
```

**Responses:**

| Status | Meaning |
|---|---|
| `200/201` | Ticket created — response body is the full ticket record (includes `ticketNo`). |
| `400` | Bad request — missing `description`, invalid `serviceType`/`priority` value, or the `customerErpId`/`equipmentSerialNo` couldn't be resolved to a real record. |
| `403` | Missing/invalid/revoked API key. |

---

## 4. What happens after a ticket is created this way

Identical downstream behavior to any other source:
- **Dedup**: if the same customer+equipment already has a non-closed ticket within the
  last 24h, this is auto-merged into that existing ticket (a note is added, no duplicate
  created) — `API_PARTNER` is one of the sources configured for automatic merge, unlike
  manual/customer-initiated sources which only get a cross-reference note.
- **Auto-routing**: if the customer's region has a staffed ASM, the ticket auto-advances
  `OPEN → ASSIGNED` immediately, load-balanced across ASMs in that region.
- **Priority**: auto-filled from the service-type default if not provided.

Nothing about the partner-sourced origin is visible in the UI beyond the ticket's
`source` field showing `API_PARTNER` — it looks and behaves like any other ticket from
this point on.

---

## 5. Current limitations (scaffolding, not final)

- **No real adapter exists** — this endpoint has been tested via curl/Postman, not
  against a live IoT sensor or partner system, since none is confirmed yet.
- **No per-key rate limiting** — a misbehaving or compromised key could create tickets
  in a loop. Revoke immediately if you suspect abuse; rate limiting is not yet built
  (tracked under the general "security pass" item in the build plan, Days 17–19).
- **No payload signature verification** — unlike the ERPNext webhooks
  (`erp-webhooks.controller.ts`), this endpoint only checks the API key, not an
  HMAC signature over the body. Acceptable for now since the key itself is the trust
  boundary, but worth revisiting if a real high-value partner integration is named.
