import { type ReactNode } from "react";

type LimitedModeNoticeProps = {
  className?: string;
  actions?: ReactNode;
  title?: string;
  description?: string;
  lastUpdatedISO?: string | null;
};

const DEFAULT_TITLE = "Snapshot mode";
const DEFAULT_DESCRIPTION = "Map data is currently served from a published snapshot.";

const formatLastUpdated = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export default function LimitedModeNotice({ className, actions, title, description, lastUpdatedISO }: LimitedModeNoticeProps) {
  return (
    <div
      className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm ${className ?? ""}`}
      role="status"
    >
      <p className="font-semibold">{title ?? DEFAULT_TITLE}</p>
      <p>{description ?? DEFAULT_DESCRIPTION}</p>
      {lastUpdatedISO ? <p className="mt-1">Last updated: {formatLastUpdated(lastUpdatedISO)}</p> : null}
      {actions ? <div className="mt-2">{actions}</div> : null}
    </div>
  );
}
