'use client';

type DonutItem = {
  label: string;
  value: number;
  color: string;
};

export default function VerificationDonut({ items }: { items: DonutItem[] }) {
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 0);

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44" role="img" aria-label="Verification breakdown">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        {items.map((item) => {
          const ratio = total > 0 ? item.value / total : 0;
          const segment = ratio * circumference;
          const dashOffset = circumference - offset;
          offset += segment;

          return (
            <circle
              key={item.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
              strokeLinecap="butt"
            />
          );
        })}
        <text x="50%" y="46%" textAnchor="middle" className="fill-gray-500 text-xs">
          Total
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="fill-gray-900 text-lg font-semibold">
          {total.toLocaleString()}
        </text>
      </svg>

      <div className="w-full space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-gray-700">{item.label}</span>
            </div>
            <span className="font-semibold text-gray-900">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
