import type { SupabaseClient } from "@supabase/supabase-js";
import { BANCOS } from "@/data/bancos";
import { normalizarTexto, type RegraUsuario } from "@/lib/importacao/classificar";
import { enfileirarTransacoes, parearTransferencias } from "@/lib/importacao/fila";
import {
  autenticar,
  listarContasDoItem,
  listarFaturas,
  listarInvestimentos,
  listarTransacoes,
  obterItem,
  pluggyItemIds,
  type PluggyConta,
} from "@/lib/pluggy/cliente";
import { normalizarTransacao } from "@/lib/pluggy/mapear";
import { fechamentoDaFatura } from "@/lib/cartao-datas";

/**
 * Sincronização com o banco (Pluggy). Roda no servidor, tanto quando o usuário toca em
 * "Buscar" quanto na rotina diária. Todo acesso ao banco de dados filtra/grava `userId`
 * explicitamente, porque a rotina diária não age "logada" como o usuário.
 */

/** Na primeira sincronização de uma conta, busca este tanto de histórico. */
const DIAS_HISTORICO_INICIAL = 90;
/** Nas seguintes, volta alguns dias para pegar transações que mudaram de status. */
const DIAS_SOBREPOSICAO = 7;

type ContaApp = {
  id: string;
  nome: string;
  tipo: string;
  numero_conta: string | null;
  pluggy_account_id: string | null;
  ultima_sincronizacao: string | null;
};

export type ResultadoSincronizacao = {
  contas: { nome: string; novas: number; duplicadas: number; automaticas: number }[];
  bancoAtualizadoEm: string | null;
  proximaAtualizacao: string | null;
};

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Datas de calendário do banco (vencimento, fechamento). Vêm como meia-noite UTC
 * ("2026-11-10T00:00:00Z"); converter para o fuso de Brasília voltaria um dia (09/11).
 */
function dataIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function diaDoMes(dataIsoValor: string | null): number | null {
  const dia = dataIsoValor ? Number(dataIsoValor.slice(8, 10)) : NaN;
  return dia >= 1 && dia <= 31 ? dia : null;
}

function dataInicial(conta: ContaApp): string {
  const d = conta.ultima_sincronizacao ? new Date(conta.ultima_sincronizacao) : new Date();
  d.setDate(d.getDate() - (conta.ultima_sincronizacao ? DIAS_SOBREPOSICAO : DIAS_HISTORICO_INICIAL));
  const calculada = d.toISOString().slice(0, 10);
  // A partir de quando o usuário passou a usar o app (ex.: 2026-11-01): nada antes disso entra.
  const inicioUso = process.env.FINFLOW_DATA_INICIO?.trim();
  return inicioUso && /^\d{4}-\d{2}-\d{2}$/.test(inicioUso) && inicioUso > calculada ? inicioUso : calculada;
}

function bancoPorNome(nome: string): string | null {
  const n = normalizarTexto(nome);
  const banco = BANCOS.find(
    (b) =>
      b.id !== "outros" &&
      [normalizarTexto(b.nome).replace(/^banco /, ""), b.id.replace(/-/g, " ")].some(
        (chave) => chave.length >= 2 && new RegExp(`\\b${chave}\\b`).test(n),
      ),
  );
  return banco?.id ?? null;
}

/**
 * Liga a conta da Pluggy a uma conta do app: pelo id da Pluggy ou pelo número da conta
 * (conta criada por OFX, ou conexão refeita — `idsAtuais` são as contas devolvidas agora).
 * Se não existir, cria.
 */
async function obterOuCriarConta(
  db: SupabaseClient,
  userId: string,
  p: PluggyConta,
  idsAtuais: ReadonlySet<string>,
): Promise<ContaApp> {
  const campos = "id, nome, tipo, numero_conta, pluggy_account_id, ultima_sincronizacao";
  const { data: contas, error } = await db.from("contas").select(campos).eq("user_id", userId);
  if (error) throw error;
  const lista = (contas ?? []) as ContaApp[];

  const porId = lista.find((c) => c.pluggy_account_id === p.id);
  if (porId) return porId;

  const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const numeroPluggy = digitos(p.number);
  const cartao = p.type === "CREDIT";
  if (numeroPluggy) {
    const porNumero = lista.find(
      (c) =>
        (!c.pluggy_account_id || !idsAtuais.has(c.pluggy_account_id)) &&
        (c.tipo === "cartao_credito") === cartao &&
        digitos(c.numero_conta) &&
        (numeroPluggy.startsWith(digitos(c.numero_conta)) || digitos(c.numero_conta).startsWith(numeroPluggy)),
    );
    if (porNumero) {
      const { data: ligada, error: errLiga } = await db
        .from("contas")
        .update({ pluggy_account_id: p.id })
        .eq("id", porNumero.id)
        .select(campos)
        .single();
      if (errLiga) throw errLiga;
      return ligada as ContaApp;
    }
  }

  const nomeBase = p.marketingName || p.name;
  const { data: criada, error: errCria } = await db
    .from("contas")
    .insert({
      user_id: userId,
      nome: cartao ? `${nomeBase} (cartão)` : nomeBase,
      banco: bancoPorNome(`${p.marketingName ?? ""} ${p.name}`),
      tipo: cartao ? "cartao_credito" : "corrente",
      numero_conta: p.number,
      pluggy_account_id: p.id,
    })
    .select(campos)
    .single();
  if (errCria) throw errCria;
  return criada as ContaApp;
}

