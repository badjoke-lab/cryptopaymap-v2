import SubmissionDetailClient from "../SubmissionDetailClient";
import DbStatusIndicator from "@/components/status/DbStatusIndicator";

export default function SubmissionDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-semibold">Internal only / 暫定レビュー画面</p>
          <p className="text-sm">直リンクのみ。外部には公開しないでください。</p>
        </div>
        <DbStatusIndicator showBanner />
      </div>

      <SubmissionDetailClient submissionId={params.id} />
    </main>
  );
}
