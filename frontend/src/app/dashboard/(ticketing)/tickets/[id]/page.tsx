"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createFsv, FieldServiceVisit, listFsvForTicket } from "@/lib/ticketing/fsv";
import { getBestEffortGpsPosition } from "@/lib/geolocation";
import {
  Chargeability,
  createDirectInvoice,
  createDirectSalesOrder,
  createQuotation,
  Delivery as DeliveryRecord,
  isTicketChargeable,
  listDeliveriesForTicket,
  listQuotationsForTicket,
  Quotation as QuotationRecord,
  retryDirectSalesOrderErpSync,
} from "@/lib/ticketing/quotation";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import {
  CUSTOMER_CATEGORY_LABEL,
  SOURCE_LABEL,
  CustomerCategory,
  PENDING_REASON_LABEL,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  SLA_STATUS_LABEL,
  SLA_STATUS_STYLE,
  SlaClockStatus,
  worstSlaStatus,
  SELECTABLE_SERVICE_TYPES,
  SERVICE_TYPE_LABEL,
  SLA_TARGET_DATE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  PendingReason,
  ServiceType,
  Ticket,
  TicketStatus,
} from "@/lib/ticketing/types";
import {
  acceptTicket,
  asmResolveTicket,
  asmRejectResolution,
  assignTicket,
  closeTicket,
  EngineerCandidate,
  engineerCandidates,
  getTicket,
  markPending,
  engineerResolve,
  reachedSite,
  regularizeTicket,
  rejectTicket,
  reopenTicket,
  resendCsatSurvey,
  resolveDuplicate,
  resumeTicket,
  retryAutoRouting,
  startWorking,
  TicketAuditEntry,
  ticketTimeline,
  updateCustomerCategory,
  updateTicketTags,
  overrideWarranty,
  updateServiceType,
} from "@/lib/ticketing/actions";

const CUSTOMER_CATEGORIES: CustomerCategory[] = ["WARRANTY", "NON_WARRANTY", "AMC"];

