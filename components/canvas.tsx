"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  AlertTriangle,
  FileText,
  Keyboard,
  Search,
  ExternalLink,
} from "lucide-react";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface CanvasState {
  mode: "display" | "edit" | "input" | "results";
  title: string;
  body?: string;
  prompt?: string;
  placeholder?: string;
  confirmLabel?: string;
  tone?: "default" | "error";
  /** For results mode. */
  results?: SearchHit[];
  searchQuery?: string;
  /** Bumped each time the agent opens a new canvas, to reset the input value. */
  token: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface CanvasProps {
  state: CanvasState | null;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

/**
 * A non-blocking docked panel the agent uses to SHOW text (drafts, results,
 * errors) and to TAKE typed input. In "edit" mode the user can revise the
 * text before confirming; in "input" mode they type a fresh answer.
 */
const Canvas: React.FC<CanvasProps> = ({ state, onClose, onSubmit }) => {
  const [value, setValue] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset the editable value whenever a new canvas is opened.
  useEffect(() => {
    if (!state) return;
    setValue(state.mode === "edit" ? state.body ?? "" : "");
    if (state.mode !== "display") {
      // Focus the field shortly after the slide-in animation starts.
      const id = window.setTimeout(() => fieldRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [state?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const isError = state.tone === "error";
  const canSubmit = state.mode !== "display";
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
  };

  return (
    <aside className={`canvas ${isError ? "canvas-error" : ""}`} aria-live="polite">
      <header className="canvas-head">
        <span className="canvas-icon" aria-hidden="true">
          {isError ? (
            <AlertTriangle size={16} />
          ) : state.mode === "input" ? (
            <Keyboard size={16} />
          ) : state.mode === "results" ? (
            <Search size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>
        <h2 className="canvas-title">{state.title}</h2>
        <button className="canvas-close" onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
      </header>

      <div className="canvas-body">
        {state.mode === "display" && (
          <pre className="canvas-text">{state.body}</pre>
        )}

        {state.mode === "results" && (
          <div className="canvas-results">
            {(state.results ?? []).map((hit, idx) => (
              <a
                key={idx}
                className="canvas-result"
                href={hit.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="canvas-result-host">{hostOf(hit.url)}</span>
                <span className="canvas-result-title">{hit.title}</span>
                {hit.snippet && (
                  <span className="canvas-result-snippet">{hit.snippet}</span>
                )}
              </a>
            ))}
          </div>
        )}

        {state.mode === "edit" && (
          <textarea
            ref={fieldRef}
            className="canvas-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck
          />
        )}

        {state.mode === "input" && (
          <>
            {state.prompt && <p className="canvas-prompt">{state.prompt}</p>}
            <textarea
              ref={fieldRef}
              className="canvas-field canvas-field-input"
              value={value}
              placeholder={state.placeholder ?? "Type your answer…"}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
            />
          </>
        )}
      </div>

      {canSubmit && (
        <footer className="canvas-foot">
          <button className="canvas-submit" onClick={submit}>
            <Check size={16} />
            {state.confirmLabel ?? (state.mode === "edit" ? "Confirm" : "Send")}
          </button>
        </footer>
      )}

      {state.mode === "results" && state.searchQuery && (
        <footer className="canvas-foot">
          <a
            className="canvas-google"
            href={`https://www.google.com/search?q=${encodeURIComponent(
              state.searchQuery
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} />
            Open in Google
          </a>
        </footer>
      )}
    </aside>
  );
};

export default Canvas;
