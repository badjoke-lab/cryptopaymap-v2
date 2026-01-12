import { type ReactNode } from "react";

type LimitedModeNoticeProps = {
  className?: string;
  actions?: ReactNode;
};

const message = "Data may be partial. Please try again later.";

export default function LimitedModeNotice({ className, actions }: LimitedModeNoticeProps) {
  return (
    <div
      className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm ${className ?? ""}`}
      role="status"
    >
      <p className="font-semibold">{message}</p>
      {actions ? <div className="mt-2">{actions}</div> : null}
    </div>
  );
}
