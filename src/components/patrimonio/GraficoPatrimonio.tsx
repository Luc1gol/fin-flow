"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format-currency";
import type { PontoPatrimonio } from "@/lib/dados/patrimonio";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function dataMes(iso: string): string {
  const [a, m] = iso.split("-");
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${a?.slice(2)}`;
}

function TooltipPatrimonio({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PontoPatrimonio }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="vidro rounded-xl px-3 py-2 text-xs">
      <p className="text-texto-3">{dataCurta(p.data)}/{p.data.slice(0, 4)}</p>
      <p className={`font-semibold ${p.liquido < 0 ? "text-negativo" : "text-texto"}`}>
        {p.liquido < 0 ? "− " : ""}
        {formatBRL(Math.abs(p.liquido))}
      </p>
      <p className="mt-1 text-texto-2">Em conta: {formatBRL(p.contas)}</p>
      <p className="text-texto-2">Investido: {formatBRL(p.investimentos)}</p>
      <p className="text-texto-2">Cartões: {formatBRL(p.cartoes)}</p>
    </div>
  );
}

/** Evolução do patrimônio líquido (área azul). */
export function GraficoPatrimonio({ pontos, porMes }: { pontos: PontoPatrimonio[]; porMes?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pontos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="data"
          tickFormatter={(d: string) => (porMes ? dataMes(d) : dataCurta(d))}
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip content={<TooltipPatrimonio />} cursor={{ stroke: "rgb(255 255 255 / 0.15)" }} />
        <Area
          type="monotone"
          dataKey="liquido"
          stroke="#4f8cff"
          strokeWidth={2}
          fill={`url(#grad-${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Mini gráfico sem eixos, para o cartão do Início. */
export function SparklinePatrimonio({ pontos }: { pontos: PontoPatrimonio[] }) {
  const id = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pontos} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="monotone"
          dataKey="liquido"
          stroke="#4f8cff"
          strokeWidth={1.5}
          fill={`url(#spark-${id})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