// Ticket Detail (§10.1 W-08) — one shared screen for all roles; the action
// buttons shown below the status depend on (a) current status and (b) the
// logged-in user's role, mirroring TICKET_TRANSITIONS' allowedRoles exactly
// so a role never sees a button the backend would reject.
export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TicketAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [visits, setVisits] = useState<FieldServiceVisit[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeReason, setMergeReason] = useState("");
  const [showRegularizeModal, setShowRegularizeModal] = useState(false);
  const [regularizeTarget, setRegularizeTarget] = useState<TicketStatus>("OPEN");
  const [regularizeReason, setRegularizeReason] = useState("");
  const [chargeability, setChargeability] = useState<Chargeability | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getTicket(id), ticketTimeline(id), listFsvForTicket(id)])
      .then(([t, tl, v]) => {
        setTicket(t);
        setTimeline(tl);
        setVisits(v);
      })
      .catch(() => setError("Could not load this ticket."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setUser(getCurrentUser());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!ticket) return;
    if (
      user?.role === "CALL_CENTER" ||
      user?.role === "ASM" ||
      user?.role === "MANAGER" ||
      user?.role === "ADMIN" ||
      user?.role === "ENGINEER"
    ) {
      isTicketChargeable(ticket.id).then(setChargeability).catch(() => setChargeability(null));
    }
  }, [ticket?.id, user?.role]);

  async function runAction<T>(action: () => Promise<T>, successNote?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successNote) setNotice(successNote);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Action failed.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error && !ticket) return <p className="p-8 text-sm text-brand-red">{error}</p>;
  if (!ticket || !user) return null;

  const role = user.role;
  const isMine = ticket.assignedEngineer?.id ? undefined : undefined; // engineer scoping already enforced server-side

  const canRegularize = role === "ADMIN" || role === "CALL_CENTER";
  const canResolveDuplicate =
    ticket.possibleDuplicateOf &&
    !ticket.duplicateFlagResolved &&
    (role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN");

  const menuItems: { label: string; onClick: () => void; variant?: "danger" }[] = [];
  if (canResolveDuplicate) {
    menuItems.push({ label: "Merge / Duplicate", onClick: () => setShowMergeModal(true), variant: "danger" });
  }
  if (canRegularize) {
    menuItems.push({ label: "Regularize", onClick: () => setShowRegularizeModal(true) });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="absolute right-0 top-0 sm:hidden">
          <DotMenu items={menuItems} />
        </div>
        <div className="min-w-0 pr-12 sm:pr-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-muted">{ticket.ticketNo}</p>
            {ticket.possibleDuplicateOf && !ticket.duplicateFlagResolved && role !== "ENGINEER" && (
              <span className="animate-pulse rounded-full bg-brand-red-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-red">
                Duplicate?
              </span>
            )}
          </div>
          <h1 className="break-words text-xl font-bold text-navy">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[ticket.status]}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
            <span className="text-xs text-muted">{SERVICE_TYPE_LABEL[ticket.serviceType as ServiceType] ?? ticket.serviceType}</span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-start gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${PRIORITY_STYLE[ticket.priority]}`}>
                {PRIORITY_LABEL[ticket.priority]}
              </span>
              {worstSlaStatus(ticket) !== "ON_TRACK" && (
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${SLA_STATUS_STYLE[worstSlaStatus(ticket)]}`}>
                  {SLA_STATUS_LABEL[worstSlaStatus(ticket)]}
                </span>
              )}
              {chargeability && !chargeability.chargeable && chargeability.reason && (
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    chargeability.reason === "WARRANTY" ? "bg-brand-amber-bg text-brand-amber" : "bg-brand-green-bg text-brand-green"
                  }`}
                >
                  {chargeability.reason === "WARRANTY"
                    ? "Under Warranty"
                    : `Under AMC${chargeability.amcEndDate ? ` — till ${new Date(chargeability.amcEndDate).toLocaleDateString()}` : ""}`}
                </span>
              )}
              {chargeability && chargeability.chargeable && (
                <span className="rounded-full bg-brand-red-bg px-3 py-1.5 text-xs font-bold text-brand-red">
                  Out of Warranty — Chargeable
                </span>
              )}
            </div>
            <div className="hidden shrink-0 sm:block">
              <DotMenu items={menuItems} />
            </div>
          </div>
        </div>
      </div>

      {showMergeModal && ticket.possibleDuplicateOf && (
        <Modal title={`Merge into ${ticket.possibleDuplicateOf.ticketNo}`} onClose={() => setShowMergeModal(false)}>
          <p className="mb-2 text-sm text-navy">
            Possible duplicate of{" "}
            <a href={`/dashboard/tickets/${ticket.possibleDuplicateOf.id}`} className="font-bold underline">
              {ticket.possibleDuplicateOf.ticketNo}
            </a>{" "}
            ({STATUS_LABEL[ticket.possibleDuplicateOf.status]}).
          </p>
          <p className="mb-2 text-xs text-muted">
            This ticket is currently at "{STATUS_LABEL[ticket.status]}" — if real work has already happened on it,
            make sure that's actually intended before confirming a merge.
          </p>
          <textarea
            value={mergeReason}
            onChange={(e) => setMergeReason(e.target.value)}
            placeholder="Reason (required if merging, audit-logged)"
            className="mb-3 h-16 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Merge (close this one)"
              variant="danger"
              busy={busy || !mergeReason.trim()}
              onClick={() => {
                const alreadyActive = ticket.status !== "OPEN";
                const confirmed = window.confirm(
                  alreadyActive
                    ? `This ticket is already at "${STATUS_LABEL[ticket.status]}" — it looks like real work may have happened on it. Merging will close it immediately and cannot be undone. Continue?`
                    : `Merge this ticket into ${ticket.possibleDuplicateOf!.ticketNo} and close it? This cannot be undone.`,
                );
                if (!confirmed) return;
                runAction(() => resolveDuplicate(ticket.id, "MERGE", mergeReason.trim()), "Ticket merged and closed.");
                setShowMergeModal(false);
                setMergeReason("");
              }}
            />
            <ActionButton
              label="Not a duplicate — dismiss"
              variant="secondary"
              busy={busy}
              onClick={() => {
                runAction(() => resolveDuplicate(ticket.id, "DISMISS"), "Duplicate flag dismissed.");
                setShowMergeModal(false);
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowMergeModal(false)} />
          </div>
        </Modal>
      )}

      {showRegularizeModal && (
        <Modal title="Regularize — force to any status" onClose={() => setShowRegularizeModal(false)}>
          <p className="mb-2 text-xs text-muted">Bypasses the normal workflow rules. Always audit-logged with the reason below.</p>
          <select
            value={regularizeTarget}
            onChange={(e) => setRegularizeTarget(e.target.value as TicketStatus)}
            className="mb-2 w-full rounded-md border border-line px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            value={regularizeReason}
            onChange={(e) => setRegularizeReason(e.target.value)}
            placeholder="Reason (required, audit-logged)"
            className="mb-3 h-20 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Confirm Regularize"
              variant="danger"
              busy={busy || !regularizeReason.trim()}
              onClick={() => {
                runAction(
                  () => regularizeTicket(ticket.id, regularizeTarget, regularizeReason.trim()),
                  "Ticket regularized.",
                );
                setShowRegularizeModal(false);
                setRegularizeReason("");
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowRegularizeModal(false)} />
          </div>
        </Modal>
      )}

      <StateBar status={ticket.status} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-line bg-white p-4 text-sm sm:grid-cols-2 sm:gap-y-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Customer</p>
          <p className="break-words text-navy">{ticket.customer.customerName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Site</p>
          <p className="break-words text-navy">{ticket.site?.siteName ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Equipment</p>
          <p className="break-words text-navy">{ticket.equipment?.itemName ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Customer Category</p>
          {role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN" ? (
            <select
              value={ticket.customerCategory ?? ""}
              disabled={busy}
              onChange={(e) =>
                runAction(
                  () => updateCustomerCategory(ticket.id, e.target.value as CustomerCategory),
                  "Customer category updated.",
                )
              }
              className="h-8 w-full max-w-[180px] rounded-md border border-line px-2 text-sm text-navy disabled:opacity-50"
            >
              <option value="">Not set</option>
              {CUSTOMER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CUSTOMER_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          ) : (
            <p className="break-words text-navy">
              {ticket.customerCategory ? CUSTOMER_CATEGORY_LABEL[ticket.customerCategory] : "—"}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Source</p>
          <p className="break-words text-navy">{SOURCE_LABEL[ticket.source] ?? ticket.source}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted">Created</p>
          <p className="break-words text-navy">{new Date(ticket.createdAt).toLocaleString()}</p>
        </div>
        {ticket.updatedAt && (
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">Last Updated</p>
            <p className="break-words text-navy">{new Date(ticket.updatedAt).toLocaleString()}</p>
          </div>
        )}
        {ticket.closedAt && (
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">Closed</p>
            <p className="break-words text-navy">{new Date(ticket.closedAt).toLocaleString()}</p>
          </div>
        )}
        {!!ticket.reOpenCount && (
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">Reopened</p>
            <p className="break-words text-navy">{ticket.reOpenCount} time{ticket.reOpenCount > 1 ? "s" : ""}</p>
          </div>
        )}
        {!!ticket.rejectionCount && (
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">Rejected</p>
            <p className="break-words text-navy">
              {ticket.rejectionCount} time{ticket.rejectionCount > 1 ? "s" : ""} — see Timeline for reasons
            </p>
          </div>
        )}
        {ticket.reachedSiteGpsLat != null && ticket.reachedSiteGpsLong != null && (
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">Reached Site Location</p>
            <a
              href={`https://www.google.com/maps?q=${ticket.reachedSiteGpsLat},${ticket.reachedSiteGpsLong}`}
              target="_blank"
              rel="noreferrer"
              className="break-words font-bold text-navy underline"
            >
              View on map
            </a>
          </div>
        )}
        <div className="min-w-0 sm:col-span-2">
          <p className="text-xs font-bold uppercase text-muted">Tags</p>
          {role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN" ? (
            <div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(ticket.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-navy"
                  >
                    {tag}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => updateTicketTags(ticket.id, (ticket.tags ?? []).filter((t) => t !== tag)),
                          "Tag removed.",
                        )
                      }
                      className="text-muted hover:text-red-600 disabled:opacity-50"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Type a tag and press Enter"
                disabled={busy}
                className="mt-2 h-8 w-full max-w-[240px] rounded-md border border-line px-2 text-sm text-navy disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const value = e.currentTarget.value.trim();
                  if (!value) return;
                  if ((ticket.tags ?? []).includes(value)) {
                    e.currentTarget.value = "";
                    return;
                  }
                  runAction(
                    () => updateTicketTags(ticket.id, [...(ticket.tags ?? []), value]),
                    "Tag added.",
                  );
                  e.currentTarget.value = "";
                }}
              />
            </div>
          ) : (
            <p className="break-words text-navy">
              {ticket.tags && ticket.tags.length ? ticket.tags.join(", ") : "—"}
            </p>
          )}
        </div>
        {ticket.status === "PENDING" && (
          <div className="min-w-0 sm:col-span-2">
            <p className="text-xs font-bold uppercase text-muted">Pending reason</p>
            <p className="break-words text-navy">
              {ticket.pendingReason ? PENDING_REASON_LABEL[ticket.pendingReason] : "—"}
              {ticket.pendingNotes ? ` — ${ticket.pendingNotes}` : ""}
            </p>
          </div>
        )}
        {ticket.resolutionSummary && (
          <div className="min-w-0 sm:col-span-2">
            <p className="text-xs font-bold uppercase text-muted">Resolution summary</p>
            <p className="break-words text-navy">{ticket.resolutionSummary}</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}
      {notice && <p className="rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}

      {ticket.status === "OPEN" && !ticket.assignedAsm && (role === "ASM" || role === "MANAGER" || role === "ADMIN") && (
        <div className="rounded-lg border border-brand-amber bg-brand-amber-bg p-3">
          <p className="text-sm text-navy">
            No ASM covered {ticket.customer.region ?? "this customer's region"} when this ticket was created —
            auto-routing only runs once, at creation time. If a region's ASM staffing has changed since, retry it here.
          </p>
          <div className="mt-2">
            <ActionButton
              label="Retry Auto-Routing"
              busy={busy}
              onClick={() => runAction(() => retryAutoRouting(ticket.id), "Ticket auto-routed.")}
            />
          </div>
        </div>
      )}

      <TicketActions role={role} ticket={ticket} busy={busy} runAction={runAction} />

      <TicketHistoryTabs
        timeline={timeline}
        visits={visits}
        ticket={ticket}
        showCommercial={role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN" || role === "ENGINEER"}
        role={role}
      />
        </div>

        <div className="order-first space-y-4 lg:order-none lg:sticky lg:top-6 lg:self-start">
          {role === "ENGINEER" ? (
            <EngineerActionCard ticket={ticket} busy={busy} runAction={runAction} />
          ) : (
            <div className="rounded-lg border border-line bg-white p-3 text-sm">
              <p className="mb-2 text-xs font-bold uppercase text-muted">Assigned ASM</p>
              <p className="mb-3 text-navy">{ticket.assignedAsm?.fullName ?? "Unassigned"}</p>
              <p className="mb-2 text-xs font-bold uppercase text-muted">Assigned Engineer</p>
              <AssignEngineerCard role={role} ticket={ticket} busy={busy} runAction={runAction} />
            </div>
          )}
          {(role === "ASM" || role === "ENGINEER" || role === "MANAGER" || role === "ADMIN") &&
            ticket.status !== "CLOSED" && <ServiceTypeCard ticket={ticket} runAction={runAction} />}
          <SlaFieldsCard ticket={ticket} />
          {ticket.status === "CLOSED" &&
            (role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN") && (
              <CsatCard ticket={ticket} runAction={runAction} />
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * Engineer's own next-step card in the sidebar — not relevant to other
 * roles (they don't need "who's assigned" surfaced to themselves, they need
 * their own next action prominent instead, same reasoning that put Assign
 * Engineer in the sidebar for ASM/Manager). Covers the full Accept -> Reject
 * -> Reached Site -> Start Working -> Mark Pending/FSV -> Resume -> Mark
 * Resolved (after at least one FSV is submitted, 2026-08-01) chain.
 */
function EngineerActionCard({
  ticket,
  busy,
  runAction,
}: {
  ticket: Ticket;
  busy: boolean;
  runAction: <T>(action: () => Promise<T>, note?: string) => void;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [pendingReason, setPendingReason] = useState<PendingReason>("AWAITING_PARTS");
  const [pendingNotes, setPendingNotes] = useState("");
  const [showPending, setShowPending] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [fsvList, setFsvList] = useState<FieldServiceVisit[]>([]);
  const [fsvBusy, setFsvBusy] = useState(false);
  const [reachedComment, setReachedComment] = useState("");
  const [startComment, setStartComment] = useState("");
  const router = useRouter();

  useEffect(() => {
    listFsvForTicket(ticket.id).then(setFsvList).catch(() => setFsvList([]));
  }, [ticket.id]);

  async function onOpenFsv() {
    setFsvBusy(true);
    try {
      const existingDraft = fsvList.find((v) => v.status === "DRAFT");
      if (existingDraft) {
        router.push(`/dashboard/fsv/${existingDraft.id}`);
        return;
      }
      // "Check-in" GPS (2026-07-31) — captured once, at the moment the visit
      // is opened, same best-effort pattern as Reached Site; this field
      // existed on the schema since day one but was never actually set.
      const gps = await getBestEffortGpsPosition();
      const created = await createFsv(ticket.id, new Date().toISOString(), undefined, gps?.lat, gps?.long);
      router.push(`/dashboard/fsv/${created.id}`);
    } finally {
      setFsvBusy(false);
    }
  }

  const items: React.ReactNode[] = [];

  if (ticket.status === "ENGINEER_ASSIGNED") {
    items.push(
      <ActionButton key="accept" label="Accept" busy={busy} onClick={() => runAction(() => acceptTicket(ticket.id), "Accepted.")} />,
    );
    items.push(
      <ActionButton key="reject" label="Reject" variant="danger" busy={busy} onClick={() => setShowReject(true)} />,
    );
  }
  if (ticket.status === "ACCEPTED") {
    items.push(
      <RemarkedAction
        key="reached"
        label="Reached Site"
        busy={busy}
        value={reachedComment}
        onChange={setReachedComment}
        onSubmit={() =>
          runAction(async () => {
            const gps = await getBestEffortGpsPosition();
            return reachedSite(ticket.id, reachedComment.trim() || undefined, gps?.lat, gps?.long);
          }, "Marked as reached site.")
        }
      />,
    );
  }
  if (ticket.status === "REACHED_SITE") {
    items.push(
      <RemarkedAction
        key="start"
        label="Start Working"
        busy={busy}
        value={startComment}
        onChange={setStartComment}
        onSubmit={() => runAction(() => startWorking(ticket.id, startComment.trim() || undefined), "Work started.")}
      />,
    );
  }
  const hasSubmittedFsv = fsvList.some((v) => v.status === "SUBMITTED");
  if (ticket.status === "WORKING") {
    items.push(<ActionButton key="pending" label="Mark Pending" variant="secondary" busy={busy} onClick={() => setShowPending(true)} />);
    // Client feedback (2026-08-01) — a separate resolve step, own screen
    // outside the FSV form. FSV is still mandatory — submitting the FSV no
    // longer auto-resolves the ticket (used to); this button only appears
    // once a submitted FSV actually exists for this ticket.
    if (hasSubmittedFsv) {
      items.push(
        <ActionButton key="engineer-resolve" label="Mark Resolved" variant="secondary" busy={busy} onClick={() => setShowResolve(true)} />,
      );
    }
  }

  const FSV_ELIGIBLE_STATUSES: TicketStatus[] = [
    "REACHED_SITE",
    "WORKING",
    "PENDING",
    "ENGINEER_RESOLVED",
    "ASM_RESOLVED",
  ];
  if (FSV_ELIGIBLE_STATUSES.includes(ticket.status)) {
    const hasDraftFsv = fsvList.some((v) => v.status === "DRAFT");
    const alreadyResolvedOnce = ticket.status === "ENGINEER_RESOLVED" || ticket.status === "ASM_RESOLVED";
    const fsvLabel = hasDraftFsv
      ? "Continue Field Service Visit"
      : alreadyResolvedOnce
        ? "Start Another Field Service Visit"
        : "Start Field Service Visit";
    items.push(<ActionButton key="fsv" label={fsvLabel} busy={fsvBusy} onClick={onOpenFsv} />);
  }
  if (ticket.status === "PENDING") {
    items.push(
      <ActionButton key="resume" label="Resume Work" busy={busy} onClick={() => runAction(() => resumeTicket(ticket.id), "Resumed.")} />,
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <p className="mb-2 text-xs font-bold uppercase text-muted">Your Next Action</p>
      {items.length === 0 ? (
        <p className="text-muted">Nothing to do right now.</p>
      ) : (
        <div className="flex flex-col gap-2">{items}</div>
      )}

      {showReject && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-bold uppercase text-navy">Rejection reason</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="mb-2 h-20 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Submit Rejection"
              variant="danger"
              busy={busy || !rejectReason}
              onClick={() => {
                runAction(() => rejectTicket(ticket.id, rejectReason), "Ticket rejected.");
                setShowReject(false);
                setRejectReason("");
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowReject(false)} />
          </div>
        </div>
      )}

      {showPending && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-bold uppercase text-navy">Pending reason</p>
          <select
            value={pendingReason}
            onChange={(e) => setPendingReason(e.target.value as PendingReason)}
            className="mb-2 w-full rounded-md border border-line px-3 py-2 text-sm"
          >
            {Object.entries(PENDING_REASON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            value={pendingNotes}
            onChange={(e) => setPendingNotes(e.target.value)}
            placeholder="Notes (required) — what specifically is being waited on?"
            className="mb-2 h-16 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Mark Pending"
              busy={busy || !pendingNotes.trim()}
              onClick={() => {
                runAction(() => markPending(ticket.id, pendingReason, pendingNotes.trim()), "Marked pending.");
                setShowPending(false);
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowPending(false)} />
          </div>
        </div>
      )}

      {showResolve && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-bold uppercase text-navy">Resolution Summary</p>
          <textarea
            value={resolutionSummary}
            onChange={(e) => setResolutionSummary(e.target.value)}
            placeholder="What was done to resolve this ticket? (min 20 characters)"
            className="mb-2 h-20 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Mark Engineer Resolved"
              busy={busy || resolutionSummary.trim().length < 20}
              onClick={() => {
                runAction(() => engineerResolve(ticket.id, resolutionSummary.trim()), "Marked Engineer Resolved.");
                setShowResolve(false);
                setResolutionSummary("");
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowResolve(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function AssignEngineerCard({
  role,
  ticket,
  busy,
  runAction,
}: {
  role: AuthUser["role"];
  ticket: Ticket;
  busy: boolean;
  runAction: <T>(action: () => Promise<T>, note?: string) => void;
}) {
  const [engineerId, setEngineerId] = useState("");
  const [candidates, setCandidates] = useState<EngineerCandidate[]>([]);

  useEffect(() => {
    if ((role === "ASM" || role === "MANAGER") && (ticket.status === "OPEN" || ticket.status === "ASSIGNED")) {
      engineerCandidates(ticket.customer.region ?? undefined).then(setCandidates).catch(() => setCandidates([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ticket.status, ticket.customer.region]);

  if (ticket.assignedEngineer) {
    return <p className="text-navy">{ticket.assignedEngineer.fullName}</p>;
  }

  if (!((role === "ASM" || role === "MANAGER") && ticket.status !== "CLOSED")) {
    return <p className="text-muted">Unassigned</p>;
  }

  return (
    <div className="space-y-2">
      <select
        value={engineerId}
        onChange={(e) => setEngineerId(e.target.value)}
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
      >
        <option value="">Select engineer…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName} — {c.openLoad} open{c.territoryMatch ? " · territory match" : ""}
          </option>
        ))}
      </select>
      <ActionButton
        label="Assign"
        busy={busy || !engineerId}
        onClick={() => runAction(() => assignTicket(ticket.id, engineerId), "Engineer assigned.")}
      />
    </div>
  );
}

/** Moved into the sidebar per client feedback — was a standalone card in the main action list. */
function ServiceTypeCard({
  ticket,
  runAction,
}: {
  ticket: Ticket;
  runAction: <T>(action: () => Promise<T>, note?: string) => void;
}) {
  const [serviceType, setServiceType] = useState<ServiceType | "">((ticket.serviceType as ServiceType) ?? "");
  const [slaTargetDate, setSlaTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const targetDateLabel = serviceType ? SLA_TARGET_DATE_LABEL[serviceType] : undefined;
  const needsNewTargetDate = targetDateLabel && serviceType !== ticket.serviceType;

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <p className="mb-2 text-xs font-bold uppercase text-muted">Service Type</p>
      <select
        value={serviceType}
        onChange={(e) => {
          setServiceType(e.target.value as ServiceType | "");
          setSlaTargetDate("");
        }}
        className="mb-2 w-full rounded-md border border-line px-3 py-2 text-sm text-navy"
      >
        <option value="">Not yet determined</option>
        {SELECTABLE_SERVICE_TYPES.map((k) => (
          <option key={k} value={k}>
            {SERVICE_TYPE_LABEL[k]}
          </option>
        ))}
      </select>
      {needsNewTargetDate && (
        <div className="mb-2">
          <label className="mb-1 block text-xs font-bold text-navy">{targetDateLabel}</label>
          <input
            type="datetime-local"
            value={slaTargetDate}
            onChange={(e) => setSlaTargetDate(e.target.value)}
            required
            className="w-full rounded-md border border-line px-3 py-2 text-sm text-navy"
          />
        </div>
      )}
      <ActionButton
        label={saving ? "Saving…" : "Update"}
        variant="secondary"
        busy={saving || !serviceType || serviceType === ticket.serviceType || Boolean(needsNewTargetDate && !slaTargetDate)}
        onClick={async () => {
          if (!serviceType) return;
          setSaving(true);
          try {
            await runAction(
              () => updateServiceType(ticket.id, serviceType, needsNewTargetDate ? new Date(slaTargetDate).toISOString() : undefined),
              "Service type updated.",
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

/** Manual-send fallback (2026-07-31, client request) — Call Center/ASM/Manager
 * can copy the CSAT survey link themselves (e.g. to paste into a manual
 * WhatsApp message) instead of relying solely on the automatic N-14 send. */
function CsatLinkCopy({ ticketId }: { ticketId: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/csat/${ticketId}` : "";

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.target.select()}
        className="h-8 flex-1 rounded-md border border-line bg-navy-soft px-2 text-xs text-navy"
      />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="h-8 shrink-0 rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

// "1 Aug 2026, 6:00 PM" — friendlier than the browser's raw locale format,
// and a fixed relative-day hint ("Today"/"Tomorrow"/"in 3 days"/"2 days ago")
// so Admin/ASM don't have to do date math to judge urgency at a glance.
function slaFieldValue(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  const datePart = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function relativeDayHint(v: string | null): string | null {
  if (!v) return null;
  const due = new Date(v);
  const today = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round((dueDay - todayDay) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1) return `in ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/**
 * "Met" is only ever set true once the clock is genuinely satisfied — false
 * doesn't mean breached, it can just mean still in progress. Showing the
 * live clock status (On Track/At Risk/Breached) as a color badge avoids
 * reading an in-progress ticket as if it had already failed its SLA.
 */
function SlaClockRow({
  label,
  due,
  met,
  status,
}: {
  label: string;
  due: string | null;
  met: boolean;
  status: SlaClockStatus | undefined;
}) {
  const hint = relativeDayHint(due);
  const badgeLabel = !due ? null : met ? "Met" : SLA_STATUS_LABEL[status ?? "ON_TRACK"];
  const badgeStyle = !due ? "" : met ? "bg-brand-green-bg text-brand-green" : SLA_STATUS_STYLE[status ?? "ON_TRACK"];

  return (
    <div className="rounded-md bg-navy-soft/50 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
        {badgeLabel && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyle}`}>{badgeLabel}</span>}
      </div>
      <p className="text-navy">{slaFieldValue(due)}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** New card (2026-07-30) — the 4 raw SLA fields (FSD Ticket entity table) weren't shown
 * anywhere before; only the derived status badge existed. Right sidebar, below Service Type.
 * SLA Policy moved in here too (2026-07-31, client request) — was a separate
 * field in the main info grid, now grouped with the rest of the SLA info. */
function SlaFieldsCard({ ticket }: { ticket: Ticket }) {
  const hasPolicy = ticket.slaPolicy && ticket.slaPolicy.responseHours != null && ticket.slaPolicy.resolutionHours != null;
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <p className="mb-3 text-xs font-bold uppercase text-muted">SLA Details</p>
      <div className="mb-3">
        <p className="text-xs font-bold uppercase text-muted">Policy</p>
        <p className="break-words text-navy">
          {hasPolicy
            ? `${ticket.slaPolicy!.responseHours}h response / ${ticket.slaPolicy!.resolutionHours}h resolution`
            : "No policy set for this service type / priority"}
        </p>
      </div>
      <div className="space-y-2">
        <SlaClockRow label="Response Due" due={ticket.slaResponseDue} met={ticket.slaResponseMet} status={ticket.slaResponseStatus} />
        <SlaClockRow label="Resolution Due" due={ticket.slaResolutionDue} met={ticket.slaResolutionMet} status={ticket.slaResolutionStatus} />
      </div>
    </div>
  );
}

/**
 * New dedicated card (2026-07-31, client request) — was inline rows in the
 * main info grid, moved into its own card matching the SLA Details/Service
 * Type pattern. Only shown once the ticket is Closed (CSAT is only ever
 * sent at that point). Shows the customer's actual score/comment once
 * submitted; otherwise a "Resend Survey" action to retrigger N-14 manually
 * (e.g. if the original send silently failed — no real Email/WhatsApp
 * credentials yet — or the customer just hasn't responded).
 */
function CsatCard({ ticket, runAction }: { ticket: Ticket; runAction: <T>(action: () => Promise<T>, note?: string) => void }) {
  const [resending, setResending] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <p className="mb-3 text-xs font-bold uppercase text-muted">Customer Feedback (CSAT)</p>
      {ticket.csatScore != null ? (
        <p className="break-words text-navy">
          {ticket.csatScore}/5{ticket.csatResponseText ? ` — "${ticket.csatResponseText}"` : ""}
        </p>
      ) : (
        <div>
          <p className="mb-2 break-words text-muted">
            {ticket.csatSurveySent ? "Not fulfilled yet — survey sent, awaiting customer response." : "Survey not yet sent."}
          </p>
          <p className="mb-1 text-xs font-bold uppercase text-muted">Survey link</p>
          <div className="mb-3">
            <CsatLinkCopy ticketId={ticket.id} />
          </div>
          <ActionButton
            label={resending ? "Sending…" : "Resend Survey"}
            variant="secondary"
            busy={resending}
            onClick={async () => {
              setResending(true);
              try {
                await runAction(() => resendCsatSurvey(ticket.id), "CSAT survey re-sent.");
              } finally {
                setResending(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function TicketHistoryTabs({
  timeline,
  visits,
  ticket,
  showCommercial,
  role,
}: {
  timeline: TicketAuditEntry[];
  visits: FieldServiceVisit[];
  ticket: Ticket;
  showCommercial: boolean;
  role: AuthUser["role"];
}) {
  const [tab, setTab] = useState<"timeline" | "fsv" | "commercial">("timeline");

  // TEMP (2026-07-30): hide notification-failure entries from the Timeline —
  // client hasn't been told the Notification Module exists yet, and these
  // rows leak that it's live (real SMTP/WhatsApp/Push attempts, currently
  // failing only because .env credentials aren't filled in yet). Backend
  // still logs everything (NotificationLog + this same TicketAuditLog row) —
  // this is a display-only filter. UN-HIDE by deleting this filter once the
  // client has been informed — see ACE-Ticket-Engine-Build-Plan.md.
  const visibleTimeline = timeline.filter((e) => e.fieldName !== "notification_failed");

  return (
    <div>
      <div className="mb-2 flex gap-1 border-b border-line">
        <button
          type="button"
          onClick={() => setTab("timeline")}
          className={`px-3 py-2 text-sm font-bold ${
            tab === "timeline" ? "border-b-2 border-orange text-navy" : "text-muted"
          }`}
        >
          Timeline
        </button>
        <button
          type="button"
          onClick={() => setTab("fsv")}
          className={`px-3 py-2 text-sm font-bold ${tab === "fsv" ? "border-b-2 border-orange text-navy" : "text-muted"}`}
        >
          Field Service Visits {visits.length > 0 ? `(${visits.length})` : ""}
        </button>
        {showCommercial && (
          <button
            type="button"
            onClick={() => setTab("commercial")}
            className={`px-3 py-2 text-sm font-bold ${
              tab === "commercial" ? "border-b-2 border-orange text-navy" : "text-muted"
            }`}
          >
            Commercial
          </button>
        )}
      </div>

      {tab === "commercial" && showCommercial && <CommercialTab ticket={ticket} role={role} />}

      {tab === "timeline" && (
        <div className="rounded-lg border border-line bg-white">
          {visibleTimeline.length === 0 ? (
            <p className="p-4 text-sm text-muted">No history yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visibleTimeline.map((e) => {
                const { headline, note } = describeTimelineEntry(e);
                return (
                  <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                    <div>
                      <p className="text-navy">{headline}</p>
                      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
                      <p className="mt-0.5 text-xs text-muted">by {e.changedByName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{new Date(e.changedAt).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "fsv" && (
        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {visits.length === 0 ? (
            <p className="p-4 text-sm text-muted">No Field Service Visits yet.</p>
          ) : (
            visits.map((v) => {
              const travelHours = hoursBetweenTimestamps(v.travelStartTime, v.siteArrivalTime);
              const workHours = hoursBetweenTimestamps(v.workStartTime, v.workEndTime);
              return (
                <a
                  key={v.id}
                  href={`/dashboard/fsv/${v.id}`}
                  className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-navy-tint"
                >
                  <div>
                    <p className="text-navy">
                      <span className="font-bold">Visit #{v.visitNumber}</span>{" "}
                      <span className="font-mono text-xs text-muted">{v.visitNo}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(v.visitDate).toLocaleDateString()}
                      {v.engineer && <> · Created by {v.engineer.fullName}</>}
                    </p>
                    {(travelHours || workHours) && (
                      <p className="text-xs text-muted">
                        {travelHours && <>Travel: {travelHours}h</>}
                        {travelHours && workHours && " · "}
                        {workHours && <>Work: {workHours}h</>}
                      </p>
                    )}
                    {(v.gpsLatAtCheckin != null || v.gpsLongAtCheckin != null) && (
                      <p className="text-xs text-muted">
                        GPS:{" "}
                        <span
                          role="link"
                          onClick={(e) => {
                            // This whole row is already an <a> to the FSV detail
                            // page — a nested <a> here would be invalid HTML, so
                            // a click-handled span + explicit new-tab open instead.
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://www.google.com/maps?q=${v.gpsLatAtCheckin},${v.gpsLongAtCheckin}`, "_blank", "noopener,noreferrer");
                          }}
                          className="cursor-pointer font-bold text-navy underline"
                        >
                          Open in Google Maps
                        </span>
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      v.status === "SUBMITTED" ? "bg-brand-green-bg text-brand-green" : "bg-navy-tint text-navy"
                    }`}
                  >
                    {v.status}
                  </span>
                </a>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function statusLabelOrRaw(value: string): string {
  return STATUS_LABEL[value as TicketStatus] ?? value;
}

// Same computation as the FSV detail page's TimestampRow — surfaced in the
// FSV tab's list too (client feedback 2026-07-31: "show these details in
// FSV tab for that FSV visit"), so Travel/Work hours are visible without
// opening each visit individually.
function hoursBetweenTimestamps(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  const hours = (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
  return hours >= 0 ? hours.toFixed(1) : null;
}

// Renders each TicketAuditLog row (raw fieldName/oldValue/newValue) into a
// readable headline + optional note, instead of showing enum codes with
// underscores or the "STATUS (note text)" packed format the backend stores.
function describeTimelineEntry(e: TicketAuditEntry): { headline: string; note: string | null } {
  if (e.fieldName === 'status') {
    // WorkflowService packs an optional note as "TARGET_STATUS (note)".
    const match = e.newValue?.match(/^([A-Z_]+)(?: \((.+)\))?$/);
    const targetRaw = match?.[1] ?? e.newValue ?? '';
    const note = match?.[2] ?? null;
    const from = e.oldValue ? statusLabelOrRaw(e.oldValue) : null;
    const to = statusLabelOrRaw(targetRaw);
    return { headline: from ? `Status changed: ${from} → ${to}` : `Status set to ${to}`, note };
  }
  if (e.fieldName === 'serviceType') {
    return { headline: `Service type changed: ${e.oldValue} → ${e.newValue}`, note: null };
  }
  if (e.fieldName === 'duplicate_merge' || e.fieldName === 'duplicate_reference') {
    return { headline: e.newValue ?? '', note: null };
  }
  if (e.fieldName === 'slaResponseStatus' || e.fieldName === 'slaResolutionStatus') {
    const clock = e.fieldName === 'slaResponseStatus' ? 'Response' : 'Resolution';
    const to = SLA_STATUS_LABEL[e.newValue as SlaClockStatus] ?? e.newValue;
    return { headline: `SLA ${clock}: ${to}`, note: null };
  }
  const fieldLabel = e.fieldName
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { headline: `${fieldLabel}: ${e.oldValue ?? '—'} → ${e.newValue ?? '—'}`, note: null };
}

// Linear lifecycle order for the progress bar (§5.4) — PENDING is a branch
// off WORKING in the actual state machine (WORKING ⇄ PENDING), not a strict
// step everyone passes through, but shown inline here since that's where it
// sits structurally; a ticket that never went through it just shows it as
// upcoming/skipped, same as the golden-path briefing's demo bar.
const STATE_ORDER: TicketStatus[] = [
  "OPEN",
  "ASSIGNED",
  "ENGINEER_ASSIGNED",
  "ACCEPTED",
  "REACHED_SITE",
  "WORKING",
  "PENDING",
  "ENGINEER_RESOLVED",
  "ASM_RESOLVED",
  "CLOSED",
];

function StateBar({ status }: { status: TicketStatus }) {
  const currentIndex = STATE_ORDER.indexOf(status);
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* Mobile: compact current-stage label + progress dots, tap to expand the full list. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2.5 text-left sm:hidden"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-navy">{STATUS_LABEL[status]}</span>
          <span className="text-xs text-muted">
            Step {currentIndex + 1} of {STATE_ORDER.length} {expanded ? "▲" : "▼"}
          </span>
        </div>
        <div className="flex gap-1">
          {STATE_ORDER.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? "bg-orange" : "bg-navy-tint"}`}
            />
          ))}
        </div>
        {expanded && (
          <ul className="mt-1.5 divide-y divide-line border-t border-line pt-1.5">
            {STATE_ORDER.map((s, i) => {
              const done = i < currentIndex;
              const now = i === currentIndex;
              return (
                <li key={s} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className={now ? "text-orange" : done ? "text-navy" : "text-muted"}>
                    {done ? "✓" : now ? "●" : "○"}
                  </span>
                  <span className={now ? "font-bold text-navy" : done ? "text-navy" : "text-muted"}>
                    {STATUS_LABEL[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </button>

      {/* Desktop/tablet: original full pill bar. */}
      <div className="hidden flex-wrap gap-y-1 text-xs font-bold sm:flex">
        {STATE_ORDER.map((s, i) => {
          const done = i < currentIndex;
          const now = i === currentIndex;
          return (
            <span
              key={s}
              className={`whitespace-nowrap px-3.5 py-2.5 first:rounded-l-full last:rounded-r-full ${
                now
                  ? "bg-orange text-navy"
                  : done
                    ? "bg-navy text-white"
                    : "bg-navy-tint text-muted"
              }`}
            >
              {STATUS_LABEL[s]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase text-navy">{title}</h3>
          <button type="button" onClick={onClose} className="text-lg leading-none text-muted hover:text-navy">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DotMenu({ items }: { items: { label: string; onClick: () => void; variant?: "danger" }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-2xl font-bold leading-none text-navy shadow-sm hover:border-navy hover:bg-navy-tint"
        aria-label="More actions"
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-white py-1 shadow-lg">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-navy-tint ${
                  it.variant === "danger" ? "text-brand-red" : "text-navy"
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  variant?: "primary" | "danger" | "secondary";
}) {
  const styles = {
    primary: "bg-orange text-navy",
    danger: "bg-brand-red-bg text-brand-red",
    secondary: "bg-navy-tint text-navy",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-md px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${styles}`}
    >
      {label}
    </button>
  );
}

// A single-step transition button paired with an optional remark — client
// request: engineer/ASM can leave a note on each stage from Accepted onward.
function RemarkedAction({
  label,
  busy,
  value,
  onChange,
  onSubmit,
}: {
  label: string;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Remark (optional)"
        className="h-9 w-56 rounded-md border border-line px-2 text-sm text-navy placeholder:text-text-disabled"
      />
      <ActionButton label={label} busy={busy} onClick={onSubmit} />
    </div>
  );
}

/**
 * One row of role-appropriate action buttons — mirrors TICKET_TRANSITIONS'
 * allowedRoles + next[] exactly, so nothing here can call an endpoint the
 * backend would 403 on.
 */
function TicketActions({
  role,
  ticket,
  busy,
  runAction,
}: {
  role: AuthUser["role"];
  ticket: Ticket;
  busy: boolean;
  runAction: <T>(action: () => Promise<T>, note?: string) => void;
}) {
  const [asmResolveComment, setAsmResolveComment] = useState("");
  const [closeComment, setCloseComment] = useState("");
  const [showRejectResolution, setShowRejectResolution] = useState(false);
  const [rejectResolutionReason, setRejectResolutionReason] = useState("");
  const [rejectResolutionEngineerId, setRejectResolutionEngineerId] = useState("");
  const [rejectCandidates, setRejectCandidates] = useState<EngineerCandidate[]>([]);

  useEffect(() => {
    if ((role === "ASM" || role === "MANAGER") && ticket.status === "ENGINEER_RESOLVED") {
      engineerCandidates(ticket.customer.region ?? undefined)
        .then(setRejectCandidates)
        .catch(() => setRejectCandidates([]));
      setRejectResolutionEngineerId(ticket.assignedEngineer?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ticket.status, ticket.customer.region, ticket.assignedEngineer?.id]);

  const buttons: React.ReactNode[] = [];

  // Engineer's Accept/Reject/Reached Site/Start Working/Mark Pending/FSV/
  // Resume actions now live in the sidebar's EngineerActionCard instead —
  // not relevant to surface twice, and the sidebar is the more prominent
  // spot for "what do I do next" for that role specifically.

  // ASM/Manager: confirm resolution, or reject it back to an engineer
  if ((role === "ASM" || role === "MANAGER") && ticket.status === "ENGINEER_RESOLVED") {
    buttons.push(
      <RemarkedAction
        key="asmresolve"
        label="Confirm Resolution"
        busy={busy}
        value={asmResolveComment}
        onChange={setAsmResolveComment}
        onSubmit={() =>
          runAction(() => asmResolveTicket(ticket.id, asmResolveComment.trim() || undefined), "Resolution confirmed.")
        }
      />,
    );
    if (!showRejectResolution) {
      buttons.push(
        <ActionButton
          key="reject-resolution"
          label="Reject"
          variant="secondary"
          busy={busy}
          onClick={() => setShowRejectResolution(true)}
        />,
      );
    } else {
      buttons.push(
        <div key="reject-resolution-form" className="w-full space-y-2 rounded-md border border-line bg-navy-soft p-3">
          <textarea
            value={rejectResolutionReason}
            onChange={(e) => setRejectResolutionReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="h-16 w-full rounded-md border border-line p-2 text-sm text-navy"
          />
          <select
            value={rejectResolutionEngineerId}
            onChange={(e) => setRejectResolutionEngineerId(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          >
            <option value="">Select engineer…</option>
            {ticket.assignedEngineer && (
              <option value={ticket.assignedEngineer.id}>{ticket.assignedEngineer.fullName} (same engineer)</option>
            )}
            {rejectCandidates
              .filter((c) => c.id !== ticket.assignedEngineer?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} — {c.openLoad} open{c.territoryMatch ? " · territory match" : ""}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <ActionButton
              label="Submit Rejection"
              busy={busy || !rejectResolutionReason.trim() || !rejectResolutionEngineerId}
              onClick={() => {
                runAction(
                  () => asmRejectResolution(ticket.id, rejectResolutionEngineerId, rejectResolutionReason.trim()),
                  "Ticket rejected and reassigned.",
                );
                setShowRejectResolution(false);
                setRejectResolutionReason("");
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowRejectResolution(false)} />
          </div>
        </div>,
      );
    }
  }

  // Call Center/Manager: close
  if ((role === "CALL_CENTER" || role === "MANAGER") && ticket.status === "ASM_RESOLVED") {
    buttons.push(
      <RemarkedAction
        key="close"
        label="Close Ticket"
        busy={busy}
        value={closeComment}
        onChange={setCloseComment}
        onSubmit={() => runAction(() => closeTicket(ticket.id, closeComment.trim() || undefined), "Ticket closed.")}
      />,
    );
  }

  // Admin: reopen
  if (role === "ADMIN" && ticket.status === "CLOSED") {
    buttons.push(
      <ActionButton
        key="reopen"
        label="Reopen"
        variant="secondary"
        busy={busy}
        onClick={() => runAction(() => reopenTicket(ticket.id), "Ticket reopened.")}
      />,
    );
  }

  return (
    <div className="space-y-3">
      {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}
    </div>
  );
}

/**
 * Commercial (Quotation/Direct Sales Order) panel, extracted into its own
 * tab — was previously an always-visible card in the main action list,
 * moved here per client feedback for a cleaner, more organized layout.
 */
// Client decision (2026-07-27): Create Quotation/Direct Sales Order is only
// meaningful once the engineer has actually engaged with the ticket, up
// through Pending (still an active engagement, just blocked on something) —
// not before Accepted, and not once Engineer/ASM has already resolved it.
// Replaces the previous "does any FSV exist" gate, which an engineer could
// satisfy by opening an FSV without ever leaving Accepted.
const COMMERCIAL_ALLOWED_STATUSES: TicketStatus[] = ["ACCEPTED", "REACHED_SITE", "WORKING", "PENDING"];

function CommercialTab({ ticket, role }: { ticket: Ticket; role: AuthUser["role"] }) {
  const [chargeability, setChargeability] = useState<Chargeability | null>(null);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [resultModal, setResultModal] = useState<{ title: string; message: string; success: boolean } | null>(null);
  // Local, since this component doesn't own/refetch the parent `ticket` —
  // seeded from the prop, then updated directly from createDirectInvoice's
  // own response so the UI reflects it immediately without a full reload.
  const [directInvoiceId, setDirectInvoiceId] = useState(ticket.erpnextInvoiceId ?? null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const router = useRouter();
  const canCreateCommercial = COMMERCIAL_ALLOWED_STATUSES.includes(ticket.status);

  function extractErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string | string[] } | null;
      return Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Something went wrong.";
    }
    return "Could not reach the server.";
  }

  useEffect(() => {
    isTicketChargeable(ticket.id).then(setChargeability).catch(() => setChargeability(null));
    listQuotationsForTicket(ticket.id).then(setQuotations).catch(() => setQuotations([]));
    listDeliveriesForTicket(ticket.id).then(setDeliveries).catch(() => setDeliveries([]));
  }, [ticket.id]);

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      {showOverrideModal && (
        <Modal title="Reclassify as Under Warranty" onClose={() => setShowOverrideModal(false)}>
          <p className="mb-2 text-xs text-muted">
            Overrides this ticket&apos;s chargeability to Under Warranty. The equipment&apos;s own auto-computed warranty
            status is not changed — only this ticket. Always audit-logged with the reason below.
          </p>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason (required, audit-logged)"
            className="mb-3 h-20 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Confirm Override"
              variant="danger"
              busy={overrideBusy || !overrideReason.trim()}
              onClick={async () => {
                setOverrideBusy(true);
                try {
                  await overrideWarranty(ticket.id, true, overrideReason.trim());
                  setChargeability(await isTicketChargeable(ticket.id));
                  setShowOverrideModal(false);
                  setOverrideReason("");
                } catch (err) {
                  setResultModal({ title: "Could not override", message: extractErrorMessage(err), success: false });
                } finally {
                  setOverrideBusy(false);
                }
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowOverrideModal(false)} />
          </div>
        </Modal>
      )}
      {chargeability?.chargeable && (role === "MANAGER" || role === "ADMIN") && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-navy-tint px-2.5 py-1.5">
          <span className="text-xs text-muted">Manager/Admin: this ticket can be reclassified as Under Warranty.</span>
          <button
            type="button"
            className="text-xs font-bold text-navy underline"
            onClick={() => setShowOverrideModal(true)}
          >
            Reclassify as Under Warranty
          </button>
        </div>
      )}
      {chargeability === null ? (
        <p className="text-xs text-muted">Checking chargeable status…</p>
      ) : quotations.length === 0 && deliveries.length === 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {chargeability.chargeable
              ? "This ticket is chargeable."
              : chargeability.reason === "WARRANTY"
                ? `Covered by Warranty${chargeability.warrantyEndDate ? ` (until ${new Date(chargeability.warrantyEndDate).toLocaleDateString()})` : ""} — not chargeable.`
                : chargeability.reason === "AMC"
                  ? `Covered by AMC ${chargeability.amcContractRef}${chargeability.amcEndDate ? ` (until ${new Date(chargeability.amcEndDate).toLocaleDateString()})` : ""} — not chargeable.`
                  : "Not chargeable."}
          </span>
          {!canCreateCommercial ? (
            <span className="text-xs italic text-muted">(available once the ticket is Accepted, through Pending)</span>
          ) : (
            <>
              <ActionButton
              label={chargeability.chargeable ? "Create Quotation" : "Create Direct Sales Order"}
              busy={commercialBusy}
              variant="secondary"
              onClick={async () => {
                setCommercialBusy(true);
                try {
                  if (chargeability.chargeable) {
                    const validUntil = new Date();
                    validUntil.setDate(validUntil.getDate() + 14);
                    const q = await createQuotation(ticket.id, {
                      validUntil: validUntil.toISOString().slice(0, 10),
                    });
                    router.push(`/dashboard/quotations/${q.id}`);
                  } else {
                    const created = await createDirectSalesOrder(ticket.id);
                    setDeliveries(await listDeliveriesForTicket(ticket.id));
                    setResultModal({
                      title: "Direct Sales Order created",
                      message: created.erpnextSalesOrderId
                        ? `Synced to ERPNext — Sales Order ${created.erpnextSalesOrderId}.`
                        : (created.erpnextSyncNote ?? "Created, but not yet synced to ERPNext."),
                      success: !!created.erpnextSalesOrderId,
                    });
                  }
                } catch (err) {
                  setResultModal({ title: "Could not create", message: extractErrorMessage(err), success: false });
                } finally {
                  setCommercialBusy(false);
                }
              }}
              />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => (
            <div key={q.id} className="rounded-md border border-line p-2">
              <a href={`/dashboard/quotations/${q.id}`} className="block text-xs font-bold text-navy hover:underline">
                {q.quotationNo} — {q.status}
              </a>
              {q.erpnextQuotationId && (
                <div className="mt-1.5 space-y-0.5 text-xs text-muted">
                  <p>ERPNext Quotation: <span className="font-bold text-navy">{q.erpnextQuotationId}</span></p>
                  <p>Sales Order: <span className={q.erpnextSalesOrderId ? "font-bold text-navy" : ""}>{q.erpnextSalesOrderId ?? "—"}</span></p>
                  <p>Delivery Note: <span className={q.erpnextDeliveryNoteId ? "font-bold text-navy" : ""}>{q.erpnextDeliveryNoteId ?? "—"}</span></p>
                  <p>Sales Invoice: <span className={q.erpnextInvoiceId ? "font-bold text-navy" : ""}>{q.erpnextInvoiceId ?? "—"}</span></p>
                </div>
              )}
            </div>
          ))}
          {deliveries.map((d) => (
            <div key={d.id} className="text-xs text-muted">
              <p>
                {d.quotationId ? "Sales Order via Quotation" : "Direct Sales Order (warranty/AMC)"} — delivery: {d.status}
              </p>
              {d.erpnextSalesOrderId ? (
                <div className="text-brand-green">
                  <p>ERPNext Sales Order: {d.erpnextSalesOrderId}</p>
                  {!d.quotationId && (
                    <p>
                      Sales Invoice:{" "}
                      <span className={directInvoiceId ? "font-bold text-navy" : "text-muted"}>{directInvoiceId ?? "—"}</span>
                      {!directInvoiceId && ticket.status === "CLOSED" && (
                        <button
                          type="button"
                          className="ml-2 font-bold text-navy underline"
                          onClick={async () => {
                            setCommercialBusy(true);
                            try {
                              const result = await createDirectInvoice(ticket.id);
                              setDirectInvoiceId(result.erpnextInvoiceId);
                              setResultModal({
                                title: "Sales Invoice created",
                                message: "A zero-rate Sales Invoice was created in ERPNext from this Sales Order.",
                                success: true,
                              });
                            } catch (err) {
                              setResultModal({ title: "Could not create invoice", message: extractErrorMessage(err), success: false });
                            } finally {
                              setCommercialBusy(false);
                            }
                          }}
                        >
                          Create Invoice
                        </button>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-brand-red">
                  <span>{d.erpnextSyncNote ?? "Not yet synced to ERPNext"}</span>
                  {!d.quotationId && (
                    <button
                      type="button"
                      className="font-bold underline"
                      onClick={async () => {
                        setCommercialBusy(true);
                        try {
                          const retried = await retryDirectSalesOrderErpSync(d.id);
                          setDeliveries(await listDeliveriesForTicket(ticket.id));
                          setResultModal({
                            title: "Retry complete",
                            message: retried.erpnextSalesOrderId
                              ? `Synced to ERPNext — Sales Order ${retried.erpnextSalesOrderId}.`
                              : (retried.erpnextSyncNote ?? "Still not synced — no reason given."),
                            success: !!retried.erpnextSalesOrderId,
                          });
                        } catch (err) {
                          setResultModal({ title: "Retry failed", message: extractErrorMessage(err), success: false });
                        } finally {
                          setCommercialBusy(false);
                        }
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resultModal && (
        <Modal title={resultModal.title} onClose={() => setResultModal(null)}>
          <p className={`text-sm ${resultModal.success ? "text-brand-green" : "text-brand-red"}`}>
            {resultModal.message}
          </p>
          <div className="mt-3">
            <ActionButton label="OK" busy={false} onClick={() => setResultModal(null)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
