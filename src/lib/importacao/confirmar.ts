import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTA_CORRENTE_LABEL, labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import { chaveTransacao, normalizarTexto, type MeioMovimento, type TipoMovimento } from "@/lib/importacao/classificar";
import { ajustarInvestimento, ehCategoriaInvestimento } from "@/lib/investimentos";
import { formatBRL } from "@/lib/format-currency";
import { lancamentoCombina, listarRecorrenciasAtivas } from "@/lib/dados/recorrencias";

/** Transação da fila "Revisar" já decidida (pelo usuário ou por uma regra aprendida). */
export type ItemConfirmado = {
  transacao: {
    id: string;
    conta_id: string;
    /** Com sinal: negativo = saída. */
    valor: number;
    data: string;
    memo: string;
    sugestao_descricao: string;
    sugestao_meio: MeioMovimento | null;
  };
  tipo: TipoMovimento;
  descricao: string;
  categoria: string | null;
};

const MEIO_PARA_COLUNA: Partial<Record<MeioMovimento, string>> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
};

/**
 * Cria os lançamentos, marca as transações da fila como confirmadas e (opcionalmente)
 * aprende regras. Funciona com o cliente do navegador e com o do servidor (rotina diária).
 */
export async function criarLancamentosConfirmados(
  db: SupabaseClient,
  userId: string,
  itens: ItemConfirmado[],
  opcoes: { aprender: boolean },
): Promise<void> {
  if (itens.length === 0) return;

  // Compras de conta de cartão aparecem no app como "Cartão <nome>", igual ao lançamento manual.
  const contaIds = [...new Set(itens.map((it) => it.transacao.conta_id))];
  const { data: contasDb, error: errContas } = await db
    .from("contas")
    .select("id, nome, tipo, cartoes(nome)")
    .in("id", contaIds);
  if (errContas) throw errContas;
  const rotuloPorConta = new Map<string, string>();
  const contasCartao = new Set<string>();
  for (const c of contasDb ?? []) {
    if (c.tipo === "cartao_credito") contasCartao.add(c.id);
    const cartao = c.cartoes as { nome?: string } | { nome?: string }[] | null;
    const nomeCartao = Array.isArray(cartao) ? cartao[0]?.nome : cartao?.nome;
    rotuloPorConta.set(
      c.id,
      c.tipo === "cartao_credito" ? labelContaCartaoPersistido(nomeCartao ?? c.nome) : CONTA_CORRENTE_LABEL,
    );
  }

  // Pagamento de uma conta fixa (ex.: aluguel via Pix) já fica ligado a ela.
  const recorrencias = await listarRecorrenciasAtivas(db, userId).catch(() => []);

  // Estorno no cartão abate a compra original em vez de virar entrada de dinheiro.
  const estornados = new Map<number, string>();
  for (const [i, it] of itens.entries()) {
    if (it.tipo !== "receita" || !contasCartao.has(it.transacao.conta_id)) continue;
    if (ehCategoriaInvestimento(it.categoria)) continue;
    const original = await abaterCompraEstornada(db, userId, it, rotuloPorConta.get(it.transacao.conta_id) ?? "");
    if (original) estornados.set(i, original);
  }

  const paraInserir = itens.filter((_, i) => !estornados.has(i));
  const lancamentos = paraInserir.map((it) => {
    const descricao = it.descricao.trim() || it.transacao.sugestao_descricao;
    // Receitas e despesas usam valor positivo (padrão do app). Transferências guardam o sinal.
    // Aplicação/resgate de investimento vira transferência (não é gasto nem ganho).
    const ajuste = ajustarInvestimento(
      it.tipo,
      it.tipo === "transferencia" ? it.transacao.valor : Math.abs(it.transacao.valor),
      it.categoria,
    );
    const valor = ajuste.valor;
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      descricao,
      valor,
      tipo: ajuste.tipo,
      data: it.transacao.data,
      tag: it.categoria?.trim() || null,
      conta_cartao: rotuloPorConta.get(it.transacao.conta_id) ?? CONTA_CORRENTE_LABEL,
      meio_pagamento: it.transacao.sugestao_meio ? (MEIO_PARA_COLUNA[it.transacao.sugestao_meio] ?? null) : null,
      conta_id: it.transacao.conta_id,
      origem: "importacao",
      recorrencia_id:
        recorrencias.find((r) => lancamentoCombina(r, { descricao, tipo: ajuste.tipo, valor }))?.id ?? null,
    };
  });

  if (lancamentos.length > 0) {
    const { error } = await db.from("lancamentos").insert(lancamentos);
    if (error) throw error;
  }

  const vinculos = [
    ...paraInserir.map((it, k) => ({ id: it.transacao.id, lancamentoId: lancamentos[k]!.id })),
    ...[...estornados].map(([i, lancamentoId]) => ({ id: itens[i]!.transacao.id, lancamentoId })),
  ];
  for (let i = 0; i < vinculos.length; i += 10) {
    await Promise.all(
      vinculos.slice(i, i + 10).map(async (v) => {
        const { error: e } = await db
          .from("transacoes_importadas")
          .update({ status: "confirmada", lancamento_id: v.lancamentoId })
          .eq("id", v.id);
        if (e) throw e;
      }),
    );
  }

  if (!opcoes.aprender) return;
  const regras = new Map<string, Record<string, unknown>>();
  for (const it of itens) {
    const padrao = chaveTransacao(it.transacao.memo, it.transacao.valor);
    if (!padrao) continue;
    regras.set(padrao, {
      user_id: userId,
      padrao,
      tipo: it.tipo,
      categoria: it.categoria?.trim() || null,
      descricao: it.descricao.trim() || null,
    });
  }
  if (regras.size > 0) {
    const { error: errRegras } = await db
      .from("regras_categorizacao")
      .upsert([...regras.values()], { onConflict: "user_id,padrao" });
    if (errRegras) console.error("Erro ao salvar regras:", errRegras);
  }
}

