# Proman Edge

Unified app merging two modules for Proman Infrastructure Services Group:

- **Ticketing (`ticketing/`)** — ACE (After-Sales, Customer & Equipment) service ticketing platform
- **Dashboards (`dashboards/`)** — role-based executive homepages (Manufacturing, Sales, Finance,
  Procurement, Dispatch, Stores, and others per `BUILD-Role-based Homepages.html`), migrated from
  the earlier standalone Express-based Proman Edge dashboard product

One Postgres database, one auth/role system, one Next.js frontend — replacing what used to be two
separate codebases/servers.

Reference docs: `PISPL-ACE-FSD-001_v2.0.pdf` (full ticketing FSD), `proman-edge-briefing.html`
(frozen ticketing MVP scope), `Proman Edge - Manager Console.html` (ticketing Manager UI
prototype), `BUILD-Role-based Homepages.html` (11 dashboard roles spec).

## Structure

```
backend/src/
  auth/          shared: JWT, roles guard (Admin bypasses all @Roles() checks), regions
  users/         shared: user/role/region/company management
  prisma/        shared: PrismaService
  common/        shared: decorators, filters, utils
  erp/           shared ERPNext integration (read-only MariaDB pool, Redis cache, Frappe REST client)
  ticketing/     ACE domain: tickets, workflow, fsv, customers, equipment, items, notifications, sync
  dashboards/    Proman Edge domain: manufacturing, sales, finance, procurement, dispatch, stores...
  admin/         admin UI backend: user/role/company CRUD

frontend/src/
  app/dashboard/service/         ticketing (Manager/ASM/Engineer views)
  app/dashboard/{manufacturing,sales,finance,...}/   dashboard modules (as ported)
  app/dashboard/admin/           user/role/company management
  lib/ticketing/                 ticket-specific types/formatting
  lib/dashboards/                dashboard-specific types (as ported)
```

## Scope — Ticketing (frozen MVP)

- Ticket engine: 8 creation sources → single `CreateTicketService` → 9-state workflow
- Field Service Visit (web, not native mobile — responsive/PWA)
- ERPNext integration: **read-only MariaDB** nightly pull for masters (Customer/Item/Serial No/
  Warehouse/Bin), **REST API only** for writes (Stock Entry, draft Sales Invoice) + inbound webhook
- 15 email + SMS notification triggers (all golden-path/SLA triggers per FSD Section 9)
- Service/Manager/Engineer/Customer-tracker views, web only

Out of scope for ticketing MVP: AMC engine, Quotations, full report suite, predictive maintenance,
native mobile.

## Scope — Dashboards

Porting the 6 existing dashboards (Manufacturing, Sales, Finance, Procurement, Dispatch, Stores)
from the old Express backend, one at a time, preserving the existing SQL/Frappe queries as-is.
5 additional roles from `BUILD-Role-based Homepages.html` (MD, Sales Head IM/BMH, Engineering &
Design Head, QMS Head, Service & After-Sales Head) are reserved in the `Role` enum but not yet
built — several depend on ERPNext custom doctypes that may not exist yet.

**Service & After-Sales Head** (Ashwath) is a special case: the reference doc assumes its data
comes from ERPNext (`Issue`, `AMC DocType`, `Warranty Claim`), but that data actually lives in the
ticketing module's own Postgres tables. Data-source mapping for this one deferred intentionally —
do not build against the doc's assumption without resolving this first.

## Known open items (do not build around these silently — confirm first)

- `tabSerial No` is empty (0 rows) on the test DB (`187.127.182.29` / `_61377ae1ad149e95`) —
  blocks Equipment master until Shivam confirms where real ACE serial/warranty data lives.
- `tabItem Price` has only 6 rows on the same test DB — insufficient for billing rates.
- Confirm whether `pispl.frappe.cloud` actually holds ACE-relevant masters, or whether ACE data is
  isolated to `ace.frappe.cloud` (access pending).
- Production DB/API credentials not yet issued — test-server credentials only.
- Real company-per-site breakdown (the "9 entities" from the dashboard doc) pending confirmation
  from the internal manager — 5 placeholder companies (one per Frappe site) seeded for now.
