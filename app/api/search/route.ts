import { requireApiAuth } from "@/lib/apiAuth";
import { createLogger } from "@/lib/logger";
import {
  createRequestAbortSignal,
  isAbortError,
  readTimeoutMs,
} from "@/lib/openaiRequest";

export const runtime = "nodejs";

const log = createLogger("search");
const SEARCH_TIMEOUT_MS = readTimeoutMs("SEARCH_TIMEOUT_MS", 12_000);
const MAX_RESULTS = 6;

export type SearchResult = { title: string; url: string; snippet: string };

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Unwrap DuckDuckGo's /l/?uddg=<encoded> redirect into the real URL. */
function unwrapUrl(href: string): string {
  let url = href;
  const uddg = url.match(/[?&]uddg=([^&]+)/);
  if (uddg) url = decodeURIComponent(uddg[1]);
  if (url.startsWith("//")) url = "https:" + url;
  return url;
}

/** Primary keyless source: DuckDuckGo's HTML results endpoint. */
async function searchDdgHtml(
  query: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": BROWSER_UA }, signal }
  );
  if (!res.ok) throw new Error(`DuckDuckGo(html) responded ${res.status}`);
  const html = await res.text();

  const snippets: string[] = [];
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html))) snippets.push(stripHtml(s[1]));

  const results: SearchResult[] = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html)) && results.length < MAX_RESULTS) {
    const url = unwrapUrl(m[1]);
    const title = stripHtml(m[2]);
    if (title && url.startsWith("http")) {
      results.push({ title, url, snippet: snippets[i] ?? "" });
    }
    i += 1;
  }
  return results;
}

/** Fallback keyless source: DuckDuckGo's lighter "lite" endpoint. */
async function searchDdgLite(
  query: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const res = await fetch(
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": BROWSER_UA }, signal }
  );
  if (!res.ok) throw new Error(`DuckDuckGo(lite) responded ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  const linkRe = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;

  const snippets: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html))) snippets.push(stripHtml(s[1]));

  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html)) && results.length < MAX_RESULTS) {
    const url = unwrapUrl(m[1]);
    const title = stripHtml(m[2]);
    if (title && url.startsWith("http")) {
      results.push({ title, url, snippet: snippets[i] ?? "" });
    }
    i += 1;
  }
  return results;
}

export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  let query = "";
  try {
    const body = await request.json();
    query = String(body?.query ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!query) {
    return Response.json({ error: "query is required." }, { status: 400 });
  }

  const started = Date.now();
  log.info("query", { q: query.slice(0, 80) });

  const req = createRequestAbortSignal({
    request,
    timeoutMs: SEARCH_TIMEOUT_MS,
    timeoutMessage: "Search timed out.",
  });

  try {
    // Try the richer HTML endpoint first, fall back to the lite endpoint.
    let results: SearchResult[] = [];
    try {
      results = await searchDdgHtml(query, req.signal);
    } catch (err) {
      log.warn("html endpoint failed, trying lite", {
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
    if (results.length === 0) {
      results = await searchDdgLite(query, req.signal);
    }

    if (results.length === 0) {
      log.warn("no results", { ms: Date.now() - started });
      return Response.json({
        query,
        results: [],
        error: "No results found for that search.",
      });
    }

    log.info("done", { results: results.length, ms: Date.now() - started });
    return Response.json({ query, results });
  } catch (error) {
    if (isAbortError(error)) {
      log.error("timeout");
      return Response.json(
        { query, results: [], error: "The search took too long." },
        { status: 200 }
      );
    }
    const message = error instanceof Error ? error.message : "Search failed.";
    log.error("exception", { reason: message });
    return Response.json(
      { query, results: [], error: `Search failed: ${message}` },
      { status: 200 }
    );
  } finally {
    req.cleanup();
  }
}
