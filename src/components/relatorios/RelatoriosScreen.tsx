"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Car,
  CreditCard,
  Inbox,
  LayoutGrid,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type GastoPorCartao,
  type GastoPorTag,
  type PeriodoRelatorioId,
  type PontoFluxo,
} from "@/data/relatorios-mock";
import { getBancoById, logoIconHorseUrl } from "@/data/bancos";
import { formatBRL } from "@/lib/format-currency";
import {
  labelContaCartaoPersistido,
  type CartaoUsuarioOrigem,
} from "@/lib/conta-cartao-lancamento";
import { coalesceTagsExtrasFromUnknown } from "@/lib/tags-extras-coalesce";
import { supabase } from "@/lib/supabase";
import { GlassPanel } from "@/components/ui/glass-panel";

type VisaoGraficoComposicao = "cartao" | "categoria" | "tag";

export type LancamentoRelatorioRow = {
  id: string;
  tipo: string;
  valor: unknown;
  data: string;
  descricao: string | null;
  tag: string | null;
  conta_cartao: string | null;
  tags_extras: string[];
};

const MESES_LABEL_FLUXO_ANO: readonly string[] = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  return `${y}-${pad2(mo)}-${pad2(da)}`;
}

/** Seg — Dom (alinhado a `Date.getDay()` para português). */
const WEEKDAY_LABEL_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function weekdayLabelPt(d: Date): string {
  return WEEKDAY_LABEL_PT[d.getDay()] ?? "—";
}

function intervaloDatasPorPeriodo(
  periodo: PeriodoRelatorioId,
  ref: Date,
): { desde: string; ate: string } {
  const ate = isoFromLocalDate(ref);
  switch (periodo) {
    case "7d": {
      const start = new Date(ref);
      start.setDate(start.getDate() - 6);
      start.setHours(12, 0, 0, 0);
      return { desde: isoFromLocalDate(start), ate };
    }
    case "mes": {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 12, 0, 0, 0);
      return { desde: isoFromLocalDate(start), ate };
    }
    case "3m": {
      const start = new Date(ref.getFullYear(), ref.getMonth() - 2, 1, 12, 0, 0, 0);
      return { desde: isoFromLocalDate(start), ate };
    }
    case "ano": {
      const y = ref.getFullYear();
      return { desde: `${y}-01-01`, ate: `${y}-12-31` };
    }
    default:
      return { desde: ate, ate };
  }
}

