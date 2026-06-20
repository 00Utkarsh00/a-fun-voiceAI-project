import { VOICE } from "@/lib/config";
import { MODEL, REALTIME_CLIENT_SECRETS_URL } from "@/lib/constants";
import { requireApiAuth } from "@/lib/apiAuth";
import {
  createRequestAbortSignal,
  isAbortError,
  readTimeoutMs,
} from "@/lib/openaiRequest";

const REALTIME_CLIENT_SECRET_TIMEOUT_MS = readTimeoutMs(
  "OPENAI_REALTIME_SECRET_TIMEOUT_MS",
  10_000
);

// Mint a short-lived Realtime client secret for the browser WebRTC session.
export async function GET(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  const apiKey = process.env.OPENAI_API_KEY;
  const realtimeModel = process.env.OPENAI_REALTIME_MODEL ?? MODEL;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const openAIRequest = createRequestAbortSignal({
      request,
      timeoutMs: REALTIME_CLIENT_SECRET_TIMEOUT_MS,
      timeoutMessage: "Realtime client secret request timed out.",
    });

    let response: Response;
    try {
      response = await fetch(REALTIME_CLIENT_SECRETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: {
            anchor: "created_at",
            seconds: 600,
          },
          session: {
            type: "realtime",
            model: realtimeModel,
            audio: {
              output: {
                voice: VOICE,
              },
            },
          },
        }),
        cache: "no-store",
        signal: openAIRequest.signal,
      });
    } finally {
      openAIRequest.cleanup();
    }

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error: any) {
    if (isAbortError(error)) {
      return new Response(
        JSON.stringify({
          error:
            error.name === "TimeoutError"
              ? "Realtime client secret request timed out."
              : "Realtime client secret request was cancelled.",
        }),
        {
          status: error.name === "TimeoutError" ? 504 : 499,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.error("Failed to create realtime client secret:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
