export const API_AUTH_COOKIE_NAME = "voice_api_session";
export const API_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60;

const encoder = new TextEncoder();
const TOKEN_VERSION = "v1";

function getAuthSecret() {
  return (
    process.env.APP_API_AUTH_SECRET ??
    process.env.PORTFOLIO_API_AUTH_SECRET ??
    process.env.OPENAI_API_KEY ??
    ""
  );
}

function getBearerToken() {
  return (
    process.env.APP_API_BEARER_TOKEN ??
    process.env.PORTFOLIO_API_BEARER_TOKEN ??
    ""
  );
}

function base64UrlEncode(bytes: ArrayBuffer) {
  const chars = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(chars).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function signApiSessionPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(signature);
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return null;
}

function sameRequestHost(request: Request, rawUrl: string) {
  try {
    const requestUrl = new URL(request.url);
    const candidateUrl = new URL(rawUrl);
    const forwardedHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      request.headers.get("host") ??
      requestUrl.host;

    return candidateUrl.host === forwardedHost;
  } catch {
    return false;
  }
}

function isSameOriginBrowserRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin && !sameRequestHost(request, origin)) {
    return false;
  }

  const referer = request.headers.get("referer");
  if (referer && !sameRequestHost(request, referer)) {
    return false;
  }

  return true;
}

function hasBearerAuth(request: Request) {
  const expectedToken = getBearerToken();
  if (!expectedToken) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const headerToken =
    request.headers.get("x-app-api-token") ??
    request.headers.get("x-portfolio-api-token") ??
    "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  return (
    constantTimeEqual(bearerToken, expectedToken) ||
    constantTimeEqual(headerToken, expectedToken)
  );
}

export async function createApiSessionCookieValue() {
  const secret = getAuthSecret();
  if (!secret) return null;

  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const payload = `${issuedAt}.${nonce}`;
  const signature = await signApiSessionPayload(payload, secret);

  return `${TOKEN_VERSION}.${payload}.${signature}`;
}

export async function isValidApiSessionCookieValue(value: string | undefined) {
  if (!value) return false;

  const secret = getAuthSecret();
  if (!secret) return false;

  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return false;
  }

  const [, issuedAt, nonce, signature] = parts;
  const issuedAtSeconds = Number(issuedAt);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(issuedAtSeconds)) return false;
  if (issuedAtSeconds > nowSeconds + 60) return false;
  if (nowSeconds - issuedAtSeconds > API_AUTH_COOKIE_MAX_AGE_SECONDS) {
    return false;
  }

  const expectedSignature = await signApiSessionPayload(
    `${issuedAt}.${nonce}`,
    secret
  );
  return constantTimeEqual(signature, expectedSignature);
}

export async function isAuthorizedApiRequest(request: Request) {
  if (hasBearerAuth(request)) {
    return true;
  }

  if (!isSameOriginBrowserRequest(request)) {
    return false;
  }

  const cookieValue = readCookie(
    request.headers.get("cookie"),
    API_AUTH_COOKIE_NAME
  );
  return isValidApiSessionCookieValue(cookieValue ?? undefined);
}

export async function requireApiAuth(request: Request) {
  if (await isAuthorizedApiRequest(request)) {
    return null;
  }

  return Response.json(
    { error: "Unauthorized API request." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
