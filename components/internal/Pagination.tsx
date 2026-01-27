'use client';

type PaginationProps = {
  page: number;
  limit: number;
  total?: number | null;
  hasMore?: boolean;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, limit, total, hasMore, onPageChange }: PaginationProps) {
  const totalPages = total ? Math.ceil(total / limit) : null;
  const start = total ? (page - 1) * limit + 1 : null;
  const end = total ? Math.min(page * limit, total) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm">
      <div className="text-gray-600">
        {total ? (
          <span>
            {start}–{end} of {total}
          </span>
        ) : (
          <span>Page {page}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Prev
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page + 1)}
          disabled={totalPages ? page >= totalPages : !hasMore}
        >
          Next
        </button>
      </div>
    </div>
  );
}
