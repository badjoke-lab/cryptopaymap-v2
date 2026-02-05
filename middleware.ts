import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "internal_auth";

const unauthorized = (reason: string) =>
  new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Internal"',
      "x-internal-auth-reason": reason, // デバッグ用（理由だけ。値は出さない）
    },
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

  if (isStatic(pathname)) return NextResponse.next();

  // ✅ 末尾改行/空白を殺す（Vercel UI貼り付け事故対策）
  const username = (process.env.INTERNAL_BASIC_USER ?? "").trim();
  const password = (process.env.INTERNAL_BASIC_PASS ?? "").trim();

  // devでは未設定なら素通し
  if (process.env.NODE_ENV === "development" && (!username || !password)) {
    return NextResponse.next();
  }

  // prodでは必須
  if (!username || !password) return unauthorized("missing_env");

  const expected = await sha256Base64url(`${username}:${password}`);

  // cookie で通す（画像など）
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  // Basic で通す
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized("no_basic");

  let decoded = "";
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized("bad_base64");
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return unauthorized("no_colon");

  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  if (u !== username || p !== password) return unauthorized("bad_creds");

  // 認証成功 → cookieセット
  const res = NextResponse.next();
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"],
};