const PALAVRAS_ESTORNO = /\b(estorno|estornado|reembolso|devolucao|cancelamento|credito|ajuste)\b/g;

/**
 * Procura a compra original de um estorno no mesmo cartão (até 120 dias antes) e abate o valor
 * dela, anotando na observação. Prefere valor igual e nome parecido. Devolve o id da compra
 * ajustada, ou null se não achar (aí o estorno segue como receita, para o usuário decidir).
 */
async function abaterCompraEstornada(
  db: SupabaseClient,
  userId: string,
  it: ItemConfirmado,
  rotuloCartao: string,
): Promise<string | null> {
  const valorEstorno = Math.abs(it.transacao.valor);
  const ate = it.transacao.data;
  const desde = new Date(`${ate}T12:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 120);
  const { data: compras } = await db
    .from("lancamentos")
    .select("id, descricao, valor, data, observacao, conta_id, conta_cartao")
    .eq("user_id", userId)
    .eq("tipo", "despesa")
    .gte("data", desde.toISOString().slice(0, 10))
    .lte("data", ate)
    .order("data", { ascending: false });
  const doCartao = (compras ?? []).filter(
    (c) => c.conta_id === it.transacao.conta_id || (rotuloCartao && c.conta_cartao === rotuloCartao),
  );
  if (doCartao.length === 0) return null;

  const palavras = normalizarTexto(`${it.transacao.memo} ${it.descricao}`)
    .replace(PALAVRAS_ESTORNO, " ")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
  const nomeParecido = (descricao: string | null) => {
    const d = normalizarTexto(descricao ?? "");
    return palavras.some((p) => d.includes(p));
  };
  const mesmoValor = (v: unknown) => Math.abs(Math.abs(Number(v)) - valorEstorno) < 0.005;

  const original =
    doCartao.find((c) => mesmoValor(c.valor) && nomeParecido(c.descricao)) ??
    doCartao.find((c) => mesmoValor(c.valor)) ??
    doCartao.find((c) => nomeParecido(c.descricao) && Math.abs(Number(c.valor)) >= valorEstorno);
  if (!original) return null;

  const [a, m, d] = ate.split("-");
  const nota = `Estornado ${formatBRL(valorEstorno)} em ${d}/${m}/${a}.`;
  const { error } = await db
    .from("lancamentos")
    .update({
      valor: Math.max(0, Math.abs(Number(original.valor)) - valorEstorno),
      observacao: original.observacao ? `${original.observacao}
${nota}` : nota,
    })
    .eq("id", original.id);
  if (error) throw error;
  return String(original.id);
}
