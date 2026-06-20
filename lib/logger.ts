/**
 * Tiny structured logger for the API routes. Gives every backend operation a
 * consistent, greppable shape so failures (Composio tool errors, the expert
 * agent, auth) are actually visible in the server console.
 *
 *   [12:04:31] composio/execute › GMAIL_SEND_EMAIL  ok (812ms)
 *   [12:04:33] composio/execute › GITHUB_SEARCH_REPOS  FAIL (640ms) — Not Found
 */

type Fields = Record<string, unknown>;

function ts() {
  // Time-only timestamp; the platform adds the date in most log viewers.
  return new Date().toISOString().slice(11, 19);
}

function fmt(fields?: Fields) {
  if (!fields) return "";
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return parts.length ? "  " + parts.join(" ") : "";
}

export function createLogger(scope: string) {
  const tag = `\x1b[36m${scope}\x1b[0m`; // cyan scope
  return {
    info(message: string, fields?: Fields) {
      console.log(`[${ts()}] ${tag} › ${message}${fmt(fields)}`);
    },
    warn(message: string, fields?: Fields) {
      console.warn(`[${ts()}] ${tag} › \x1b[33m${message}\x1b[0m${fmt(fields)}`);
    },
    error(message: string, fields?: Fields) {
      console.error(`[${ts()}] ${tag} › \x1b[31mFAIL ${message}\x1b[0m${fmt(fields)}`);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