function parseValorLancamento(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function fluxoTemplateMesesDoAno(): PontoFluxo[] {
  return [...MESES_LABEL_FLUXO_ANO].map((label) => ({
    label,
    entradas: 0,
    saidas: 0,
  }));
}

function acumulaFluxoPorData(
  agg: PontoFluxo[],
  row: { tipo: string; valor: unknown; data: string },
  monthIndexForRow: (iso: string) => number | null,
) {
  const s = String(row.data ?? "").slice(0, 10);
  const idx = monthIndexForRow(s);
  if (idx == null || idx < 0 || idx >= agg.length) return;
  const tipo = String(row.tipo ?? "").toLowerCase().trim();
  const valor = parseValorLancamento(row.valor);
  if (tipo === "receita") {
    agg[idx]!.entradas += valor;
  } else if (tipo === "despesa") {
    agg[idx]!.saidas += valor;
  }
}

function processarFluxoEsteAno(
  rows: { tipo: string; valor: unknown; data: string }[],
  anoAlvo: number,
): PontoFluxo[] {
  const agg = fluxoTemplateMesesDoAno();
  for (const row of rows) {
    const s = String(row.data ?? "").slice(0, 10);
    const y = Number.parseInt(s.slice(0, 4), 10);
    if (y !== anoAlvo) continue;
    acumulaFluxoPorData(agg, row, (iso) => {
      const m = Number.parseInt(iso.slice(5, 7), 10);
      return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null;
    });
  }
  return agg;
}

function processarFluxoUltimos7Dias(
  rows: { tipo: string; valor: unknown; data: string }[],
  ref: Date,
): PontoFluxo[] {
  const days: Date[] = [];
  const baseY = ref.getFullYear();
  const baseM = ref.getMonth();
  const baseD = ref.getDate();
  for (let offset = -6; offset <= 0; offset++) {
    const d = new Date(baseY, baseM, baseD + offset, 12, 0, 0, 0);
    days.push(d);
  }
  const isoKeys = days.map(isoFromLocalDate);
  const idxByIso = new Map<string, number>();
  isoKeys.forEach((iso, idx) => {
    idxByIso.set(iso, idx);
  });
  const agg: PontoFluxo[] = isoKeys.map((_iso, idx) => ({
    label: weekdayLabelPt(days[idx] as Date),
    entradas: 0,
    saidas: 0,
  }));
  for (const row of rows) {
    const s = String(row.data ?? "").slice(0, 10);
    const idx = idxByIso.get(s);
    if (idx == null) continue;
    const tipo = String(row.tipo ?? "").toLowerCase().trim();
    const valor = parseValorLancamento(row.valor);
    if (tipo === "receita") {
      agg[idx]!.entradas += valor;
    } else if (tipo === "despesa") {
      agg[idx]!.saidas += valor;
    }
  }
  return agg;
}

function semanaMesLabel(iso: string): number {
  const dd = Number.parseInt(iso.slice(8, 10), 10);
  if (!Number.isFinite(dd)) return 3;
  if (dd <= 7) return 0;
  if (dd <= 14) return 1;
  if (dd <= 21) return 2;
  return 3;
}

function processarFluxoEsteMes(
  rows: { tipo: string; valor: unknown; data: string }[],
  ref: Date,
): PontoFluxo[] {
  const y = ref.getFullYear();
  const mo = ref.getMonth();
  const agg: PontoFluxo[] = [
    { label: "S1", entradas: 0, saidas: 0 },
    { label: "S2", entradas: 0, saidas: 0 },
    { label: "S3", entradas: 0, saidas: 0 },
    { label: "S4", entradas: 0, saidas: 0 },
  ];
  for (const row of rows) {
    const s = String(row.data ?? "").slice(0, 10);
    const pr = isoDateParts(s);
    if (!pr || pr[0] !== y || pr[1] !== mo) continue;
    const tipo = String(row.tipo ?? "").toLowerCase().trim();
    const valor = parseValorLancamento(row.valor);
    const bi = semanaMesLabel(s);
    if (tipo === "receita") {
      agg[bi]!.entradas += valor;
    } else if (tipo === "despesa") {
      agg[bi]!.saidas += valor;
    }
  }
  return agg;
}

function isoDateParts(
  iso: string,
): [year: number, monthIndex: number] | null {
  const y = Number.parseInt(iso.slice(0, 4), 10);
  const mo = Number.parseInt(iso.slice(5, 7), 10) - 1;
  const d = Number.parseInt(iso.slice(8, 10), 10);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    mo < 0 ||
    mo > 11 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }
  return [y, mo];
}

function ymKey(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
}

/** Três meses calendário consecutivos: (mês-2) … (mês atual). */
function processarFluxoUltimos3Meses(
  rows: { tipo: string; valor: unknown; data: string }[],
  ref: Date,
): PontoFluxo[] {
  const y0 = ref.getFullYear();
  const mo0 = ref.getMonth();
  const keysOrdered: string[] = [];
  const labelsOrdered: string[] = [];
  for (let delta = -2; delta <= 0; delta++) {
    const d = new Date(y0, mo0 + delta, 1, 12, 0, 0, 0);
    const ym = ymKey(d.getFullYear(), d.getMonth());
    keysOrdered.push(ym);
    labelsOrdered.push(MESES_LABEL_FLUXO_ANO[d.getMonth()] ?? "—");
  }
  const idxByYm = new Map(keysOrdered.map((k, i) => [k, i]));
  const agg: PontoFluxo[] = labelsOrdered.map((label) => ({
    label,
    entradas: 0,
    saidas: 0,
  }));
  for (const row of rows) {
    const s = String(row.data ?? "").slice(0, 10);
    const pr = isoDateParts(s);
    if (!pr) continue;
    const key = ymKey(pr[0], pr[1]);
    const idx = idxByYm.get(key);
    if (idx == null) continue;
    const tipo = String(row.tipo ?? "").toLowerCase().trim();
    const valor = parseValorLancamento(row.valor);
    if (tipo === "receita") {
      agg[idx]!.entradas += valor;
    } else if (tipo === "despesa") {
      agg[idx]!.saidas += valor;
    }
  }
  return agg;
}

function processarFluxoEvolucao(
  rows: { tipo: string; valor: unknown; data: string }[],
  periodo: PeriodoRelatorioId,
  refDate: Date,
): PontoFluxo[] {
  switch (periodo) {
    case "7d":
      return processarFluxoUltimos7Dias(rows, refDate);
    case "mes":
      return processarFluxoEsteMes(rows, refDate);
    case "3m":
      return processarFluxoUltimos3Meses(rows, refDate);
    case "ano":
      return processarFluxoEsteAno(rows, refDate.getFullYear());
    default:
      return [];
  }
}

