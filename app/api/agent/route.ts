import { requireApiAuth } from "@/lib/apiAuth";
import { createLogger } from "@/lib/logger";
import {
  createRequestAbortSignal,
  isAbortError,
  readTimeoutMs,
} from "@/lib/openaiRequest";

export const runtime = "nodejs";

const log = createLogger("agent/expert");

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const EXPERT_MODEL = process.env.OPENAI_TEXT_AGENT_MODEL ?? "gpt-5.4";
const EXPERT_TIMEOUT_MS = readTimeoutMs("OPENAI_TEXT_AGENT_TIMEOUT_MS", 30_000);

const SYSTEM_PROMPT = `You are the "expert" — a powerful background assistant that a real-time voice agent delegates hard work to.
Produce high-quality, well-structured, ready-to-use output: clear emails, documents, analyses, plans, or summaries.
Write the final result directly, with no preamble, meta-commentary, or "here is" framing — just the content itself.
Be thorough but tight. Use plain text formatting (line breaks, short paragraphs, simple lists). Honor any constraints in the task.`;

/**
 * The background reasoning agent. The voice agent offloads complex writing,
 * analysis, and planning here (a stronger, slower model than the realtime one).
 */
export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  let task = "";
  let context = "";
  try {
    const body = await request.json();
    task = String(body?.task ?? "").trim();
    context = String(body?.context ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!task) {
    return Response.json({ error: "task is required." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.error("missing OPENAI_API_KEY");
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const started = Date.now();
  log.info("delegated", { model: EXPERT_MODEL, task: task.slice(0, 80) });

  const userContent = context ? `${task}\n\nContext:\n${context}` : task;

  const openAIRequest = createRequestAbortSignal({
    request,
    timeoutMs: EXPERT_TIMEOUT_MS,
    timeoutMessage: "Expert agent request timed out.",
  });

  try {
    const response = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXPERT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      cache: "no-store",
      signal: openAIRequest.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      log.error("openai error", {
        status: response.status,
        body: raw.slice(0, 300),
      });
      let message = `Expert model request failed (${response.status}).`;
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.error?.message ?? message;
      } catch {
        /* keep default */
      }
      return Response.json({ error: message }, { status: 200 });
    }

    const parsed = JSON.parse(raw);
    const text: string = parsed?.choices?.[0]?.message?.content ?? "";
    log.info("done", { ms: Date.now() - started, chars: text.length });
    return Response.json({ text });
  } catch (error) {
    if (isAbortError(error)) {
      log.error("aborted/timeout", { ms: Date.now() - started });
      return Response.json(
        { error: "The expert agent took too long. Try a smaller request." },
        { status: 200 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    log.error("exception", { message });
    return Response.json({ error: message }, { status: 200 });
  } finally {
    openAIRequest.cleanup();
  }
}
