import type { LancamentoExtrato } from "@/types/lancamento";
import { mapLancamentoRowFromDb } from "@/lib/map-lancamento-extrato";
import { supabase } from "@/lib/supabase";

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDdMmYyyy(iso: string): string {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDdMm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  if (!m || !d) return iso;
  return `${d}/${m}`;
}

export const CSV_SEP_EXTRATO = ";";

export function csvEscaparExtrato(valor: string): string {
  if (
    valor.includes(CSV_SEP_EXTRATO) ||
    valor.includes('"') ||
    /\r|\n/.test(valor)
  ) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** yyyy-mm-dd no fuso local. */
export function formatISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PeriodoPresetId = "7d" | "mes_atual" | "mes_anterior" | "personalizado";

export const PERIODO_PADRAO_EXTRATO: PeriodoPresetId = "mes_atual";

export const OPCOES_PERIODO: { id: PeriodoPresetId; label: string }[] = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "mes_atual", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "personalizado", label: "Personalizado" },
];

export function labelPresetPeriodo(id: PeriodoPresetId): string {
  const op = OPCOES_PERIODO.find((x) => x.id === id);
  return op?.label ?? String(id);
}

/** Rótulo curto do período para o chip (mostra as datas no personalizado). */
export function labelChipPeriodo(
  id: PeriodoPresetId,
  dataInicio: string,
  dataFim: string,
): string {
  if (id !== "personalizado") return labelPresetPeriodo(id);
  const de = dataInicio.trim();
  const ate = dataFim.trim();
  if (de && ate) return `${formatDdMm(de)} – ${formatDdMm(ate)}`;
  if (de) return `Desde ${formatDdMm(de)}`;
  if (ate) return `Até ${formatDdMm(ate)}`;
  return labelPresetPeriodo(id);
}

export function primeiraDataInclusivePreset(preset: PeriodoPresetId): string | null {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (preset === "7d") {
    const start = new Date(now.getTime());
    start.setDate(start.getDate() - 6);
    return formatISODateLocal(start);
  }
  if (preset === "mes_atual") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  if (preset === "mes_anterior") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  }
  return null;
}

export function ultimaDataInclusivePreset(preset: PeriodoPresetId): string | null {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (preset === "7d") return formatISODateLocal(now);
  if (preset === "mes_atual") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }
  if (preset === "mes_anterior") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth(), 0));
  }
  return null;
}

export function isoNoIntervalo(
  iso: string,
  min: string | null,
  max: string | null,
): boolean {
  const s = iso.slice(0, 10);
  if (min !== null && s < min) return false;
  if (max !== null && s > max) return false;
  return true;
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "Hoje", "Ontem" ou "15 de Outubro · qua" (com o ano quando não é o atual). */
export function tituloGrupoData(iso: string): string {
  const ref = parseLocalDate(iso);
  ref.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (ref.getTime() === hoje.getTime()) return "Hoje";
  if (ref.getTime() === ontem.getTime()) return "Ontem";
  const raw = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(ref);
  const sep = " de ";
  const idx = raw.lastIndexOf(sep);
  let base = raw;
  if (idx !== -1) {
    const dia = raw.slice(0, idx);
    const mes = raw.slice(idx + sep.length);
    base = `${dia} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  }
  if (ref.getFullYear() !== hoje.getFullYear()) base = `${base} de ${ref.getFullYear()}`;
  return `${base} · ${DIAS_SEMANA[ref.getDay()]}`;
}

/** Filtros que abrem uma folha (bottom sheet). */
export type FiltroExtratoId = "periodo" | "categorias" | "tags" | "cartao" | "meio";

/** Estado persistido ao tocar em “Aplicar” por tipo de filtro. */
export type FiltrosAplicadosState = {
  periodo: boolean;
  categorias: boolean;
  tags: boolean;
  cartoes: boolean;
  meioPagamento: boolean;
};

export const FILTROS_APLICADOS_INICIAL: FiltrosAplicadosState = {
  periodo: false,
  categorias: false,
  tags: false,
  cartoes: false,
  meioPagamento: false,
};

/** Recarrega a lista do extrato (refresh pós-edição) sem alterar `isLoading`. */
export async function buscarLancamentosExtratoParaUsuario(
  userId: string,
): Promise<LancamentoExtrato[]> {
  const bundle = await supabase
    .from("lancamentos")
    .select("*")
    .eq("user_id", userId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  let data = bundle.data;
  if (bundle.error) {
    const retry = await supabase
      .from("lancamentos")
      .select("*")
      .eq("user_id", userId)
      .order("data", { ascending: false });
    if (retry.error) {
      console.error(bundle.error, retry.error);
      throw retry.error;
    }
    data = retry.data;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map(mapLancamentoRowFromDb);
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export type JanelaComparacao = {
  atual: { min: string; max: string };
  anterior: { min: string; max: string };
  /** Ex.: "vs 1–10 de out", "vs setembro", "vs 7 dias anteriores". */
  rotulo: string;
};

/**
 * O período com que comparar as entradas e saídas do Extrato: o mesmo pedaço do mês anterior
 * no mês atual (1 a hoje), o mês anterior inteiro, ou o mesmo número de dias logo antes.
 */
export function janelaComparacao(
  preset: PeriodoPresetId,
  dataInicio: string,
  dataFim: string,
): JanelaComparacao | null {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const iso = formatISODateLocal;
  if (preset === "mes_atual") {
    const dia = now.getDate();
    const ultimoAnterior = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const ateAnterior = Math.min(dia, ultimoAnterior);
    const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      atual: { min: iso(new Date(now.getFullYear(), now.getMonth(), 1)), max: iso(now) },
      anterior: { min: iso(mesAnterior), max: iso(new Date(now.getFullYear(), now.getMonth() - 1, ateAnterior)) },
      rotulo: `vs 1–${ateAnterior} de ${MESES_CURTOS[mesAnterior.getMonth()]}`,
    };
  }
  if (preset === "mes_anterior") {
    const antes = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return {
      atual: {
        min: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        max: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      },
      anterior: { min: iso(antes), max: iso(new Date(now.getFullYear(), now.getMonth() - 1, 0)) },
      rotulo: `vs ${MESES_LONGOS[antes.getMonth()]}`,
    };
  }
  const deslocar = (base: string, dias: number) => {
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return iso(d);
  };
  if (preset === "7d") {
    const min = deslocar(iso(now), -6);
    return {
      atual: { min, max: iso(now) },
      anterior: { min: deslocar(min, -7), max: deslocar(min, -1) },
      rotulo: "vs 7 dias anteriores",
    };
  }
  // Personalizado: o mesmo número de dias logo antes do início escolhido.
  let min = dataInicio.trim().slice(0, 10);
  let max = dataFim.trim().slice(0, 10);
  if (!min || !max) return null;
  if (min > max) [min, max] = [max, min];
  const dias = Math.round((Date.parse(`${max}T12:00:00`) - Date.parse(`${min}T12:00:00`)) / 86_400_000) + 1;
  return {
    atual: { min, max },
    anterior: { min: deslocar(min, -dias), max: deslocar(min, -1) },
    rotulo: "vs período anterior",
  };
}
