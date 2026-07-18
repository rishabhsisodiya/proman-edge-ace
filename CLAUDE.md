# Proman Edge — Project-Specific Engineering Rules

These rules extend the global CLAUDE.md. Adapted from `PROMAN/CLAUDE.md` (the original dashboard
product's rules) for this merged app's two modules, which have different ERPNext access patterns.
One file at project root covers both `backend/` and `frontend/` — no separate per-folder files.

---

## Frontend: This Next.js version has breaking changes

`frontend/`'s Next.js version differs from training-data assumptions — APIs, conventions, and file
structure may not match what's expected. **Read the relevant guide in
`frontend/node_modules/next/dist/docs/` before writing any frontend code.** Heed deprecation
notices. Concrete example already hit in this project: `middleware.ts` was renamed to `proxy.ts`
with a `proxy` export instead of `middleware` — caught by reading the docs first, not by a runtime
failure.

## Backend: `esModuleInterop` is not set in `tsconfig.json`

Default imports of CJS packages (`import mysql from 'mysql2/promise'`, `import fs from 'fs'`,
`import path from 'path'`) **pass typecheck but crash at runtime** (`Cannot read properties of
undefined`). Already hit twice while porting the Manufacturing dashboard. Always use namespace
imports instead: `import * as mysql from 'mysql2/promise'`. Before adding a new dashboard module or
any new CJS dependency, check its import style against this.

---

## ERPNext / MariaDB: Zero-Touch Policy on the Read Connection

**`ErpDbService` (`backend/src/erp/erp-db.service.ts`) is READ-ONLY. Full stop.**

This connection (used by the nightly ACE sync AND every `dashboards/*` module) must **never**
execute INSERT, UPDATE, DELETE, or any DDL — ever, for any reason, in any module. It exists to run
`SELECT` queries against ERPNext's own MariaDB, nothing else.

This means, for anything going through `ErpDbService`:
- No custom DocType creation — we cannot do it
- No new `@frappe.whitelist()` methods — we cannot write them
- No schema changes, no field additions, no workflow modifications
- No role/permission changes inside ERPNext
- No direct MariaDB INSERT / UPDATE / DELETE — ever, for any reason

### What to do when ERP-side work is needed

If a feature requires something from the ERPNext/Frappe side (a new DocType, a new whitelisted API
method, a new field, a workflow trigger), **do not implement a workaround**. Instead:

1. Stop and clearly state: *"This requires ERP-side work."*
2. Draft a precise message addressed to the ERP developer (Shivam) in this format:

```
--- MESSAGE FOR ERP DEVELOPER (Shivam) ---

Feature: <feature name>
Request Type: <New DocType / New Whitelist Method / New Field / Other>

What is needed:
<exact DocType name, fields with types, or exact API method signature>

Why it is needed:
<what the module will call and what it expects in return>

Expected Response Format:
<JSON shape expected>

Priority: <Blocking / Non-blocking>
--- END OF MESSAGE ---
```

3. Wait for confirmation that the ERP-side work is done before implementing anything that depends
   on it.

---

## The One Deliberate Exception: Ticketing Module Writes

Unlike the dashboards module (100% read-only, no exceptions), the **ticketing module**
(`backend/src/ticketing/sync/`) is authorized to write to ERPNext — but **only** via:

- Frappe's REST API (`POST /api/resource/{DocType}`), or
- Whitelisted methods Shivam/Promantia explicitly provides

**Never via `ErpDbService` or any raw SQL connection.** The two write operations in scope:
creating + submitting a Stock Entry (Material Issue) on Field Service Visit submission, and
creating a **draft** Sales Invoice (`docstatus: 0`, never auto-submitted) on chargeable ticket
closure. Both require the integration user + custom fields (`custom_ace_ticket`,
`custom_ace_fsv`) requested from Shivam/Promantia — do not build against these until that access
is confirmed granted.

If a future feature seems to need a write beyond these two, treat it exactly like the dashboards
module: stop, draft the message to Shivam, wait for confirmation.

---

## Frappe API Rules (Reads)

- Always pass `filters`, `fields`, and `limit` — never fetch an entire DocType
- Frappe `docstatus`: `0 = Draft`, `1 = Submitted`, `2 = Cancelled` — filter by correct status
- `get_list` default max is 500 — always paginate or use server-side aggregation
- Never use Frappe private/internal APIs (`frappe._` anything)

## Frappe Limitations — Always Aware Of

| Limitation | How we handle it |
|---|---|
| No real-time push from Frappe | Nightly batch sync for masters; never promise live data outside the ticketing module's own Postgres tables |
| `get_list`/query max row limits | Paginate, or request server-side aggregation from Shivam |
| Custom DocTypes can break on ERPNext major upgrades | Flag this risk whenever a feature depends on a custom DocType |
| Workflow states mean partial data mid-submission is normal | Show `docstatus` context in UI where data state matters |

---

## ERP Developer: Shivam (also coordinate via Promantia for write-access items)

All ERP-side requests go to Shivam; write-access items (integration user, custom fields, webhook)
may need Promantia looped in separately — see project memory / conversation history for current
status of pending requests before assuming access exists.

---

## Sites Reference

| Site | Entity | Division |
|---|---|---|
| pispl.frappe.cloud | PISPL | Aggregate, IM, BMH |
| ace.frappe.cloud | ACE | Service & After-Sales |
| promax.frappe.cloud | PROMAX | Dry Mortar |
| bluestone.frappe.cloud | Bluestone | TBC |
| qmspro.frappe.cloud | QMS Pro | Quality / Certifications |

**Open item:** confirm whether ACE-relevant Serial No/Item Price data actually lives on `ace` or
`pispl` — see README's "Known open items."
