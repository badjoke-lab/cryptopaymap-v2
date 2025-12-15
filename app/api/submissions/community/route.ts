import { handleSubmission } from "@/lib/submissions";

export async function POST(request: Request) {
  return handleSubmission(request, "community");
}
