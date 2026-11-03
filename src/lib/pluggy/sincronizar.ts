import type { SupabaseClient } from "@supabase/supabase-js";
import { BANCOS } from "@/data/bancos";
import { normalizarTexto, type RegraUsuario } from "@/lib/importacao/classificar";
import { enfileirarTransacoes, parearTransferencias, PREFIXO_ATALHO } from "@/lib/importacao/fila";
import {
  autenticar,
  listarContasDoItem,
  listarFaturas,
  listarInvestimentos,
  listarTransacoes,
  obterItem,
  pluggyItemIds,
  type PluggyConta,
  type PluggyItem,
  type PluggyTransacao,
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
  saldo_banco: number | string | null;
  sem_detalhe: number | string | null;
  sem_detalhe_desde: string | null;
};

/** Situação de um banco conectado (um item do Meu Pluggy), para mostrar um card por banco. */
export type BancoConectado = {
  itemId: string;
  /** Id em `src/data/bancos.ts` (para o logo). */
  banco: string | null;
  nome: string;
  status: "ok" | "atrasado" | "atualizando" | "erro";
  /** Última vez que o banco mandou dados ao Meu Pluggy. */
  ultima: string | null;
  proxima: string | null;
  /** Ids da Pluggy das contas deste banco (ligam às contas do app). */
  contasPluggy: string[];
  /** Só depois de uma busca. */
  novas?: number;
  automaticas?: number;
  erro?: string;
};

export type ResultadoSincronizacao = {
  contas: { nome: string; novas: number; duplicadas: number; automaticas: number }[];
  bancos: BancoConectado[];
};

/** Mais que isso sem o banco mandar dados é sinal de que a atualização diária falhou. */
const HORAS_ATE_ATRASO = 30;

function situacaoDoItem(item: PluggyItem | null, contas: PluggyConta[], itemId: string): BancoConectado {
  // No Meu Pluggy o conector se chama "MeuPluggy"; o banco de verdade está no nome das contas.
  const banco = [item?.connector?.name, ...contas.flatMap((c) => [c.marketingName, c.name])]
    .map((n) => (n ? bancoPorNome(n) : null))
    .find(Boolean) ?? null;
  const nome = banco
    ? (BANCOS.find((b) => b.id === banco)?.nome ?? banco)
    : contas[0]?.marketingName || contas[0]?.name || item?.connector?.name || "Banco";
  const ultima = item?.lastUpdatedAt ?? null;
  let status: BancoConectado["status"] = "ok";
  if (!item) status = "erro";
  else if (item.status === "UPDATING") status = "atualizando";
  else if (["LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT"].includes(item.status)) status = "erro";
  else if (!ultima || Date.now() - Date.parse(ultima) > HORAS_ATE_ATRASO * 3_600_000) status = "atrasado";
  return {
    itemId,
    banco,
    nome,
    status,
    ultima,
    proxima: item?.nextAutoSyncAt ?? null,
    contasPluggy: contas.map((c) => c.id),
    ...(status === "erro" ? { erro: "O banco não respondeu na última atualização." } : {}),
  };
}

/** Só consulta a situação de cada banco (sem buscar transações): usado ao abrir Revisar. */
export async function situacaoDosBancos(): Promise<BancoConectado[]> {
  const apiKey = await autenticar();
  return Promise.all(
    pluggyItemIds().map(async (itemId) => {
      const [item, contas] = await Promise.all([
        obterItem(apiKey, itemId).catch(() => null),
        listarContasDoItem(apiKey, itemId).catch(() => [] as PluggyConta[]),
      ]);
      return situacaoDoItem(item, contas, itemId);
    }),
  );
}

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

/**
 * Busca a partir da última sincronização (menos uma folga). Se o banco ficou dias sem mandar
 * dados, a busca volta até o último envio dele, para não pular o que chegar atrasado.
 */
function dataInicial(conta: ContaApp, bancoAtualizadoEm: string | null): string {
  const base = [conta.ultima_sincronizacao, bancoAtualizadoEm]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const d = conta.ultima_sincronizacao && base ? new Date(base) : new Date();
  d.setDate(d.getDate() - (conta.ultima_sincronizacao ? DIAS_SOBREPOSICAO : DIAS_HISTORICO_INICIAL));
  const calculada = d.toISOString().slice(0, 10);
  // A partir de quando o usuário passou a usar o app (ex.: 2026-11-01): nada antes disso entra.
  const inicioUso = process.env.FINFLOW_DATA_INICIO?.trim();
  return inicioUso && /^\d{4}-\d{2}-\d{2}$/.test(inicioUso) && inicioUso > calculada ? inicioUso : calculada;
}

