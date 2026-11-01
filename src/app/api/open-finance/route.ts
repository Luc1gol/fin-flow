import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { BANCOS } from "@/data/bancos";
import { normalizarTexto, type RegraUsuario } from "@/lib/importacao/classificar";
import { enfileirarTransacoes } from "@/lib/importacao/fila";
import {
  autenticar,
  listarContasDoItem,
  listarTransacoes,
  obterItem,
  pluggyConfigurado,
  pluggyItemIds,
  type PluggyConta,
} from "@/lib/pluggy/cliente";
import { normalizarTransacao } from "@/lib/pluggy/mapear";

export const maxDuration = 60;

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

/**
 * Autentica pelo token do Supabase enviado pelo app e devolve um cliente que age
 * como o usuário (RLS aplicada). Só o dono configurado em FINFLOW_EMAIL_DONO pode
 * usar a conexão, já que as credenciais da Pluggy são de uma pessoa só.
 */
async function autenticarRequisicao(
  request: Request,
): Promise<{ db: SupabaseClient; user: User; permitido: boolean } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ erro: "Não autenticado." }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }
  const dono = process.env.FINFLOW_EMAIL_DONO?.trim().toLowerCase();
  const permitido = Boolean(dono) && data.user.email?.toLowerCase() === dono;
  return { db, user: data.user, permitido };
}

export async function GET(request: Request) {
  const auth = await autenticarRequisicao(request);
  if (auth instanceof Response) return auth;
  return Response.json({ disponivel: pluggyConfigurado() && auth.permitido });
}

export async function POST(request: Request) {
  const auth = await autenticarRequisicao(request);
  if (auth instanceof Response) return auth;
  if (!pluggyConfigurado()) {
    return Response.json({ erro: "Conexão com o banco não configurada." }, { status: 503 });
  }
  if (!auth.permitido) {
    return Response.json({ erro: "Conexão disponível só para o dono do app." }, { status: 403 });
  }

  try {
    const { db, user } = auth;
    const [apiKey, nomesTitular, regras] = await Promise.all([
      autenticar(),
      carregarNomesTitular(db, user),
      carregarRegras(db),
    ]);

    const resultado: { nome: string; novas: number; duplicadas: number }[] = [];
    const atualizacoes: { ultima: string | null; proxima: string | null }[] = [];
    const porItem = await Promise.all(
      pluggyItemIds().map(async (itemId) => ({
        // Informativo: se falhar, a sincronização segue normalmente.
        item: await obterItem(apiKey, itemId).catch(() => null),
        contas: await listarContasDoItem(apiKey, itemId),
      })),
    );
    const idsAtuais = new Set(porItem.flatMap((i) => i.contas.map((c) => c.id)));
    for (const { item, contas } of porItem) {
      if (item) atualizacoes.push({ ultima: item.lastUpdatedAt, proxima: item.nextAutoSyncAt });
      for (const contaPluggy of contas) {
        const conta = await obterOuCriarConta(db, contaPluggy, idsAtuais);
        const cartao = contaPluggy.type === "CREDIT";
        const transacoes = (
          await listarTransacoes(apiKey, contaPluggy.id, dataInicial(conta))
        )
          // Na conta corrente, PENDING são agendamentos futuros; no cartão, compras da fatura aberta.
          .filter((t) => cartao || t.status === "POSTED")
          .map((t) => normalizarTransacao(t, contaPluggy));

        const { novas, duplicadas } = await enfileirarTransacoes(db, {
          contaId: conta.id,
          origem: "Open Finance",
          transacoes: transacoes.map((t) => ({ ...t })),
          nomesTitular,
          regras,
          cartaoCredito: cartao,
          ignorarIguaisJaNaFila: true,
        });

        await db
          .from("contas")
          .update({
            saldo_banco: contaPluggy.balance,
            saldo_banco_em: new Date().toISOString(),
            ultima_sincronizacao: new Date().toISOString(),
          })
          .eq("id", conta.id);

        resultado.push({ nome: conta.nome, novas, duplicadas });
      }
    }
    // Data mais antiga entre os bancos: é ela que limita o que já chegou.
    const ultimas = atualizacoes.map((a) => a.ultima).filter((d): d is string => Boolean(d)).sort();
    const proximas = atualizacoes.map((a) => a.proxima).filter((d): d is string => Boolean(d)).sort();
    return Response.json({
      contas: resultado,
      bancoAtualizadoEm: ultimas[0] ?? null,
      proximaAtualizacao: proximas[0] ?? null,
    });
  } catch (e) {
    console.error("[open-finance]", e);
    return Response.json(
      { erro: "Falha ao buscar dados do banco. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}

function dataInicial(conta: ContaApp): string {
  const d = conta.ultima_sincronizacao ? new Date(conta.ultima_sincronizacao) : new Date();
  d.setDate(
    d.getDate() - (conta.ultima_sincronizacao ? DIAS_SOBREPOSICAO : DIAS_HISTORICO_INICIAL),
  );
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
 * Liga a conta da Pluggy a uma conta do app: pelo id da Pluggy, ou pelo número da
 * conta (caso ela já tenha sido criada por um OFX). Se não existir, cria.
 */
/**
 * `idsAtuais`: contas que a Pluggy devolveu nesta sincronização. Uma conta do app ligada a
 * um id que não existe mais (conexão refeita) pode ser religada à conta nova do mesmo número.
 */
async function obterOuCriarConta(
  db: SupabaseClient,
  p: PluggyConta,
  idsAtuais: ReadonlySet<string>,
): Promise<ContaApp> {
  const campos = "id, nome, tipo, numero_conta, pluggy_account_id, ultima_sincronizacao";
  const { data: contas, error } = await db.from("contas").select(campos);
  if (error) throw error;
  const lista = (contas ?? []) as ContaApp[];

  const porId = lista.find((c) => c.pluggy_account_id === p.id);
  if (porId) return porId;

  const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const numeroPluggy = digitos(p.number);
  const cartaoPluggy = p.type === "CREDIT";
  if (numeroPluggy) {
    const porNumero = lista.find(
      (c) =>
        (!c.pluggy_account_id || !idsAtuais.has(c.pluggy_account_id)) &&
        (c.tipo === "cartao_credito") === cartaoPluggy &&
        digitos(c.numero_conta) &&
        (numeroPluggy.startsWith(digitos(c.numero_conta)) ||
          digitos(c.numero_conta).startsWith(numeroPluggy)),
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
  const cartao = p.type === "CREDIT";
  const { data: criada, error: errCria } = await db
    .from("contas")
    .insert({
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

async function carregarNomesTitular(db: SupabaseClient, user: User): Promise<string[]> {
  const { data } = await db
    .from("profiles")
    .select("nome_completo")
    .eq("id", user.id)
    .maybeSingle();
  return [data?.nome_completo, user.user_metadata?.full_name, user.user_metadata?.name]
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
}

async function carregarRegras(db: SupabaseClient): Promise<Map<string, RegraUsuario>> {
  const { data, error } = await db
    .from("regras_categorizacao")
    .select("padrao, tipo, categoria, descricao");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.padrao as string, r as RegraUsuario]));
}
