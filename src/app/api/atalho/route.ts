import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/importacao/classificar";
import { enfileirarTransacoes, PREFIXO_ATALHO } from "@/lib/importacao/fila";
import { carregarNomesTitular, carregarRegras } from "@/lib/pluggy/sincronizar";

/**
 * Recebe na hora o pagamento feito com Apple Pay, enviado pela automação "Transação" do
 * app Atalhos do iPhone, e coloca em Revisar. Quando o banco mandar a mesma compra
 * (dia seguinte), ela é reconhecida pelo valor e não entra de novo.
 *
 * Chamada: POST com `Authorization: Bearer <chave do atalho>` (gerada em Perfil) e corpo
 * JSON `{ "valor": "R$ 33,30", "loja": "Padaria X", "cartao": "C6 Carbon" }`.
 */

type ContaDoUsuario = { id: string; nome: string; banco: string | null; tipo: string };

/** Aceita "R$ 1.234,56", "1234,56", "1,234.56", "33.3" ou número. */
function lerValor(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? Math.abs(bruto) : null;
  const t = String(bruto ?? "").replace(/[^\d.,]/g, "");
  if (!t) return null;
  const decimal = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  const temCentavos = decimal >= 0 && t.length - decimal - 1 <= 2;
  const inteiro = (temCentavos ? t.slice(0, decimal) : t).replace(/[.,]/g, "");
  const n = Number(temCentavos ? `${inteiro}.${t.slice(decimal + 1)}` : inteiro);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Cartão do Wallet → conta do app. Débito (pelo nome do cartão) vai para a conta corrente;
 * o resto vai para o cartão de crédito do banco. Na dúvida, o cartão de crédito.
 */
function escolherConta(contas: ContaDoUsuario[], nomeCartao: string): ContaDoUsuario | null {
  const n = normalizarTexto(nomeCartao);
  const debito = /\b(debito|debit)\b/.test(n);
  const doBanco = contas.filter((c) => {
    const banco = normalizarTexto(c.banco ?? c.nome);
    return banco.length >= 2 && n.includes(banco);
  });
  const tipoQuerido = (c: ContaDoUsuario) => (c.tipo === "cartao_credito") !== debito;
  return (
    doBanco.find(tipoQuerido) ??
    contas.find(tipoQuerido) ??
    doBanco[0] ??
    contas[0] ??
    null
  );
}

export async function POST(request: Request) {
  const chave = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return Response.json({ erro: "Chave do atalho ausente." }, { status: 401 });
  if (!chaveServico) return Response.json({ erro: "Atalho não configurado." }, { status: 503 });

  // Cliente de serviço: ignora RLS, por isso todo acesso filtra pelo id do dono da chave.
  const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hash = createHash("sha256").update(chave).digest("hex");
  const { data: perfil } = await db.from("profiles").select("id").eq("atalho_chave_hash", hash).maybeSingle();
  if (!perfil) return Response.json({ erro: "Chave do atalho inválida." }, { status: 401 });
  const userId = perfil.id as string;

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const valor = lerValor(corpo?.valor);
  const loja = String(corpo?.loja ?? "").trim().slice(0, 120);
  const cartao = String(corpo?.cartao ?? "").trim();
  if (valor == null) return Response.json({ erro: "Valor inválido." }, { status: 400 });

  const { data: contas, error } = await db
    .from("contas")
    .select("id, nome, banco, tipo")
    .eq("user_id", userId)
    .eq("arquivada", false)
    .order("created_at");
  if (error) {
    console.error("[atalho] contas", error);
    return Response.json({ erro: "Falha ao localizar a conta." }, { status: 500 });
  }
  const conta = escolherConta((contas ?? []) as ContaDoUsuario[], cartao);
  if (!conta) return Response.json({ erro: "Nenhuma conta cadastrada." }, { status: 404 });

  try {
    const cartaoCredito = conta.tipo === "cartao_credito";
    const [nomesTitular, regras] = await Promise.all([
      carregarNomesTitular(db, userId),
      carregarRegras(db, userId),
    ]);
    const { novas } = await enfileirarTransacoes(db, {
      contaId: conta.id,
      origem: "Apple Pay",
      transacoes: [
        { idExterno: `${PREFIXO_ATALHO}${randomUUID()}`, data: hojeBrasilia(), valor: -valor, memo: loja || "Compra Apple Pay" },
      ],
      nomesTitular,
      regras,
      cartaoCredito,
      userId,
      // Se o banco já mandou essa compra, não entra de novo.
      ignorarIguaisJaNaFila: true,
      autoConfirmar: true,
    });
    const valorTexto = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return Response.json({
      ok: true,
      mensagem:
        novas > 0
          ? `${valorTexto}${loja ? ` em ${loja}` : ""} foi para Revisar (${conta.nome}).`
          : `${valorTexto} já estava no FinFlow.`,
    });
  } catch (e) {
    console.error("[atalho]", e);
    return Response.json({ erro: "Falha ao registrar a compra." }, { status: 500 });
  }
}
