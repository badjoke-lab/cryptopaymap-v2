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

  if (!configuredKey) {
    return buildErrorResponse(503, "INTERNAL_AUTH_MISCONFIG", "CPM internal auth is not configured.");
  }

  const providedKey = request.headers.get("x-cpm-internal-key");

  if (!providedKey || providedKey !== configuredKey) {
    return buildErrorResponse(401, "UNAUTHORIZED", "Missing or invalid internal authentication key.");
  }

  return { ok: true };
};
