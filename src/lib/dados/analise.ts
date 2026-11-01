/**
 * Busca de dados da tela Análise (/relatorios).
 * - Lançamentos (só receita/despesa; transferências nunca entram) numa janela de datas,
 *   paginando além de 1000 linhas.
 * - Contas de cartão de crédito do banco + faturas, e cartões manuais (para logos).
 */
import { supabase } from "@/lib/supabase";
import { labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import { coalesceTagsExtrasFromUnknown } from "@/lib/tags-extras-coalesce";
import type {
  ContaCartaoAnalise,
  FaturaAnalise,
  LancamentoRelatorioRow,
} from "@/types/relatorios";

const PAGINA = 1000;

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function textoOuNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function mapLancamento(item: Record<string, unknown>): LancamentoRelatorioRow {
  return {
    id: String(item.id),
    tipo: String(item.tipo ?? "").toLowerCase().trim(),
    valor: Math.abs(numero(item.valor)),
    data: String(item.data ?? "").slice(0, 10),
    descricao: textoOuNull(item.descricao),
    tag: textoOuNull(item.tag),
    conta_cartao: textoOuNull(item.conta_cartao),
    meio_pagamento: textoOuNull(item.meio_pagamento),
    recorrencia_id: textoOuNull(item.recorrencia_id),
    tags_extras: coalesceTagsExtrasFromUnknown(item.tags_extras),
  };
}

/** Receitas e despesas entre duas datas (inclusive), em páginas de 1000. */
async function buscarLancamentos(
  userId: string,
  desde: string,
  ate: string,
): Promise<LancamentoRelatorioRow[]> {
  const linhas: LancamentoRelatorioRow[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        "id, tipo, valor, data, descricao, tag, conta_cartao, meio_pagamento, recorrencia_id, tags_extras",
      )
      .eq("user_id", userId)
      .in("tipo", ["receita", "despesa"])
      .gte("data", desde)
      .lte("data", ate)
      .order("data")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as Record<string, unknown>[];
    linhas.push(...pagina.map(mapLancamento));
    if (pagina.length < PAGINA) break;
  }
  return linhas;
}

export type CartoesAnalise = {
  contasCartao: ContaCartaoAnalise[];
  faturas: FaturaAnalise[];
  /** "Cartão X" (como gravado em `conta_cartao`) → id do banco. */
  bancoPorCartao: Record<string, string>;
};

/** Contas de crédito do banco, faturas (até 18 meses) e cartões manuais. Falhas viram listas vazias. */
async function buscarCartoes(userId: string, faturasDesde: string): Promise<CartoesAnalise> {
  const [cart, cont] = await Promise.all([
    supabase.from("cartoes").select("id, nome, banco").eq("user_id", userId),
    supabase
      .from("contas")
      .select("id, nome, banco, cartao_id, saldo_banco, limite, limite_disponivel, fatura_vencimento")
      .eq("user_id", userId)
      .eq("tipo", "cartao_credito"),
  ]);
  if (cart.error) console.error("[analise] cartoes:", cart.error);
  if (cont.error) console.error("[analise] contas:", cont.error);

  const bancoPorCartao: Record<string, string> = {};
  const bancoPorCartaoId = new Map<string, string>();
  for (const r of (cart.data ?? []) as Record<string, unknown>[]) {
    const banco = String(r.banco ?? "").trim();
    if (!banco) continue;
    bancoPorCartao[labelContaCartaoPersistido(String(r.nome ?? ""))] = banco;
    bancoPorCartaoId.set(String(r.id), banco);
  }

  const contasCartao: ContaCartaoAnalise[] = ((cont.data ?? []) as Record<string, unknown>[]).map(
    (r) => {
      const cartaoId = textoOuNull(r.cartao_id);
      return {
        id: String(r.id),
        nome: String(r.nome ?? "").trim() || "Cartão",
        bancoId: (cartaoId ? bancoPorCartaoId.get(cartaoId) : undefined) ?? textoOuNull(r.banco),
        saldo: numeroOuNull(r.saldo_banco),
        limite: numeroOuNull(r.limite),
        limiteDisponivel: numeroOuNull(r.limite_disponivel),
        faturaVencimento: textoOuNull(r.fatura_vencimento)?.slice(0, 10) ?? null,
      };
    },
  );

  let faturas: FaturaAnalise[] = [];
  if (contasCartao.length > 0) {
    const fat = await supabase
      .from("faturas")
      .select("id, conta_id, vencimento, valor_total, valor_pago")
      .in(
        "conta_id",
        contasCartao.map((c) => c.id),
      )
      .gte("vencimento", faturasDesde)
      .order("vencimento", { ascending: true });
    if (fat.error) console.error("[analise] faturas:", fat.error);
    else {
      faturas = ((fat.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        contaId: String(r.conta_id),
        vencimento: String(r.vencimento ?? "").slice(0, 10),
        valorTotal: numero(r.valor_total),
        valorPago: numero(r.valor_pago),
      }));
    }
  }
  return { contasCartao, faturas, bancoPorCartao };
}

/**
 * Tudo que a Análise precisa numa ida: lançamentos de `desde` a `ate` e os dados dos cartões.
 * Retorna `null` sem usuário logado.
 */
export async function carregarDadosAnalise(janela: {
  desde: string;
  ate: string;
  faturasDesde: string;
}): Promise<({ lancamentos: LancamentoRelatorioRow[] } & CartoesAnalise) | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const userId = data.user.id;
  const [lancamentos, cartoes] = await Promise.all([
    buscarLancamentos(userId, janela.desde, janela.ate),
    buscarCartoes(userId, janela.faturasDesde),
  ]);
  return { lancamentos, ...cartoes };
}
