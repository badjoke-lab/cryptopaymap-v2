"use client";

import { useEffect, useState } from "react";

import { getHealthStatus, HealthStatus } from "@/lib/healthStatus";

const REFRESH_INTERVAL_MS = 20000;

export function useHealthStatus() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let isMounted = true;

    const update = async () => {
      const data = await getHealthStatus();
      if (!isMounted) return;
      setStatus(data);
      setLastUpdated(new Date());
    };

    update();
    const interval = window.setInterval(update, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return { status, lastUpdated };
}
