import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { DbUnavailableError, hasDatabaseUrl } from "@/lib/db";
import { findSubmissionMediaById } from "@/lib/db/media";
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

export async function GET(
  _request: Request,
  { params }: { params: { submissionId: string; mediaId: string } },
) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const { submissionId, mediaId } = params;

  if (!submissionId || !mediaId) {
    return new Response(null, { status: 404 });
  }

  try {
    const record = await findSubmissionMediaById({
      submissionId,
      kind: "gallery",
      mediaId,
      route: "api_media_gallery",
    });

    if (!record) {
      return new Response(null, { status: 404 });
    }

    const expectedKey = buildSubmissionMediaKey(submissionId, "gallery", mediaId);
    if (record.r2Key && record.r2Key !== expectedKey) {
      return new Response(null, { status: 403 });
    }

    const key = expectedKey;
    const result = await getSubmissionMediaObject(key);
    const stream = toReadableStream(result.Body);

    if (!stream) {
      return new Response(null, { status: 404 });
    }

    const contentType =
      record.mime ?? (typeof result.ContentType === "string" ? result.ContentType : null) ?? "image/webp";

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }

    if (isNotFoundError(error)) {
      return new Response(null, { status: 404 });
    }

    console.error("[media gallery] failed to load", error);
    return NextResponse.json({ error: "MEDIA_UNAVAILABLE" }, { status: 500 });
  }
}
