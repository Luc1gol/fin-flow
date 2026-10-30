/**
 * Cálculos puros da tela Análise: intervalos de datas por período e agregações.
 * Só "receita" e "despesa" contam como entrada/saída; transferências ficam de fora.
 */
import type {
  FatiaGasto,
  LancamentoRelatorioRow,
  PeriodoRelatorioId,
  PontoFluxo,
  TotaisPeriodo,
  VisaoComposicao,
} from "@/types/relatorios";
import { CORES_CATEGORIA } from "@/lib/icone-categoria";

const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

type LinhaFluxo = { tipo: string; valor: unknown; data: string };

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export function isoDaData(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dataDoIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function valorNumerico(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** "receita" | "despesa" | null (transferência e outros tipos não contam). */
export function tipoFluxo(tipo: string): "receita" | "despesa" | null {
  const t = String(tipo ?? "").toLowerCase().trim();
  if (t === "receita") return "receita";
  if (t === "despesa") return "despesa";
  return null;
}

export type Intervalo = { desde: string; ate: string };

/** Janela do período atual: sempre do início do período até hoje. */
export function intervaloDoPeriodo(periodo: PeriodoRelatorioId, ref: Date): Intervalo {
  const ate = isoDaData(ref);
  switch (periodo) {
    case "7d": {
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 6, 12);
      return { desde: isoDaData(inicio), ate };
    }
    case "mes":
      return { desde: isoDaData(new Date(ref.getFullYear(), ref.getMonth(), 1, 12)), ate };
    case "3m":
      return { desde: isoDaData(new Date(ref.getFullYear(), ref.getMonth() - 2, 1, 12)), ate };
    case "ano":
      return { desde: `${ref.getFullYear()}-01-01`, ate };
    default:
      return { desde: ate, ate };
  }
}

/** Mesmo dia num mês deslocado, sem passar do último dia (31/03 → 28/02). */
function mesmoDiaNoMes(ano: number, mes0: number, dia: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0, 12).getDate();
  return new Date(ano, mes0, Math.min(dia, ultimo), 12);
}

/**
 * Janela anterior equivalente, para comparação justa: mesmo tamanho e mesmo
 * "pedaço" do período (ex.: hoje 15/10 no Mês → 01/09 a 15/09).
 */
export function intervaloAnterior(periodo: PeriodoRelatorioId, ref: Date): Intervalo {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (periodo) {
    case "7d":
      return {
        desde: isoDaData(new Date(y, m, ref.getDate() - 13, 12)),
        ate: isoDaData(new Date(y, m, ref.getDate() - 7, 12)),
      };
    case "mes":
      return {
        desde: isoDaData(new Date(y, m - 1, 1, 12)),
        ate: isoDaData(mesmoDiaNoMes(y, m - 1, ref.getDate())),
      };
    case "3m":
      // Ex.: hoje 30/10 → atual 01/08–30/10, anterior 01/05–30/07.
      return {
        desde: isoDaData(new Date(y, m - 5, 1, 12)),
        ate: isoDaData(mesmoDiaNoMes(y, m - 3, ref.getDate())),
      };
    case "ano":
      // Ex.: hoje 30/10/2026 → anterior 01/01/2025–30/10/2025.
      return {
        desde: `${y - 1}-01-01`,
        ate: isoDaData(mesmoDiaNoMes(y - 1, m, ref.getDate())),
      };
    default:
      return intervaloDoPeriodo(periodo, ref);
  }
}

export const ROTULO_COMPARACAO: Record<PeriodoRelatorioId, string> = {
  "7d": "vs 7 dias anteriores",
  mes: "vs mesmo período do mês passado",
  "3m": "vs mesmo período dos 3 meses anteriores",
  ano: "vs mesmo período do ano passado",
};

export function dentroDo(intervalo: Intervalo, iso: string): boolean {
  return iso >= intervalo.desde && iso <= intervalo.ate;
}

