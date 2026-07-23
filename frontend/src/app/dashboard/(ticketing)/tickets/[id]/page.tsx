"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createFsv, FieldServiceVisit, listFsvForTicket } from "@/lib/ticketing/fsv";
import {
  Chargeability,
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
  PENDING_REASON_LABEL,
  PRIORITY_STYLE,
  SERVICE_TYPE_LABEL,
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
  assignTicket,
  closeTicket,
  EngineerCandidate,
  engineerCandidates,
  getTicket,
  markPending,
  reachedSite,
  regularizeTicket,
  rejectTicket,
  reopenTicket,
  resolveDuplicate,
  resumeTicket,
  startWorking,
  TicketAuditEntry,
  ticketTimeline,
  updateServiceType,
} from "@/lib/ticketing/actions";

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
  const [showMergeReason, setShowMergeReason] = useState(false);
  const [mergeReason, setMergeReason] = useState("");

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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <p className="font-mono text-xs text-muted">{ticket.ticketNo}</p>
        <h1 className="text-xl font-bold text-navy">{ticket.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[ticket.status]}`}>
            {STATUS_LABEL[ticket.status]}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[ticket.priority]}`}>
            {ticket.priority}
          </span>
          <span className="text-xs text-muted">{SERVICE_TYPE_LABEL[ticket.serviceType as ServiceType] ?? ticket.serviceType}</span>
        </div>
      </div>

      <StateBar status={ticket.status} />

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
          <p className="text-xs font-bold uppercase text-muted">Engineer</p>
          <p className="break-words text-navy">{ticket.assignedEngineer?.fullName ?? "Unassigned"}</p>
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

      {ticket.possibleDuplicateOf && !ticket.duplicateFlagResolved && (
        <div className="rounded-lg border border-brand-amber bg-brand-amber-bg p-3">
          <p className="text-sm text-navy">
            Possible duplicate of{" "}
            <a href={`/dashboard/tickets/${ticket.possibleDuplicateOf.id}`} className="font-bold underline">
              {ticket.possibleDuplicateOf.ticketNo}
            </a>{" "}
            ({STATUS_LABEL[ticket.possibleDuplicateOf.status]}).
          </p>
          {(role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN") && (
            <>
              <div className="mt-2 flex gap-2">
                <ActionButton
                  label="Merge (close this one)"
                  variant="danger"
                  busy={busy}
                  onClick={() => setShowMergeReason((s) => !s)}
                />
                <ActionButton
                  label="Not a duplicate — dismiss"
                  variant="secondary"
                  busy={busy}
                  onClick={() => runAction(() => resolveDuplicate(ticket.id, "DISMISS"), "Duplicate flag dismissed.")}
                />
              </div>
              {showMergeReason && (
                <div className="mt-2">
                  <textarea
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    placeholder="Reason (required, audit-logged)"
                    className="mb-2 h-16 w-full rounded-md border border-line p-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <ActionButton
                      label="Confirm Merge"
                      variant="danger"
                      busy={busy || !mergeReason.trim()}
                      onClick={() => {
                        runAction(
                          () => resolveDuplicate(ticket.id, "MERGE", mergeReason.trim()),
                          "Ticket merged and closed.",
                        );
                        setShowMergeReason(false);
                        setMergeReason("");
                      }}
                    />
                    <ActionButton
                      label="Cancel"
                      variant="secondary"
                      busy={false}
                      onClick={() => setShowMergeReason(false)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <TicketActions role={role} ticket={ticket} busy={busy} runAction={runAction} />

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">Timeline</h2>
        <div className="rounded-lg border border-line bg-white">
          {timeline.length === 0 ? (
            <p className="p-4 text-sm text-muted">No history yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {timeline.map((e) => {
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
      </div>

      {visits.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">Field Service Visits</h2>
          <div className="divide-y divide-line rounded-lg border border-line bg-white">
            {visits.map((v) => (
              <a
                key={v.id}
                href={`/dashboard/fsv/${v.id}`}
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-navy-tint"
              >
                <div>
                  <p className="font-mono text-xs text-muted">{v.visitNo}</p>
                  <p className="text-navy">Visit #{v.visitNumber}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    v.status === "SUBMITTED" ? "bg-brand-green-bg text-brand-green" : "bg-navy-tint text-navy"
                  }`}
                >
                  {v.status}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabelOrRaw(value: string): string {
  return STATUS_LABEL[value as TicketStatus] ?? value;
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
  const [engineerId, setEngineerId] = useState("");
  const [candidates, setCandidates] = useState<EngineerCandidate[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [pendingReason, setPendingReason] = useState<PendingReason>("AWAITING_PARTS");
  const [pendingNotes, setPendingNotes] = useState("");
  const [showPending, setShowPending] = useState(false);
  const [fsvList, setFsvList] = useState<FieldServiceVisit[]>([]);
  const [fsvBusy, setFsvBusy] = useState(false);
  const [reachedComment, setReachedComment] = useState("");
  const [startComment, setStartComment] = useState("");
  const [asmResolveComment, setAsmResolveComment] = useState("");
  const [closeComment, setCloseComment] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType | "">((ticket.serviceType as ServiceType) ?? "");
  const [serviceTypeSaving, setServiceTypeSaving] = useState(false);
  const [chargeability, setChargeability] = useState<Chargeability | null>(null);
  const [showRegularize, setShowRegularize] = useState(false);
  const [regularizeTarget, setRegularizeTarget] = useState<TicketStatus>("OPEN");
  const [regularizeReason, setRegularizeReason] = useState("");
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if ((role === "ASM" || role === "MANAGER") && (ticket.status === "OPEN" || ticket.status === "ASSIGNED")) {
      engineerCandidates(ticket.customer.region ?? undefined).then(setCandidates).catch(() => setCandidates([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ticket.status, ticket.customer.region]);

  useEffect(() => {
    listFsvForTicket(ticket.id).then(setFsvList).catch(() => setFsvList([]));
  }, [ticket.id]);

  useEffect(() => {
    if (role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN") {
      isTicketChargeable(ticket.id).then(setChargeability).catch(() => setChargeability(null));
      listQuotationsForTicket(ticket.id).then(setQuotations).catch(() => setQuotations([]));
      listDeliveriesForTicket(ticket.id).then(setDeliveries).catch(() => setDeliveries([]));
    }
  }, [role, ticket.id]);

  async function onOpenFsv() {
    setFsvBusy(true);
    try {
      const existingDraft = fsvList.find((v) => v.status === "DRAFT");
      if (existingDraft) {
        router.push(`/dashboard/fsv/${existingDraft.id}`);
        return;
      }
      const created = await createFsv(ticket.id, new Date().toISOString());
      router.push(`/dashboard/fsv/${created.id}`);
    } finally {
      setFsvBusy(false);
    }
  }

  const buttons: React.ReactNode[] = [];

  // Service type may not be known at creation — ASM/Engineer/Manager/Admin
  // can set/update it any time before the ticket is closed.
  const canUpdateServiceType =
    (role === "ASM" || role === "ENGINEER" || role === "MANAGER" || role === "ADMIN") && ticket.status !== "CLOSED";

  // ASM/Manager: assign an engineer (covers OPEN and ASSIGNED per tickets.service.ts assign()).
  if ((role === "ASM" || role === "MANAGER") && ticket.status !== "CLOSED" && !ticket.assignedEngineer) {
    buttons.push(
      <div key="assign" className="flex flex-wrap items-center gap-2">
        <select
          value={engineerId}
          onChange={(e) => setEngineerId(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm"
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
      </div>,
    );
  }

  // Engineer: Accept / Reject
  if (role === "ENGINEER" && ticket.status === "ENGINEER_ASSIGNED") {
    buttons.push(
      <ActionButton key="accept" label="Accept" busy={busy} onClick={() => runAction(() => acceptTicket(ticket.id), "Accepted.")} />,
    );
    buttons.push(
      <ActionButton key="reject" label="Reject" variant="danger" busy={busy} onClick={() => setShowReject(true)} />,
    );
  }

  // Engineer: Reached Site — remark optional (§ client request: remarks on
  // each stage from Accepted onward)
  if (role === "ENGINEER" && ticket.status === "ACCEPTED") {
    buttons.push(
      <RemarkedAction
        key="reached"
        label="Reached Site"
        busy={busy}
        value={reachedComment}
        onChange={setReachedComment}
        onSubmit={() =>
          runAction(() => reachedSite(ticket.id, reachedComment.trim() || undefined), "Marked as reached site.")
        }
      />,
    );
  }

  // Engineer: Start Working
  if (role === "ENGINEER" && ticket.status === "REACHED_SITE") {
    buttons.push(
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

  // Engineer: Mark Pending / Field Service Visit (submitting the FSV is what
  // moves the ticket to Engineer Resolved — see fsv.service.ts's submit()).
  if (role === "ENGINEER" && ticket.status === "WORKING") {
    buttons.push(<ActionButton key="pending" label="Mark Pending" variant="secondary" busy={busy} onClick={() => setShowPending(true)} />);
    buttons.push(
      <ActionButton
        key="fsv"
        label={fsvList.some((v) => v.status === "DRAFT") ? "Continue Field Service Visit" : "Start Field Service Visit"}
        busy={fsvBusy}
        onClick={onOpenFsv}
      />,
    );
  }

  // Engineer: Resume
  if (role === "ENGINEER" && ticket.status === "PENDING") {
    buttons.push(
      <ActionButton key="resume" label="Resume Work" busy={busy} onClick={() => runAction(() => resumeTicket(ticket.id), "Resumed.")} />,
    );
  }

  // ASM/Manager: confirm resolution
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

  // Admin/Call Center: regularize (force to any state, always reasoned)
  if (role === "ADMIN" || role === "CALL_CENTER") {
    buttons.push(
      <ActionButton
        key="regularize"
        label="Regularize"
        variant="secondary"
        busy={busy}
        onClick={() => setShowRegularize(true)}
      />,
    );
  }

  return (
    <div className="space-y-3">
      {canUpdateServiceType && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
          <p className="text-xs font-bold uppercase text-muted">Service Type</p>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType | "")}
            className="h-9 rounded-md border border-line px-2 text-sm text-navy"
          >
            <option value="">Not yet determined</option>
            {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <ActionButton
            label={serviceTypeSaving ? "Saving…" : "Update"}
            busy={serviceTypeSaving || !serviceType || serviceType === ticket.serviceType}
            variant="secondary"
            onClick={async () => {
              if (!serviceType) return;
              setServiceTypeSaving(true);
              try {
                await runAction(() => updateServiceType(ticket.id, serviceType), "Service type updated.");
              } finally {
                setServiceTypeSaving(false);
              }
            }}
          />
        </div>
      )}

      {(role === "CALL_CENTER" || role === "ASM" || role === "MANAGER" || role === "ADMIN") && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-2 text-xs font-bold uppercase text-muted">Commercial</p>
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
                      const q = await createQuotation(ticket.id, { validUntil: validUntil.toISOString().slice(0, 10) });
                      router.push(`/dashboard/quotations/${q.id}`);
                    } else {
                      await createDirectSalesOrder(ticket.id);
                      setDeliveries(await listDeliveriesForTicket(ticket.id));
                    }
                  } finally {
                    setCommercialBusy(false);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-1">
              {quotations.map((q) => (
                <a key={q.id} href={`/dashboard/quotations/${q.id}`} className="block text-xs font-bold text-navy hover:underline">
                  {q.quotationNo} — {q.status}
                </a>
              ))}
              {deliveries.map((d) => (
                <div key={d.id} className="text-xs text-muted">
                  <p>
                    {d.quotationId ? "Sales Order via Quotation" : "Direct Sales Order (warranty/AMC)"} — delivery: {d.status}
                  </p>
                  {d.erpnextSalesOrderId ? (
                    <p className="text-brand-green">ERPNext Sales Order: {d.erpnextSalesOrderId}</p>
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
                              await retryDirectSalesOrderErpSync(d.id);
                              setDeliveries(await listDeliveriesForTicket(ticket.id));
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
        </div>
      )}

      {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}

      {showReject && (
        <div className="rounded-lg border border-line bg-white p-4">
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
        <div className="rounded-lg border border-line bg-white p-4">
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
            placeholder="Notes (optional)"
            className="mb-2 h-16 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Mark Pending"
              busy={busy}
              onClick={() => {
                runAction(() => markPending(ticket.id, pendingReason, pendingNotes || undefined), "Marked pending.");
                setShowPending(false);
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowPending(false)} />
          </div>
        </div>
      )}

      {showRegularize && (
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase text-navy">Regularize — force to any status</p>
          <p className="mb-2 text-xs text-muted">
            Bypasses the normal workflow rules. Always audit-logged with the reason below.
          </p>
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
            className="mb-2 h-20 w-full rounded-md border border-line p-2 text-sm"
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
                setShowRegularize(false);
                setRegularizeReason("");
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowRegularize(false)} />
          </div>
        </div>
      )}

    </div>
  );
}
