import { supabase } from "@/lib/supabase";
import { CONTA_CORRENTE_LABEL } from "@/lib/conta-cartao-lancamento";
import { normalizarTexto } from "@/lib/importacao/classificar";

export type TipoRecorrencia = "despesa" | "receita";
export type StatusRecorrencia = "ativa" | "pausada" | "encerrada";

export type Recorrencia = {
  id: string;
  descricao: string;
  tipo: TipoRecorrencia;
  valor: number;
  categoria: string | null;
  meioPagamento: string | null;
  contaCartao: string | null;
  /** Dia do mês em que costuma acontecer (1–31). */
  dia: number;
  status: StatusRecorrencia;
  dataInicio: string;
  dataFim: string | null;
};

export type SituacaoMes = "paga" | "a_vencer" | "atrasada" | "prevista";

export type ContaDoMes = {
  recorrencia: Recorrencia;
  situacao: SituacaoMes;
  /** Data em que vence/acontece neste mês (yyyy-mm-dd). */
  vencimento: string;
  /** Lançamento que cumpriu a recorrência neste mês, se houver. */
  pagamento: { id: string; data: string; valor: number } | null;
};

export type SugestaoRecorrencia = {
  descricao: string;
  tipo: TipoRecorrencia;
  valor: number;
  dia: number;
  categoria: string | null;
  meioPagamento: string | null;
  meses: number;
};

export type PainelContasFixas = {
  contas: ContaDoMes[];
  pausadas: Recorrencia[];
  sugestoes: SugestaoRecorrencia[];
};

type LancamentoBase = {
  id: string;
  descricao: string;
  tipo: string;
  valor: number;
  data: string;
  tag: string | null;
  meio: string | null;
  recorrenciaId: string | null;
};

