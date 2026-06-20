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

        <a
          className="auth-connect"
          href={request.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Connect {request.appName}
          <ExternalLink size={16} />
        </a>

        <p className="auth-hint">
          Opens in a new tab. When you&apos;re finished, just say{" "}
          <strong>&ldquo;I&apos;m done&rdquo;</strong> and I&apos;ll continue.
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
