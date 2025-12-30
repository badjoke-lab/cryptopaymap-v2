export type HealthStatus = {
  ok: boolean;
  db: {
    ok: boolean;
    latencyMs?: number;
  };
};

const CACHE_TTL_MS = 20000;

const fallbackStatus: HealthStatus = {
  ok: false,
  db: { ok: false },
};

let cachedStatus: HealthStatus | null = null;
let cachedAt = 0;
let inFlight: Promise<HealthStatus> | null = null;

const fetchHealthStatus = async (): Promise<HealthStatus> => {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      return fallbackStatus;
    }

    const data = (await response.json()) as Partial<HealthStatus>;
    return {
      ok: Boolean(data?.ok),
      db: {
        ok: Boolean(data?.db?.ok),
        latencyMs: data?.db?.latencyMs,
      },
    };
  } catch {
    return fallbackStatus;
  }
};

export const getHealthStatus = async (): Promise<HealthStatus> => {
  const now = Date.now();
  if (cachedStatus && now - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  if (!inFlight) {
    inFlight = fetchHealthStatus()
      .then((data) => {
        cachedStatus = data;
        cachedAt = Date.now();
        inFlight = null;
        return data;
      })
      .catch(() => {
        cachedStatus = fallbackStatus;
        cachedAt = Date.now();
        inFlight = null;
        return fallbackStatus;
      });
  }

  return inFlight;
};
