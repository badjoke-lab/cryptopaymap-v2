import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "internal_auth";

const unauthorized = () =>
  new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Internal"' },
  });

function base64urlFromBytes(bytes: ArrayBuffer) {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64url(input: string) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlFromBytes(digest);
}

function isStatic(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon-") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // static assets must never be intercepted
  if (isStatic(pathname)) return NextResponse.next();

  const username = process.env.INTERNAL_BASIC_USER;
  const password = process.env.INTERNAL_BASIC_PASS;

  // devでは未設定なら素通し（ローカル作業止めない）
  if (process.env.NODE_ENV === "development" && (!username || !password)) {
    return NextResponse.next();
  }

  // prodでは必須
  if (!username || !password) return unauthorized();

  const expected = await sha256Base64url(`${username}:${password}`);

  // ① cookie で通す（<img> は Authorization 付けられないが cookie は送れる）
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  // ② Basic で通す
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized();
  }

  const [u, p] = decoded.split(":");
  if (u !== username || p !== password) return unauthorized();

  // 認証成功 → cookie をセットして以後の <img> も通す
  const res = NextResponse.next();
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"],
};