function agruparDespesasComposicao(
  rows: LancamentoRelatorioRow[],
  modo: VisaoGraficoComposicao,
): (GastoPorCartao | GastoPorTag)[] {
  const despesas = rows.filter(
    (r) => String(r.tipo ?? "").toLowerCase().trim() === "despesa",
  );
  if (modo === "cartao") {
    const mapa = new Map<string, number>();
    for (const r of despesas) {
      const nomeRaw = String(r.conta_cartao ?? "").trim();
      const nome = nomeRaw || "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + parseValorLancamento(r.valor));
    }
    const list: GastoPorCartao[] = [...mapa.entries()].map(([nome, valor]) => ({
      nome,
      valor,
    }));
    return list.sort((a, b) => b.valor - a.valor);
  }
  if (modo === "categoria") {
    const mapaCat = new Map<string, number>();
    for (const r of despesas) {
      const cat =
        r.tag != null && String(r.tag).trim()
          ? String(r.tag).trim()
          : "Sem categoria";
      mapaCat.set(cat, (mapaCat.get(cat) ?? 0) + parseValorLancamento(r.valor));
    }
    const listC: GastoPorTag[] = [...mapaCat.entries()].map(([tag, valor]) => ({
      tag,
      valor,
    }));
    return listC.sort((a, b) => b.valor - a.valor);
  }
  const mapaExtras = new Map<string, number>();
  for (const r of despesas) {
    const extras = r.tags_extras;
    if (!extras.length) continue;
    const v = parseValorLancamento(r.valor);
    for (const raw of extras) {
      const key = String(raw ?? "").trim();
      if (!key) continue;
      mapaExtras.set(key, (mapaExtras.get(key) ?? 0) + v);
    }
  }
  const listT: GastoPorTag[] = [...mapaExtras.entries()].map(([tag, valor]) => ({
    tag,
    valor,
  }));
  return listT.sort((a, b) => b.valor - a.valor);
}

function bancoIconIdParaCartao(
  contaCartaoSalva: string | null | undefined,
  cartoes: CartaoUsuarioOrigem[],
): string | null {
  const t = String(contaCartaoSalva ?? "").trim();
  if (!t) return null;
  const matchCartao = cartoes.find((c) => labelContaCartaoPersistido(c.nome) === t);
  const slug = matchCartao?.banco?.trim();
  return slug || null;
}

const ABAS_PERIODO: { id: PeriodoRelatorioId; label: string }[] = [
  { id: "7d", label: "7 Dias" },
  { id: "mes", label: "Este Mês" },
  { id: "3m", label: "Últimos 3 Meses" },
  { id: "ano", label: "Este Ano" },
];

const CATEGORIA_ICONE: Record<string, LucideIcon> = {
  Alimentação: UtensilsCrossed,
  Transporte: Car,
  Lazer: Sparkles,
};

function MiniLogoBanco({ bancoId }: { bancoId: string }) {
  const [erro, setErro] = useState(false);
  const banco = getBancoById(bancoId);
  if (erro) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-800 text-zinc-400">
        <CreditCard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.08]">
      <img
        src={logoIconHorseUrl(banco.domain)}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setErro(true)}
      />
    </div>
  );
}

