import { supabase } from "@/lib/supabase";
import { fechamentoDaFatura } from "@/lib/cartao-datas";

/** Cartão cadastrado manualmente pelo usuário (tabela `cartoes`). */
export type CartaoManual = {
  id: string;
  /** Id da instituição em `BANCOS` (ex.: nubank, c6). */
  banco: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  limite: number;
};

/** Conta de cartão de crédito sincronizada pelo banco (tabela `contas`, tipo `cartao_credito`). */
export type ContaCartaoBanco = {
  id: string;
  nome: string;
  banco: string | null;
  numeroConta: string | null;
  cartaoId: string | null;
  /** Total devido hoje no cartão (fatura atual segundo o banco). */
  saldo: number | null;
  saldoEm: string | null;
  limite: number | null;
  limiteDisponivel: number | null;
  faturaFechamento: string | null;
  /** Vencimento informado pelo banco — pode estar no passado (desatualizado). */
  faturaVencimento: string | null;
  pagamentoMinimo: number | null;
  ultimaSincronizacao: string | null;
  /** Pagamento da fatura que vencia em `vencimentoPago` (o vencimento acima já é o seguinte). */
  pagamento?: { valor: number; data: string; vencimentoPago: string } | null;
};

/** Fatura vinda do banco (tabela `faturas`). */
export type FaturaBanco = {
  id: string;
  contaId: string;
  vencimento: string;
  valorTotal: number;
  pagamentoMinimo: number | null;
  valorPago: number;
};

export type CartaoComBanco = CartaoManual & {
  /** Conta do banco vinculada (null = sem vínculo, usa estimativa pelos lançamentos). */
  conta: ContaCartaoBanco | null;
  /** Faturas do banco, mais recentes primeiro (até 12). */
  faturas: FaturaBanco[];
  /** Próximo vencimento (yyyy-mm-dd), preferindo o dado do banco. */
  proximoVencimento: string | null;
};

export type CartoesComBanco = {
  cartoes: CartaoComBanco[];
  /** Todas as contas de cartão de crédito do usuário (para o seletor de vínculo). */
  contasCredito: ContaCartaoBanco[];
  /** Faturas por conta (mais recentes primeiro, até 12 por conta). */
  faturasPorConta: Record<string, FaturaBanco[]>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: unknown): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function textoOuNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Data no mês com o dia limitado ao último dia (ex.: 31 em fevereiro → 28/29). */
function diaNoMes(ano: number, mes0: number, dia: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(Math.max(1, dia), ultimo));
}

export function mapCartaoManual(row: Record<string, unknown>): CartaoManual {
  return {
    id: String(row.id),
    banco: String(row.banco ?? "").trim() || "outros",
    nome: String(row.nome ?? "").trim(),
    diaFechamento: inteiro(row.dia_fechamento),
    diaVencimento: inteiro(row.dia_vencimento),
    limite: numero(row.limite),
  };
}

function mapConta(row: Record<string, unknown>): ContaCartaoBanco {
  return {
    id: String(row.id),
    nome: String(row.nome ?? "").trim(),
    banco: textoOuNull(row.banco),
    numeroConta: textoOuNull(row.numero_conta),
    cartaoId: textoOuNull(row.cartao_id),
    saldo: numeroOuNull(row.saldo_banco),
    saldoEm: textoOuNull(row.saldo_banco_em),
    limite: numeroOuNull(row.limite),
    limiteDisponivel: numeroOuNull(row.limite_disponivel),
    faturaFechamento: textoOuNull(row.fatura_fechamento)?.slice(0, 10) ?? null,
    faturaVencimento: textoOuNull(row.fatura_vencimento)?.slice(0, 10) ?? null,
    pagamentoMinimo: numeroOuNull(row.pagamento_minimo),
    ultimaSincronizacao: textoOuNull(row.ultima_sincronizacao),
  };
}

function mapFatura(row: Record<string, unknown>): FaturaBanco {
  return {
    id: String(row.id),
    contaId: String(row.conta_id),
    vencimento: String(row.vencimento ?? "").slice(0, 10),
    valorTotal: numero(row.valor_total),
    pagamentoMinimo: numeroOuNull(row.pagamento_minimo),
    valorPago: numero(row.valor_pago),
  };
}

/* ------------------------------------------------------------------ */
/* Regras puras                                                        */
/* ------------------------------------------------------------------ */

/**
 * Próximo vencimento da fatura (yyyy-mm-dd).
 * - Com o vencimento do banco: usa-o se for hoje ou depois; se já passou (banco ainda não
 *   virou a fatura), avança mês a mês mantendo o dia (ex.: 2026-10-09 → 2026-11-09).
 * - Sem dado do banco: usa o dia de vencimento manual (este mês, ou o próximo se já passou).
 */
