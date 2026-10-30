import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/importacao/classificar";

export type ItemOrcamento = {
  /** id do orçamento; null para categoria com gasto mas sem orçamento definido. */
  id: string | null;
  categoria: string;
  limite: number | null;
  gasto: number;
  /** Média mensal dos 3 meses completos anteriores (base para sugerir um limite). */
  mediaAnterior: number;
};

export type PainelOrcamento = {
  itens: ItemOrcamento[];
  /** Dias do mês que ainda faltam, contando hoje (null em meses que já passaram). */
  diasRestantes: number | null;
  /** Fração do mês já decorrida (0–1), para comparar com o ritmo de gasto. */
  fracaoMes: number;
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(ano: number, mes0: number, dia: number) {
  const d = new Date(ano, mes0, dia, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Arredonda a sugestão para cima, em múltiplos de 10 (ex.: 347 → 350). */
export function sugerirLimite(media: number): number {
  return Math.max(10, Math.ceil(media / 10) * 10);
}

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

/** Orçamentos + gasto do mês por categoria + média dos 3 meses anteriores. */
export async function carregarPainelOrcamento(ano: number, mes0: number): Promise<PainelOrcamento> {
  const userId = await usuarioId();
  const desde = iso(ano, mes0 - 3, 1);
  const fimMes = iso(ano, mes0 + 1, 0);
  const inicioMes = iso(ano, mes0, 1);

  const [orc, lanc] = await Promise.all([
    supabase.from("orcamentos").select("id, categoria, valor_mensal").order("categoria"),
    supabase
      .from("lancamentos")
      .select("valor, data, tag")
      .eq("user_id", userId)
      .eq("tipo", "despesa")
      .gte("data", desde)
      .lte("data", fimMes),
  ]);
  if (orc.error) throw orc.error;
  if (lanc.error) throw lanc.error;

  // Agrupa ignorando acentos e maiúsculas ("Fast food" = "Fast Food").
  const porChave = new Map<string, ItemOrcamento>();
  const item = (categoria: string) => {
    const k = normalizarTexto(categoria);
    let it = porChave.get(k);
    if (!it) {
      it = { id: null, categoria, limite: null, gasto: 0, mediaAnterior: 0 };
      porChave.set(k, it);
    }
    return it;
  };

  for (const o of orc.data ?? []) {
    const it = item(String(o.categoria));
    it.id = String(o.id);
    it.categoria = String(o.categoria);
    it.limite = numero(o.valor_mensal);
  }
  for (const l of lanc.data ?? []) {
    const categoria = l.tag?.trim() || "Sem categoria";
    const valor = Math.abs(numero(l.valor));
    const data = String(l.data).slice(0, 10);
    const it = item(categoria);
    if (data >= inicioMes) it.gasto += valor;
    else it.mediaAnterior += valor / 3;
  }

  const hoje = new Date();
  const diasNoMes = new Date(ano, mes0 + 1, 0).getDate();
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mes0;
  const passado = new Date(ano, mes0 + 1, 1) <= hoje;

  return {
    itens: [...porChave.values()],
    diasRestantes: ehMesAtual ? diasNoMes - hoje.getDate() + 1 : null,
    fracaoMes: ehMesAtual ? hoje.getDate() / diasNoMes : passado ? 1 : 0,
  };
}

export async function salvarOrcamento(categoria: string, valorMensal: number): Promise<void> {
  const userId = await usuarioId();
  const { error } = await supabase
    .from("orcamentos")
    .upsert(
      { user_id: userId, categoria: categoria.trim(), valor_mensal: valorMensal },
      { onConflict: "user_id,categoria" },
    );
  if (error) throw error;
}

export async function excluirOrcamento(id: string): Promise<void> {
  const { error } = await supabase.from("orcamentos").delete().eq("id", id);
  if (error) throw error;
}

/** Cria orçamentos de uma vez a partir das sugestões (média dos últimos 3 meses). */
export async function criarOrcamentosSugeridos(itens: { categoria: string; valor: number }[]): Promise<void> {
  if (itens.length === 0) return;
  const userId = await usuarioId();
  const { error } = await supabase.from("orcamentos").upsert(
    itens.map((i) => ({ user_id: userId, categoria: i.categoria, valor_mensal: i.valor })),
    { onConflict: "user_id,categoria" },
  );
  if (error) throw error;
}

export type StatusOrcamento = "ok" | "atencao" | "estourado";

export function statusDoItem(gasto: number, limite: number): StatusOrcamento {
  const pct = gasto / limite;
  if (pct > 1) return "estourado";
  if (pct >= 0.8) return "atencao";
  return "ok";
}