/** Depois disso sem o banco detalhar, a diferença é descartada (evita acumular erro). */
const DIAS_MAXIMOS_SEM_DETALHE = 4;

/**
 * O banco atualiza o saldo na hora, mas só manda as transações do dia anterior perto do
 * meio-dia. A variação do saldo que as transações novas não explicam vira "sem detalhe"
 * (negativo = saiu dinheiro) e aparece em Revisar; some quando o banco detalha.
 * Cartão de crédito fica de fora: parcelas mexem no limite sem casar com as transações.
 */
function semDetalheAtualizado(
  conta: ContaApp,
  saldoAgora: number,
  somaNovas: number,
): { sem_detalhe: number; sem_detalhe_desde: string | null } {
  if (conta.saldo_banco == null) return { sem_detalhe: 0, sem_detalhe_desde: null };
  const anterior = Number(conta.sem_detalhe) || 0;
  const valor = Math.round((anterior + saldoAgora - Number(conta.saldo_banco) - somaNovas) * 100) / 100;
  const desde = conta.sem_detalhe_desde ? Date.parse(conta.sem_detalhe_desde) : Date.now();
  if (Math.abs(valor) < 0.01 || Date.now() - desde > DIAS_MAXIMOS_SEM_DETALHE * 86_400_000) {
    return { sem_detalhe: 0, sem_detalhe_desde: null };
  }
  return { sem_detalhe: valor, sem_detalhe_desde: conta.sem_detalhe_desde ?? new Date().toISOString() };
}

