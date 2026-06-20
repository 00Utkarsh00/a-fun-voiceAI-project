import "server-only";
import { Composio } from "@composio/core";
import { OpenAIProvider } from "@composio/openai";
import { APP_CATALOG } from "@/lib/config";

// Each Composio operation runs as the signed-in user's id (their Supabase user
// id), so every user gets their own connected accounts. Routes resolve the id
// via getUserId() from lib/supabase/server.

let cached: Composio<OpenAIProvider> | null = null;

/**
 * Lazily construct a single Composio client. Throwing here (rather than at
 * module load) lets API routes return a clean 500 with a useful message when
 * the key is missing, instead of crashing the whole server.
 */
export function getComposio(): Composio<OpenAIProvider> {
  if (cached) return cached;

  const apiKey = process.env.COMPOSIO_API_KEY ?? process.env.composioAPI;
  if (!apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY is not configured. Add it to your .env file."
    );
  }

  cached = new Composio({ apiKey, provider: new OpenAIProvider() });
  return cached;
}

/**
 * Turn a spoken app name ("Google Calendar", "git hub") into a Composio
 * toolkit slug ("googlecalendar", "github").
 */
export function normalizeToolkit(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Human-friendly label for a toolkit slug, for UI + spoken confirmations. */
export function prettyAppName(slug: string, fallback: string): string {
  return APP_CATALOG.find((app) => app.slug === slug)?.name ?? fallback;
}

/**
 * The OpenAI *Chat Completions* provider returns tools shaped as
 * `{ type: "function", function: { name, description, parameters } }`.
 * The OpenAI *Realtime* API expects the flattened
 * `{ type: "function", name, description, parameters }`.
 * This bridges the two so Composio tools drop straight into a Realtime session.
 */
export function toRealtimeTool(tool: any) {
  if (tool?.type === "function" && tool.function) {
    return {
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    };
  }
  return tool;
}
