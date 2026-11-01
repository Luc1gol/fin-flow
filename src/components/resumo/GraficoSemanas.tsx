"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatBRL } from "@/lib/format-currency";
import type { SemanaResumo } from "@/lib/dados/resumo";

const COR_SAIDA = "#f87171";
const EIXO = { fill: "#71717a", fontSize: 11 };

function TooltipVidro({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs text-texto"
      style={{
        background: "rgb(24 24 27 / 0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgb(255 255 255 / 0.12)",
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.1), 0 10px 30px rgb(0 0 0 / 0.4)",
      }}
    >
      <p className="mb-0.5 text-texto-2">Dias {String(label ?? "")}</p>
      <p className="valor font-semibold">{formatBRL(typeof v === "number" ? v : 0)}</p>
    </div>
  );
}

/** Barras de gasto por semana do mês (dias 1–7, 8–14, …). */
export function GraficoSemanas({ semanas }: { semanas: SemanaResumo[] }) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={semanas} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="label" tick={EIXO} axisLine={false} tickLine={false} interval={0} tickMargin={6} />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.04)", radius: 6 }}
            content={({ active, payload, label }) => (
              <TooltipVidro active={active} payload={payload} label={label} />
            )}
          />
          <Bar dataKey="valor" fill={COR_SAIDA} radius={[4, 4, 4, 4]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
