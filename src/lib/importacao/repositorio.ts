import { supabase } from "@/lib/supabase";
import { CONTA_CORRENTE_LABEL } from "@/lib/conta-cartao-lancamento";
import {
  chaveTransacao,
  classificarTransacao,
  type MeioMovimento,
  type RegraUsuario,
  type TipoMovimento,
} from "@/lib/importacao/classificar";
import type { OfxExtrato } from "@/lib/importacao/ofx";

export type Conta = {
  id: string;
  nome: string;
  banco: string | null;
  tipo: string;
  numero_conta: string | null;
  saldo_inicial: number;
  data_saldo_inicial: string;
};

export type TransacaoImportada = {
  id: string;
  conta_id: string;
  id_externo: string;
  data: string;
  /** Com sinal: negativo = saída. */
  valor: number;
  memo: string;
  sugestao_tipo: TipoMovimento;
  sugestao_descricao: string;
  sugestao_categoria: string | null;
  sugestao_meio: MeioMovimento | null;
};

/** Edição feita pelo usuário na tela "A revisar". */
export type TransacaoRevisada = {
  transacao: TransacaoImportada;
  tipo: TipoMovimento;
  descricao: string;
  categoria: string | null;
};

async function usuarioAtual() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user;
}

export async function listarContas(): Promise<Conta[]> {
  const { data, error } = await supabase
    .from("contas")
    .select("id, nome, banco, tipo, numero_conta, saldo_inicial, data_saldo_inicial")
    .eq("arquivada", false)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })) as Conta[];
}

export async function criarConta(input: {
  nome: string;
  banco: string | null;
  numero_conta: string | null;
  saldo_inicial: number;
  data_saldo_inicial: string;
}): Promise<Conta> {
  const { data, error } = await supabase
    .from("contas")
    .insert(input)
    .select("id, nome, banco, tipo, numero_conta, saldo_inicial, data_saldo_inicial")
    .single();
  if (error) throw error;
  return { ...data, saldo_inicial: Number(data.saldo_inicial) } as Conta;
}

/** Nomes usados para reconhecer Pix entre contas do próprio usuário. */
export async function nomesDoTitular(): Promise<string[]> {
  const user = await usuarioAtual();
  const { data } = await supabase
    .from("profiles")
    .select("nome_completo")
    .eq("id", user.id)
    .maybeSingle();
  const nomes = [
    data?.nome_completo,
    user.user_metadata?.full_name,
    user.user_metadata?.name,
  ];
  return nomes.map((n) => String(n ?? "").trim()).filter(Boolean);
}

export async function carregarRegras(): Promise<Map<string, RegraUsuario>> {
  const { data, error } = await supabase
    .from("regras_categorizacao")
    .select("padrao, tipo, categoria, descricao");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.padrao as string, r as RegraUsuario]));
}

/**
 * Grava as transações do arquivo na fila "A revisar".
 * Transações já importadas antes (mesmo FITID na mesma conta) são ignoradas.
 */
export async function importarExtrato(params: {
  conta: Conta;
  extrato: OfxExtrato;
  arquivoNome: string;
  nomesTitular: string[];
  regras: ReadonlyMap<string, RegraUsuario>;
}): Promise<{ novas: number; duplicadas: number }> {
  const { conta, extrato, arquivoNome, nomesTitular, regras } = params;
  const datas = extrato.transacoes.map((t) => t.data).sort();

  const { data: importacao, error: errImp } = await supabase
    .from("importacoes")
    .insert({
      conta_id: conta.id,
      arquivo_nome: arquivoNome,
      periodo_inicio: datas[0] ?? null,
      periodo_fim: datas[datas.length - 1] ?? null,
    })
    .select("id")
    .single();
  if (errImp) throw errImp;

  const linhas = extrato.transacoes.map((t) => {
    const s = classificarTransacao(t.memo, t.valor, { nomesTitular, regras });
    return {
      conta_id: conta.id,
      importacao_id: importacao.id,
      id_externo: t.fitid,
      data: t.data,
      valor: t.valor,
      memo: t.memo,
      sugestao_tipo: s.tipo,
      sugestao_descricao: s.descricao,
      sugestao_categoria: s.categoria,
      sugestao_meio: s.meio,
    };
  });

  const { data: inseridas, error } = await supabase
    .from("transacoes_importadas")
    .upsert(linhas, { onConflict: "conta_id,id_externo", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;

  const novas = inseridas?.length ?? 0;
  await supabase
    .from("importacoes")
    .update({ total_transacoes: novas })
    .eq("id", importacao.id);

  return { novas, duplicadas: linhas.length - novas };
}

export async function listarPendentes(): Promise<TransacaoImportada[]> {
  const { data, error } = await supabase
    .from("transacoes_importadas")
    .select(
      "id, conta_id, id_externo, data, valor, memo, sugestao_tipo, sugestao_descricao, sugestao_categoria, sugestao_meio",
    )
    .eq("status", "pendente")
    .order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, valor: Number(t.valor) })) as TransacaoImportada[];
}

