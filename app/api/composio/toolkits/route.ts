import { requireApiAuth } from "@/lib/apiAuth";
import { getComposio } from "@/lib/composio";
import { createLogger } from "@/lib/logger";
import type { ToolkitSummary } from "@/lib/config";

export const runtime = "nodejs";

const log = createLogger("composio/toolkits");

// The full catalog rarely changes, so cache it for the server's lifetime to
// avoid re-hitting Composio on every popup open.
let cache: ToolkitSummary[] | null = null;

/** Lists every toolkit (app) the assistant can connect to — 100+ of them. */
export async function GET(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  if (cache) {
    return Response.json({ toolkits: cache, count: cache.length, cached: true });
  }

  try {
    const composio = getComposio();
    // Bare array response; a high limit returns the whole catalog in one call.
    const raw = await composio.toolkits.get({
      limit: 999,
      sortBy: "alphabetically",
    });

    const toolkits: ToolkitSummary[] = (raw as any[])
      .map((t) => ({
        slug: t?.slug ?? "",
        name: t?.name ?? t?.slug ?? "",
        logo: t?.meta?.logo,
        categories: Array.isArray(t?.meta?.categories)
          ? t.meta.categories
              .map((c: any) => c?.name)
              .filter((n: unknown): n is string => typeof n === "string")
          : [],
      }))
      .filter((t) => t.slug && t.name);

    cache = toolkits;
    log.info("listed", { count: toolkits.length });
    return Response.json({ toolkits, count: toolkits.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    log.error("list failed", { reason: message });
    return Response.json(
      { toolkits: [], count: 0, error: message },
      { status: 200 }
    );
  }
}
