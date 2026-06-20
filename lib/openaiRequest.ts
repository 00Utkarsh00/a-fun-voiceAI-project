const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

export function readTimeoutMs(envName: string, fallbackMs: number) {
  const rawValue = process.env[envName];
  const parsed = rawValue ? Number(rawValue) : fallbackMs;

  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, parsed));
}

export function createRequestAbortSignal({
  request,
  timeoutMs,
  timeoutMessage,
}: {
  request: Request;
  timeoutMs: number;
  timeoutMessage: string;
}) {
  const controller = new AbortController();

  const abortFromClient = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        request.signal.reason ??
          new DOMException("Client request was cancelled.", "AbortError")
      );
    }
  };

  if (request.signal.aborted) {
    abortFromClient();
  } else {
    request.signal.addEventListener("abort", abortFromClient, { once: true });
  }

  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException(timeoutMessage, "TimeoutError"));
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", abortFromClient);
    },
  };
}

export function isAbortError(error: unknown): error is DOMException | Error {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.name === "TimeoutError";
}
