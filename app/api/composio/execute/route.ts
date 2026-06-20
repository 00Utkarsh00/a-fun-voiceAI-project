import { requireApiAuth } from "@/lib/apiAuth";
import { getComposio } from "@/lib/composio";
import { getUserId } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";

const log = createLogger("composio/execute");

/** Pull a human-readable reason out of a Composio result or thrown error. */
function extractReason(source: unknown): string | null {
  if (!source) return null;
  if (typeof source === "string") return source;
  const obj = source as Record<string, unknown>;
  const candidate =
    obj.error ??
    (obj.data as Record<string, unknown> | undefined)?.error ??
    (obj.data as Record<string, unknown> | undefined)?.message ??
    obj.message;
  return typeof candidate === "string" ? candidate : null;
}

/**
 * Executes a real Composio tool (e.g. GMAIL_SEND_EMAIL) on behalf of the demo
 * user. Always responds 200 with a normalized { successful, data, error }
 * shape so the voice agent can speak either a confirmation or a graceful
 * apology — a tool failure should never break the conversation.
 */
export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  let toolName = "";
  let toolArguments: Record<string, unknown> = {};
  try {
    const body = await request.json();
    toolName = String(body?.toolName ?? "").trim();
    toolArguments =
      body?.arguments && typeof body.arguments === "object"
        ? body.arguments
        : {};
  } catch {
    return Response.json(
      { successful: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!toolName) {
    return Response.json(
      { successful: false, error: "toolName is required." },
      { status: 400 }
    );
  }

  const userId = await getUserId();
  if (!userId) {
    return Response.json(
      { successful: false, error: "You must be signed in." },
      { status: 401 }
    );
  }

  const started = Date.now();
  log.info(toolName, { user: userId.slice(0, 8), args: JSON.stringify(toolArguments).slice(0, 120) });

  try {
    const composio = getComposio();
    const result = await composio.tools.execute(toolName, {
      userId,
      arguments: toolArguments,
      // The agent picks tools dynamically, so we always run the latest version.
      // The SDK rejects "latest" for manual execution unless we opt in here.
      version: "latest",
      dangerouslySkipVersionCheck: true,
    });

    const ms = Date.now() - started;
    if (result.successful) {
      log.info(`${toolName} ok`, { ms });
    } else {
      // A "soft" failure — the SDK didn't throw, but the action didn't work.
      // This is the case that previously produced no logs.
      log.error(toolName, { ms, reason: extractReason(result) ?? "(none)" });
    }

    return Response.json({
      successful: result.successful,
      data: result.data ?? null,
      error: result.error ?? extractReason(result),
    });
  } catch (error) {
    const ms = Date.now() - started;
    const reason = extractReason(error) ?? "Unknown execution error.";
    log.error(`${toolName} threw`, { ms, reason });
    return Response.json({ successful: false, data: null, error: reason });
  }
}
