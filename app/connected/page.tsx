"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Landing page after an app OAuth connection. It is opened as a popup, so it
 * notifies the main tab (window.opener) that the app is connected and closes
 * itself — the original voice session keeps running and picks up automatically.
 * If it can't close (opened as a normal tab), it shows a "return" link instead.
 */
export default function ConnectedPage() {
  const [canClose, setCanClose] = useState(true);

  useEffect(() => {
    const app = new URLSearchParams(window.location.search).get("app") ?? "";

    try {
      window.opener?.postMessage(
        { type: "composio-connected", app },
        window.location.origin
      );
    } catch {
      /* no opener */
    }

    const timer = window.setTimeout(() => {
      window.close();
      // If we're still here a moment later, the window wasn't script-opened.
      window.setTimeout(() => setCanClose(false), 300);
    }, 500);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="connected-page">
      <div className="connected-card">
        <div className="connected-check" aria-hidden="true">✓</div>
        <h1>Connected</h1>
        <p>
          {canClose
            ? "All set — returning you to your assistant…"
            : "You can close this tab and return to your assistant."}
        </p>
        {!canClose && (
          <Link className="connected-link" href="/">
            Back to my assistant
          </Link>
        )}
      </div>
    </div>
  );
}