/** Dias corridos do período até hoje (base da média diária). */
export function diasDecorridos(periodo: PeriodoRelatorioId, ref: Date): number {
  const { desde } = intervaloDoPeriodo(periodo, ref);
  const ms = dataDoIso(isoDaData(ref)).getTime() - dataDoIso(desde).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function rotuloIntervalo(intervalo: Intervalo): string {
  const fmt = (iso: string) =>
    dataDoIso(iso)
      .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
      .replace(".", "");
  return `${fmt(intervalo.desde)} – ${fmt(intervalo.ate)}`;
}

export function somarTotais(rows: LinhaFluxo[]): TotaisPeriodo {
  let entradas = 0;
  let saidas = 0;
  for (const r of rows) {
    const t = tipoFluxo(r.tipo);
    if (t === "receita") entradas += valorNumerico(r.valor);
    else if (t === "despesa") saidas += valorNumerico(r.valor);
  }
  return { entradas, saidas };
}

/** Variação percentual arredondada; null quando não há base de comparação. */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/* ---------- Evolução (buckets do gráfico) ---------- */

function acumular(
  baldes: PontoFluxo[],
  rows: LinhaFluxo[],
  indice: (iso: string) => number | null | undefined,
) {
  for (const r of rows) {
    const t = tipoFluxo(r.tipo);
    if (!t) continue;
    const i = indice(String(r.data ?? "").slice(0, 10));
    if (i == null || i < 0 || i >= baldes.length) continue;
    if (t === "receita") baldes[i]!.entradas += valorNumerico(r.valor);
    else baldes[i]!.saidas += valorNumerico(r.valor);
  }
  return baldes;
}

const vazio = (label: string): PontoFluxo => ({ label, entradas: 0, saidas: 0 });

export function evolucaoDoPeriodo(
  rows: LinhaFluxo[],
  periodo: PeriodoRelatorioId,
  ref: Date,
): PontoFluxo[] {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (periodo) {
    case "7d": {
      const dias = Array.from({ length: 7 }, (_, i) => new Date(y, m, ref.getDate() - 6 + i, 12));
      const idx = new Map(dias.map((d, i) => [isoDaData(d), i]));
      return acumular(
        dias.map((d) => vazio(DIAS_SEMANA[d.getDay()] ?? "—")),
        rows,
        (iso) => idx.get(iso),
      );
    }
    case "mes": {
      const prefixo = `${y}-${pad2(m + 1)}-`;
      return acumular(
        [vazio("1–7"), vazio("8–14"), vazio("15–21"), vazio("22+")],
        rows,
        (iso) => {
          if (!iso.startsWith(prefixo)) return null;
          const d = Number.parseInt(iso.slice(8, 10), 10);
          if (!Number.isFinite(d)) return null;
          return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
        },
      );
    }
    case "3m": {
      const meses = [-2, -1, 0].map((delta) => new Date(y, m + delta, 1, 12));
      const idx = new Map(meses.map((d, i) => [isoDaData(d).slice(0, 7), i]));
      return acumular(
        meses.map((d) => vazio(MESES_CURTOS[d.getMonth()] ?? "—")),
        rows,
        (iso) => idx.get(iso.slice(0, 7)),
      );
    }
    case "ano":
      return acumular(
        MESES_CURTOS.map((l) => vazio(l)),
        rows,
        (iso) => {
          if (!iso.startsWith(`${y}-`)) return null;
          const mo = Number.parseInt(iso.slice(5, 7), 10);
          return Number.isFinite(mo) ? mo - 1 : null;
        },
      );
    default:
      return [];
  }
}

/* ---------- Composição de gastos ---------- */

export const SEM_CATEGORIA = "Sem categoria";
export const SEM_CONTA = "Sem conta/cartão";

/** Soma das despesas agrupadas por categoria, conta/cartão ou tag extra. */
export function composicaoDeGastos(
  rows: LancamentoRelatorioRow[],
  visao: VisaoComposicao,
): { nome: string; valor: number }[] {
  const soma = new Map<string, number>();
  const somar = (k: string, v: number) => soma.set(k, (soma.get(k) ?? 0) + v);
  for (const r of rows) {
    if (tipoFluxo(r.tipo) !== "despesa") continue;
    const v = valorNumerico(r.valor);
    if (visao === "categoria") somar(r.tag?.trim() || SEM_CATEGORIA, v);
    else if (visao === "cartao") somar(r.conta_cartao?.trim() || SEM_CONTA, v);
    else {
      for (const raw of r.tags_extras) {
        const k = String(raw ?? "").trim();
        if (k) somar(k, v);
      }
    }
  }
  return [...soma.entries()]
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Converte grupos em fatias com % e cor. Mantém as `max` maiores e junta o resto
 * em "Outros" (a base do % é o total de despesas do período; em tags, a soma das tags).
 */
export function emFatias(
  grupos: { nome: string; valor: number }[],
  max: number,
): FatiaGasto[] {
  const total = grupos.reduce((a, g) => a + g.valor, 0);
  if (total <= 0) return [];
  const principais = grupos.slice(0, max);
  const resto = grupos.slice(max).reduce((a, g) => a + g.valor, 0);
  const lista = resto > 0 ? [...principais, { nome: "Outros", valor: resto }] : principais;
  const ultimaCor = CORES_CATEGORIA.length - 1;
  return lista.map((g, i) => ({
    ...g,
    pct: (g.valor / total) * 100,
    cor:
      g.nome === "Outros" && resto > 0
        ? CORES_CATEGORIA[ultimaCor]
        : CORES_CATEGORIA[Math.min(i, ultimaCor)]!,
  }));
}

/** Maiores despesas do período, da maior para a menor. */
export function maioresDespesas(
  rows: LancamentoRelatorioRow[],
  limite: number,
): LancamentoRelatorioRow[] {
  return rows
    .filter((r) => tipoFluxo(r.tipo) === "despesa")
    .sort((a, b) => valorNumerico(b.valor) - valorNumerico(a.valor))
    .slice(0, limite);
}
