"use client";

import React from "react";
import { ShieldCheck, ExternalLink, X } from "lucide-react";

export interface AuthRequest {
  appName: string;
  url: string;
}

interface AuthModalProps {
  request: AuthRequest | null;
  onClose: () => void;
}

/**
 * Appears only when the agent generates a dynamic auth link. Clean, calm, and
 * single-purpose: connect the named app, then return to the conversation.
 */
const AuthModal: React.FC<AuthModalProps> = ({ request, onClose }) => {
  if (!request) return null;

  const openConnect = () => {
    const w = 520;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      request.url,
      "composio_oauth",
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`
    );
    // Popup blocked → fall back to a new tab so the user can still connect.
    if (!popup) window.open(request.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true">
      <div className="auth-card">
        <button
          type="button"
          className="auth-close"
          onClick={onClose}
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        <div className="auth-badge" aria-hidden="true">
          <ShieldCheck size={26} />
        </div>

        <h2 className="auth-title">Connect {request.appName}</h2>
        <p className="auth-subtitle">
          To continue, securely connect your {request.appName} account. You only
          need to do this once.
        </p>

        <button type="button" className="auth-connect" onClick={openConnect}>
          Connect {request.appName}
          <ExternalLink size={16} />
        </button>

        <p className="auth-hint">
          A secure window will open. Once you connect, it closes and I&apos;ll
          pick up right where we left off.
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
