"use client";

import { use, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
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
  resolveTicket,
  resumeTicket,
  startWorking,
  TicketAuditEntry,
  ticketTimeline,
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

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getTicket(id), ticketTimeline(id)])
      .then(([t, tl]) => {
        setTicket(t);
        setTimeline(tl);
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
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
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

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-muted">Customer</p>
          <p className="text-navy">{ticket.customer.customerName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-muted">Site</p>
          <p className="text-navy">{ticket.site?.siteName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-muted">Equipment</p>
          <p className="text-navy">{ticket.equipment?.itemName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-muted">Engineer</p>
          <p className="text-navy">{ticket.assignedEngineer?.fullName ?? "Unassigned"}</p>
        </div>
        {ticket.status === "PENDING" && (
          <div className="col-span-2">
            <p className="text-xs font-bold uppercase text-muted">Pending reason</p>
            <p className="text-navy">
              {ticket.pendingReason ? PENDING_REASON_LABEL[ticket.pendingReason] : "—"}
              {ticket.pendingNotes ? ` — ${ticket.pendingNotes}` : ""}
            </p>
          </div>
        )}
        {ticket.resolutionSummary && (
          <div className="col-span-2">
            <p className="text-xs font-bold uppercase text-muted">Resolution summary</p>
            <p className="text-navy">{ticket.resolutionSummary}</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}
      {notice && <p className="rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}

      <TicketActions role={role} ticket={ticket} busy={busy} runAction={runAction} />

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">Timeline</h2>
        <div className="rounded-lg border border-line bg-white">
          {timeline.length === 0 ? (
            <p className="p-4 text-sm text-muted">No history yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {timeline.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-navy">
                    {e.oldValue} → {e.newValue}
                  </span>
                  <span className="text-xs text-muted">{new Date(e.changedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [showResolve, setShowResolve] = useState(false);

  useEffect(() => {
    if ((role === "ASM" || role === "MANAGER") && (ticket.status === "OPEN" || ticket.status === "ASSIGNED")) {
      engineerCandidates(ticket.customer.region).then(setCandidates).catch(() => setCandidates([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ticket.status, ticket.customer.region]);

  const buttons: React.ReactNode[] = [];

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

  // Engineer: Reached Site
  if (role === "ENGINEER" && ticket.status === "ACCEPTED") {
    buttons.push(
      <ActionButton
        key="reached"
        label="Reached Site"
        busy={busy}
        onClick={() => runAction(() => reachedSite(ticket.id), "Marked as reached site.")}
      />,
    );
  }

  // Engineer: Start Working
  if (role === "ENGINEER" && ticket.status === "REACHED_SITE") {
    buttons.push(
      <ActionButton
        key="start"
        label="Start Working"
        busy={busy}
        onClick={() => runAction(() => startWorking(ticket.id), "Work started.")}
      />,
    );
  }

  // Engineer: Mark Pending / Resolve
  if (role === "ENGINEER" && ticket.status === "WORKING") {
    buttons.push(<ActionButton key="pending" label="Mark Pending" variant="secondary" busy={busy} onClick={() => setShowPending(true)} />);
    buttons.push(<ActionButton key="resolve" label="Resolve" busy={busy} onClick={() => setShowResolve(true)} />);
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
      <ActionButton
        key="asmresolve"
        label="Confirm Resolution"
        busy={busy}
        onClick={() => runAction(() => asmResolveTicket(ticket.id), "Resolution confirmed.")}
      />,
    );
  }

  // Call Center/Manager: close
  if ((role === "CALL_CENTER" || role === "MANAGER") && ticket.status === "ASM_RESOLVED") {
    buttons.push(
      <ActionButton key="close" label="Close Ticket" busy={busy} onClick={() => runAction(() => closeTicket(ticket.id), "Ticket closed.")} />,
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
        onClick={() => {
          const target = window.prompt(
            "Target status (OPEN/ASSIGNED/ENGINEER_ASSIGNED/ACCEPTED/REACHED_SITE/WORKING/PENDING/ENGINEER_RESOLVED/ASM_RESOLVED/CLOSED):",
          );
          if (!target) return;
          const reason = window.prompt("Reason (required, audit-logged):");
          if (!reason) return;
          runAction(() => regularizeTicket(ticket.id, target as any, reason), "Ticket regularized.");
        }}
      />,
    );
  }

  return (
    <div className="space-y-3">
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

      {showResolve && (
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase text-navy">Resolution summary</p>
          <textarea
            value={resolutionSummary}
            onChange={(e) => setResolutionSummary(e.target.value)}
            className="mb-2 h-20 w-full rounded-md border border-line p-2 text-sm"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Submit Resolution"
              busy={busy || !resolutionSummary}
              onClick={() => {
                runAction(() => resolveTicket(ticket.id, resolutionSummary), "Marked resolved.");
                setShowResolve(false);
              }}
            />
            <ActionButton label="Cancel" variant="secondary" busy={false} onClick={() => setShowResolve(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
