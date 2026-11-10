import { supabase } from "@/lib/supabase";
import { labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import { normalizarTexto } from "@/lib/importacao/classificar";
import { carregarContasFixas } from "@/lib/dados/recorrencias";
import { carregarPagamentosFatura, pagamentoDoVencimento } from "@/lib/dados/cartoes-banco";

export type TipoEvento = "conta_fixa" | "receita_fixa" | "fatura" | "agendado";

/** Algo que ainda vai mexer no saldo da conta até o fim do mês. */
export type EventoPrevisto = {
  data: string;
  descricao: string;
  /** Com sinal: negativo = sai da conta. */
  valor: number;
  tipo: TipoEvento;
  /** Fatura calculada pelos lançamentos do cartão (pode faltar compra não lançada). */
  estimado?: boolean;
  /** Valor da fatura informado pelo banco (Open Finance). */
  doBanco?: boolean;
};

export type Projecao = {
  hoje: string;
  fimMes: string;
  /** Saldo informado pelo banco; null se nenhuma conta está conectada. */
  saldoHoje: { valor: number; em: string | null } | null;
  eventos: EventoPrevisto[];
  /** Saldo no último dia considerando só o que já está previsto. */
  saldoPrevisto: number;
  /** Média diária de gastos variáveis (débito, Pix, dinheiro) dos últimos 3 meses. */
  gastoMedioDiario: number;
  diasRestantes: number;
  /** Saldo previsto descontando também o gasto médio do dia a dia. */
  saldoComDiaADia: number;
  /** Uma posição por dia, de hoje ao fim do mês, para o gráfico. */
  serie: { data: string; previsto: number; comDiaADia: number }[];
};

const DIAS_MEDIA = 90;
/** Com menos dias que isso de histórico, a média ainda divide por este tanto (evita exagero). */
const DIAS_MINIMOS_MEDIA = 14;
/** Perto do fim do mês, a projeção passa a ir até o fim do mês seguinte. */
const MIN_DIAS_HORIZONTE = 7;

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaNoMes(ano: number, mes0: number, dia: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(Math.max(1, dia), ultimo), 12);
}

function ehCredito(meio: string | null, conta: string | null) {
  const m = normalizarTexto(meio ?? "");
  // Compra lançada num cartão conta como crédito, a não ser que diga débito.
  return m === "credito" || (/^cart[aã]o /i.test(conta ?? "") && m !== "debito");
}

/**
 * Fatura que vence em `vencimento`: compras entre o fechamento anterior (inclusive)
 * e o fechamento seguinte (exclusive) — mesma regra da tela Cartões.
 */
function cicloDaFatura(vencimento: Date, diaFechamento: number): { de: string; ate: string } {
  let fecha = diaNoMes(vencimento.getFullYear(), vencimento.getMonth(), diaFechamento);
  if (fecha >= vencimento) fecha = diaNoMes(vencimento.getFullYear(), vencimento.getMonth() - 1, diaFechamento);
  const inicio = diaNoMes(fecha.getFullYear(), fecha.getMonth() - 1, diaFechamento);
  return { de: iso(inicio), ate: iso(fecha) };
}

