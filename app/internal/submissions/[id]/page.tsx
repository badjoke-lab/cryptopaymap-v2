import DbStatusIndicator from "@/components/status/DbStatusIndicator";
import SubmissionDetail from "@/components/internal/SubmissionDetail";

export default function SubmissionDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-semibold">Internal only</p>
          <p className="text-sm">Direct link only. Do not share publicly.</p>
        </div>
        <DbStatusIndicator showBanner />
      </div>

      <SubmissionDetail submissionId={params.id} />
    </main>
  );
}
