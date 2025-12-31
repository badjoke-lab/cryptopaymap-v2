import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const buildUnauthorizedResponse = () =>
  new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Internal"',
    },
  });

export function middleware(request: NextRequest) {
  const username = process.env.INTERNAL_BASIC_USER;
  const password = process.env.INTERNAL_BASIC_PASS;

  if (!username || !password) {
    return buildUnauthorizedResponse();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return buildUnauthorizedResponse();
  }

  let decoded = "";
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return buildUnauthorizedResponse();
  }

  const [providedUser, providedPass] = decoded.split(":");
  if (providedUser !== username || providedPass !== password) {
    return buildUnauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"],
};
