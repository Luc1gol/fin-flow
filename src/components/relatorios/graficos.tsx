"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type XAxisTickContentProps,
} from "recharts";
import { formatBRL } from "@/lib/format-currency";
import type { PontoFluxo } from "@/types/relatorios";

export const COR_ENTRADA = "#34d399";
export const COR_SAIDA = "#f87171";
export const COR_MARCA = "#4f8cff";

const EIXO = { fill: "#71717a", fontSize: 11 };
const GRADE = "rgb(255 255 255 / 0.06)";
const CURSOR = { fill: "rgb(255 255 255 / 0.04)", radius: 6 };

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const formatarEixo = (v: number) => (v === 0 ? "0" : compacto.format(v));

export type LinhaTooltip = { rotulo: string; valor: number; cor?: string; destaque?: boolean };

/** Tooltip em vidro escuro translúcido. */
export function TooltipVidro({ titulo, linhas }: { titulo: string; linhas: LinhaTooltip[] }) {
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
      <p className="mb-1 font-semibold">{titulo}</p>
      {linhas.map((l) => (
        <p
          key={l.rotulo}
          className={`flex items-center justify-between gap-3 text-texto-2 ${
            l.destaque ? "mt-1 border-t border-borda pt-1" : "mt-0.5"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {l.cor ? <span className="h-2 w-2 rounded-full" style={{ background: l.cor }} /> : null}
            {l.rotulo}
          </span>
          <span className="valor text-texto">{formatBRL(l.valor)}</span>
        </p>
      ))}
    </div>
  );
}

/** Rótulo do eixo X com uma segunda linha opcional (ex.: "parcial"). */
function TickDuasLinhas({
  x,
  y,
  payload,
  index,
  subtitulos,
}: XAxisTickContentProps & { subtitulos: (string | undefined)[] }) {
  const sub = subtitulos[index];
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill={EIXO.fill} fontSize={EIXO.fontSize}>
        {String(payload.value ?? "")}
      </text>
      {sub ? (
        <text x={0} y={0} dy={22} textAnchor="middle" fill="#52525b" fontSize={9}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

type DadoComCor = { cor?: string; apagado?: boolean };

/** Barra arredondada que usa a cor (e opacidade) do próprio ponto. */
function formaColorida(padrao: string) {
  return function FormaBarra(p: BarShapeProps) {
    const d = (p.payload ?? {}) as DadoComCor;
    return (
      <Rectangle
        x={p.x}
        y={p.y}
        width={p.width}
        height={p.height}
        radius={4}
        fill={d.cor ?? padrao}
        fillOpacity={d.apagado ? 0.45 : 1}
      />
    );
  };
}

const formaEntrada = formaColorida(COR_ENTRADA);
const formaSaida = formaColorida(COR_SAIDA);
const formaMarca = formaColorida(COR_MARCA);

/** Entradas vs saídas por mês; o mês parcial fica mais apagado e marcado "parcial". */
export function GraficoEvolucao({ dados, altura = 176 }: { dados: PontoFluxo[]; altura?: number }) {
  const pontos = dados.map((d) => ({ ...d, apagado: d.parcial }));
  const subtitulos = dados.map((d) => (d.parcial ? "parcial" : undefined));
  return (
    <div className="w-full" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="26%" barGap={2}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={30}
            tick={(p: XAxisTickContentProps) => <TickDuasLinhas {...p} subtitulos={subtitulos} />}
          />
          <YAxis tick={EIXO} axisLine={false} tickLine={false} width={38} tickCount={4} tickFormatter={formatarEixo} />
          <Tooltip
            cursor={CURSOR}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (PontoFluxo & { apagado?: boolean }) | undefined;
              if (!active || !d) return null;
              return (
                <TooltipVidro
                  titulo={d.parcial ? `${d.label} (até hoje)` : d.label}
                  linhas={[
                    { rotulo: "Entradas", valor: d.entradas, cor: COR_ENTRADA },
                    { rotulo: "Saídas", valor: d.saidas, cor: COR_SAIDA },
                    { rotulo: "Resultado", valor: d.entradas - d.saidas, destaque: true },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="entradas" shape={formaEntrada} maxBarSize={16} isAnimationActive={false} />
          <Bar dataKey="saidas" shape={formaSaida} maxBarSize={16} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PontoBarra = {
  label: string;
  valor: number;
  cor?: string;
  apagado?: boolean;
  /** Segunda linha do rótulo no eixo X. */
  sub?: string;
  /** Linhas do tooltip (padrão: só o valor). */
  tooltip?: LinhaTooltip[];
  tituloTooltip?: string;
};

/** Barras simples, uma cor por ponto (padrão: azul da marca). */
export function GraficoBarras({
  dados,
  altura = 150,
  rotuloValor = "Total",
  largura = 22,
}: {
  dados: PontoBarra[];
  altura?: number;
  rotuloValor?: string;
  largura?: number;
}) {
  const subtitulos = dados.map((d) => d.sub);
  const temSub = subtitulos.some(Boolean);
  return (
    <div className="w-full" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={temSub ? 30 : 20}
            tick={(p: XAxisTickContentProps) => <TickDuasLinhas {...p} subtitulos={subtitulos} />}
          />
          <YAxis tick={EIXO} axisLine={false} tickLine={false} width={38} tickCount={4} tickFormatter={formatarEixo} />
          <Tooltip
            cursor={CURSOR}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as PontoBarra | undefined;
              if (!active || !d) return null;
              return (
                <TooltipVidro
                  titulo={d.tituloTooltip ?? d.label}
                  linhas={d.tooltip ?? [{ rotulo: rotuloValor, valor: d.valor, cor: d.cor ?? COR_MARCA }]}
                />
              );
            }}
          />
          <Bar dataKey="valor" shape={formaMarca} maxBarSize={largura} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PontoEmpilhado = {
  label: string;
  base: number;
  topo: number;
  sub?: string;
  tituloTooltip?: string;
};

/** Duas séries empilhadas: base sólida e topo translúcido (ex.: lançado + previsto). */
export function GraficoEmpilhado({
  dados,
  rotuloBase,
  rotuloTopo,
  corBase = COR_MARCA,
  altura = 150,
}: {
  dados: PontoEmpilhado[];
  rotuloBase: string;
  rotuloTopo: string;
  corBase?: string;
  altura?: number;
}) {
  const subtitulos = dados.map((d) => d.sub);
  return (
    <div className="w-full" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="26%">
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={subtitulos.some(Boolean) ? 30 : 20}
            tick={(p: XAxisTickContentProps) => <TickDuasLinhas {...p} subtitulos={subtitulos} />}
          />
          <YAxis tick={EIXO} axisLine={false} tickLine={false} width={38} tickCount={4} tickFormatter={formatarEixo} />
          <Tooltip
            cursor={CURSOR}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as PontoEmpilhado | undefined;
              if (!active || !d) return null;
              const linhas: LinhaTooltip[] = [{ rotulo: rotuloBase, valor: d.base, cor: corBase }];
              if (d.topo > 0) linhas.push({ rotulo: rotuloTopo, valor: d.topo, cor: `${corBase}66` });
              if (d.topo > 0) linhas.push({ rotulo: "Total", valor: d.base + d.topo, destaque: true });
              return <TooltipVidro titulo={d.tituloTooltip ?? d.label} linhas={linhas} />;
            }}
          />
          <Bar dataKey="base" stackId="a" fill={corBase} radius={4} maxBarSize={22} isAnimationActive={false} />
          <Bar
            dataKey="topo"
            stackId="a"
            fill={corBase}
            fillOpacity={0.4}
            radius={4}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
