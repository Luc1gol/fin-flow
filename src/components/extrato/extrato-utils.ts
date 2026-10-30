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
