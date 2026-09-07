import React from "react";
import { AlertOctagon, RotateCcw, Home, RefreshCw } from "lucide-react";

// Detects errors caused by Vite/webpack dynamic chunk fetch failures.
// These always happen when:
// - A new deploy invalidates chunk hashes (stale cache)
// - Cloudflare Pages misconfiguration serves JS as text/html (MIME mismatch)
function isChunkLoadError(error) {
  if (!error) return false;
  const msg = error.message || "";
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    msg.includes("Importing a module script failed")
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
      // How many times we have auto-retried this specific error in this
      // boundary instance -- resets to 0 when the boundary remounts (i.e.
      // when the user navigates to a new route and React replaces the tree).
      autoRetryCount: 0,
    };
    this._handleReset = this._handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] caught:", error, errorInfo);

    // Auto-reload once for chunk load errors (new deploy / stale cache).
    // Limit to 2 auto-retries per boundary instance to avoid infinite loops.
    // We intentionally do NOT use sessionStorage so the counter resets on
    // every navigation (component remount), making the boundary self-healing.
    if (isChunkLoadError(error) && this.state.autoRetryCount < 2) {
      this.setState((prev) => ({ autoRetryCount: prev.autoRetryCount + 1 }));
      // Small delay so the browser has time to purge any bad cached response.
      setTimeout(() => window.location.reload(), 300);
    }
  }

  // Attempt in-place recovery: reset state so Suspense re-tries the lazy import.
  _handleReset() {
    this.setState({ hasError: false, error: null, isChunkError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, isChunkError, autoRetryCount } = this.state;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-main)",
          fontFamily: "var(--font-primary)",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: "520px",
            width: "100%",
            backgroundColor: "var(--white)",
            borderRadius: "var(--spacing-lg)",
            padding: "2.5rem",
            boxShadow: "0 20px 40px rgba(0,0,0,0.06)",
            textAlign: "center",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              backgroundColor: "var(--status-cancelled-bg)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              color: "var(--color-danger)",
            }}
          >
            <AlertOctagon size={32} />
          </div>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "var(--text-main)",
              marginBottom: "0.75rem",
            }}
          >
            {isChunkError ? "Page Failed to Load" : "System Error Encountered"}
          </h1>

          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
              lineHeight: "1.6",
              marginBottom: isChunkError ? "1rem" : "2rem",
            }}
          >
            {isChunkError
              ? autoRetryCount > 0
                ? "Reloading the app to pick up the latest version..."
                : "A page resource failed to load. This usually happens after a new deployment. Click Reload to fix it."
              : "The application encountered an unexpected fault and was unable to recover."}
          </p>

          {/* Show technical detail for non-chunk errors */}
          {!isChunkError && error && (
            <span
              style={{
                display: "block",
                marginBottom: "2rem",
                fontSize: "0.82rem",
                padding: "0.75rem",
                backgroundColor: "var(--cream)",
                borderRadius: "var(--spacing-sm)",
                color: "var(--text-main)",
                textAlign: "left",
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}
            >
              {error.toString()}
            </span>
          )}

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            {/* Try Again: resets the boundary so Suspense can retry without
                a full page reload -- works for transient network hiccups. */}
            <button
              onClick={this._handleReset}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--white)",
                color: "var(--text-main)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--spacing-sm)",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--cream)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--white)")}
            >
              <RefreshCw size={18} /> Try Again
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--accent)",
                color: "var(--white)",
                border: "none",
                borderRadius: "var(--spacing-sm)",
                fontWeight: "600",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
            >
              <RotateCcw size={18} /> Reload App
            </button>

            <button
              onClick={() => (window.location.href = "/")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--white)",
                color: "var(--text-main)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--spacing-sm)",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--cream)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--white)")}
              onFocus={(e) => (e.currentTarget.style.backgroundColor = "var(--cream)")}
              onBlur={(e) => (e.currentTarget.style.backgroundColor = "var(--white)")}
            >
              <Home size={18} /> Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
