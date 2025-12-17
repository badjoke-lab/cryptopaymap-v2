import { StoredSubmission } from "@/lib/submissions";

export type LoadedSubmission = {
  data: StoredSubmission;
  fileName: string;
};