/** Compras do Apple Pay que chegaram na conta desde a última sincronização (com sinal). */
async function somaDoAtalhoDesde(db: SupabaseClient, contaId: string, desde: string | null): Promise<number> {
  if (!desde) return 0;
  const { data } = await db
    .from("transacoes_importadas")
    .select("valor")
    .eq("conta_id", contaId)
    .like("id_externo", `${PREFIXO_ATALHO}%`)
    .gt("created_at", desde);
  return (data ?? []).reduce((a, r) => a + Number(r.valor), 0);
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
  const campos =
    "id, nome, tipo, numero_conta, pluggy_account_id, ultima_sincronizacao, saldo_banco, sem_detalhe, sem_detalhe_desde";
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

export async function carregarRegras(db: SupabaseClient, userId: string): Promise<Map<string, RegraUsuario>> {
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

/** Devolve os ids que o banco mandou (null se a consulta falhou). */
async function salvarInvestimentos(
  db: SupabaseClient,
  userId: string,
  apiKey: string,
  itemId: string,
): Promise<string[] | null> {
  const lista = await listarInvestimentos(apiKey, itemId).catch((e) => {
    console.error("[open-finance] investimentos", e);
    return null;
  });
  if (!lista) return null;
  if (lista.length === 0) return [];
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
  return lista.map((i) => i.id);
}

/**
 * Investimento resgatado costuma simplesmente sumir da lista do banco. Se nenhum banco
 * o devolveu mais, o saldo vai a zero (senão o dinheiro conta duas vezes: na conta e investido).
 */
async function zerarInvestimentosSumidos(db: SupabaseClient, userId: string, idsAtuais: string[]): Promise<void> {
  const { data } = await db.from("investimentos").select("id, pluggy_investment_id").eq("user_id", userId).gt("saldo", 0);
  const atuais = new Set(idsAtuais);
  const sumidos = (data ?? []).filter((i) => i.pluggy_investment_id && !atuais.has(i.pluggy_investment_id as string));
  if (sumidos.length === 0) return;
  const { error } = await db
    .from("investimentos")
    .update({ saldo: 0, atualizado_em: new Date().toISOString() })
    .in(
      "id",
      sumidos.map((i) => i.id),
    );
  if (error) console.error("[open-finance] zerar investimentos", error);
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

/**
 * Transações que entram na fila. Na conta corrente, PENDING com data futura são
 * agendamentos (ficam de fora); com data de hoje ou antes, já saíram do saldo e entram
 * logo — o banco às vezes leva um dia para marcá-las como definitivas. No cartão,
 * PENDING são as compras da fatura aberta.
 */
function transacoesParaFila(lista: PluggyTransacao[], contaPluggy: PluggyConta) {
  const hoje = hojeBrasilia();
  const normalizadas = lista.map((t) => ({ pendente: t.status === "PENDING", ...normalizarTransacao(t, contaPluggy) }));
  if (contaPluggy.type === "CREDIT") return normalizadas;
  const definitivas = normalizadas.filter((t) => !t.pendente);
  return normalizadas.filter(
    (t) =>
      !t.pendente ||
      (t.data <= hoje &&
        // Se o definitivo já veio junto, o pendente é a mesma transação.
        !definitivas.some(
          (d) => d.valor === t.valor && Math.abs(Date.parse(d.data) - Date.parse(t.data)) <= 86_400_000,
        )),
  );
}

export async function sincronizarBanco(
  db: SupabaseClient,
  userId: string,
  nomesTitular: string[],
): Promise<ResultadoSincronizacao> {
  const [apiKey, regras] = await Promise.all([autenticar(), carregarRegras(db, userId)]);

  const resultado: ResultadoSincronizacao["contas"] = [];
  const porItem = await Promise.all(
    pluggyItemIds().map(async (itemId) => {
      // Um banco fora do ar não impede os outros de atualizar.
      const [item, contas] = await Promise.all([
        obterItem(apiKey, itemId).catch(() => null),
        listarContasDoItem(apiKey, itemId).catch((e) => {
          console.error("[open-finance] contas do item", itemId, e);
          return null;
        }),
      ]);
      return { itemId, item, contas };
    }),
  );
  const idsAtuais = new Set(porItem.flatMap((i) => (i.contas ?? []).map((c) => c.id)));

  const bancos: BancoConectado[] = [];
  const idsInvestimentos: string[] = [];
  let investimentosCompletos = true;
  for (const { itemId, item, contas } of porItem) {
    const banco = situacaoDoItem(item, contas ?? [], itemId);
    bancos.push(banco);
    if (!contas) {
      banco.status = "erro";
      banco.erro = "Não foi possível falar com o banco agora.";
      continue;
    }
    banco.novas = 0;
    banco.automaticas = 0;
    try {
      for (const contaPluggy of contas) {
        const conta = await obterOuCriarConta(db, userId, contaPluggy, idsAtuais);
        const cartao = contaPluggy.type === "CREDIT";
        const transacoes = transacoesParaFila(
          await listarTransacoes(apiKey, contaPluggy.id, dataInicial(conta, item?.lastUpdatedAt ?? null)),
          contaPluggy,
        );

        const { novas, duplicadas, automaticas, somaNovas } = await enfileirarTransacoes(db, {
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
            ...(cartao
              ? {}
              : semDetalheAtualizado(
                  conta,
                  contaPluggy.balance,
                  somaNovas + (await somaDoAtalhoDesde(db, conta.id, conta.ultima_sincronizacao)),
                )),
          })
          .eq("id", conta.id);

        if (cartao) await salvarDadosCartao(db, userId, apiKey, conta.id, contaPluggy);
        resultado.push({ nome: conta.nome, novas, duplicadas, automaticas });
        banco.novas += novas;
        banco.automaticas += automaticas;
      }
      const investimentos = await salvarInvestimentos(db, userId, apiKey, itemId);
      if (investimentos) idsInvestimentos.push(...investimentos);
      else investimentosCompletos = false;
    } catch (e) {
      console.error("[open-finance] banco", itemId, e);
      banco.status = "erro";
      banco.erro = "Falhou ao trazer os dados deste banco. Tente de novo em instantes.";
      investimentosCompletos = false;
    }
  }
  // Só com a lista completa de todos os bancos dá para saber o que foi resgatado.
  if (investimentosCompletos && bancos.every((b) => b.status !== "erro")) {
    await zerarInvestimentosSumidos(db, userId, idsInvestimentos).catch((e) =>
      console.error("[open-finance] zerar investimentos", e),
    );
  }
  // Com todas as contas em dia, junta os dois lados das transferências entre elas.
  await parearTransferencias(db, userId).catch((e) => console.error("[open-finance] pareamento", e));
  await registrarPatrimonio(db, userId);

  if (bancos.length > 0 && bancos.every((b) => b.status === "erro" && b.novas == null)) {
    throw new Error("Nenhum banco respondeu.");
  }
  return { contas: resultado, bancos };
}
