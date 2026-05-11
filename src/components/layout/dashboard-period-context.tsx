"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DashboardPeriod } from "@/types/dashboard-period";

function currentDashboardPeriod(): DashboardPeriod {
  const d = new Date();
  return { monthIndex: d.getMonth(), year: d.getFullYear() };
}

type DashboardPeriodContextValue = {
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
};

const DashboardPeriodContext = createContext<DashboardPeriodContextValue | null>(
  null,
);

export function DashboardPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<DashboardPeriod>(
    currentDashboardPeriod,
  );

  const setPeriod = useCallback((next: DashboardPeriod) => {
    setPeriodState(next);
  }, []);

  const value = useMemo(
    () => ({ period, setPeriod }),
    [period, setPeriod],
  );

  return (
    <DashboardPeriodContext.Provider value={value}>
      {children}
    </DashboardPeriodContext.Provider>
  );
}

export function useDashboardPeriod() {
  const ctx = useContext(DashboardPeriodContext);
  if (!ctx) {
    throw new Error(
      "useDashboardPeriod deve ser usado dentro de DashboardPeriodProvider",
    );
  }
  return ctx;
}