export async function carregarNomesTitular(
  db: SupabaseClient,
  userId: string,
  metadata?: Record<string, unknown>,
): Promise<string[]> {
  const { data } = await db.from("profiles").select("nome_completo").eq("id", userId).maybeSingle();
  return [data?.nome_completo, metadata?.full_name, metadata?.name]
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
}

async function carregarRegras(db: SupabaseClient, userId: string): Promise<Map<string, RegraUsuario>> {
  const { data, error } = await db
    .from("regras_categorizacao")
    .select("padrao, tipo, categoria, descricao")
    .eq("user_id", userId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.padrao as string, r as RegraUsuario]));
}

/** Limite, datas e faturas do cartão. Informativo: falhas não interrompem a sincronização. */
async function salvarDadosCartao(
  db: SupabaseClient,
  userId: string,
  apiKey: string,
  contaId: string,
  p: PluggyConta,
): Promise<void> {
  const c = p.creditData;
  await db
    .from("contas")
    .update({
      limite: c?.creditLimit ?? null,
      limite_disponivel: c?.availableCreditLimit ?? null,
      fatura_fechamento: dataIso(c?.balanceCloseDate),
      fatura_vencimento: dataIso(c?.balanceDueDate),
      pagamento_minimo: c?.minimumPayment ?? null,
    })
    .eq("id", contaId);

  // Mantém os dias de fechamento e vencimento do cartão cadastrado iguais aos do banco,
  // para a projeção, os avisos e o ciclo da fatura usarem as datas reais.
  const { data: vinculo } = await db
    .from("contas")
    .select("cartao_id, cartoes(banco)")
    .eq("id", contaId)
    .maybeSingle();
  const bancoCartao = (vinculo?.cartoes as { banco?: string | null } | null)?.banco ?? null;
  const diaFechamento = diaDoMes(
    fechamentoDaFatura(dataIso(c?.balanceCloseDate), dataIso(c?.balanceDueDate), bancoCartao),
  );
  const diaVencimento = diaDoMes(dataIso(c?.balanceDueDate));
  if (diaFechamento || diaVencimento) {
    if (vinculo?.cartao_id) {
      await db
        .from("cartoes")
        .update({
          ...(diaFechamento ? { dia_fechamento: diaFechamento } : {}),
          ...(diaVencimento ? { dia_vencimento: diaVencimento } : {}),
        })
        .eq("id", vinculo.cartao_id)
        .eq("user_id", userId);
    }
  }

  const faturas = await listarFaturas(apiKey, p.id).catch((e) => {
    console.error("[open-finance] faturas", e);
    return [];
  });
  if (faturas.length === 0) return;
  const { error } = await db.from("faturas").upsert(
    faturas.map((f) => ({
      user_id: userId,
      conta_id: contaId,
      pluggy_bill_id: f.id,
      vencimento: dataIso(f.dueDate),
      valor_total: f.totalAmount,
      pagamento_minimo: f.minimumPaymentAmount ?? null,
      valor_pago: (f.payments ?? []).reduce((a, pg) => a + Math.abs(pg.amount ?? 0), 0),
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: "conta_id,pluggy_bill_id" },
  );
  if (error) console.error("[open-finance] salvar faturas", error);
}

async function salvarInvestimentos(
  db: SupabaseClient,
  userId: string,
  apiKey: string,
  itemId: string,
): Promise<void> {
  const lista = await listarInvestimentos(apiKey, itemId).catch((e) => {
    console.error("[open-finance] investimentos", e);
    return [];
  });
  if (lista.length === 0) return;
  const { error } = await db.from("investimentos").upsert(
    lista.map((i) => ({
      user_id: userId,
      pluggy_investment_id: i.id,
      nome: i.name,
      tipo: i.type ?? null,
      subtipo: i.subtype ?? null,
      instituicao: i.institution?.name ?? i.issuer ?? null,
      // Investimento resgatado/encerrado fica com saldo zero.
      saldo: i.status && i.status !== "ACTIVE" ? 0 : (i.balance ?? 0),
      taxa: i.annualRate != null ? `${i.annualRate}% a.a.${i.rateType ? ` (${i.rateType})` : ""}` : null,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: "pluggy_investment_id" },
  );
  if (error) console.error("[open-finance] salvar investimentos", error);
}

/** Foto do dia: dinheiro em conta, investido e devido no cartão. */
async function registrarPatrimonio(db: SupabaseClient, userId: string): Promise<void> {
  const [contas, invest] = await Promise.all([
    db.from("contas").select("tipo, saldo_banco").eq("user_id", userId).eq("arquivada", false),
    db.from("investimentos").select("saldo").eq("user_id", userId),
  ]);
  const soma = (rows: { saldo_banco?: unknown; saldo?: unknown }[] | null, campo: "saldo_banco" | "saldo") =>
    (rows ?? []).reduce((a, r) => a + (Number(r[campo]) || 0), 0);
  const correntes = (contas.data ?? []).filter((c) => c.tipo !== "cartao_credito" && c.saldo_banco != null);
  const cartoes = (contas.data ?? []).filter((c) => c.tipo === "cartao_credito" && c.saldo_banco != null);
  const { error } = await db.from("patrimonio_diario").upsert(
    {
      user_id: userId,
      data: hojeBrasilia(),
      contas: soma(correntes, "saldo_banco"),
      investimentos: soma(invest.data, "saldo"),
      cartoes: soma(cartoes, "saldo_banco"),
    },
    { onConflict: "user_id,data" },
  );
  if (error) console.error("[open-finance] patrimônio", error);
}

export async function sincronizarBanco(
  db: SupabaseClient,
  userId: string,
  nomesTitular: string[],
): Promise<ResultadoSincronizacao> {
  const [apiKey, regras] = await Promise.all([autenticar(), carregarRegras(db, userId)]);

  const resultado: ResultadoSincronizacao["contas"] = [];
  const atualizacoes: { ultima: string | null; proxima: string | null }[] = [];
  const porItem = await Promise.all(
    pluggyItemIds().map(async (itemId) => ({
      itemId,
      // Informativo: se falhar, a sincronização segue normalmente.
      item: await obterItem(apiKey, itemId).catch(() => null),
      contas: await listarContasDoItem(apiKey, itemId),
    })),
  );
  const idsAtuais = new Set(porItem.flatMap((i) => i.contas.map((c) => c.id)));

  for (const { itemId, item, contas } of porItem) {
    if (item) atualizacoes.push({ ultima: item.lastUpdatedAt, proxima: item.nextAutoSyncAt });
    for (const contaPluggy of contas) {
      const conta = await obterOuCriarConta(db, userId, contaPluggy, idsAtuais);
      const cartao = contaPluggy.type === "CREDIT";
      const transacoes = (await listarTransacoes(apiKey, contaPluggy.id, dataInicial(conta)))
        // Na conta corrente, PENDING são agendamentos futuros; no cartão, compras da fatura aberta.
        .filter((t) => cartao || t.status === "POSTED")
        .map((t) => normalizarTransacao(t, contaPluggy));

      const { novas, duplicadas, automaticas } = await enfileirarTransacoes(db, {
        contaId: conta.id,
        origem: "Open Finance",
        transacoes,
        nomesTitular,
        regras,
        cartaoCredito: cartao,
        ignorarIguaisJaNaFila: true,
        autoConfirmar: true,
        userId,
      });

      await db
        .from("contas")
        .update({
          saldo_banco: contaPluggy.balance,
          saldo_banco_em: new Date().toISOString(),
          ultima_sincronizacao: new Date().toISOString(),
        })
        .eq("id", conta.id);

      if (cartao) await salvarDadosCartao(db, userId, apiKey, conta.id, contaPluggy);
      resultado.push({ nome: conta.nome, novas, duplicadas, automaticas });
    }
    await salvarInvestimentos(db, userId, apiKey, itemId);
  }
  // Com todas as contas em dia, junta os dois lados das transferências entre elas.
  await parearTransferencias(db, userId).catch((e) => console.error("[open-finance] pareamento", e));
  await registrarPatrimonio(db, userId);

  // Data mais antiga entre os bancos: é ela que limita o que já chegou.
  const ultimas = atualizacoes.map((a) => a.ultima).filter((d): d is string => Boolean(d)).sort();
  const proximas = atualizacoes.map((a) => a.proxima).filter((d): d is string => Boolean(d)).sort();
  return { contas: resultado, bancoAtualizadoEm: ultimas[0] ?? null, proximaAtualizacao: proximas[0] ?? null };
}
