"use client";

import React from "react";
import { Mic, Square, LoaderCircle } from "lucide-react";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface OrbProps {
  status: VoiceStatus;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The single central control: a soft, breathing orb that doubles as the
 * start/stop button. It reflects the live conversation state through colour
 * and motion (see globals.css `.orb-*` rules).
 */
const Orb: React.FC<OrbProps> = ({ status, onClick, disabled }) => {
  const isActive = status !== "idle" && status !== "error";
  const label = status === "idle" ? "Start conversation" : "End conversation";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="orb-button"
      data-status={status}
    >
      {/* Animated halo rings, shown while a session is live */}
      <span className="orb-ring orb-ring-1" aria-hidden="true" />
      <span className="orb-ring orb-ring-2" aria-hidden="true" />

      <span className="orb-core" aria-hidden="true">
        {status === "connecting" ? (
          <LoaderCircle className="orb-icon spin" />
        ) : isActive ? (
          <Square className="orb-icon" />
        ) : (
          <Mic className="orb-icon" />
        )}
      </span>
    </button>
  );
};

export default Orb;
