import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

async function valid(token: string | undefined) {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return true;
  } catch {
    return false;
  }
}

const hits = new Map<string, { count: number; reset: number }>();

function tooMany(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 180;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/uploads") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (tooMany(request)) {
    return new NextResponse("Demasiadas peticiones. Espera un momento.", { status: 429 });
  }

  const authenticated = await valid(request.cookies.get("fadey_session")?.value);
  const isPublic = pathname === "/login" || pathname === "/setup";
  if (!authenticated && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (authenticated && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|brand|uploads|sw.js).*)"],
};
