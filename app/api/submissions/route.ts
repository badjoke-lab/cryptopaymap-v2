import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { handleUnifiedSubmission, normalizeSubmission, SubmissionPayload } from "@/lib/submissions";

const pendingSubmissionsPath = path.join(process.cwd(), "data", "submissions-pending.ndjson");

type PendingSubmissionRecord = {
  submissionId: string;
  receivedAt: string;
  payload: SubmissionPayload | Record<string, unknown> | null;
  error: string;
};

const appendPendingSubmission = async (record: PendingSubmissionRecord) => {
  try {
    await fs.mkdir(path.dirname(pendingSubmissionsPath), { recursive: true });
    await fs.appendFile(pendingSubmissionsPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    console.warn("[submissions] failed to write pending submission", error);
  }
};

const getDbFailureSummary = async (response: Response) => {
  if (![500, 503].includes(response.status)) return null;

  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (response.status === 503 && payload.error === "DB_UNAVAILABLE") return payload.error;
    if (response.status === 500 && payload.error === "Submissions table missing") return payload.error;
  } catch {
    return null;
  }

  return null;
};

export async function POST(request: Request) {
  let parsedBody: Record<string, unknown> | null = null;
  let normalizedPayload: SubmissionPayload | null = null;

  try {
    const parsed = await request.clone().json();
    if (parsed && typeof parsed === "object") {
      parsedBody = parsed as Record<string, unknown>;
      const normalized = normalizeSubmission(parsed);
      if (normalized.ok) {
        normalizedPayload = normalized.payload;
      }
    }
  } catch {
    parsedBody = null;
  }

  const response = await handleUnifiedSubmission(request);
  const dbFailureSummary = await getDbFailureSummary(response);

  if (!dbFailureSummary) {
    return response;
  }

  const submissionId = randomUUID();
  const receivedAt = new Date().toISOString();
  const payload = normalizedPayload ?? parsedBody;

  console.warn(
    `[submissions] db_failure accepted pending submission id=${submissionId} error=${dbFailureSummary}`,
  );
  await appendPendingSubmission({
    submissionId,
    receivedAt,
    payload,
    error: dbFailureSummary,
  });

  return new Response(
    JSON.stringify({
      submissionId,
      status: "pending",
      accepted: true,
    }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
}
