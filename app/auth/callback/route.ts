import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * OAuth / email-confirmation callback. Supabase redirects here with a `code`
 * that we exchange for a session cookie, then send the user into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Behind Vercel's proxy, request.url's host can be an internal one. Prefer the
  // forwarded host so we redirect back to the real public URL, not localhost.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const isLocal = process.env.NODE_ENV === "development";
  const baseUrl =
    !isLocal && forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${baseUrl}${next}`);
    }
  }

  // Something went wrong — bounce back to login with a flag.
  return NextResponse.redirect(`${baseUrl}/login?error=auth`);
}
