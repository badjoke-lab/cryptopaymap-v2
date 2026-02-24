import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { buildDataSourceHeaders } from "@/lib/dataSource";
import { parseMultipartSubmission } from "@/lib/submissions/parseMultipart";
import {
  generateSuggestedPlaceId,
  handleUnifiedSubmission,
  normalizeSubmission,
  SubmissionPayload,
} from "@/lib/submissions";

const pendingSubmissionsPath = path.join(process.cwd(), "data", "submissions-pending.ndjson");

export const runtime = "nodejs";

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
    const payload = (await response.clone().json()) as { error?: { code?: string } };
    const code = payload.error?.code;
    if (response.status === 503 && code === "DB_UNAVAILABLE") return code;
    if (response.status === 500 && code === "SUBMISSIONS_TABLE_MISSING") return code;
  } catch {
    return null;
  }

  return null;
};

export async function POST(request: Request) {
  let parsedBody: Record<string, unknown> | null = null;
  let normalizedPayload: SubmissionPayload | null = null;
  let normalizedErrors: Record<string, string> | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const parsedMultipart = await parseMultipartSubmission(request.clone());
      if (parsedMultipart.ok) {
        parsedBody = parsedMultipart.value.payload;
        const normalized = normalizeSubmission(parsedMultipart.value.payload);
        if (normalized.ok) {
          normalizedPayload = normalized.payload;
        } else {
          normalizedErrors = normalized.errors;
        }
      }
    } else {
      const parsed = await request.clone().json();
      if (parsed && typeof parsed === "object") {
        parsedBody = parsed as Record<string, unknown>;
        const normalized = normalizeSubmission(parsed);
        if (normalized.ok) {
          normalizedPayload = normalized.payload;
        } else {
          normalizedErrors = normalized.errors;
        }
      }
    }
  } catch {
    parsedBody = null;
  }

  const url = new URL(request.url);
  const dryRunParam = url.searchParams.get("dryRun") ?? "";
  const dryRun = ["1", "true", "yes"].includes(dryRunParam.toLowerCase());
  if (dryRun) {
    if (!normalizedPayload) {
      return new Response(
        JSON.stringify({
          error: "Invalid submission",
          errors: normalizedErrors ?? { body: "Invalid JSON payload" },
          hint:
            "Use multipart form-data with a payload JSON field. Example: curl -F 'payload={\"kind\":\"owner\",\"name\":\"Example\",\"country\":\"US\",\"city\":\"Austin\",\"address\":\"100 Congress Ave\",\"category\":\"cafe\",\"acceptedChains\":[\"btc\"],\"payment_accepts\":[{\"asset_key\":\"USDT\",\"rail_key\":\"trc20\"}],\"ownerVerification\":\"domain\",\"contactEmail\":\"me@example.com\"}' $BASE/api/submissions",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        id: `dryrun-${normalizedPayload.kind}-${randomUUID()}`,
        kind: normalizedPayload.kind,
        status: "validated",
        suggestedPlaceId: generateSuggestedPlaceId(normalizedPayload),
        dryRun: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const response = await handleUnifiedSubmission(request);
  const dbFailureSummary = await getDbFailureSummary(response);
  const headers = new Headers(response.headers);
  const dataSourceHeaders = buildDataSourceHeaders("db", Boolean(dbFailureSummary));
  Object.entries(dataSourceHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  if (!dbFailureSummary) {
    return new Response(response.body, {
      status: response.status,
      headers,
    });
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
      id: submissionId,
      submissionId,
      status: "pending",
      kind: normalizedPayload?.kind ?? null,
      accepted: true,
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json", ...buildDataSourceHeaders("db", true) },
    },
  );
}
