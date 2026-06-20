import {
  API_AUTH_COOKIE_MAX_AGE_SECONDS,
  API_AUTH_COOKIE_NAME,
  createApiSessionCookieValue,
  isValidApiSessionCookieValue,
} from "@/lib/apiAuth";
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
}

export async function middleware(request: NextRequest) {
  // 1. Refresh the Supabase session and learn who (if anyone) is signed in.
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isPublic = isAuthRoute || pathname.startsWith("/auth");

  // 2. Gate the app: signed-out users can only see auth routes.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    copyCookies(response, redirect);
    return redirect;
  }
  // Signed-in users shouldn't sit on the login/signup screens.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    copyCookies(response, redirect);
    return redirect;
  }

  // 3. Keep the signed API-session cookie that gates the /api routes.
  const existingApiSession = request.cookies.get(API_AUTH_COOKIE_NAME)?.value;
  if (!(await isValidApiSessionCookieValue(existingApiSession))) {
    const nextSession = await createApiSessionCookieValue();
    if (nextSession) {
      response.cookies.set({
        name: API_AUTH_COOKIE_NAME,
        value: nextSession,
        httpOnly: true,
        sameSite: "lax",
        secure:
          request.nextUrl.protocol === "https:" ||
          process.env.NODE_ENV === "production",
        path: "/",
        maxAge: API_AUTH_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