/** Tolerância de valor para reconhecer a mesma conta (ex.: luz varia todo mês). */
const TOLERANCIA_VALOR = 0.3;
const SUFIXO_PARCELA = /\s*\(\d{1,2}\/\d{1,2}\)\s*$/;

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(ano: number, mes0: number, dia: number) {
  const d = new Date(ano, mes0, dia, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dia de vencimento dentro do mês, sem passar do último dia (31 → 30/28). */
function vencimentoNoMes(ano: number, mes0: number, dia: number) {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return iso(ano, mes0, Math.min(dia, ultimo));
}

function chaveDescricao(descricao: string) {
  return normalizarTexto(descricao.replace(SUFIXO_PARCELA, ""));
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

function maisFrequente<T>(valores: T[]): T | null {
  const cont = new Map<T, number>();
  for (const v of valores) cont.set(v, (cont.get(v) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Diz se um lançamento parece ser a recorrência: mesmo tipo, descrição parecida
 * (uma contém a outra) e valor dentro da tolerância.
 */
export function lancamentoCombina(
  rec: Pick<Recorrencia, "descricao" | "tipo" | "valor">,
  l: { descricao: string; tipo: string; valor: number },
): boolean {
  if (l.tipo !== rec.tipo) return false;
  const a = chaveDescricao(rec.descricao);
  const b = chaveDescricao(l.descricao);
  if (a.length < 3 || b.length < 3) return false;
  if (!(a === b || a.includes(b) || b.includes(a))) return false;
  return Math.abs(Math.abs(l.valor) - rec.valor) <= rec.valor * TOLERANCIA_VALOR;
}

function mapRecorrencia(r: Record<string, unknown>): Recorrencia {
  const dataInicio = String(r.data_inicio ?? "").slice(0, 10);
  return {
    id: String(r.id),
    descricao: String(r.descricao ?? ""),
    tipo: r.tipo === "receita" ? "receita" : "despesa",
    valor: Math.abs(numero(r.valor)),
    categoria: r.categoria ? String(r.categoria) : null,
    meioPagamento: r.meio_pagamento ? String(r.meio_pagamento) : null,
    contaCartao: r.conta_cartao ? String(r.conta_cartao) : null,
    dia: Number(r.dia_do_mes) || Number(dataInicio.slice(8, 10)) || 1,
    status: r.status === "pausada" || r.status === "encerrada" ? r.status : "ativa",
    dataInicio,
    dataFim: r.data_fim ? String(r.data_fim).slice(0, 10) : null,
  };
}

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

export async function listarRecorrenciasAtivas(): Promise<Recorrencia[]> {
  const { data, error } = await supabase.from("recorrencias").select("*").eq("status", "ativa");
  if (error) throw error;
  return (data ?? []).map(mapRecorrencia);
}

/** Situação das contas fixas no mês + sugestões tiradas do histórico. */
export async function carregarContasFixas(ano: number, mes0: number): Promise<PainelContasFixas> {
  const userId = await usuarioId();
  const desde = iso(ano, mes0 - 4, 1);
  const fimMes = iso(ano, mes0 + 1, 0);
  const inicioMes = iso(ano, mes0, 1);

  const [recs, lanc] = await Promise.all([
    supabase.from("recorrencias").select("*").neq("status", "encerrada"),
    supabase
      .from("lancamentos")
      .select("id, descricao, tipo, valor, data, tag, meio_pagamento, recorrencia_id")
      .eq("user_id", userId)
      .in("tipo", ["despesa", "receita"])
      .gte("data", desde)
      .lte("data", fimMes),
  ]);
  if (recs.error) throw recs.error;
  if (lanc.error) throw lanc.error;

  const recorrencias = (recs.data ?? []).map(mapRecorrencia);
  const lancamentos: LancamentoBase[] = (lanc.data ?? []).map((l) => ({
    id: String(l.id),
    descricao: String(l.descricao ?? ""),
    tipo: String(l.tipo),
    valor: Math.abs(numero(l.valor)),
    data: String(l.data).slice(0, 10),
    tag: l.tag ? String(l.tag) : null,
    meio: l.meio_pagamento ? String(l.meio_pagamento) : null,
    recorrenciaId: l.recorrencia_id ? String(l.recorrencia_id) : null,
  }));
  const doMes = lancamentos.filter((l) => l.data >= inicioMes);

  const hoje = iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const usados = new Set<string>();
  const contas: ContaDoMes[] = [];
  for (const rec of recorrencias.filter((r) => r.status === "ativa")) {
    if (rec.dataInicio > fimMes) continue;
    const vencimento = vencimentoNoMes(ano, mes0, rec.dia);
    const pago =
      doMes.find((l) => l.recorrenciaId === rec.id && !usados.has(l.id)) ??
      doMes.find((l) => !l.recorrenciaId && !usados.has(l.id) && lancamentoCombina(rec, l));
    if (pago) usados.add(pago.id);
    const situacao: SituacaoMes = pago
      ? "paga"
      : fimMes < hoje
        ? "atrasada"
        : inicioMes > hoje
          ? "prevista"
          : vencimento < hoje
            ? "atrasada"
            : "a_vencer";
    contas.push({
      recorrencia: rec,
      situacao,
      vencimento,
      pagamento: pago ? { id: pago.id, data: pago.data, valor: pago.valor } : null,
    });
  }
  contas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    contas,
    pausadas: recorrencias.filter((r) => r.status === "pausada"),
    sugestoes: detectarSugestoes(
      lancamentos.filter((l) => l.data < inicioMes),
      recorrencias,
    ),
  };
}

/**
 * Procura o que se repete: mesma descrição em pelo menos 3 dos 4 meses anteriores,
 * com valor estável. Parcelas ("(2/10)") e o que já é recorrência ficam de fora.
 */
function detectarSugestoes(historico: LancamentoBase[], existentes: Recorrencia[]): SugestaoRecorrencia[] {
  const grupos = new Map<string, LancamentoBase[]>();
  for (const l of historico) {
    if (l.recorrenciaId || SUFIXO_PARCELA.test(l.descricao)) continue;
    const k = `${l.tipo}|${chaveDescricao(l.descricao)}`;
    if (k.endsWith("|") || k.length < 6) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }

  const sugestoes: SugestaoRecorrencia[] = [];
  for (const itens of grupos.values()) {
    const meses = new Set(itens.map((l) => l.data.slice(0, 7)));
    if (meses.size < 3) continue;
    // Um por mês (o maior), para não confundir com gastos frequentes do dia a dia.
    if (itens.length > meses.size * 1.5) continue;
    const valores = itens.map((l) => l.valor);
    const valor = mediana(valores);
    if (Math.max(...valores) > valor * (1 + TOLERANCIA_VALOR) || Math.min(...valores) < valor * (1 - TOLERANCIA_VALOR)) {
      continue;
    }
    const base = itens[itens.length - 1]!;
    const sugestao: SugestaoRecorrencia = {
      descricao: base.descricao.replace(SUFIXO_PARCELA, "").trim(),
      tipo: base.tipo === "receita" ? "receita" : "despesa",
      valor: Math.round(valor * 100) / 100,
      dia: Math.round(mediana(itens.map((l) => Number(l.data.slice(8, 10))))),
      categoria: maisFrequente(itens.map((l) => l.tag).filter((t): t is string => Boolean(t))),
      meioPagamento: maisFrequente(itens.map((l) => l.meio).filter((m): m is string => Boolean(m))),
      meses: meses.size,
    };
    if (existentes.some((r) => r.status !== "encerrada" && lancamentoCombina(r, sugestao))) continue;
    sugestoes.push(sugestao);
  }
  return sugestoes.sort((a, b) => b.valor - a.valor).slice(0, 8);
}

export type DadosRecorrencia = {
  descricao: string;
  tipo: TipoRecorrencia;
  valor: number;
  dia: number;
  categoria: string | null;
  meioPagamento: string | null;
};

export async function criarRecorrencia(d: DadosRecorrencia): Promise<void> {
  const userId = await usuarioId();
  const hoje = new Date();
  const { error } = await supabase.from("recorrencias").insert({
    user_id: userId,
    descricao: d.descricao.trim(),
    tipo: d.tipo,
    valor: d.valor,
    dia_do_mes: d.dia,
    categoria: d.categoria?.trim() || null,
    meio_pagamento: d.meioPagamento,
    frequencia: "mensal",
    status: "ativa",
    data_inicio: iso(hoje.getFullYear(), hoje.getMonth(), 1),
  });
  if (error) throw error;
}

export async function atualizarRecorrencia(id: string, d: DadosRecorrencia): Promise<void> {
  const { error } = await supabase
    .from("recorrencias")
    .update({
      descricao: d.descricao.trim(),
      tipo: d.tipo,
      valor: d.valor,
      dia_do_mes: d.dia,
      categoria: d.categoria?.trim() || null,
      meio_pagamento: d.meioPagamento,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Pausar, reativar ou encerrar. Nunca apaga: os lançamentos ligados continuam no extrato. */
export async function mudarStatusRecorrencia(id: string, status: StatusRecorrencia): Promise<void> {
  const hoje = new Date();
  const { error } = await supabase
    .from("recorrencias")
    .update({
      status,
      data_fim: status === "encerrada" ? iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) : null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Registra o pagamento do mês (ex.: aluguel pago em dinheiro) como lançamento. */
export async function marcarComoPaga(conta: ContaDoMes): Promise<void> {
  const userId = await usuarioId();
  const rec = conta.recorrencia;
  const hoje = new Date();
  const hojeIso = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const { error } = await supabase.from("lancamentos").insert({
    user_id: userId,
    descricao: rec.descricao,
    valor: rec.valor,
    tipo: rec.tipo,
    data: conta.vencimento < hojeIso ? conta.vencimento : hojeIso,
    tag: rec.categoria,
    conta_cartao: rec.contaCartao ?? CONTA_CORRENTE_LABEL,
    meio_pagamento: rec.meioPagamento,
    recorrencia_id: rec.id,
    origem: "manual",
  });
  if (error) throw error;
}
