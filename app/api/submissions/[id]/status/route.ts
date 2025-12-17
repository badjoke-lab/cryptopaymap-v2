import { NextResponse } from "next/server";

import { updateSubmissionStatus } from "@/lib/submissions";

const ALLOWED_STATUSES = ["approved", "rejected"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return typeof value === "string" && (ALLOWED_STATUSES as readonly string[]).includes(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawStatus = (body as { status?: unknown }).status;
  const reviewNote =
    typeof (body as { reviewNote?: unknown }).reviewNote === "string"
      ? (body as { reviewNote: string }).reviewNote
      : undefined;

  if (!isAllowedStatus(rawStatus)) {
    return NextResponse.json(
      { error: "Status must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  const status = rawStatus; // <- type is now "approved" | "rejected"

  try {
    const updated = await updateSubmissionStatus(params.id, status, reviewNote);
    return NextResponse.json(updated);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    console.error("[submissions] status update failed", error);
    return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
  }
}
