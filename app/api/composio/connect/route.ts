import { requireApiAuth } from "@/lib/apiAuth";
import type { Composio } from "@composio/core";
import {
  getComposio,
  normalizeToolkit,
  prettyAppName,
  toRealtimeTool,
} from "@/lib/composio";
import { getUserId } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";

const log = createLogger("composio/connect");

// How many Composio tools we expose to the model per app. Realtime sessions
// degrade with very large tool lists, so we cap it.
const MAX_TOOLS_PER_APP = 12;

/**
 * Find an auth config for the toolkit, creating a Composio-managed one if none
 * exists. Needed because `connectedAccounts.link()` (the supported way to get
 * an OAuth redirect URL) requires an authConfigId.
 */
async function resolveAuthConfigId(
  composio: Composio<any>,
  slug: string
): Promise<string> {
  const existing = await composio.authConfigs.list({ toolkit: slug });
  const enabled =
    existing.items?.find((item) => item.status === "ENABLED") ??
    existing.items?.[0];
  if (enabled) return enabled.id;

  const created = await composio.authConfigs.create(slug);
  return created.id;
}

/** Best-effort origin for the post-connection callback. */
function getOrigin(request: Request): string {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * The gatekeeper. The voice agent calls connect_and_load_application(app); the
 * browser forwards it here. We either:
 *  - return an OAuth link to show in the modal (not connected yet), or
 *  - return the app's tool schemas (already connected) for the browser to
 *    splice into the live Realtime session.
 */
export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  let applicationName = "";
  try {
    const body = await request.json();
    applicationName = String(body?.application_name ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!applicationName) {
    return Response.json(
      { error: "application_name is required." },
      { status: 400 }
    );
  }

  const slug = normalizeToolkit(applicationName);
  const appName = prettyAppName(slug, applicationName);

  const userId = await getUserId();
  if (!userId) {
    return Response.json(
      { status: "error", appName, error: "You must be signed in." },
      { status: 401 }
    );
  }

  log.info("request", { app: slug, user: userId.slice(0, 8) });

  try {
    const composio = getComposio();

    // 1) Is there already an ACTIVE connection for this user + app?
    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
      toolkitSlugs: [slug],
      statuses: ["ACTIVE"],
    });
    const isConnected = (connections.items ?? []).length > 0;

    // 2) Not connected → start OAuth and hand the redirect URL back to the UI.
    if (!isConnected) {
      const authConfigId = await resolveAuthConfigId(composio, slug);
      const connectionRequest = await composio.connectedAccounts.link(
        userId,
        authConfigId,
        { callbackUrl: `${getOrigin(request)}/connected?app=${slug}` }
      );

      if (!connectionRequest.redirectUrl) {
        // Some toolkits need no auth, or the auth config is misconfigured.
        return Response.json(
          {
            status: "error",
            appName,
            error: `Couldn't generate a connection link for ${appName}. It may not require a connection, or no auth config exists for it.`,
          },
          { status: 200 }
        );
      }

      log.info("auth_required", { app: slug });
      return Response.json({
        status: "auth_required",
        appName,
        slug,
        redirectUrl: connectionRequest.redirectUrl,
        connectionId: connectionRequest.id,
      });
    }

    // 3) Connected → fetch tool schemas (OpenAI format) and flatten for Realtime.
    const rawTools = await composio.tools.get(userId, {
      toolkits: [slug],
      limit: MAX_TOOLS_PER_APP,
    });

    const tools = (rawTools as any[]).map(toRealtimeTool);
    const toolNames = tools
      .map((t) => t?.name)
      .filter((name): name is string => typeof name === "string");

    log.info("connected", { app: slug, tools: toolNames.length });
    return Response.json({
      status: "connected",
      appName,
      slug,
      tools,
      toolNames,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Composio error.";
    log.error(appName, { reason: message });
    return Response.json(
      {
        status: "error",
        appName,
        error: `Could not connect ${appName}: ${message}`,
      },
      { status: 200 } // 200 so the agent can speak the failure gracefully
    );
  }
}
