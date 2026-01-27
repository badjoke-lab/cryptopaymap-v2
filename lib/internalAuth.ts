import { NextResponse } from "next/server";

type ErrorDetails = Record<string, unknown>;

const buildErrorResponse = (
  status: number,
  code: string,
  message: string,
  details: ErrorDetails = {},
) =>
  NextResponse.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    { status },
  );

export const requireInternalAuth = (request: Request): { ok: true } | NextResponse => {
  const configuredKey = process.env.CPM_INTERNAL_KEY?.trim();
  const basicUser = process.env.INTERNAL_BASIC_USER;
  const basicPass = process.env.INTERNAL_BASIC_PASS;

  const authorization = request.headers.get("authorization");
  const hasBasic = Boolean(basicUser && basicPass);
  const isBasicAuthed = (() => {
    if (!authorization?.startsWith("Basic ") || !hasBasic) return false;
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const [providedUser, providedPass] = decoded.split(":");
      return providedUser === basicUser && providedPass === basicPass;
    } catch {
      return false;
    }
  })();

  if (!configuredKey && !hasBasic) {
    return buildErrorResponse(503, "INTERNAL_AUTH_MISCONFIG", "CPM internal auth is not configured.");
  }

  const providedKey = request.headers.get("x-cpm-internal-key");

  if (configuredKey && providedKey === configuredKey) {
    return { ok: true };
  }

  if (isBasicAuthed) {
    return { ok: true };
  }

  return buildErrorResponse(401, "UNAUTHORIZED", "Missing or invalid internal authentication key.");
};