export function proximoVencimento(
  faturaVencimento: string | null,
  diaVencimentoManual: number | null,
  hoje = new Date(),
): string | null {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const m = faturaVencimento ? /^(\d{4})-(\d{2})-(\d{2})/.exec(faturaVencimento) : null;
  if (m) {
    const ano = Number(m[1]);
    const mes0 = Number(m[2]) - 1;
    const dia = Number(m[3]);
    let d = diaNoMes(ano, mes0, dia);
    for (let i = 1; d < base && i <= 240; i++) d = diaNoMes(ano, mes0 + i, dia);
    return iso(d);
  }
  if (diaVencimentoManual && diaVencimentoManual >= 1 && diaVencimentoManual <= 31) {
    let d = diaNoMes(base.getFullYear(), base.getMonth(), diaVencimentoManual);
    if (d < base) d = diaNoMes(base.getFullYear(), base.getMonth() + 1, diaVencimentoManual);
    return iso(d);
  }
  return null;
}

/** Pagamento de fatura que chegou do banco na conta do cartão (entrada positiva). */
export type PagamentoCartao = { contaId: string; data: string; valor: number };

/** Pagamentos de fatura dos últimos 60 dias nas contas de cartão indicadas. */
export async function carregarPagamentosFatura(contaIds: string[]): Promise<PagamentoCartao[]> {
  if (contaIds.length === 0) return [];
  const desde = new Date();
  desde.setDate(desde.getDate() - 60);
  const { data, error } = await supabase
    .from("transacoes_importadas")
    .select("conta_id, data, valor")
    .in("conta_id", contaIds)
    .gt("valor", 0)
    .ilike("memo", "pagamento de fatura%")
    .gte("data", iso(desde));
  if (error) {
    console.error("[cartoes-banco] pagamentos:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    contaId: String(r.conta_id),
    data: String(r.data).slice(0, 10),
    valor: numero(r.valor),
  }));
}

/**
 * Alguns bancos (ex.: C6) não avisam pelo Open Finance que a fatura foi paga: o vencimento
 * continua o mesmo até passar. Se houve pagamento entre o fechamento e o vencimento dessa
 * fatura, ela está paga e o que vale é o vencimento seguinte.
 */
export function pagamentoDoVencimento(
  conta: { id: string; banco: string | null; faturaFechamento: string | null; faturaVencimento: string | null },
  pagamentos: PagamentoCartao[],
  hoje = new Date(),
): { valor: number; data: string; vencimentoPago: string; proximoVencimento: string } | null {
  const venc = proximoVencimento(conta.faturaVencimento, null, hoje);
  if (!venc) return null;
  const [a, m, d] = venc.split("-").map(Number) as [number, number, number];
  const umMesAntes = iso(diaNoMes(a, m - 2, d));
  // Fechamento desta fatura: o do banco, se for deste ciclo; senão, calculado pelo vencimento.
  const fechamento =
    (conta.faturaFechamento && conta.faturaFechamento > umMesAntes && conta.faturaFechamento <= venc
      ? conta.faturaFechamento
      : null) ??
    fechamentoDaFatura(null, venc, conta.banco) ??
    iso(new Date(a, m - 1, d - 10));
  const doCiclo = pagamentos.filter((p) => p.contaId === conta.id && p.data >= fechamento && p.data <= venc);
  if (doCiclo.length === 0) return null;
  const valor = doCiclo.reduce((a, p) => a + p.valor, 0);
  const data = doCiclo.map((p) => p.data).sort().pop()!;
  return { valor, data, vencimentoPago: venc, proximoVencimento: iso(diaNoMes(a, m, d)) };
}

/** Fatura considerada paga quando o valor pago cobre o total. */
export function faturaPaga(f: FaturaBanco): boolean {
  return f.valorPago + 0.005 >= f.valorTotal;
}

/**
 * Vínculos automáticos para cartões sem conta vinculada:
 * - exatamente uma conta de crédito livre com o mesmo banco (e um único cartão livre desse banco);
 * - ou, se a conta não tem banco, quando há exatamente uma conta de crédito e um cartão.
 * Retorna pares { contaId, cartaoId } a persistir.
 */
export function sugerirVinculos(
  cartoes: CartaoManual[],
  contas: ContaCartaoBanco[],
): { contaId: string; cartaoId: string }[] {
  const idsCartoes = new Set(cartoes.map((c) => c.id));
  const vinculados = new Set(
    contas.filter((c) => c.cartaoId && idsCartoes.has(c.cartaoId)).map((c) => c.cartaoId!),
  );
  const contasLivres = contas.filter((c) => !c.cartaoId || !idsCartoes.has(c.cartaoId));
  const cartoesLivres = cartoes.filter((c) => !vinculados.has(c.id));

  if (contas.length === 1 && cartoes.length === 1) {
    const conta = contas[0]!;
    const cartao = cartoes[0]!;
    if (contasLivres.length === 1 && cartoesLivres.length === 1 && (!conta.banco || conta.banco === cartao.banco)) {
      return [{ contaId: conta.id, cartaoId: cartao.id }];
    }
    return [];
  }

  const pares: { contaId: string; cartaoId: string }[] = [];
  for (const cartao of cartoesLivres) {
    const mesmasContas = contasLivres.filter((c) => c.banco && c.banco === cartao.banco);
    const mesmosCartoes = cartoesLivres.filter((c) => c.banco === cartao.banco);
    if (mesmasContas.length === 1 && mesmosCartoes.length === 1) {
      pares.push({ contaId: mesmasContas[0]!.id, cartaoId: cartao.id });
    }
  }
  return pares;
}

