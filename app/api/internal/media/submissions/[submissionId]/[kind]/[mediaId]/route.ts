import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { DbUnavailableError, hasDatabaseUrl } from "@/lib/db";
import { findSubmissionMediaById } from "@/lib/db/media";
import { requireInternalAuth } from "@/lib/internalAuth";
import { buildSubmissionMediaKey, getSubmissionMediaObject } from "@/lib/storage/r2";

export const runtime = "nodejs";

const toReadableStream = (body: unknown): ReadableStream | null => {
  if (!body) return null;
  if (body instanceof ReadableStream) return body;
  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream;
  }
  if (typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }
  return null;
};

const isNotFoundError = (error: unknown) => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
};

const isAllowedKind = (kind: string): kind is "proof" | "evidence" =>
  kind === "proof" || kind === "evidence";

export async function GET(
  request: Request,
  { params }: { params: { submissionId: string; kind: string; mediaId: string } },
) {
  if (!isAllowedKind(params.kind)) {
    return new Response(null, { status: 404 });
  }

  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const { submissionId, kind, mediaId } = params;

  if (!submissionId || !mediaId) {
    return new Response(null, { status: 404 });
  }

  try {
    const record = await findSubmissionMediaById({
      submissionId,
      kind,
      mediaId,
      route: "api_internal_media",
    });

    if (!record) {
      return new Response(null, { status: 404 });
    }

    const key = record.r2Key ?? buildSubmissionMediaKey(submissionId, kind, mediaId);
    const result = await getSubmissionMediaObject(key);
    const stream = toReadableStream(result.Body);

    if (!stream) {
      return new Response(null, { status: 404 });
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }

    if (isNotFoundError(error)) {
      return new Response(null, { status: 404 });
    }

    console.error("[internal media] failed to load", error);
    return NextResponse.json({ error: "MEDIA_UNAVAILABLE" }, { status: 500 });
  }
}
