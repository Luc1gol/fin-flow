import type { SupabaseClient } from "@supabase/supabase-js";
import { classificarTransacao, type RegraUsuario } from "@/lib/importacao/classificar";

export type TransacaoParaFila = {
  idExterno: string;
  data: string;
  /** Com sinal: negativo = saída. */
  valor: number;
  memo: string;
};

/**
 * Coloca transações na fila "A revisar" (`transacoes_importadas`) com sugestão de
 * tipo/categoria. Funciona com o cliente do navegador e com o do servidor.
 * Transações com o mesmo id externo na mesma conta nunca entram duas vezes.
 */
export async function enfileirarTransacoes(
  db: SupabaseClient,
  params: {
    contaId: string;
    origem: string;
    transacoes: TransacaoParaFila[];
    nomesTitular: string[];
    regras: ReadonlyMap<string, RegraUsuario>;
    cartaoCredito?: boolean;
    /** Dono dos dados; obrigatório quando o cliente não está logado como o usuário (rotina diária). */
    userId?: string;
    /**
     * Ignora transações que já estão na fila com a mesma data e valor, mesmo com outro
     * id externo — evita repetir o que veio antes por OFX quando chega pela Pluggy.
     */
    ignorarIguaisJaNaFila?: boolean;
  },
): Promise<{ novas: number; duplicadas: number }> {
  let transacoes = params.transacoes;
  if (transacoes.length === 0) return { novas: 0, duplicadas: 0 };

  if (params.ignorarIguaisJaNaFila) {
    transacoes = await removerIguaisJaNaFila(db, params.contaId, transacoes);
  }
  const ignoradasAntes = params.transacoes.length - transacoes.length;
  if (transacoes.length === 0) return { novas: 0, duplicadas: ignoradasAntes };

  const datas = transacoes.map((t) => t.data).sort();
  const { data: importacao, error: errImp } = await db
    .from("importacoes")
    .insert({
      ...(params.userId ? { user_id: params.userId } : {}),
      conta_id: params.contaId,
      arquivo_nome: params.origem,
      periodo_inicio: datas[0],
      periodo_fim: datas[datas.length - 1],
    })
    .select("id")
    .single();
  if (errImp) throw errImp;

  const linhas = transacoes.map((t) => {
    const s = classificarTransacao(t.memo, t.valor, {
      nomesTitular: params.nomesTitular,
      regras: params.regras,
      cartaoCredito: params.cartaoCredito,
    });
    return {
      ...(params.userId ? { user_id: params.userId } : {}),
      conta_id: params.contaId,
      importacao_id: importacao.id,
      id_externo: t.idExterno,
      data: t.data,
      valor: t.valor,
      memo: t.memo,
      sugestao_tipo: s.tipo,
      sugestao_descricao: s.descricao,
      sugestao_categoria: s.categoria,
      sugestao_meio: s.meio,
    };
  });

  const { data: inseridas, error } = await db
    .from("transacoes_importadas")
    .upsert(linhas, { onConflict: "conta_id,id_externo", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;

  const novas = inseridas?.length ?? 0;
  if (novas === 0) {
    await db.from("importacoes").delete().eq("id", importacao.id);
  } else {
    await db.from("importacoes").update({ total_transacoes: novas }).eq("id", importacao.id);
  }
  return { novas, duplicadas: ignoradasAntes + linhas.length - novas };
}

async function removerIguaisJaNaFila(
  db: SupabaseClient,
  contaId: string,
  transacoes: TransacaoParaFila[],
): Promise<TransacaoParaFila[]> {
  const datas = transacoes.map((t) => t.data).sort();
  const { data, error } = await db
    .from("transacoes_importadas")
    .select("id_externo, data, valor")
    .eq("conta_id", contaId)
    .gte("data", datas[0]!)
    .lte("data", datas[datas.length - 1]!);
  if (error) throw error;

  const idsExistentes = new Set((data ?? []).map((r) => r.id_externo as string));
  // Conta quantas vezes cada (data, valor) já existe, para casar uma a uma.
  const disponiveis = new Map<string, number>();
  for (const r of data ?? []) {
    const k = `${r.data}|${Number(r.valor).toFixed(2)}`;
    disponiveis.set(k, (disponiveis.get(k) ?? 0) + 1);
  }
  return transacoes.filter((t) => {
    if (idsExistentes.has(t.idExterno)) return true; // o upsert já ignora
    const k = `${t.data}|${t.valor.toFixed(2)}`;
    const n = disponiveis.get(k) ?? 0;
    if (n > 0) {
      disponiveis.set(k, n - 1);
      return false;
    }
    return true;
  });
}
