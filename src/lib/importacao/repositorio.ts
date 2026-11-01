import { supabase } from "@/lib/supabase";
import {
  CONTA_CORRENTE_LABEL,
  labelContaCartaoPersistido,
} from "@/lib/conta-cartao-lancamento";
import {
  chaveTransacao,
  classificarTransacao,
  type MeioMovimento,
  type RegraUsuario,
  type TipoMovimento,
} from "@/lib/importacao/classificar";
import { enfileirarTransacoes } from "@/lib/importacao/fila";
import { lancamentoCombina, listarRecorrenciasAtivas } from "@/lib/dados/recorrencias";
import type { OfxExtrato } from "@/lib/importacao/ofx";

export type Conta = {
  id: string;
  nome: string;
  banco: string | null;
  tipo: string;
  numero_conta: string | null;
  saldo_inicial: number;
  data_saldo_inicial: string;
  ultima_sincronizacao: string | null;
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
    .select("id, nome, banco, tipo, numero_conta, saldo_inicial, data_saldo_inicial, ultima_sincronizacao")
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
    .select("id, nome, banco, tipo, numero_conta, saldo_inicial, data_saldo_inicial, ultima_sincronizacao")
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
 * Transações já importadas antes (mesmo FITID ou mesma data e valor) são ignoradas.
 * Antes disso, usa o arquivo para dar nome às "Compras no débito" que vieram do banco sem nome.
 */
export async function importarExtrato(params: {
  conta: Conta;
  extrato: OfxExtrato;
  arquivoNome: string;
  nomesTitular: string[];
  regras: ReadonlyMap<string, RegraUsuario>;
}): Promise<{ novas: number; duplicadas: number; nomesPreenchidos: number }> {
  const opcoes = {
    nomesTitular: params.nomesTitular,
    regras: params.regras,
    cartaoCredito: params.conta.tipo === "cartao_credito",
  };
  const { usados, preenchidos } = await preencherNomesDebito(
    params.conta.id,
    params.extrato.transacoes,
    opcoes,
  );
  const resultado = await enfileirarTransacoes(supabase, {
    contaId: params.conta.id,
    origem: params.arquivoNome,
    transacoes: params.extrato.transacoes
      .filter((t) => !usados.has(t.fitid))
      .map((t) => ({ idExterno: t.fitid, data: t.data, valor: t.valor, memo: t.memo })),
    ...opcoes,
    ignorarIguaisJaNaFila: true,
  });
  return { ...resultado, nomesPreenchidos: preenchidos };
}

const DEBITO_SEM_NOME = "Compra no débito";

/**
 * O Open Finance do C6 manda compras no débito sem o nome da loja; o OFX traz o nome.
 * Casa cada compra do arquivo com a transação do banco de mesmo valor (mesmo dia ou
 * um dia de diferença) e copia o nome — na fila de revisão e nos lançamentos já confirmados.
 */
async function preencherNomesDebito(
  contaId: string,
  transacoes: OfxExtrato["transacoes"],
  opcoes: Parameters<typeof classificarTransacao>[2],
): Promise<{ usados: Set<string>; preenchidos: number }> {
  const usados = new Set<string>();
  const compras = transacoes.filter((t) => t.valor < 0);
  if (compras.length === 0) return { usados, preenchidos: 0 };
  const datas = compras.map((t) => t.data).sort();
  const desde = deslocarDias(datas[0]!, -1);
  const ate = deslocarDias(datas[datas.length - 1]!, 1);

  const [fila, lancs] = await Promise.all([
    supabase
      .from("transacoes_importadas")
      .select("id, data, valor, sugestao_categoria")
      .eq("conta_id", contaId)
      .eq("status", "pendente")
      .eq("sugestao_descricao", DEBITO_SEM_NOME)
      .gte("data", desde)
      .lte("data", ate),
    supabase
      .from("lancamentos")
      .select("id, data, valor, tag")
      .eq("conta_id", contaId)
      .eq("descricao", DEBITO_SEM_NOME)
      .gte("data", desde)
      .lte("data", ate),
  ]);
  if (fila.error) throw fila.error;
  if (lancs.error) throw lancs.error;

  const filaLivre = [...(fila.data ?? [])];
  const lancLivre = [...(lancs.data ?? [])];
  const casa = (data: string, valor: number) => (r: { data: string; valor: unknown }) =>
    Math.abs(Math.abs(Number(r.valor)) - Math.abs(valor)) < 0.005 &&
    Math.abs(diffDias(String(r.data), data)) <= 1;

  const atualizacoes: PromiseLike<unknown>[] = [];
  for (const t of compras) {
    const s = classificarTransacao(t.memo, t.valor, opcoes);
    if (s.meio !== "debito" || s.descricao === DEBITO_SEM_NOME) continue;

    const iFila = filaLivre.findIndex(casa(t.data, t.valor));
    if (iFila >= 0) {
      const alvo = filaLivre.splice(iFila, 1)[0]!;
      usados.add(t.fitid);
      atualizacoes.push(
        supabase
          .from("transacoes_importadas")
          .update({
            memo: t.memo,
            sugestao_descricao: s.descricao,
            sugestao_categoria: alvo.sugestao_categoria ?? s.categoria,
          })
          .eq("id", alvo.id),
      );
      continue;
    }
    const iLanc = lancLivre.findIndex(casa(t.data, t.valor));
    if (iLanc >= 0) {
      const alvo = lancLivre.splice(iLanc, 1)[0]!;
      usados.add(t.fitid);
      atualizacoes.push(
        supabase
          .from("lancamentos")
          .update({ descricao: s.descricao, tag: alvo.tag ?? s.categoria })
          .eq("id", alvo.id),
      );
    }
  }
  await Promise.all(atualizacoes);
  return { usados, preenchidos: usados.size };
}

/** Pede ao servidor para buscar as transações novas do banco (Pluggy). */
export async function sincronizarOpenFinance(): Promise<ResultadoSincronizacao> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
  const res = await fetch("/api/open-finance", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const corpo = await res.json();
  if (!res.ok) throw new Error(corpo.erro ?? "Falha ao sincronizar com o banco.");
  return corpo as ResultadoSincronizacao;
}

export type ResultadoSincronizacao = {
  contas: { nome: string; novas: number; duplicadas: number }[];
  /** Última vez que o banco mandou dados novos para o Meu Pluggy. */
  bancoAtualizadoEm: string | null;
  proximaAtualizacao: string | null;
};

/** Diz se a sincronização automática está disponível para o usuário logado. */
export async function statusOpenFinance(): Promise<{ disponivel: boolean }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { disponivel: false };
  const res = await fetch("/api/open-finance", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { disponivel: false };
  return (await res.json()) as { disponivel: boolean };
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

  // Compras de conta de cartão aparecem no app como "Cartão <nome>", igual ao lançamento manual.
  const contaIds = [...new Set(itens.map((it) => it.transacao.conta_id))];
  const { data: contasDb, error: errContas } = await supabase
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
      c.tipo === "cartao_credito"
        ? labelContaCartaoPersistido(nomeCartao ?? c.nome)
        : CONTA_CORRENTE_LABEL,
    );
  }

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
    conta_cartao: rotuloPorConta.get(it.transacao.conta_id) ?? CONTA_CORRENTE_LABEL,
    meio_pagamento: it.transacao.sugestao_meio
      ? (MEIO_PARA_COLUNA[it.transacao.sugestao_meio] ?? null)
      : null,
    conta_id: it.transacao.conta_id,
    origem: "importacao",
  }));

  // Pagamento de uma conta fixa (ex.: aluguel via Pix) já fica ligado a ela.
  const recorrencias = await listarRecorrenciasAtivas().catch(() => []);
  const comRecorrencia = lancamentos.map((l) => ({
    ...l,
    recorrencia_id:
      recorrencias.find((r) => lancamentoCombina(r, { descricao: l.descricao, tipo: l.tipo, valor: l.valor }))
        ?.id ?? null,
  }));

  const { error } = await supabase.from("lancamentos").insert(comRecorrencia);
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

/** Ignora de uma vez tudo o que está pendente com data anterior a `data` (yyyy-mm-dd). */
export async function ignorarPendentesAntesDe(data: string): Promise<number> {
  const { data: ignoradas, error } = await supabase
    .from("transacoes_importadas")
    .update({ status: "ignorada" })
    .eq("status", "pendente")
    .lt("data", data)
    .select("id");
  if (error) throw error;
  return ignoradas?.length ?? 0;
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
