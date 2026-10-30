import { supabase } from "@/lib/supabase";
import { labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import { normalizarTexto } from "@/lib/importacao/classificar";
import { carregarContasFixas } from "@/lib/dados/recorrencias";

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
  const fimMes = iso(new Date(ano, mes0 + 1, 0, 12));
  const inicioMedia = iso(new Date(ano, mes0, agora.getDate() - DIAS_MEDIA, 12));
  // Faturas que vencem este mês podem ter compras de até ~2 meses atrás.
  const inicioBusca = iso(new Date(ano, mes0 - 3, 1, 12));

  const [contas, lanc, cartoes, fixas] = await Promise.all([
    supabase.from("contas").select("tipo, saldo_banco, saldo_banco_em").eq("arquivada", false),
    supabase
      .from("lancamentos")
      .select("descricao, tipo, valor, data, meio_pagamento, conta_cartao, recorrencia_id")
      .eq("user_id", userId)
      .in("tipo", ["despesa", "receita"])
      .gte("data", inicioBusca)
      .lte("data", fimMes),
    supabase.from("cartoes").select("nome, dia_fechamento, dia_vencimento").eq("user_id", userId),
    carregarContasFixas(ano, mes0),
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
  for (const c of fixas.contas) {
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

  // 3. Faturas de cartão que ainda vencem este mês.
  for (const c of cartoes.data ?? []) {
    const diaV = Number(c.dia_vencimento);
    const diaF = Number(c.dia_fechamento);
    if (!Number.isFinite(diaV) || !Number.isFinite(diaF)) continue;
    const vencimento = diaNoMes(ano, mes0, diaV);
    if (iso(vencimento) < hoje) continue; // já venceu: considera paga
    const { de, ate } = cicloDaFatura(vencimento, diaF);
    const rotulo = labelContaCartaoPersistido(String(c.nome ?? "")).toLowerCase();
    const valor = lancamentos
      .filter((l) => l.tipo === "despesa" && (l.conta ?? "").toLowerCase() === rotulo && l.data >= de && l.data < ate)
      .reduce((a, l) => a + l.valor, 0);
    if (valor <= 0) continue;
    eventos.push({
      data: iso(vencimento),
      descricao: `Fatura ${String(c.nome ?? "do cartão")}`,
      valor: -valor,
      tipo: "fatura",
      estimado: true,
    });
  }

  eventos.sort((a, b) => a.data.localeCompare(b.data));

  // Gasto do dia a dia: despesas variáveis (sem crédito e sem contas fixas) dos últimos 90 dias.
  const variaveis = lancamentos.filter(
    (l) => l.tipo === "despesa" && !l.recorrencia && !ehCredito(l.meio, l.conta) && l.data >= inicioMedia && l.data <= hoje,
  );
  const gastoMedioDiario = variaveis.reduce((a, l) => a + l.valor, 0) / DIAS_MEDIA;

  const diasRestantes = Math.max(0, new Date(ano, mes0 + 1, 0).getDate() - agora.getDate());
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
