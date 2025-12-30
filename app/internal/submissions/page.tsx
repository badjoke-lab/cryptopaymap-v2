import { promises as fs } from "fs";
import path from "path";

import SubmissionsClient from "./SubmissionsClient";
import { LoadedSubmission } from "./types";
import { StoredSubmission } from "@/lib/submissions";
import DbStatusIndicator from "@/components/status/DbStatusIndicator";

export const runtime = "nodejs";

const submissionsDir = path.join(process.cwd(), "data", "submissions");

const loadSubmissions = async (): Promise<{ submissions: LoadedSubmission[]; warnings: string[] }> => {
  const warnings: string[] = [];

  let files: string[] = [];
  try {
    files = await fs.readdir(submissionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { submissions: [], warnings: [] };
    }
    warnings.push("Failed to access submissions directory.");
    return { submissions: [], warnings };
  }

  const submissions: LoadedSubmission[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(submissionsDir, file);

    try {
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw) as StoredSubmission;

      if (!parsed.submissionId || !parsed.createdAt || !parsed.payload) {
        warnings.push(`File ${file} is missing required fields and was skipped.`);
        continue;
      }

      submissions.push({ data: parsed, fileName: file });
    } catch (error) {
      warnings.push(`Failed to read ${file}: ${(error as Error).message}`);
    }
  }

  submissions.sort(
    (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime(),
  );

  return { submissions, warnings };
};

export default async function SubmissionsPage() {
  const { submissions, warnings } = await loadSubmissions();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-semibold">Internal only / 暫定レビュー画面</p>
          <p className="text-sm">直リンクのみ。外部には公開しないでください。</p>
        </div>
        <DbStatusIndicator showBanner />
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
          <p className="font-medium">Some submissions could not be loaded:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          No submissions yet.
        </div>
      ) : (
        <SubmissionsClient submissions={submissions} />
      )}
    </main>
  );
}
