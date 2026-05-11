"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const CHART_HEIGHT = 220;

type Slice = {
  name: string;
  value: number;
  fill: string;
};

type SpendingDonutProps = {
  data: readonly Slice[];
  totalLabel: string;
};

export function SpendingDonut({ data, totalLabel }: SpendingDonutProps) {
  return (
    <div
      className="relative mx-auto w-full max-w-[240px]"
      style={{ height: CHART_HEIGHT }}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            cx="50%"
            cy="50%"
            data={data as Slice[]}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="92%"
            stroke="none"
            paddingAngle={2}
            cornerRadius={6}
          >
            {data.map((entry, i) => (
              <Cell key={`${entry.name}-${String(i)}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Total
        </span>
        <span className="text-lg font-bold tracking-tight text-white tabular-nums">
          {totalLabel}
        </span>
      </div>
    </div>
  );
}
