"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format-currency";
import type { PontoFluxo } from "@/types/relatorios";

export const COR_ENTRADA = "#34d399";
export const COR_SAIDA = "#f87171";

const EIXO = { fill: "#71717a", fontSize: 11 };

const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type ItemTooltip = { dataKey?: unknown; value?: unknown };

/** Tooltip em vidro escuro translúcido. */
function TooltipVidro({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly ItemTooltip[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  const valorDe = (chave: string) => {
    const v = payload.find((p) => p.dataKey === chave)?.value;
    return typeof v === "number" ? v : 0;
  };
  const entradas = valorDe("entradas");
  const saidas = valorDe("saidas");
  return (
    <div
      className="min-w-36 rounded-xl px-3 py-2 text-xs text-texto"
      style={{
        background: "rgb(24 24 27 / 0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgb(255 255 255 / 0.12)",
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.1), 0 10px 30px rgb(0 0 0 / 0.4)",
      }}
    >
      <p className="mb-1 font-semibold">{String(label ?? "")}</p>
      <p className="flex items-center justify-between gap-3 text-texto-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_ENTRADA }} />
          Entradas
        </span>
        <span className="valor text-texto">{formatBRL(entradas)}</span>
      </p>
      <p className="mt-0.5 flex items-center justify-between gap-3 text-texto-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_SAIDA }} />
          Saídas
        </span>
        <span className="valor text-texto">{formatBRL(saidas)}</span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-3 border-t border-borda pt-1 text-texto-2">
        Resultado
        <span className={`valor ${entradas - saidas >= 0 ? "text-positivo" : "text-negativo"}`}>
          {formatBRL(entradas - saidas)}
        </span>
      </p>
    </div>
  );
}

/** Barras arredondadas de entradas vs saídas por intervalo do período. */
export function GraficoEvolucao({ dados }: { dados: PontoFluxo[] }) {
  const muitos = dados.length > 7;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 6, right: 0, left: 0, bottom: 0 }}
          barCategoryGap={muitos ? "22%" : "28%"}
          barGap={2}
        >
          <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={EIXO}
            axisLine={false}
            tickLine={false}
            interval={0}
            tickMargin={6}
          />
          <YAxis
            tick={EIXO}
            axisLine={false}
            tickLine={false}
            width={40}
            tickCount={4}
            tickFormatter={(v: number) => (v === 0 ? "0" : compacto.format(v))}
          />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.04)", radius: 6 }}
            content={({ active, payload, label }) => (
              <TooltipVidro active={active} payload={payload} label={label} />
            )}
          />
          <Bar
            dataKey="entradas"
            fill={COR_ENTRADA}
            radius={[4, 4, 4, 4]}
            maxBarSize={muitos ? 10 : 18}
            isAnimationActive={false}
          />
          <Bar
            dataKey="saidas"
            fill={COR_SAIDA}
            radius={[4, 4, 4, 4]}
            maxBarSize={muitos ? 10 : 18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