/**
 * Procura lançamentos manuais com o mesmo valor em até 2 dias de diferença —
 * provavelmente a mesma transação já lançada à mão.
 * Retorna: id da transação importada → descrição do lançamento parecido.
 */
export async function buscarPossiveisDuplicados(
  pendentes: TransacaoImportada[],
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (pendentes.length === 0) return resultado;
  const datas = pendentes.map((p) => p.data).sort();
  const desde = deslocarDias(datas[0]!, -2);
  const ate = deslocarDias(datas[datas.length - 1]!, 2);

  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, descricao, valor, data, tipo")
    .eq("origem", "manual")
    .gte("data", desde)
    .lte("data", ate);
  if (error) throw error;

  const usados = new Set<string>();
  for (const p of pendentes) {
    const alvo = Math.abs(p.valor);
    const candidato = (data ?? []).find(
      (l) =>
        !usados.has(l.id) &&
        Math.abs(Number(l.valor) - alvo) < 0.005 &&
        Math.abs(diffDias(l.data, p.data)) <= 2,
    );
    if (candidato) {
      usados.add(candidato.id);
      resultado.set(p.id, `${candidato.descricao} (${formatarDataCurta(candidato.data)})`);
    }
  }
  return resultado;
}

const MEIO_PARA_COLUNA: Partial<Record<MeioMovimento, string>> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
};

/** Cria os lançamentos, marca as transações como confirmadas e aprende regras. */
export async function confirmarTransacoes(itens: TransacaoRevisada[]): Promise<void> {
  if (itens.length === 0) return;
  const user = await usuarioAtual();

  const lancamentos = itens.map((it) => ({
    id: crypto.randomUUID(),
    user_id: user.id,
    descricao: it.descricao.trim() || it.transacao.sugestao_descricao,
    // Receitas e despesas usam valor positivo (padrão do app).
    // Transferências guardam o sinal: negativo = saiu da conta.
    valor:
      it.tipo === "transferencia"
        ? it.transacao.valor
        : Math.abs(it.transacao.valor),
    tipo: it.tipo,
    data: it.transacao.data,
    tag: it.categoria?.trim() || null,
    conta_cartao: CONTA_CORRENTE_LABEL,
    meio_pagamento: it.transacao.sugestao_meio
      ? (MEIO_PARA_COLUNA[it.transacao.sugestao_meio] ?? null)
      : null,
    conta_id: it.transacao.conta_id,
    origem: "importacao",
  }));

  const { error } = await supabase.from("lancamentos").insert(lancamentos);
  if (error) throw error;

  await emLotes(itens, 10, async (it, i) => {
    const { error: e } = await supabase
      .from("transacoes_importadas")
      .update({ status: "confirmada", lancamento_id: lancamentos[i]!.id })
      .eq("id", it.transacao.id);
    if (e) throw e;
  });

  const regras = new Map<string, Record<string, unknown>>();
  for (const it of itens) {
    const padrao = chaveTransacao(it.transacao.memo, it.transacao.valor);
    if (!padrao) continue;
    regras.set(padrao, {
      user_id: user.id,
      padrao,
      tipo: it.tipo,
      categoria: it.categoria?.trim() || null,
      descricao: it.descricao.trim() || null,
    });
  }
  if (regras.size > 0) {
    const { error: errRegras } = await supabase
      .from("regras_categorizacao")
      .upsert([...regras.values()], { onConflict: "user_id,padrao" });
    if (errRegras) console.error("Erro ao salvar regras:", errRegras);
  }
}

export async function ignorarTransacoes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("transacoes_importadas")
    .update({ status: "ignorada" })
    .in("id", ids);
  if (error) throw error;
}

async function emLotes<T>(
  itens: T[],
  tamanho: number,
  fn: (item: T, indice: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map((it, j) => fn(it, i + j)));
  }
}

function deslocarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diffDias(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000,
  );
}

function formatarDataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
