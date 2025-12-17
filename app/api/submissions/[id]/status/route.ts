import { NextResponse } from "next/server";

import { SubmissionStatus, updateSubmissionStatus } from "@/lib/submissions";

const ALLOWED_STATUSES: SubmissionStatus[] = ["approved", "rejected"];

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

  const status = (body as { status?: SubmissionStatus }).status;
  const reviewNote = typeof (body as { reviewNote?: unknown }).reviewNote === "string"
    ? (body as { reviewNote: string }).reviewNote
    : undefined;

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
  }

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
