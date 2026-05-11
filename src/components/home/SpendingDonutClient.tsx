"use client";

import { useSyncExternalStore } from "react";
import { SpendingDonut } from "@/components/home/SpendingDonut";

type Slice = {
  name: string;
  value: number;
  fill: string;
};

type SpendingDonutClientProps = {
  data: readonly Slice[];
  totalLabel: string;
};

function noopSubscribe(): () => void {
  return () => {};
}

export function SpendingDonutClient({
  data,
  totalLabel,
}: SpendingDonutClientProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  if (!isClient) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2">
        <div
          className="h-40 w-40 animate-pulse rounded-full bg-white/5"
          aria-hidden
        />
        <span className="sr-only">Carregando gráfico</span>
      </div>
    );
  }

  return <SpendingDonut data={data} totalLabel={totalLabel} />;
}
