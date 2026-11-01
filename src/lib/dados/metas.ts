import { supabase } from "@/lib/supabase";

export type Meta = {
  id: string;
  nome: string;
  valorAlvo: number;
  /** yyyy-mm-dd ou null. */
  dataAlvo: string | null;
  /** Quanto o usuário diz já ter guardado fora dos investimentos vinculados. */
  valorManual: number;
  investimentoIds: string[];
  concluidaEm: string | null;
  createdAt: string;
};

export type InvestimentoMeta = {
  id: string;
  nome: string;
  tipo: string | null;
  instituicao: string | null;
  saldo: number;
};

export type PainelMetas = {
  metas: Meta[];
  investimentos: InvestimentoMeta[];
  /** Média mensal de despesas dos 3 meses completos anteriores. */
  mediaDespesasMensal: number;
};

export type DadosMeta = {
  nome: string;
  valorAlvo: number;
  dataAlvo: string | null;
  valorManual: number;
  investimentoIds: string[];
};

export type ProgressoMeta = {
  /** valor manual + saldo dos investimentos vinculados. */
  atual: number;
  saldoInvestimentos: number;
  /** 0–1 (limitado a 1). */
  fracao: number;
  falta: number;
  alcancada: boolean;
  /** Meses inteiros até a data alvo (null sem data; 0 = este mês ou já passou). */
  mesesRestantes: number | null;
  prazoVencido: boolean;
  /** Quanto guardar por mês para chegar lá (null sem data ou já alcançada). */
  porMes: number | null;
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(ano: number, mes0: number, dia: number) {
  const d = new Date(ano, mes0, dia, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function hojeIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

function mapMeta(r: Record<string, unknown>): Meta {
  const ids = Array.isArray(r.investimento_ids) ? r.investimento_ids.map(String) : [];
  return {
    id: String(r.id),
    nome: String(r.nome ?? "").trim() || "Meta",
    valorAlvo: numero(r.valor_alvo),
    dataAlvo: r.data_alvo ? String(r.data_alvo).slice(0, 10) : null,
    valorManual: numero(r.valor_manual),
    investimentoIds: ids,
    concluidaEm: r.concluida_em ? String(r.concluida_em) : null,
    createdAt: String(r.created_at ?? ""),
  };
}

/** Metas, investimentos do usuário e média de despesas (base da sugestão de reserva). */
export async function carregarPainelMetas(): Promise<PainelMetas> {
  const userId = await usuarioId();
  const hoje = new Date();
  const desde = iso(hoje.getFullYear(), hoje.getMonth() - 3, 1);
  const ate = iso(hoje.getFullYear(), hoje.getMonth(), 0);

  const [met, inv, lanc] = await Promise.all([
    supabase
      .from("metas")
      .select("id, nome, valor_alvo, data_alvo, valor_manual, investimento_ids, concluida_em, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("investimentos").select("id, nome, tipo, instituicao, saldo").order("nome"),
    supabase
      .from("lancamentos")
      .select("valor")
      .eq("user_id", userId)
      .eq("tipo", "despesa")
      .gte("data", desde)
      .lte("data", ate),
  ]);
  if (met.error) throw met.error;
  if (inv.error) throw inv.error;
  if (lanc.error) throw lanc.error;

  const totalDespesas = (lanc.data ?? []).reduce((s, l) => s + Math.abs(numero(l.valor)), 0);

  return {
    metas: (met.data ?? []).map((r) => mapMeta(r as Record<string, unknown>)),
    investimentos: (inv.data ?? []).map((r) => ({
      id: String(r.id),
      nome: String(r.nome ?? "").trim() || "Investimento",
      tipo: r.tipo ? String(r.tipo) : null,
      instituicao: r.instituicao ? String(r.instituicao) : null,
      saldo: numero(r.saldo),
    })),
    mediaDespesasMensal: totalDespesas / 3,
  };
}

/** Sugestão de reserva de emergência: 6× a média mensal de despesas, arredondada para cima em centenas. */
export function sugerirReservaEmergencia(mediaMensal: number): number | null {
  if (mediaMensal <= 0) return null;
  return Math.ceil((mediaMensal * 6) / 100) * 100;
}

/** Meses inteiros entre hoje e a data alvo (0 se for este mês ou já passou). */
export function mesesAte(dataAlvo: string, hoje = new Date()): number {
  const [a, m, d] = dataAlvo.split("-").map((v) => Number.parseInt(v, 10));
  let meses = (a - hoje.getFullYear()) * 12 + (m - 1 - hoje.getMonth());
  if (d < hoje.getDate()) meses -= 1;
  return Math.max(0, meses);
}

export function calcularProgresso(meta: Meta, investimentos: InvestimentoMeta[]): ProgressoMeta {
  const vinculados = new Set(meta.investimentoIds);
  const saldoInvestimentos = investimentos
    .filter((i) => vinculados.has(i.id))
    .reduce((s, i) => s + i.saldo, 0);
  const atual = meta.valorManual + saldoInvestimentos;
  const falta = Math.max(0, meta.valorAlvo - atual);
  const alcancada = falta <= 0.005;
  const fracao = meta.valorAlvo > 0 ? Math.min(1, Math.max(0, atual / meta.valorAlvo)) : 0;

  let mesesRestantes: number | null = null;
  let prazoVencido = false;
  let porMes: number | null = null;
  if (meta.dataAlvo) {
    mesesRestantes = mesesAte(meta.dataAlvo);
    prazoVencido = meta.dataAlvo < hojeIso();
    if (!alcancada && !prazoVencido) porMes = falta / Math.max(1, mesesRestantes);
  }

  return { atual, saldoInvestimentos, fracao, falta, alcancada, mesesRestantes, prazoVencido, porMes };
}

function linhaDb(dados: DadosMeta) {
  return {
    nome: dados.nome.trim(),
    valor_alvo: dados.valorAlvo,
    data_alvo: dados.dataAlvo || null,
    valor_manual: Math.max(0, dados.valorManual),
    investimento_ids: dados.investimentoIds,
  };
}

export async function criarMeta(dados: DadosMeta): Promise<void> {
  const userId = await usuarioId();
  const { error } = await supabase.from("metas").insert({ user_id: userId, ...linhaDb(dados) });
  if (error) throw error;
}

export async function atualizarMeta(id: string, dados: DadosMeta): Promise<void> {
  const { error } = await supabase.from("metas").update(linhaDb(dados)).eq("id", id);
  if (error) throw error;
}

/** Marca como concluída (agora) ou reabre. */
export async function definirConclusaoMeta(id: string, concluida: boolean): Promise<void> {
  const { error } = await supabase
    .from("metas")
    .update({ concluida_em: concluida ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirMeta(id: string): Promise<void> {
  const { error } = await supabase.from("metas").delete().eq("id", id);
  if (error) throw error;
}
