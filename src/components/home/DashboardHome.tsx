"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
} from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SpendingDonutClient } from "@/components/home/SpendingDonutClient";
import { VerMetasButton } from "@/components/home/VerMetasButton";
import { ImportantNoticesHub, type DashboardAviso } from "@/components/home/ImportantNoticesHub";
import { supabase } from "@/lib/supabase";

const VALOR_OCULTO = "••••";

/** Mesmo formato que formatBRL, explícito conforme especificação. */
const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseValor(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function isoDateParts(iso: string): [number, number, number] | null {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number.parseInt(x, 10));
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    m < 1 ||
    m > 12
  ) {
    return null;
  }
  return [y, m, d];
}

function isInCalendarMonth(isoDate: string, year: number, monthIndex0: number) {
  const p = isoDateParts(isoDate);
  if (!p) return false;
  return p[0] === year && p[1] - 1 === monthIndex0;
}

function previousMonth(year: number, monthIndex0: number) {
  return monthIndex0 === 0
    ? { y: year - 1, m: 11 }
    : { y: year, m: monthIndex0 - 1 };
}

function momDeltaPct(current: number, previous: number): number {
  if (previous <= 0) return current <= 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

const SEM_CATEGORIA_LABEL = "Sem categoria";

const DONUT_FILLS = [
  "#EF4444",
  "#3B82F6",
  "#A78BFA",
  "#38BDF8",
  "#FBBF24",
  "#F472B6",
  "#34D399",
  "#FB923C",
  "#94A3B8",
] as const;

type LancRow = {
  id: string;
  tipo: string;
  valor: number | string;
  data: string;
  tag: string | null;
  descricao: string | null;
  tags_extras?: unknown;
};

type CartaoUsuarioDashboard = {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
};

function parseIntSafeCartao(v: unknown): number {
  const n =
    typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapCartaoDashboard(row: Record<string, unknown>): CartaoUsuarioDashboard {
  const df = parseIntSafeCartao(row.dia_fechamento);
  const dv = parseIntSafeCartao(row.dia_vencimento);
  return {
    id: String(row.id),
    nome: String(row.nome ?? "").trim(),
    diaFechamento: Math.min(31, Math.max(1, df)),
    diaVencimento: Math.min(31, Math.max(1, dv)),
  };
}

function GastosMomHint({
  deltaPct,
  isVisible,
}: {
  deltaPct: number;
  isVisible: boolean;
}) {
  if (!isVisible) {
    return (
      <p className="mt-2 text-xs leading-tight tracking-widest text-zinc-500">
        {VALOR_OCULTO}
      </p>
    );
  }

  const abs = Math.abs(deltaPct);
  if (deltaPct === 0) {
    return (
      <p className="mt-2 text-xs leading-tight text-zinc-500">
        Estável vs mês passado
      </p>
    );
  }
  if (deltaPct < 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs leading-tight text-[#10B981]">
        <ArrowDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{abs}% menor que o mês passado</span>
      </p>
    );
  }
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs leading-tight text-[#EF4444]">
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{abs}% maior que o mês passado</span>
    </p>
  );
}

function RecebimentosMomHint({
  deltaPct,
  isVisible,
}: {
  deltaPct: number;
  isVisible: boolean;
}) {
  if (!isVisible) {
    return (
      <p className="mt-2 text-xs leading-tight tracking-widest text-zinc-500">
        {VALOR_OCULTO}
      </p>
    );
  }

  const abs = Math.abs(deltaPct);
  if (deltaPct === 0) {
    return (
      <p className="mt-2 text-xs leading-tight text-zinc-500">
        Estável vs mês passado
      </p>
    );
  }
  if (deltaPct > 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs leading-tight text-[#10B981]">
        <ArrowUpLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{abs}% maior que o mês passado</span>
      </p>
    );
  }
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs leading-tight text-[#EF4444]">
      <ArrowDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{abs}% menor que o mês passado</span>
    </p>
  );
}

function AmountSkeleton({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded-lg bg-white/[0.08] align-middle ${className ?? ""}`}
      aria-hidden
    />
  );
}

export function DashboardHome() {
  const [isVisible, setIsVisible] = useState(true);
  const { period } = useDashboardPeriod();
  const mesSelecionado = period.monthIndex;
  const anoSelecionado = period.year;

  const [saldoTotal, setSaldoTotal] = useState(0);
  const [receitasMes, setReceitasMes] = useState(0);
  const [despesasMes, setDespesasMes] = useState(0);
  const [nomeSaudacao, setNomeSaudacao] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [gastosMomPct, setGastosMomPct] = useState(0);
  const [receitasMomPct, setReceitasMomPct] = useState(0);

  type DonutSlice = { name: string; value: number; fill: string };
  const [donutSlices, setDonutSlices] = useState<DonutSlice[]>([]);

  const [recentMovementRows, setRecentMovementRows] = useState<LancRow[]>([]);
  const [lancamentosUsuario, setLancamentosUsuario] = useState<LancRow[]>([]);
  const [cartoesUsuario, setCartoesUsuario] = useState<CartaoUsuarioDashboard[]>(
    [],
  );

  useEffect(() => {
    async function fetchDashboardData() {
      setIsLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error(userError);
          setNomeSaudacao("");
          setSaldoTotal(0);
          setReceitasMes(0);
          setDespesasMes(0);
          setDonutSlices([]);
          setRecentMovementRows([]);
          setLancamentosUsuario([]);
          setCartoesUsuario([]);
          setReceitasMomPct(0);
          setGastosMomPct(0);
          return;
        }

        const prefixoEmail =
          user.email?.split("@")[0]?.trim().replace(/\./g, " ") ?? "";

        const [lacRes, cartRes, profRes] = await Promise.all([
          supabase
            .from("lancamentos")
            .select("id, tipo, valor, data, tag, descricao, tags_extras")
            .eq("user_id", user.id),
          supabase
            .from("cartoes")
            .select("id, nome, dia_fechamento, dia_vencimento")
            .eq("user_id", user.id),
          supabase
            .from("profiles")
            .select("apelido, nome_completo")
            .eq("id", user.id)
            .single(),
        ]);

        if (profRes.error) {
          console.error(profRes.error);
        }

        const perfil = profRes.data as
          | { apelido?: string | null; nome_completo?: string | null }
          | null
          | undefined;
        const nomeExibicao =
          perfil?.apelido ||
          perfil?.nome_completo ||
          prefixoEmail ||
          "Usuário";
        setNomeSaudacao(nomeExibicao);

        if (lacRes.error) {
          console.error(lacRes.error);
          setLancamentosUsuario([]);
          setCartoesUsuario([]);
          return;
        }

        const rows = (lacRes.data ?? []) as LancRow[];
        setLancamentosUsuario(rows);

        if (cartRes.error) {
          console.error(cartRes.error);
          setCartoesUsuario([]);
        } else {
          const rawCart = (cartRes.data ?? []) as Record<string, unknown>[];
          setCartoesUsuario(rawCart.map(mapCartaoDashboard));
        }
        const cy = anoSelecionado;
        const cm = mesSelecionado;
        const prev = previousMonth(cy, cm);

        let recMes = 0;
        let desMes = 0;
        let recPrev = 0;
        let desPrev = 0;

        for (const row of rows) {
          const tipo = String(row.tipo ?? "").toLowerCase().trim();
          const v = parseValor(row.valor);
          const d = String(row.data ?? "");

          if (isInCalendarMonth(d, cy, cm)) {
            if (tipo === "receita") recMes += v;
            else if (tipo === "despesa") desMes += v;
          }

          if (isInCalendarMonth(d, prev.y, prev.m)) {
            if (tipo === "receita") recPrev += v;
            else if (tipo === "despesa") desPrev += v;
          }
        }

        setSaldoTotal(recMes - desMes);
        setReceitasMes(recMes);
        setDespesasMes(desMes);
        setReceitasMomPct(momDeltaPct(recMes, recPrev));
        setGastosMomPct(momDeltaPct(desMes, desPrev));

        const despesasDoMes = rows.filter((row) => {
          const d = String(row.data ?? "");
          const tipo = String(row.tipo ?? "").toLowerCase().trim();
          return isInCalendarMonth(d, cy, cm) && tipo === "despesa";
        });

        const agregadoPorCategoria = despesasDoMes.reduce<Record<string, number>>(
          (acc, row) => {
            const rawTag = row.tag;
            const categoria =
              rawTag != null && String(rawTag).trim()
                ? String(rawTag).trim()
                : SEM_CATEGORIA_LABEL;
            acc[categoria] = (acc[categoria] ?? 0) + parseValor(row.valor);
            return acc;
          },
          {},
        );

        const slices: DonutSlice[] = Object.entries(agregadoPorCategoria)
          .filter(([, value]) => value > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], i) => ({
            name,
            value,
            fill: DONUT_FILLS[i % DONUT_FILLS.length]!,
          }));
        setDonutSlices(slices);

        const noMesSelecionado = rows.filter((r) =>
          isInCalendarMonth(String(r.data ?? ""), cy, cm),
        );
        const sortedTx = [...noMesSelecionado].sort((a, b) => {
          const c = String(b.data).localeCompare(String(a.data));
          if (c !== 0) return c;
          return String(b.id).localeCompare(String(a.id));
        });
        setRecentMovementRows(sortedTx.slice(0, 8));
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [mesSelecionado, anoSelecionado]);

  const saldoFmt = useMemo(() => fmtBRL.format(saldoTotal), [saldoTotal]);
  const incFmt = useMemo(() => fmtBRL.format(receitasMes), [receitasMes]);
  const gastosFmt = useMemo(() => fmtBRL.format(despesasMes), [despesasMes]);

  const periodoLabelCurto = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "numeric",
      }).format(new Date(anoSelecionado, mesSelecionado, 1)),
    [mesSelecionado, anoSelecionado],
  );

  const donutTotalLabel = useMemo(() => fmtBRL.format(despesasMes), [despesasMes]);

  const legendRows = useMemo(() => {
    const total = despesasMes;
    if (total <= 0) return [];
    return donutSlices.map((row) => ({
      ...row,
      pct: Math.round((row.value / total) * 100),
    }));
  }, [donutSlices, despesasMes]);

  function formatDataCurta(iso: string): string {
    const p = isoDateParts(iso);
    if (!p) return iso;
    const [y, m, d] = p;
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
      }).format(new Date(y, m - 1, d));
    } catch {
      return iso;
    }
  }

  const showMomHints = !isLoading;

  const avisos = useMemo((): DashboardAviso[] => {
    const alertasGerados: DashboardAviso[] = [];
    const hoje = new Date().getDate();

    cartoesUsuario.forEach((cartao) => {
      const nomeExibicao = cartao.nome.trim() || "cartão";
      const dv = cartao.diaVencimento;
      if (hoje >= dv - 3 && hoje <= dv) {
        alertasGerados.push({
          id: `vencimento-${cartao.id}`,
          titulo: "Fatura próxima do vencimento",
          subtitulo: `O vencimento do seu cartão ${nomeExibicao} é dia ${dv}. Evite juros!`,
          icon: "AlertTriangle",
          color: "orange",
        });
      }
    });

    cartoesUsuario.forEach((cartao) => {
      const nomeExibicao = cartao.nome.trim() || "cartão";
      if (hoje === cartao.diaFechamento + 1) {
        alertasGerados.push({
          id: `melhor-dia-${cartao.id}`,
          titulo: "Melhor dia de compra!",
          subtitulo: `As compras feitas hoje no seu ${nomeExibicao} só virão na próxima fatura.`,
          icon: "Zap",
          color: "emerald",
        });
      }
    });

    if (hoje >= 1 && hoje <= 3) {
      alertasGerados.push({
        id: "aviso-mes",
        titulo: "Início de mês: revise suas datas",
        subtitulo:
          "Confira se o fechamento e vencimento dos seus cartões continuam os mesmos.",
        icon: "RefreshCw",
        color: "blue",
      });
    }

    return alertasGerados.length > 0 ? [alertasGerados[0]] : [];
  }, [cartoesUsuario]);

  return (
    <>
      <AppTopBar
        greetingName={nomeSaudacao}
        greetingLoading={isLoading}
      />
      <main className="flex flex-1 flex-col gap-6 pb-12">
        {avisos.length > 0 ? <ImportantNoticesHub avisos={avisos} /> : null}

        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          FinFlow • visão rápida
        </p>

        <section aria-label="Resultado mensal no período selecionado" className="grid grid-cols-2 gap-3">
          <GlassPanel className="col-span-2 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Balanço do mês
              </p>
              <button
                type="button"
                onClick={() => setIsVisible((v) => !v)}
                className="-mr-1 -mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
                aria-pressed={!isVisible}
                aria-label={
                  isVisible
                    ? "Ocultar balanço do mês"
                    : "Mostrar balanço do mês"
                }
              >
                {isVisible ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 min-h-[2.25rem] text-3xl font-bold tracking-tight text-white sm:min-h-[2.5rem] sm:text-4xl tabular-nums">
              {isLoading && isVisible ? (
                <AmountSkeleton className="h-9 w-[11rem] sm:h-10" />
              ) : isVisible ? (
                saldoFmt
              ) : (
                VALOR_OCULTO
              )}
            </p>
          </GlassPanel>

          <GlassPanel className="flex flex-col p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <ArrowDownLeft
                className="h-4 w-4 text-[#10B981]"
                strokeWidth={2.25}
                aria-hidden
              />
              Recebimentos
              <span
                className="ml-auto max-w-[7rem] truncate font-normal normal-case tracking-normal text-zinc-600"
                title={periodoLabelCurto}
              >
                {periodoLabelCurto}
              </span>
            </div>
            <p className="mt-1 min-h-7 text-xl font-bold text-[#10B981] tabular-nums">
              {isLoading && isVisible ? (
                <AmountSkeleton className="h-7 w-[7.5rem]" />
              ) : isVisible ? (
                incFmt
              ) : (
                VALOR_OCULTO
              )}
            </p>
            <RecebimentosMomHint
              deltaPct={receitasMomPct}
              isVisible={showMomHints && isVisible}
            />
          </GlassPanel>

          <GlassPanel className="flex flex-col p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <ArrowUpRight
                className="h-4 w-4 text-[#EF4444]"
                strokeWidth={2.25}
                aria-hidden
              />
              Gastos
              <span
                className="ml-auto max-w-[7rem] truncate font-normal normal-case tracking-normal text-zinc-600"
                title={periodoLabelCurto}
              >
                {periodoLabelCurto}
              </span>
            </div>
            <p className="mt-1 min-h-7 text-xl font-bold text-[#EF4444] tabular-nums">
              {isLoading && isVisible ? (
                <AmountSkeleton className="h-7 w-[7.5rem]" />
              ) : isVisible ? (
                gastosFmt
              ) : (
                VALOR_OCULTO
              )}
            </p>
            <GastosMomHint
              deltaPct={gastosMomPct}
              isVisible={showMomHints && isVisible}
            />
          </GlassPanel>
        </section>

        <section
          aria-label="Gastos e movimentações recentes"
          className="flex flex-col gap-3"
        >
          <GlassPanel className="flex flex-col gap-5 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                Gastos por categoria
              </h2>
            </div>

            {isLoading ? (
              <div className="flex h-[220px] flex-col items-center justify-center gap-4">
                <div className="h-36 w-36 animate-pulse rounded-full bg-white/[0.06]" />
                <p className="text-xs text-zinc-500">Carregando…</p>
              </div>
            ) : despesasMes <= 0 || donutSlices.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-2xl border border-white/[0.06] bg-zinc-900/25 px-4 py-8 text-center">
                <div className="relative mx-auto flex h-[200px] w-full max-w-[240px] items-center justify-center">
                  <div
                    className="absolute h-[150px] w-[150px] rounded-full border-[14px] border-zinc-600/35 bg-zinc-800/15"
                    aria-hidden
                  />
                  <div className="relative z-[1] flex flex-col items-center gap-0.5 text-center">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Total
                    </span>
                    <span className="text-lg font-bold tracking-tight text-zinc-500 tabular-nums">
                      {fmtBRL.format(0)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">
                    Nenhuma despesa em {periodoLabelCurto}.
                  </p>
                  <p className="text-xs text-zinc-600">
                    Os gastos aparecem aqui conforme você lança no período.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <SpendingDonutClient
                  data={donutSlices}
                  totalLabel={donutTotalLabel}
                />

                <ul className="space-y-3 pb-1">
                  {legendRows.map((row, idx) => (
                    <li
                      key={`${row.name}-${idx}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.fill }}
                          aria-hidden
                        />
                        <span className="truncate text-zinc-200">{row.name}</span>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-3">
                        <span className="text-zinc-500">{row.pct}%</span>
                        <span className="font-semibold text-white tabular-nums">
                          {fmtBRL.format(row.value)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GlassPanel>

          <GlassPanel className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                Movimentações — {periodoLabelCurto}
              </h2>
              <Link
                href="/extrato"
                className="shrink-0 text-xs font-medium text-zinc-500 transition hover:text-[#10B981]"
              >
                Ver todas
              </Link>
            </div>

            {isLoading ? (
              <ul className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li
                    key={`sk-${String(i)}`}
                    className="flex items-center gap-3 py-1"
                  >
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-white/10" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="h-3 max-w-[12rem] w-[75%] animate-pulse rounded bg-white/10" />
                      <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : recentMovementRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Nenhuma movimentação em {periodoLabelCurto}.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentMovementRows.map((tx) => {
                  const tipo = String(tx.tipo ?? "").toLowerCase();
                  const isReceita = tipo === "receita";
                  const v = parseValor(tx.valor);
                  const amount = fmtBRL.format(v);
                  const signed = isReceita ? `+${amount}` : `-${amount}`;
                  const pill = isReceita
                    ? "bg-[#10B981]/14 text-[#10B981]"
                    : "bg-[#EF4444]/12 text-[#EF4444]";
                  return (
                    <li key={tx.id}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 ${pill}`}
                        >
                          {isReceita ? (
                            <ArrowDownLeft
                              className="h-5 w-5"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          ) : (
                            <ArrowUpRight
                              className="h-5 w-5"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {(tx.descricao && tx.descricao.trim()) ||
                              (isReceita ? "Receita" : "Despesa")}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {formatDataCurta(tx.data)}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            isReceita ? "text-[#10B981]" : "text-[#EF4444]"
                          }`}
                        >
                          {signed}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>
        </section>
      </main>
    </>
  );
}
