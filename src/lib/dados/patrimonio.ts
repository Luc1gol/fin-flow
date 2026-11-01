import { supabase } from "@/lib/supabase";

export type TipoConta = "corrente" | "poupanca" | "carteira" | "investimento" | "cartao_credito";

export type ContaPatrimonio = {
  id: string;
  nome: string;
  tipo: TipoConta;
  /** id da instituição em src/data/bancos.ts (ou null). */
  banco: string | null;
  /** Saldo informado pelo banco. No cartão de crédito é o valor devido (positivo). */
  saldo: number;
  saldoEm: string | null;
};

export type InvestimentoPatrimonio = {
  id: string;
  nome: string;
  tipo: string | null;
  subtipo: string | null;
  instituicao: string | null;
  saldo: number;
  taxa: string | null;
  atualizadoEm: string | null;
};

export type PontoPatrimonio = {
  /** yyyy-mm-dd */
  data: string;
  contas: number;
  investimentos: number;
  cartoes: number;
  liquido: number;
};

export type Patrimonio = {
  /** Valores de agora (tabelas ao vivo). */
  emConta: number;
  investido: number;
  cartoes: number;
  liquido: number;
  contas: ContaPatrimonio[];
  cartoesLista: ContaPatrimonio[];
  investimentos: InvestimentoPatrimonio[];
  /** Fotos diárias, da mais antiga para a mais recente. */
  historico: PontoPatrimonio[];
  /** Variação do líquido atual contra a foto de ~30 dias atrás (null se não houver). */
  variacao30: { valor: number; percentual: number | null; desde: string } | null;
  /** Atualização mais recente informada pelo banco. */
  atualizadoEm: string | null;
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Foto mais recente com data <= `limite` (yyyy-mm-dd). */
function pontoAte(historico: PontoPatrimonio[], limite: string): PontoPatrimonio | null {
  let achado: PontoPatrimonio | null = null;
  for (const p of historico) {
    if (p.data <= limite) achado = p;
    else break;
  }
  return achado;
}

/** Contas, investimentos e histórico diário do patrimônio. */
export async function carregarPatrimonio(): Promise<Patrimonio> {
  const [contasRes, invRes, histRes] = await Promise.all([
    supabase
      .from("contas")
      .select("id, nome, tipo, banco, saldo_banco, saldo_banco_em")
      .eq("arquivada", false),
    supabase
      .from("investimentos")
      .select("id, nome, tipo, subtipo, instituicao, saldo, taxa, atualizado_em")
      .order("saldo", { ascending: false }),
    supabase
      .from("patrimonio_diario")
      .select("data, contas, investimentos, cartoes")
      .order("data", { ascending: true }),
  ]);
  if (contasRes.error) throw contasRes.error;
  if (invRes.error) throw invRes.error;
  if (histRes.error) throw histRes.error;

  const todas: ContaPatrimonio[] = (contasRes.data ?? [])
    // Só entram contas com saldo informado pelo banco.
    .filter((c) => c.saldo_banco != null)
    .map((c) => ({
      id: String(c.id),
      nome: String(c.nome ?? "Conta"),
      tipo: c.tipo as TipoConta,
      banco: (c.banco as string | null) ?? null,
      saldo: numero(c.saldo_banco),
      saldoEm: (c.saldo_banco_em as string | null) ?? null,
    }));

  const contas = todas
    .filter((c) => c.tipo !== "cartao_credito")
    .sort((a, b) => b.saldo - a.saldo);
  const cartoesLista = todas
    .filter((c) => c.tipo === "cartao_credito")
    .sort((a, b) => b.saldo - a.saldo);

  const investimentos: InvestimentoPatrimonio[] = (invRes.data ?? []).map((i) => ({
    id: String(i.id),
    nome: String(i.nome ?? "Investimento"),
    tipo: (i.tipo as string | null) ?? null,
    subtipo: (i.subtipo as string | null) ?? null,
    instituicao: (i.instituicao as string | null) ?? null,
    saldo: numero(i.saldo),
    taxa: (i.taxa as string | null) ?? null,
    atualizadoEm: (i.atualizado_em as string | null) ?? null,
  }));

  const emConta = round2(contas.reduce((s, c) => s + c.saldo, 0));
  const cartoes = round2(cartoesLista.reduce((s, c) => s + c.saldo, 0));
  const investido = round2(investimentos.reduce((s, i) => s + i.saldo, 0));
  const liquido = round2(emConta + investido - cartoes);

  const historico: PontoPatrimonio[] = (histRes.data ?? []).map((h) => {
    const c = numero(h.contas);
    const inv = numero(h.investimentos);
    const cart = numero(h.cartoes);
    return {
      data: String(h.data).slice(0, 10),
      contas: c,
      investimentos: inv,
      cartoes: cart,
      liquido: round2(c + inv - cart),
    };
  });

  // Variação contra a foto de 30 dias atrás (ou a mais recente antes disso).
  const ref = new Date();
  ref.setDate(ref.getDate() - 30);
  const base = pontoAte(historico, isoDia(ref));
  const variacao30 = base
    ? {
        valor: round2(liquido - base.liquido),
        percentual: base.liquido !== 0 ? (liquido - base.liquido) / Math.abs(base.liquido) : null,
        desde: base.data,
      }
    : null;

  const datas = [
    ...todas.map((c) => c.saldoEm),
    ...investimentos.map((i) => i.atualizadoEm),
  ].filter((d): d is string => !!d);
  const atualizadoEm = datas.length ? datas.sort().at(-1)! : null;

  return {
    emConta,
    investido,
    cartoes,
    liquido,
    contas,
    cartoesLista,
    investimentos,
    historico,
    variacao30,
    atualizadoEm,
  };
}

export type PeriodoPatrimonio = "30d" | "6m" | "1a" | "tudo";

/** Recorta o histórico para o período escolhido. */
export function filtrarHistorico(historico: PontoPatrimonio[], periodo: PeriodoPatrimonio): PontoPatrimonio[] {
  if (periodo === "tudo") return historico;
  const d = new Date();
  if (periodo === "30d") d.setDate(d.getDate() - 30);
  else if (periodo === "6m") d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  const desde = isoDia(d);
  return historico.filter((p) => p.data >= desde);
}

const ROTULO_TIPO: Record<string, string> = {
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundos",
  SECURITY: "Previdência",
  EQUITY: "Ações",
  COE: "COE",
  ETF: "ETF",
};

/** Nome amigável do tipo de investimento (Pluggy). */
export function rotuloTipoInvestimento(tipo: string | null): string {
  if (!tipo) return "Outros";
  return ROTULO_TIPO[tipo] ?? "Outros";
}

const ROTULO_CONTA: Record<TipoConta, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  carteira: "Carteira",
  investimento: "Conta investimento",
  cartao_credito: "Cartão de crédito",
};

export function rotuloTipoConta(tipo: TipoConta): string {
  return ROTULO_CONTA[tipo] ?? "Conta";
}