export async function carregarProjecao(): Promise<Projecao> {
  const { data: auth, error: errAuth } = await supabase.auth.getUser();
  if (errAuth || !auth.user) throw errAuth ?? new Error("Sessão expirada.");
  const userId = auth.user.id;

  const agora = new Date();
  const ano = agora.getFullYear();
  const mes0 = agora.getMonth();
  const hoje = iso(agora);
  const diasNoMes = new Date(ano, mes0 + 1, 0).getDate();
  const estende = diasNoMes - agora.getDate() < MIN_DIAS_HORIZONTE;
  // Meses cobertos pela projeção (o atual e, perto do fim, o seguinte).
  const meses = estende ? [mes0, mes0 + 1] : [mes0];
  const fimMes = iso(new Date(ano, mes0 + meses.length, 0, 12));
  const inicioMedia = iso(new Date(ano, mes0, agora.getDate() - DIAS_MEDIA, 12));
  // Faturas que vencem este mês podem ter compras de até ~2 meses atrás.
  const inicioBusca = iso(new Date(ano, mes0 - 3, 1, 12));

  const [contas, lanc, cartoes, fixas] = await Promise.all([
    supabase
      .from("contas")
      .select("id, tipo, banco, cartao_id, saldo_banco, saldo_banco_em, fatura_vencimento, fatura_fechamento")
      .eq("arquivada", false),
    supabase
      .from("lancamentos")
      .select("descricao, tipo, valor, data, meio_pagamento, conta_cartao, recorrencia_id")
      .eq("user_id", userId)
      .in("tipo", ["despesa", "receita"])
      .gte("data", inicioBusca)
      .lte("data", fimMes),
    supabase.from("cartoes").select("id, nome, banco, dia_fechamento, dia_vencimento").eq("user_id", userId),
    Promise.all(meses.map((m) => carregarContasFixas(ano, m))),
  ]);
  if (lanc.error) throw lanc.error;

  const correntes = (contas.data ?? []).filter((c) => c.tipo !== "cartao_credito" && c.saldo_banco != null);
  const saldoHoje =
    correntes.length > 0
      ? {
          valor: correntes.reduce((a, c) => a + numero(c.saldo_banco), 0),
          em: correntes.map((c) => c.saldo_banco_em as string | null).filter(Boolean).sort().pop() ?? null,
        }
      : null;

  const lancamentos = (lanc.data ?? []).map((l) => ({
    descricao: String(l.descricao ?? ""),
    tipo: String(l.tipo),
    valor: Math.abs(numero(l.valor)),
    data: String(l.data).slice(0, 10),
    meio: l.meio_pagamento ? String(l.meio_pagamento) : null,
    conta: l.conta_cartao ? String(l.conta_cartao) : null,
    recorrencia: Boolean(l.recorrencia_id),
  }));

  const eventos: EventoPrevisto[] = [];

  // 1. Lançamentos já registrados com data futura, fora do cartão de crédito.
  for (const l of lancamentos) {
    if (l.data <= hoje || l.data > fimMes || ehCredito(l.meio, l.conta)) continue;
    eventos.push({
      data: l.data,
      descricao: l.descricao,
      valor: l.tipo === "receita" ? l.valor : -l.valor,
      tipo: "agendado",
    });
  }

  // 2. Contas e receitas fixas ainda não pagas (as no crédito entram pela fatura).
  for (const c of fixas.flatMap((f) => f.contas)) {
    if (c.situacao === "paga") continue;
    const r = c.recorrencia;
    if (r.tipo === "despesa" && normalizarTexto(r.meioPagamento ?? "") === "credito") continue;
    eventos.push({
      data: c.vencimento < hoje ? hoje : c.vencimento,
      descricao: r.descricao,
      valor: r.tipo === "receita" ? r.valor : -r.valor,
      tipo: r.tipo === "receita" ? "receita_fixa" : "conta_fixa",
    });
  }

  // Cartões conectados pelo banco: o saldo da conta de crédito é o que se deve no cartão.
  const contasCredito = (contas.data ?? []).filter((c) => c.tipo === "cartao_credito" && c.saldo_banco != null);
  const faturaDoBanco = (cartao: { id: unknown; banco: unknown }) =>
    contasCredito.find((c) => c.cartao_id === cartao.id) ??
    contasCredito.find((c) => !c.cartao_id && c.banco && c.banco === cartao.banco);

  // Fatura já fechada e ainda não paga (vem do banco): ela vence primeiro; o resto do saldo
  // do cartão são as compras depois do fechamento, que vão para a fatura seguinte.
  const { data: faturasAbertas } = contasCredito.length
    ? await supabase
        .from("faturas")
        .select("conta_id, vencimento, valor_total, valor_pago")
        .in(
          "conta_id",
          contasCredito.map((c) => c.id),
        )
        .gte("vencimento", hoje)
    : { data: [] };
  /** Valores do banco para as próximas faturas de cada cartão conectado, em ordem. */
  const filaBanco = new Map<unknown, number[]>();
  const pagamentos = await carregarPagamentosFatura(contasCredito.map((c) => String(c.id)));
  for (const conta of contasCredito) {
    // Fatura já paga antes do vencimento (o banco não avisa): nada a pagar nesse vencimento;
    // a seguinte é estimada pelas compras lançadas (o saldo do banco inclui parcelas futuras).
    const pago = pagamentoDoVencimento(
      {
        id: String(conta.id),
        banco: (conta.banco as string | null) ?? null,
        faturaFechamento: (conta.fatura_fechamento as string | null)?.slice(0, 10) ?? null,
        faturaVencimento: (conta.fatura_vencimento as string | null)?.slice(0, 10) ?? null,
      },
      pagamentos,
      agora,
    );
    if (pago) {
      filaBanco.set(conta.id, [0]);
      continue;
    }
    const saldo = Math.max(0, numero(conta.saldo_banco));
    const fechada = (faturasAbertas ?? [])
      .filter((f) => f.conta_id === conta.id)
      .map((f) => Math.max(0, numero(f.valor_total) - numero(f.valor_pago)))
      .find((restante) => restante > 0.005);
    filaBanco.set(conta.id, fechada != null ? [fechada, Math.max(0, saldo - fechada)] : [saldo]);
  }

  // 3. Faturas de cartão que ainda vencem dentro do horizonte.
  for (const c of (cartoes.data ?? []).flatMap((cartao) => meses.map((m) => ({ cartao, m })))) {
    const diaV = Number(c.cartao.dia_vencimento);
    const diaF = Number(c.cartao.dia_fechamento);
    if (!Number.isFinite(diaV) || !Number.isFinite(diaF)) continue;
    // Com o cartão conectado, o dia de vencimento real vem do banco (pode diferir do cadastrado).
    const vencBanco = faturaDoBanco(c.cartao)?.fatura_vencimento as string | null | undefined;
    const diaReal = vencBanco ? Number(vencBanco.slice(8, 10)) || diaV : diaV;
    const vencimento = diaNoMes(ano, c.m, diaReal);
    if (iso(vencimento) < hoje) continue; // já venceu: considera paga
    const { de, ate } = cicloDaFatura(vencimento, diaF);
    const rotulo = labelContaCartaoPersistido(String(c.cartao.nome ?? "")).toLowerCase();
    // Com o cartão conectado, as próximas faturas usam os valores do banco (mesmo zero, quando
    // já foi paga); depois deles, a estimativa pelos lançamentos.
    const banco = faturaDoBanco(c.cartao);
    const valoresBanco = banco ? filaBanco.get(banco.id) : undefined;
    const doBanco = Boolean(valoresBanco && valoresBanco.length > 0);
    const valor = doBanco
      ? valoresBanco!.shift()!
      : lancamentos
          .filter((l) => l.tipo === "despesa" && (l.conta ?? "").toLowerCase() === rotulo && l.data >= de && l.data < ate)
          .reduce((a, l) => a + l.valor, 0);
    if (valor <= 0) continue;
    eventos.push({
      data: iso(vencimento),
      descricao: `Fatura ${String(c.cartao.nome ?? "do cartão")}`,
      valor: -valor,
      tipo: "fatura",
      ...(doBanco ? { doBanco: true } : { estimado: true }),
    });
  }

  eventos.sort((a, b) => a.data.localeCompare(b.data));

  // Gasto do dia a dia: despesas variáveis (sem crédito e sem contas fixas) dos últimos 90 dias.
  const variaveis = lancamentos.filter(
    (l) => l.tipo === "despesa" && !l.recorrencia && !ehCredito(l.meio, l.conta) && l.data >= inicioMedia && l.data <= hoje,
  );
  // Divide pelos dias que de fato têm registros (quem começou a usar há pouco não tem 90 dias).
  const primeiroRegistro = lancamentos
    .map((l) => l.data)
    .filter((d) => d >= inicioMedia && d <= hoje)
    .sort()[0];
  const diasCobertos = primeiroRegistro
    ? Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${primeiroRegistro}T12:00:00Z`)) / 86_400_000) + 1
    : DIAS_MEDIA;
  const gastoMedioDiario =
    variaveis.reduce((a, l) => a + l.valor, 0) / Math.min(DIAS_MEDIA, Math.max(DIAS_MINIMOS_MEDIA, diasCobertos));

  const diasRestantes = Math.max(
    0,
    Math.round((new Date(`${fimMes}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) / 86_400_000),
  );
  const base = saldoHoje?.valor ?? 0;
  const saldoPrevisto = base + eventos.reduce((a, e) => a + e.valor, 0);
  const saldoComDiaADia = saldoPrevisto - gastoMedioDiario * diasRestantes;

  const serie: Projecao["serie"] = [];
  let acumulado = base;
  for (let i = 0; i <= diasRestantes; i++) {
    const dia = iso(new Date(ano, mes0, agora.getDate() + i, 12));
    acumulado += eventos.filter((e) => e.data === dia).reduce((a, e) => a + e.valor, 0);
    serie.push({ data: dia, previsto: acumulado, comDiaADia: acumulado - gastoMedioDiario * i });
  }

  return {
    hoje,
    fimMes,
    saldoHoje,
    eventos,
    saldoPrevisto,
    gastoMedioDiario,
    diasRestantes,
    saldoComDiaADia,
    serie,
  };
}
