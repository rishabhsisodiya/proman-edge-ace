import { colors } from "@/lib/brand";

/**
 * Shared error screen for dashboard-module pages (Manufacturing, Sales, etc.)
 * — distinguishes "you don't have access to this dashboard" (403) from a real
 * connection/server failure, instead of one generic message for both.
 */
export function DashboardError({ status, onRetry }: { status?: number; onRetry?: () => void }) {
  const isForbidden = status === 403;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.navySoft,
        padding: 24,
        fontFamily: "Arial, 'Arial Narrow', Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          padding: "32px 36px",
          maxWidth: 420,
          textAlign: "center",
          boxShadow: "0 8px 30px rgba(42,47,105,.10)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: isForbidden ? colors.warningBg : colors.errorBg,
            color: isForbidden ? colors.warning : colors.error,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 22,
          }}
        >
          <i className={`ti ${isForbidden ? "ti-lock" : "ti-plug-connected-x"}`} />
        </div>

        <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.textPrimary, marginBottom: 8 }}>
          {isForbidden ? "You don't have access to this dashboard" : "Couldn't load this dashboard"}
        </h2>

        <p style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5, marginBottom: 20 }}>
          {isForbidden
            ? "Your account role isn't permitted to view this page. If you think this is a mistake, contact your administrator."
            : "We couldn't reach the server. Check that the backend is running and try again."}
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <a
            href="/login"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              textDecoration: "none",
            }}
          >
            Back to login
          </a>
          {!isForbidden && onRetry && (
            <button
              onClick={onRetry}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: colors.navy,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
