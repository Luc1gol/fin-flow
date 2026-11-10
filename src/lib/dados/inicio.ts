import { supabase } from "@/lib/supabase";
import { carregarPagamentosFatura, pagamentoDoVencimento, proximoVencimento } from "@/lib/dados/cartoes-banco";

export type MovimentoResumo = {
  id: string;
  tipo: "receita" | "despesa" | "transferencia";
  valor: number;
  data: string;
  descricao: string;
  categoria: string | null;
  meio: string | null;
};

export type ResumoInicio = {
  nome: string;
  /** Soma do saldo informado pelo banco nas contas correntes; null se nenhuma conta conectada. */
  saldoContas: { valor: number; atualizadoEm: string | null } | null;
  entradas: number;
  saidas: number;
  /**
   * Comparação justa com o mês anterior: no mês atual, compara do dia 1 até hoje
   * com o dia 1 até o mesmo dia do mês anterior. Em meses passados, mês inteiro x mês inteiro.
   */
  comparacao: {
    entradas: { atual: number; anterior: number };
    saidas: { atual: number; anterior: number };
    /** Dia limite usado (ex.: 15 → "1 a 15"); null quando compara meses inteiros. */
    ateDia: number | null;
    mesAnterior0: number;
  };
  movimentos: MovimentoResumo[];
  pendentesRevisao: number;
  cartaoVencendo: { nome: string; dias: number } | null;
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(ano: number, mes0: number, dia: number) {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Tudo o que o Início precisa para o mês escolhido, em uma ida ao banco. */
export async function carregarResumoInicio(ano: number, mes0: number): Promise<ResumoInicio> {
  const { data: auth, error: errAuth } = await supabase.auth.getUser();
  if (errAuth || !auth.user) throw errAuth ?? new Error("Sessão expirada.");
  const user = auth.user;

  const anterior = mes0 === 0 ? { ano: ano - 1, mes0: 11 } : { ano, mes0: mes0 - 1 };
  const desde = iso(anterior.ano, anterior.mes0, 1);
  const ate = iso(ano, mes0, new Date(ano, mes0 + 1, 0).getDate());

  const [lanc, contas, pend, perfil, cartoes] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id, tipo, valor, data, descricao, tag, meio_pagamento, created_at")
      .eq("user_id", user.id)
      .gte("data", desde)
      .lte("data", ate)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("contas")
      .select("id, tipo, banco, saldo_banco, saldo_banco_em, cartao_id, fatura_vencimento, fatura_fechamento")
      .eq("arquivada", false),
    supabase
      .from("transacoes_importadas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase.from("profiles").select("apelido, nome_completo").eq("id", user.id).maybeSingle(),
    supabase.from("cartoes").select("id, nome, dia_vencimento").eq("user_id", user.id),
  ]);
  if (lanc.error) throw lanc.error;

  const prefixoMes = iso(ano, mes0, 1).slice(0, 7);
  const prefixoAnterior = iso(anterior.ano, anterior.mes0, 1).slice(0, 7);
  const hojeData = new Date();
  const ehMesAtual = hojeData.getFullYear() === ano && hojeData.getMonth() === mes0;
  const ateDia = ehMesAtual ? hojeData.getDate() : null;
  // Limites (inclusivos) das duas janelas comparadas.
  const limiteAtual = ateDia != null ? iso(ano, mes0, ateDia) : ate;
  const ultimoDiaAnterior = new Date(anterior.ano, anterior.mes0 + 1, 0).getDate();
  const limiteAnterior = iso(
    anterior.ano,
    anterior.mes0,
    ateDia != null ? Math.min(ateDia, ultimoDiaAnterior) : ultimoDiaAnterior,
  );
  let entradas = 0;
  let saidas = 0;
  const comparacao: ResumoInicio["comparacao"] = {
    entradas: { atual: 0, anterior: 0 },
    saidas: { atual: 0, anterior: 0 },
    ateDia,
    mesAnterior0: anterior.mes0,
  };
  const movimentos: MovimentoResumo[] = [];
  for (const r of lanc.data ?? []) {
    const tipo = String(r.tipo) as MovimentoResumo["tipo"];
    const valor = Math.abs(numero(r.valor));
    const data = String(r.data).slice(0, 10);
    if (data.startsWith(prefixoMes)) {
      if (tipo === "receita") entradas += valor;
      else if (tipo === "despesa") saidas += valor;
      if (data <= limiteAtual) {
        if (tipo === "receita") comparacao.entradas.atual += valor;
        else if (tipo === "despesa") comparacao.saidas.atual += valor;
      }
      movimentos.push({
        id: String(r.id),
        tipo,
        // Transferências guardam o sentido no sinal.
        valor: tipo === "transferencia" ? numero(r.valor) : valor,
        data,
        descricao: String(r.descricao ?? "").trim(),
        categoria: r.tag ? String(r.tag) : null,
        meio: r.meio_pagamento ? String(r.meio_pagamento) : null,
      });
    } else if (data.startsWith(prefixoAnterior) && data <= limiteAnterior) {
      if (tipo === "receita") comparacao.entradas.anterior += valor;
      else if (tipo === "despesa") comparacao.saidas.anterior += valor;
    }
  }

  const correntes = (contas.data ?? []).filter(
    (c) => c.tipo !== "cartao_credito" && c.saldo_banco != null,
  );
  const saldoContas =
    correntes.length > 0
      ? {
          valor: correntes.reduce((acc, c) => acc + numero(c.saldo_banco), 0),
          atualizadoEm:
            correntes
              .map((c) => c.saldo_banco_em as string | null)
              .filter(Boolean)
              .sort()
              .pop() ?? null,
        }
      : null;

  const nomeEmail = user.email?.split("@")[0]?.replace(/[._]/g, " ") ?? "";
  const nome =
    perfil.data?.apelido?.trim() ||
    perfil.data?.nome_completo?.trim().split(" ")[0] ||
    nomeEmail;

  const hoje = new Date();
  let cartaoVencendo: ResumoInicio["cartaoVencendo"] = null;
  const pagamentos = await carregarPagamentosFatura(
    (contas.data ?? []).filter((k) => k.tipo === "cartao_credito").map((k) => String(k.id)),
  );
  for (const c of cartoes.data ?? []) {
    // Cartão conectado ao banco: vale o vencimento real informado por ele (ou o seguinte,
    // se a fatura já foi paga).
    const vinculada = (contas.data ?? []).find((k) => k.cartao_id === c.id);
    const pago = vinculada
      ? pagamentoDoVencimento(
          {
            id: String(vinculada.id),
            banco: (vinculada.banco as string | null) ?? null,
            faturaFechamento: (vinculada.fatura_fechamento as string | null)?.slice(0, 10) ?? null,
            faturaVencimento: (vinculada.fatura_vencimento as string | null)?.slice(0, 10) ?? null,
          },
          pagamentos,
          hoje,
        )
      : null;
    const proximo = proximoVencimento(
      pago?.proximoVencimento ?? (vinculada?.fatura_vencimento as string | null | undefined) ?? null,
      Number(c.dia_vencimento) || null,
      hoje,
    );
    if (!proximo) continue;
    const venc = new Date(`${proximo}T00:00:00`);
    const dias = Math.round((venc.getTime() - new Date(hoje.toDateString()).getTime()) / 86_400_000);
    if (dias <= 5 && (!cartaoVencendo || dias < cartaoVencendo.dias)) {
      cartaoVencendo = { nome: String(c.nome ?? "cartão"), dias };
    }
  }

  return {
    nome,
    saldoContas,
    entradas,
    saidas,
    comparacao,
    movimentos,
    pendentesRevisao: pend.count ?? 0,
    cartaoVencendo,
  };
}
