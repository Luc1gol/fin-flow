import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/importacao/classificar";

/** Despesa dividida com alguém (dinheiro que essa pessoa deve ao usuário). */
export type ItemDividido = {
  id: string;
  descricao: string;
  /** Data do lançamento (yyyy-mm-dd). */
  data: string;
  /** Valor total da despesa. */
  valor: number;
  pessoa: string;
  valorAReceber: number;
  /** yyyy-mm-dd quando a pessoa pagou; null = pendente. */
  recebidoEm: string | null;
};

export type PessoaAReceber = {
  pessoa: string;
  /** Pendente de lançamentos com data até hoje. */
  totalAtual: number;
  /** Pendente de lançamentos futuros (parcelas e recorrências ainda por vir). */
  totalFuturo: number;
  itens: ItemDividido[];
};

export type PainelAReceber = {
  pendentes: ItemDividido[];
  /** Recebidos mais recentes primeiro. */
  recebidos: ItemDividido[];
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function hojeIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

const COLUNAS = "id, descricao, data, valor, dividido_com, valor_a_receber, recebido_em";

function mapItem(r: Record<string, unknown>): ItemDividido {
  return {
    id: String(r.id),
    descricao: String(r.descricao ?? "").trim() || "Despesa",
    data: String(r.data ?? "").slice(0, 10),
    valor: Math.abs(numero(r.valor)),
    pessoa: String(r.dividido_com ?? "").trim(),
    valorAReceber: numero(r.valor_a_receber),
    recebidoEm: r.recebido_em ? String(r.recebido_em).slice(0, 10) : null,
  };
}

export async function carregarAReceber(): Promise<PainelAReceber> {
  const userId = await usuarioId();
  const base = () =>
    supabase
      .from("lancamentos")
      .select(COLUNAS)
      .eq("user_id", userId)
      .not("dividido_com", "is", null)
      .not("valor_a_receber", "is", null);

  const [pend, rec] = await Promise.all([
    base().is("recebido_em", null).order("data", { ascending: true }),
    base().not("recebido_em", "is", null).order("recebido_em", { ascending: false }).limit(100),
  ]);
  if (pend.error) throw pend.error;
  if (rec.error) throw rec.error;

  const validos = (i: ItemDividido) => i.pessoa !== "" && i.valorAReceber > 0;
  return {
    pendentes: (pend.data ?? []).map((r) => mapItem(r as Record<string, unknown>)).filter(validos),
    recebidos: (rec.data ?? []).map((r) => mapItem(r as Record<string, unknown>)).filter(validos),
  };
}

/** Agrupa pendências por pessoa (ignorando acentos e maiúsculas), maior total primeiro. */
export function agruparPorPessoa(pendentes: ItemDividido[], hoje = hojeIsoLocal()): PessoaAReceber[] {
  const grupos = new Map<string, PessoaAReceber>();
  for (const item of pendentes) {
    const chave = normalizarTexto(item.pessoa);
    let g = grupos.get(chave);
    if (!g) {
      g = { pessoa: item.pessoa, totalAtual: 0, totalFuturo: 0, itens: [] };
      grupos.set(chave, g);
    }
    g.itens.push(item);
    if (item.data > hoje) g.totalFuturo += item.valorAReceber;
    else g.totalAtual += item.valorAReceber;
  }
  return [...grupos.values()].sort(
    (a, b) => b.totalAtual - a.totalAtual || b.totalFuturo - a.totalFuturo || a.pessoa.localeCompare(b.pessoa, "pt-BR"),
  );
}

/** Marca como recebido (não cria nenhum lançamento, só registra a data). */
export async function marcarRecebidos(ids: string[], data = hojeIsoLocal()): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("lancamentos").update({ recebido_em: data }).in("id", ids);
  if (error) throw error;
}

export async function desfazerRecebido(id: string): Promise<void> {
  const { error } = await supabase.from("lancamentos").update({ recebido_em: null }).eq("id", id);
  if (error) throw error;
}

/** Nomes já usados em "Dividir com", para sugerir no campo (datalist). */
export async function listarPessoasDivididas(): Promise<string[]> {
  const userId = await usuarioId();
  const { data, error } = await supabase
    .from("lancamentos")
    .select("dividido_com")
    .eq("user_id", userId)
    .not("dividido_com", "is", null)
    .order("data", { ascending: false })
    .limit(500);
  if (error) throw error;
  const porChave = new Map<string, string>();
  for (const r of data ?? []) {
    const nome = String((r as { dividido_com?: unknown }).dividido_com ?? "").trim();
    const k = normalizarTexto(nome);
    if (nome && !porChave.has(k)) porChave.set(k, nome);
  }
  return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

/** Metade do valor, arredondada para baixo no centavo (sugestão padrão). */
export function metadeEmCentavos(valor: number): number {
  return Math.floor(Math.round(valor * 100) / 2) / 100;
}

/**
 * Divide o valor a receber entre N parcelas com soma exata em centavos.
 * Parcelas que ficariam com R$ 0,00 recebem null (o banco exige valor > 0).
 */
export function dividirAReceberEmParcelas(totalReais: number, n: number): (number | null)[] {
  if (n <= 0) return [];
  const totalCents = Math.round(totalReais * 100);
  const base = Math.floor(totalCents / n);
  const resto = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => {
    const cents = base + (i < resto ? 1 : 0);
    return cents > 0 ? cents / 100 : null;
  });
}

/**
 * Valida os campos "Dividir com" de um formulário.
 * Nome vazio = sem divisão (tudo null). Retorna `erro` quando inválido.
 */
export function validarDivisao(
  nome: string,
  valorAReceber: number,
  valorTotal: number,
): { ok: true; divididoCom: string | null; valorAReceber: number | null } | { ok: false; erro: string } {
  const pessoa = nome.trim();
  if (!pessoa) return { ok: true, divididoCom: null, valorAReceber: null };
  if (!Number.isFinite(valorAReceber) || valorAReceber <= 0) {
    return { ok: false, erro: `Informe quanto ${pessoa} te deve (maior que zero).` };
  }
  if (valorAReceber > valorTotal + 0.001) {
    return { ok: false, erro: "O valor a receber não pode ser maior que o valor da despesa." };
  }
  return { ok: true, divididoCom: pessoa, valorAReceber };
}
