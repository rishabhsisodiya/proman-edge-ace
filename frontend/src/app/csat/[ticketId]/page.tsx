"use client";

import { use, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { CsatSurveyState, getCsatSurveyState, submitCsat } from "@/lib/ticketing/csat";

// Public CSAT survey page (N-14, FSD §9) — no login, reached via the
// {{survey_link}} sent on ticket closure. The only unauthenticated
// customer-facing page in this app; deliberately outside /dashboard so the
// route proxy (which only guards /dashboard/*) never touches it.
export default function CsatSurveyPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  const [state, setState] = useState<CsatSurveyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState(0);
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getCsatSurveyState(ticketId)
      .then(setState)
      .catch(() => setError("This survey link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [ticketId]);

  async function onSubmit() {
    if (!score) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCsat(ticketId, score, responseText.trim() || undefined);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Could not submit feedback.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-soft px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-[0_1px_4px_rgba(42,47,105,.08)]">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error && !state ? (
          <p className="text-sm text-brand-red">{error}</p>
        ) : state ? (
          submitted || state.alreadySubmitted ? (
            <div className="text-center">
              <p className="mb-2 text-lg font-bold text-navy">Thank you for your feedback!</p>
              <p className="text-sm text-muted">
                {state.alreadySubmitted && !submitted
                  ? `You already rated this service ${state.score}/5.`
                  : "We appreciate you taking the time to rate our service."}
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-muted">Service Request {state.ticketNo}</p>
              <h1 className="mb-4 text-lg font-bold text-navy">How did we do?</h1>
              <div className="mb-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold transition ${
                      score >= n ? "border-orange bg-orange text-navy" : "border-line text-muted hover:border-navy"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Any comments? (optional)"
                className="mb-3 h-24 w-full rounded-md border border-line p-2 text-sm text-navy placeholder:text-text-disabled"
              />
              {error && <p className="mb-3 text-xs text-brand-red">{error}</p>}
              <button
                type="button"
                disabled={!score || submitting}
                onClick={onSubmit}
                className="h-11 w-full rounded-md bg-orange text-sm font-bold text-navy transition disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