function CategoriaGlyph({ nome }: { nome: string }) {
  const Icon = CATEGORIA_ICONE[nome] ?? LayoutGrid;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-zinc-300">
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function formatTooltipBRL(value: number) {
  return formatBRL(value);
}

export function RelatoriosScreen() {
  const [periodo, setPeriodo] = useState<PeriodoRelatorioId>("mes");
  const [visaoGrafico, setVisaoGrafico] =
    useState<VisaoGraficoComposicao>("cartao");
  const [lancamentosRelatorio, setLancamentosRelatorio] = useState<
    LancamentoRelatorioRow[]
  >([]);
  const [cartoesRelatorioUsuario, setCartoesRelatorioUsuario] = useState<
    CartaoUsuarioOrigem[]
  >([]);
  /** Referência estável ao “momento atual” apenas para agregações de fluxo iguais à janela buscada. */
  const [refRelatorio, setRefRelatorio] = useState(() => new Date());
  const [relatorioFetchConcluido, setRelatorioFetchConcluido] = useState(false);

  const carregarDadosRelatorio = useCallback(
    async (isCancelled: () => boolean) => {
      setRelatorioFetchConcluido(false);
      setLancamentosRelatorio([]);
      const ref = new Date();
      setRefRelatorio(ref);
      const { desde, ate } = intervaloDatasPorPeriodo(periodo, ref);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (isCancelled()) return;

        if (userError || !user) {
          if (!isCancelled()) {
            setLancamentosRelatorio([]);
            setCartoesRelatorioUsuario([]);
          }
          return;
        }

        const [lacRes, cartRes] = await Promise.all([
          supabase
            .from("lancamentos")
            .select(
              "id, tipo, valor, data, descricao, tag, conta_cartao, tags_extras",
            )
            .eq("user_id", user.id)
            .gte("data", desde)
            .lte("data", ate),
          supabase.from("cartoes").select("id, nome, banco").eq("user_id", user.id),
        ]);

        if (isCancelled()) return;

        if (cartRes.error) {
          console.error(cartRes.error);
        }

        const rowsCart = (cartRes.data ?? []) as {
          id: string;
          nome: string | null;
          banco?: string | null;
        }[];

        if (!isCancelled()) {
          setCartoesRelatorioUsuario(
            cartRes.error
              ? []
              : rowsCart.map((r) => ({
                  id: String(r.id),
                  nome: String(r.nome ?? "").trim(),
                  banco: String(r.banco ?? "").trim(),
                })),
          );
        }

        if (lacRes.error) {
          console.error(lacRes.error);
          if (!isCancelled()) setLancamentosRelatorio([]);
          return;
        }

        const raw = lacRes.data ?? [];
        const rows: LancamentoRelatorioRow[] = raw.map(
          (item: Record<string, unknown>) => ({
            id: String(item.id),
            tipo: String(item.tipo ?? ""),
            valor: item.valor,
            data: String(item.data ?? "").slice(0, 10),
            descricao:
              item.descricao != null ? String(item.descricao as string) : null,
            tag: item.tag != null ? String(item.tag as string) : null,
            conta_cartao:
              item.conta_cartao != null
                ? String(item.conta_cartao as string)
                : null,
            tags_extras: coalesceTagsExtrasFromUnknown(item.tags_extras),
          }),
        );
        if (!isCancelled()) setLancamentosRelatorio(rows);
      } catch (e) {
        if (!isCancelled()) {
          console.error(e);
          setLancamentosRelatorio([]);
        }
      } finally {
        if (!isCancelled()) setRelatorioFetchConcluido(true);
      }
    },
    [periodo],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    void carregarDadosRelatorio(isCancelled);
    return () => {
      cancelled = true;
    };
  }, [carregarDadosRelatorio]);

  const dadosFluxo = useMemo(
    () =>
      processarFluxoEvolucao(lancamentosRelatorio, periodo, refRelatorio),
    [lancamentosRelatorio, periodo, refRelatorio],
  );

  const dadosComposicao: (GastoPorTag | GastoPorCartao)[] = useMemo(
    () => agruparDespesasComposicao(lancamentosRelatorio, visaoGrafico),
    [lancamentosRelatorio, visaoGrafico],
  );

  const maioresGastos = useMemo(() => {
    const despesas = lancamentosRelatorio.filter((item) => {
      const t = (item.tipo ?? "").trim().toLowerCase();
      return t === "despesa" || t === "saida" || t === "saída";
    });
    return [...despesas]
      .sort(
        (a, b) =>
          Number(String(b.valor).replace(",", ".")) -
          Number(String(a.valor).replace(",", ".")),
      )
      .slice(0, 10);
  }, [lancamentosRelatorio]);

  const placarResumo = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    for (const r of lancamentosRelatorio) {
      const tipo = String(r.tipo ?? "").toLowerCase().trim();
      const v = parseValorLancamento(r.valor);
      if (tipo === "receita") totalEntradas += v;
      else if (tipo === "despesa") totalSaidas += v;
    }
    const balanco = totalEntradas - totalSaidas;
    return { totalEntradas, totalSaidas, balanco };
  }, [lancamentosRelatorio]);

  const chaveRotuloBarras = visaoGrafico === "cartao" ? "nome" : "tag";
  const corBarras = visaoGrafico === "cartao" ? "#059669" : "#10B981";

  const semMovimentacaoNoPeriodo =
    relatorioFetchConcluido && lancamentosRelatorio.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-24">
      <header className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Relatórios
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Para onde está indo o seu dinheiro? Um raio-x completo do seu período.
        </p>
      </header>

      <div className="mb-8 shrink-0 rounded-2xl border border-white/10 bg-white/[0.05] p-1">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {ABAS_PERIODO.map(({ id, label }) => {
            const ativo = periodo === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPeriodo(id)}
                className={`rounded-xl px-2 py-2.5 text-center text-[11px] font-semibold leading-tight transition-all duration-200 sm:text-xs ${
                  ativo
                    ? "bg-[#10B981]/22 text-emerald-100 shadow-inner shadow-black/20 ring-1 ring-[#10B981]/40"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {semMovimentacaoNoPeriodo ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Inbox
            className="text-zinc-600"
            aria-hidden
            strokeWidth={1.25}
            size={48}
          />
          <p className="mt-4 text-center text-zinc-400">
            Nenhuma movimentação encontrada neste período. Aproveite a
            tranquilidade!
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
              <p className="text-xs font-medium text-zinc-500">Entradas</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-500">
                {formatBRL(placarResumo.totalEntradas)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
              <p className="text-xs font-medium text-zinc-500">Saídas</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-500">
                {formatBRL(placarResumo.totalSaidas)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
              <p className="text-xs font-medium text-zinc-500">Balanço</p>
              <p
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  placarResumo.balanco > 0
                    ? "text-emerald-500"
                    : placarResumo.balanco < 0
                      ? "text-red-500"
                      : "text-zinc-400"
                }`}
              >
                {formatBRL(placarResumo.balanco)}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-6">
            <GlassPanel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Evolução de Receitas vs Despesas
              </p>
              <div className="mt-4 h-64 w-full min-h-[250px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dadosFluxo}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradEntradas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="#ffffff10"
                      strokeDasharray="3 6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#161616",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "12px",
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#e4e4e7" }}
                      formatter={(value, name) => {
                        const n =
                          typeof value === "number"
                            ? formatTooltipBRL(value)
                            : String(value ?? "");
                        const lbl =
                          name === "entradas" || name === "Entradas"
                            ? "Entradas"
                            : "Saídas";
                        return [n, lbl];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="entradas"
                      name="entradas"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#gradEntradas)"
                    />
                    <Area
                      type="monotone"
                      dataKey="saidas"
                      name="saidas"
                      stroke="#EF4444"
                      strokeWidth={2}
                      fill="url(#gradSaidas)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>

            <GlassPanel className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="min-w-0 shrink text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Composição de Gastos
            </p>
            <div className="ms-auto inline-flex w-fit shrink-0 items-stretch rounded-xl border border-white/10 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setVisaoGrafico("cartao")}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  visaoGrafico === "cartao"
                    ? "bg-[#10B981]/25 text-emerald-100 shadow-inner ring-1 ring-[#10B981]/35"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Por Cartão
              </button>
              <button
                type="button"
                onClick={() => setVisaoGrafico("categoria")}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  visaoGrafico === "categoria"
                    ? "bg-[#10B981]/25 text-emerald-100 shadow-inner ring-1 ring-[#10B981]/35"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Por Categoria
              </button>
              <button
                type="button"
                onClick={() => setVisaoGrafico("tag")}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  visaoGrafico === "tag"
                    ? "bg-[#10B981]/25 text-emerald-100 shadow-inner ring-1 ring-[#10B981]/35"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Por Tag
              </button>
            </div>
          </div>
          <div className="mt-4 h-64 w-full min-h-[250px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={dadosComposicao}
                margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                barCategoryGap={12}
              >
                <CartesianGrid stroke="#ffffff08" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey={chaveRotuloBarras}
                  width={108}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#161616",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px",
                    fontSize: 12,
                  }}
                  formatter={(v) =>
                    typeof v === "number" ? formatBRL(v) : String(v ?? "")
                  }
                />
                <Bar
                  dataKey="valor"
                  fill={corBarras}
                  radius={[0, 10, 10, 0]}
                  barSize={18}
                  fillOpacity={visaoGrafico === "cartao" ? 0.92 : 0.85}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Maiores gastos do período
          </p>
          <ul className="space-y-2.5">
            {maioresGastos.map((item, index) => (
              <li key={`maiores-${item.id}-${item.data}-${index}`}>
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-3 shadow-inner shadow-black/20 backdrop-blur-md">
                  {bancoIconIdParaCartao(item.conta_cartao, cartoesRelatorioUsuario) ? (
                    <MiniLogoBanco
                      bancoId={
                        bancoIconIdParaCartao(item.conta_cartao, cartoesRelatorioUsuario)!
                      }
                    />
                  ) : (
                    <CategoriaGlyph nome={(item.tag ?? "").trim() || "Outros"} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug text-white">
                      {item.descricao?.trim()
                        ? item.descricao.trim()
                        : "Despesa"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-zinc-500">
                        {(item.conta_cartao ?? "").trim() || "—"}
                      </span>
                      {(item.tag ?? "").trim() ? (
                        <span className="rounded-full border border-[#10B981]/25 bg-[#10B981]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/95">
                          {(item.tag ?? "").trim()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm font-semibold text-red-400">
                    − {formatBRL(parseValorLancamento(item.valor))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
