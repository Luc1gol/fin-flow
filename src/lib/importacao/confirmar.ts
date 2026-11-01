import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTA_CORRENTE_LABEL, labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import { chaveTransacao, type MeioMovimento, type TipoMovimento } from "@/lib/importacao/classificar";
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
  for (const c of contasDb ?? []) {
    const cartao = c.cartoes as { nome?: string } | { nome?: string }[] | null;
    const nomeCartao = Array.isArray(cartao) ? cartao[0]?.nome : cartao?.nome;
    rotuloPorConta.set(
      c.id,
      c.tipo === "cartao_credito" ? labelContaCartaoPersistido(nomeCartao ?? c.nome) : CONTA_CORRENTE_LABEL,
    );
  }

  // Pagamento de uma conta fixa (ex.: aluguel via Pix) já fica ligado a ela.
  const recorrencias = await listarRecorrenciasAtivas(db, userId).catch(() => []);

  const lancamentos = itens.map((it) => {
    const descricao = it.descricao.trim() || it.transacao.sugestao_descricao;
    // Receitas e despesas usam valor positivo (padrão do app). Transferências guardam o sinal.
    const valor = it.tipo === "transferencia" ? it.transacao.valor : Math.abs(it.transacao.valor);
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      descricao,
      valor,
      tipo: it.tipo,
      data: it.transacao.data,
      tag: it.categoria?.trim() || null,
      conta_cartao: rotuloPorConta.get(it.transacao.conta_id) ?? CONTA_CORRENTE_LABEL,
      meio_pagamento: it.transacao.sugestao_meio ? (MEIO_PARA_COLUNA[it.transacao.sugestao_meio] ?? null) : null,
      conta_id: it.transacao.conta_id,
      origem: "importacao",
      recorrencia_id:
        recorrencias.find((r) => lancamentoCombina(r, { descricao, tipo: it.tipo, valor }))?.id ?? null,
    };
  });

  const { error } = await db.from("lancamentos").insert(lancamentos);
  if (error) throw error;

  for (let i = 0; i < itens.length; i += 10) {
    await Promise.all(
      itens.slice(i, i + 10).map(async (it, j) => {
        const { error: e } = await db
          .from("transacoes_importadas")
          .update({ status: "confirmada", lancamento_id: lancamentos[i + j]!.id })
          .eq("id", it.transacao.id);
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
