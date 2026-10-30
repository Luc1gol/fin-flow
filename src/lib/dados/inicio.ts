import { supabase } from "@/lib/supabase";

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
  saidasMesAnterior: number;
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
    supabase.from("contas").select("tipo, saldo_banco, saldo_banco_em").eq("arquivada", false),
    supabase
      .from("transacoes_importadas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase.from("profiles").select("apelido, nome_completo").eq("id", user.id).maybeSingle(),
    supabase.from("cartoes").select("nome, dia_vencimento").eq("user_id", user.id),
  ]);
  if (lanc.error) throw lanc.error;

  const prefixoMes = iso(ano, mes0, 1).slice(0, 7);
  const prefixoAnterior = iso(anterior.ano, anterior.mes0, 1).slice(0, 7);
  let entradas = 0;
  let saidas = 0;
  let saidasMesAnterior = 0;
  const movimentos: MovimentoResumo[] = [];
  for (const r of lanc.data ?? []) {
    const tipo = String(r.tipo) as MovimentoResumo["tipo"];
    const valor = Math.abs(numero(r.valor));
    const data = String(r.data).slice(0, 10);
    if (data.startsWith(prefixoMes)) {
      if (tipo === "receita") entradas += valor;
      else if (tipo === "despesa") saidas += valor;
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
    } else if (data.startsWith(prefixoAnterior) && tipo === "despesa") {
      saidasMesAnterior += valor;
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
  for (const c of cartoes.data ?? []) {
    const dia = Number(c.dia_vencimento);
    if (!Number.isFinite(dia)) continue;
    let venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
    if (venc < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) {
      venc = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia);
    }
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
    saidasMesAnterior,
    movimentos,
    pendentesRevisao: pend.count ?? 0,
    cartaoVencendo,
  };
}
