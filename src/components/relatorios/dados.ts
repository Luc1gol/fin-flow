/**
 * Datas da tela Análise: intervalos por período e helpers de formatação.
 * Só "receita" e "despesa" contam como entrada/saída; transferências ficam de fora.
 */
import type { PeriodoRelatorioId, TotaisPeriodo } from "@/types/relatorios";

export const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const DIAS_SEMANA_LONGOS = [
  "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
] as const;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export function isoDaData(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function dataDoIso(iso: string): Date {
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

/** Complemento de frases de comparação ("…que no mesmo período do mês passado"). */
export const COMPARACAO_NO: Record<PeriodoRelatorioId, string> = {
  "7d": "nos 7 dias anteriores",
  mes: "no mesmo período do mês passado",
  "3m": "no mesmo trecho dos 3 meses anteriores",
  ano: "no mesmo período do ano passado",
};

/** Texto curto do período para frases ("neste mês", "nos últimos 7 dias"). */
export const ROTULO_PERIODO: Record<PeriodoRelatorioId, string> = {
  "7d": "nos últimos 7 dias",
  mes: "neste mês",
  "3m": "nos últimos 3 meses",
  ano: "neste ano",
};

export function dentroDo(intervalo: Intervalo, iso: string): boolean {
  return iso >= intervalo.desde && iso <= intervalo.ate;
}

/** Dias corridos de um intervalo (inclusivo). */
export function diasNoIntervalo(intervalo: Intervalo): number {
  const ms = dataDoIso(intervalo.ate).getTime() - dataDoIso(intervalo.desde).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function rotuloIntervalo(intervalo: Intervalo): string {
  const fmt = (iso: string) =>
    dataDoIso(iso)
      .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
      .replace(".", "");
  return `${fmt(intervalo.desde)} – ${fmt(intervalo.ate)}`;
}

export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "YYYY-MM" de um mês deslocado de `ref`. */
export function chaveMesDeslocado(ref: Date, delta: number): string {
  return isoDaData(new Date(ref.getFullYear(), ref.getMonth() + delta, 1, 12)).slice(0, 7);
}

/** "Nov" a partir de "2026-11". */
export function mesCurtoDaChave(chave: string): string {
  const mo = Number.parseInt(chave.slice(5, 7), 10);
  return MESES_CURTOS[(mo - 1 + 12) % 12] ?? "—";
}

export function somarTotais(rows: { tipo: string; valor: number }[]): TotaisPeriodo {
  let entradas = 0;
  let saidas = 0;
  for (const r of rows) {
    const t = tipoFluxo(r.tipo);
    if (t === "receita") entradas += r.valor;
    else if (t === "despesa") saidas += r.valor;
  }
  return { entradas, saidas };
}

/** Variação percentual arredondada; null quando não há base de comparação. */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
