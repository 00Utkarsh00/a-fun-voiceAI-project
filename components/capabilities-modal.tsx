"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Sparkles, Plug, Search, LoaderCircle } from "lucide-react";
import { CORE_CAPABILITIES, type ToolkitSummary } from "@/lib/config";

interface CapabilitiesModalProps {
  open: boolean;
  onClose: () => void;
}

// Client-side cache so reopening the popup doesn't refetch the catalog.
let toolkitCache: ToolkitSummary[] | null = null;

function ToolkitTile({ toolkit }: { toolkit: ToolkitSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="caps-app" title={toolkit.categories.join(", ")}>
      {toolkit.logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={toolkit.logo}
          alt=""
          className="caps-app-logo"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="caps-app-logo caps-app-logo-fallback">
          {toolkit.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="caps-app-name">{toolkit.name}</span>
    </div>
  );
}

const CapabilitiesModal: React.FC<CapabilitiesModalProps> = ({ open, onClose }) => {
  const [toolkits, setToolkits] = useState<ToolkitSummary[]>(toolkitCache ?? []);
  const [loading, setLoading] = useState(!toolkitCache);
  const [query, setQuery] = useState("");
  const requested = useRef(false);

  useEffect(() => {
    if (!open || toolkitCache || requested.current) return;
    requested.current = true;
    setLoading(true);
    fetch("/api/composio/toolkits", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        toolkitCache = data.toolkits ?? [];
        setToolkits(toolkitCache!);
      })
      .catch(() => setToolkits([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toolkits;
    return toolkits.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.categories.some((c) => c.toLowerCase().includes(q))
    );
  }, [toolkits, query]);

  if (!open) return null;

  const countLabel = loading
    ? "Loading apps…"
    : `${toolkits.length}+ apps I can connect`;

  return (
    <div className="caps-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="caps-card" onClick={(e) => e.stopPropagation()}>
        <button className="caps-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="caps-head">
          <span className="caps-badge" aria-hidden="true">
            <Sparkles size={22} />
          </span>
          <h2 className="caps-title">Here&apos;s what I can do</h2>
          <p className="caps-subtitle">
            Just ask out loud — I&apos;ll connect what I need along the way.
          </p>
        </div>

        <div className="caps-grid">
          {CORE_CAPABILITIES.map((cap) => (
            <div className="caps-item" key={cap.title}>
              <h3>{cap.title}</h3>
              <p>{cap.description}</p>
            </div>
          ))}
        </div>

        <div className="caps-apps">
          <div className="caps-apps-header">
            <div className="caps-apps-label">
              <Plug size={14} />
              <span>{countLabel}</span>
            </div>
            {!loading && toolkits.length > 0 && (
              <div className="caps-search">
                <Search size={14} />
                <input
                  type="text"
                  value={query}
                  placeholder="Search apps…"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="caps-loading">
              <LoaderCircle className="spin" size={20} />
              <span>Fetching the full list from Composio…</span>
            </div>
          ) : (
            <div className="caps-app-list">
              {filtered.map((t) => (
                <ToolkitTile key={t.slug} toolkit={t} />
              ))}
              {filtered.length === 0 && (
                <p className="caps-empty">No apps match &ldquo;{query}&rdquo;.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CapabilitiesModal;
