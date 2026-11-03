import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classificarTransacao,
  type MeioMovimento,
  type RegraUsuario,
  type SugestaoLancamento,
} from "@/lib/importacao/classificar";
import { criarLancamentosConfirmados, type ItemConfirmado } from "@/lib/importacao/confirmar";

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
    /**
     * Confirma sozinho o que bate com uma regra que o usuário ensinou (e tem categoria),
     * desde que não pareça já ter sido lançado à mão.
     */
    autoConfirmar?: boolean;
  },
): Promise<{ novas: number; duplicadas: number; automaticas: number; somaNovas: number }> {
  let transacoes = params.transacoes;
  if (transacoes.length === 0) return { novas: 0, duplicadas: 0, automaticas: 0, somaNovas: 0 };

  if (params.ignorarIguaisJaNaFila) {
    transacoes = await removerIguaisJaNaFila(db, params.contaId, transacoes);
  }
  const ignoradasAntes = params.transacoes.length - transacoes.length;
  if (transacoes.length === 0) return { novas: 0, duplicadas: ignoradasAntes, automaticas: 0, somaNovas: 0 };

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

  const sugestoes = new Map<string, SugestaoLancamento>();
  const linhas = transacoes.map((t) => {
    const s = classificarTransacao(t.memo, t.valor, {
      nomesTitular: params.nomesTitular,
      regras: params.regras,
      cartaoCredito: params.cartaoCredito,
    });
    sugestoes.set(t.idExterno, s);
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
    .select("id, id_externo, data, valor, memo, sugestao_descricao, sugestao_meio");
  if (error) throw error;

  const novas = inseridas?.length ?? 0;
  const automaticas = params.autoConfirmar
    ? await confirmarAutomaticas(db, params.userId, params.contaId, inseridas ?? [], sugestoes)
    : 0;
  if (novas === 0) {
    await db.from("importacoes").delete().eq("id", importacao.id);
  } else {
    await db.from("importacoes").update({ total_transacoes: novas }).eq("id", importacao.id);
  }
  // Soma (com sinal) do que entrou agora: explica a variação do saldo da conta.
  const somaNovas = (inseridas ?? []).reduce((a, l) => a + Number(l.valor), 0);
  return { novas, duplicadas: ignoradasAntes + linhas.length - novas, automaticas, somaNovas };
}

type LinhaInserida = {
  id: string;
  id_externo: string;
  data: string;
  valor: number | string;
  memo: string;
  sugestao_descricao: string;
  sugestao_meio: string | null;
};

async function confirmarAutomaticas(
  db: SupabaseClient,
  userIdParam: string | undefined,
  contaId: string,
  inseridas: LinhaInserida[],
  sugestoes: ReadonlyMap<string, SugestaoLancamento>,
): Promise<number> {
  const candidatas = inseridas.filter((l) => {
    const s = sugestoes.get(l.id_externo);
    return s?.porRegra && (s.tipo === "transferencia" || Boolean(s.categoria));
  });
  if (candidatas.length === 0) return 0;

  const userId = userIdParam ?? (await db.auth.getUser()).data.user?.id;
  if (!userId) return 0;

  // Algo com o mesmo valor lançado à mão perto da data fica para o usuário decidir.
  const datas = candidatas.map((l) => l.data).sort();
  const desloca = (iso: string, dias: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const { data: manuais } = await db
    .from("lancamentos")
    .select("valor, data")
    .eq("user_id", userId)
    .eq("origem", "manual")
    .gte("data", desloca(datas[0]!, -2))
    .lte("data", desloca(datas[datas.length - 1]!, 2));
  const pareceManual = (l: LinhaInserida) =>
    (manuais ?? []).some(
      (m) =>
        Math.abs(Math.abs(Number(m.valor)) - Math.abs(Number(l.valor))) < 0.005 &&
        Math.abs(new Date(`${m.data}T12:00:00`).getTime() - new Date(`${l.data}T12:00:00`).getTime()) <=
          2 * 86_400_000,
    );

  const itens: ItemConfirmado[] = candidatas
    .filter((l) => !pareceManual(l))
    .map((l) => {
      const s = sugestoes.get(l.id_externo)!;
      return {
        transacao: {
          id: l.id,
          conta_id: contaId,
          valor: Number(l.valor),
          data: l.data,
          memo: l.memo,
          sugestao_descricao: l.sugestao_descricao,
          sugestao_meio: (l.sugestao_meio as MeioMovimento | null) ?? null,
        },
        tipo: s.tipo,
        descricao: s.descricao,
        categoria: s.categoria,
      };
    });
  try {
    await criarLancamentosConfirmados(db, userId, itens, { aprender: false });
    return itens.length;
  } catch (e) {
    // Se falhar, ficam na fila para revisão manual.
    console.error("[fila] confirmação automática", e);
    return 0;
  }
}

async function removerIguaisJaNaFila(
  db: SupabaseClient,
  contaId: string,
  transacoes: TransacaoParaFila[],
): Promise<TransacaoParaFila[]> {
  const datas = transacoes.map((t) => t.data).sort();
  // Um dia de folga: a compra do Apple Pay feita perto da meia-noite pode vir do banco com
  // a data do dia seguinte (ou o contrário).
  const { data, error } = await db
    .from("transacoes_importadas")
    .select("id_externo, data, valor")
    .eq("conta_id", contaId)
    .gte("data", deslocarDia(datas[0]!, -1))
    .lte("data", deslocarDia(datas[datas.length - 1]!, 1));
  if (error) throw error;

  const idsExistentes = new Set((data ?? []).map((r) => r.id_externo as string));
  // Conta quantas vezes cada (data, valor) já existe, para casar uma a uma.
  const disponiveis = new Map<string, number>();
  for (const r of data ?? []) {
    const k = `${r.data}|${Number(r.valor).toFixed(2)}`;
    disponiveis.set(k, (disponiveis.get(k) ?? 0) + 1);
  }
  const consumir = (k: string) => {
    const n = disponiveis.get(k) ?? 0;
    if (n === 0) return false;
    disponiveis.set(k, n - 1);
    return true;
  };
  const doAtalho = (data ?? []).filter((r) => String(r.id_externo).startsWith(PREFIXO_ATALHO));
  return transacoes.filter((t) => {
    if (idsExistentes.has(t.idExterno)) return true; // o upsert já ignora
    const valor = t.valor.toFixed(2);
    if (consumir(`${t.data}|${valor}`)) return false;
    // Já chegou pelo Apple Pay com um dia de diferença.
    const vizinha = doAtalho.find(
      (r) =>
        Number(r.valor).toFixed(2) === valor &&
        (r.data === deslocarDia(t.data, -1) || r.data === deslocarDia(t.data, 1)),
    );
    return !(vizinha && consumir(`${vizinha.data}|${valor}`));
  });
}

/** Prefixo do id externo das compras que chegam pelo atalho do iPhone (Apple Pay). */
export const PREFIXO_ATALHO = "applepay:";

function deslocarDia(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type LinhaPareamento = {
  id: string;
  conta_id: string;
  data: string;
  valor: number | string;
  memo: string;
  status: string;
  sugestao_tipo: string;
  sugestao_descricao: string;
  sugestao_meio: string | null;
  lancamentos: { tipo: string } | null;
};

/**
 * Dinheiro que sai de uma conta sua e entra em outra (ex.: Itaú → C6, ou a fatura do C6
 * paga pelo Itaú) é transferência, mesmo quando o texto de um dos bancos não deixa claro.
 * Procura, na fila, uma saída e uma entrada de mesmo valor em contas diferentes, com até
 * 2 dias de diferença, em que pelo menos um dos lados já foi reconhecido como transferência
 * (ex.: "Pix recebido de <você>"). Confirma os dois lados pendentes como transferência,
 * para não contarem como gasto nem como entrada. Devolve quantas transações confirmou.
 */
export async function parearTransferencias(db: SupabaseClient, userId: string): Promise<number> {
  const campos =
    "id, conta_id, data, valor, memo, status, sugestao_tipo, sugestao_descricao, sugestao_meio, lancamentos(tipo)";
  const { data: pendentes } = await db
    .from("transacoes_importadas")
    .select(campos)
    .eq("user_id", userId)
    .eq("status", "pendente")
    .order("data", { ascending: false })
    .limit(500);
  if (!pendentes?.length) return 0;

  const desloca = (iso: string, dias: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const datas = pendentes.map((p) => p.data as string).sort();
  const { data: proximas } = await db
    .from("transacoes_importadas")
    .select(campos)
    .eq("user_id", userId)
    .in("status", ["pendente", "confirmada"])
    .gte("data", desloca(datas[0]!, -2))
    .lte("data", desloca(datas[datas.length - 1]!, 2));

  const linhas = (proximas ?? []) as unknown as LinhaPareamento[];
  const ehTransferencia = (l: LinhaPareamento) =>
    (l.status === "pendente" ? l.sugestao_tipo : l.lancamentos?.tipo) === "transferencia";
  const dias = (a: string, b: string) =>
    Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;

  const usadas = new Set<string>();
  const confirmar = new Map<string, LinhaPareamento>();
  for (const p of pendentes as unknown as LinhaPareamento[]) {
    if (usadas.has(p.id)) continue;
    const valor = Number(p.valor);
    const par = linhas.find(
      (c) =>
        c.id !== p.id &&
        !usadas.has(c.id) &&
        c.conta_id !== p.conta_id &&
        Math.sign(Number(c.valor)) === -Math.sign(valor) &&
        Math.abs(Math.abs(Number(c.valor)) - Math.abs(valor)) < 0.005 &&
        dias(c.data, p.data) <= 2 &&
        (ehTransferencia(c) || ehTransferencia(p)),
    );
    if (!par) continue;
    usadas.add(p.id);
    usadas.add(par.id);
    confirmar.set(p.id, p);
    if (par.status === "pendente") confirmar.set(par.id, par);
  }
  if (confirmar.size === 0) return 0;

  const itens: ItemConfirmado[] = [...confirmar.values()].map((l) => ({
    transacao: {
      id: l.id,
      conta_id: l.conta_id,
      valor: Number(l.valor),
      data: l.data,
      memo: l.memo,
      sugestao_descricao: l.sugestao_descricao,
      sugestao_meio: (l.sugestao_meio as MeioMovimento | null) ?? null,
    },
    tipo: "transferencia",
    descricao: l.sugestao_tipo === "transferencia" ? l.sugestao_descricao : "Transferência entre minhas contas",
    categoria: null,
  }));
  try {
    await criarLancamentosConfirmados(db, userId, itens, { aprender: false });
    return itens.length;
  } catch (e) {
    console.error("[fila] pareamento de transferências", e);
    return 0;
  }
}
