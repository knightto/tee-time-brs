import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const adminOnly = (pathname: string) => pathname.startsWith("/admin");
const checkInPath = (pathname: string) => pathname.startsWith("/admin/checkin");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/member") && !pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(signInUrl);
  }

  if (adminOnly(pathname)) {
    const role = token.role as string | undefined;
    const isCheckIn = checkInPath(pathname);
    const allowed = role === "ADMIN" || (isCheckIn && role === "STAFF");
    if (!allowed) {
      const deniedUrl = new URL("/member", request.url);
      return NextResponse.redirect(deniedUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/member/:path*", "/admin/:path*"],
};
