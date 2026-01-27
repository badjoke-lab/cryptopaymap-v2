import type { ApiError } from "@/lib/internal/submissions";

export default function ErrorBox({ title = "Error", error }: { title?: string; error: ApiError }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="font-semibold">{title}</p>
      <div className="mt-2 space-y-1">
        {error.code && <p className="text-xs uppercase text-rose-600">{error.code}</p>}
        <p>{error.message ?? "Something went wrong."}</p>
      </div>
    </div>
  );
}
