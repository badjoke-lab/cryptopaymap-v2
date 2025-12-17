import { handleLegacySubmission } from "@/lib/submissions";

export async function POST(request: Request) {
  return handleLegacySubmission(request, "community");
}