/* ------------------------------------------------------------------ */
/* Acesso ao banco de dados                                            */
/* ------------------------------------------------------------------ */

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

/**
 * Vincula (ou desvincula, com `contaId` null) a conta de crédito do banco a um cartão manual.
 * Remove vínculos anteriores do mesmo cartão para manter no máximo uma conta por cartão.
 */
export async function vincularContaAoCartao(cartaoId: string, contaId: string | null): Promise<void> {
  const limpar = supabase.from("contas").update({ cartao_id: null }).eq("cartao_id", cartaoId);
  const { error: errLimpar } = contaId ? await limpar.neq("id", contaId) : await limpar;
  if (errLimpar) throw errLimpar;
  if (contaId) {
    const { error } = await supabase.from("contas").update({ cartao_id: cartaoId }).eq("id", contaId);
    if (error) throw error;
  }
}

/**
 * Cartões manuais do usuário com os dados reais do banco (conta vinculada + faturas).
 * Faz o vínculo automático quando não há ambiguidade e o grava em `contas.cartao_id`.
 */
export async function carregarCartoesComBanco(hoje = new Date()): Promise<CartoesComBanco> {
  const userId = await usuarioId();

  const [cart, cont] = await Promise.all([
    supabase.from("cartoes").select("*").eq("user_id", userId),
    supabase
      .from("contas")
      .select(
        "id, nome, banco, tipo, numero_conta, cartao_id, saldo_banco, saldo_banco_em, limite, limite_disponivel, fatura_fechamento, fatura_vencimento, pagamento_minimo, ultima_sincronizacao",
      )
      .eq("user_id", userId)
      .eq("tipo", "cartao_credito")
      .eq("arquivada", false),
  ]);
  if (cart.error) throw cart.error;
  if (cont.error) console.error("[cartoes-banco] contas:", cont.error);

  const manuais = ((cart.data ?? []) as Record<string, unknown>[]).map(mapCartaoManual);
  const contas = ((cont.data ?? []) as Record<string, unknown>[]).map(mapConta);

  // Vínculo automático (persistido; falhas não impedem a exibição).
  for (const par of sugerirVinculos(manuais, contas)) {
    const { error } = await supabase
      .from("contas")
      .update({ cartao_id: par.cartaoId })
      .eq("id", par.contaId);
    if (error) {
      console.error("[cartoes-banco] vínculo automático:", error);
      continue;
    }
    const conta = contas.find((c) => c.id === par.contaId);
    if (conta) conta.cartaoId = par.cartaoId;
  }

  // Fatura já paga (o banco não avisa): passa para o vencimento seguinte.
  const pagamentos = await carregarPagamentosFatura(contas.map((c) => c.id));
  for (const conta of contas) {
    const pago = pagamentoDoVencimento(conta, pagamentos, hoje);
    if (!pago) continue;
    conta.pagamento = { valor: pago.valor, data: pago.data, vencimentoPago: pago.vencimentoPago };
    conta.faturaVencimento = pago.proximoVencimento;
    conta.faturaFechamento = null;
    conta.pagamentoMinimo = null;
  }

  const faturasPorConta: Record<string, FaturaBanco[]> = {};
  if (contas.length > 0) {
    const fat = await supabase
      .from("faturas")
      .select("id, conta_id, vencimento, valor_total, pagamento_minimo, valor_pago")
      .in(
        "conta_id",
        contas.map((c) => c.id),
      )
      .order("vencimento", { ascending: false });
    if (fat.error) {
      console.error("[cartoes-banco] faturas:", fat.error);
    } else {
      for (const f of ((fat.data ?? []) as Record<string, unknown>[]).map(mapFatura)) {
        const lista = (faturasPorConta[f.contaId] ??= []);
        if (lista.length < 12) lista.push(f);
      }
    }
  }

  // A fatura paga que o banco não mandou entra no histórico pelo pagamento (valor pago).
  for (const conta of contas) {
    const pg = conta.pagamento;
    if (!pg) continue;
    const lista = (faturasPorConta[conta.id] ??= []);
    if (lista.some((f) => f.vencimento === pg.vencimentoPago)) continue;
    lista.unshift({
      id: `pago-${pg.vencimentoPago}`,
      contaId: conta.id,
      vencimento: pg.vencimentoPago,
      valorTotal: pg.valor,
      pagamentoMinimo: null,
      valorPago: pg.valor,
    });
    lista.sort((x, y) => y.vencimento.localeCompare(x.vencimento));
    if (lista.length > 12) lista.length = 12;
  }

  const cartoes: CartaoComBanco[] = manuais.map((c) => {
    const conta = contas.find((k) => k.cartaoId === c.id) ?? null;
    return {
      ...c,
      conta,
      faturas: conta ? (faturasPorConta[conta.id] ?? []) : [],
      proximoVencimento: proximoVencimento(conta?.faturaVencimento ?? null, c.diaVencimento || null, hoje),
    };
  });

  return { cartoes, contasCredito: contas, faturasPorConta };
}
