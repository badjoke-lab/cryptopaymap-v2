import { handleUnifiedSubmission } from "@/lib/submissions";

export async function POST(request: Request) {
  return handleUnifiedSubmission(request);
}
