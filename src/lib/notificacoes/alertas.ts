import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/importacao/classificar";
import { lancamentoCombina, type Recorrencia } from "@/lib/dados/recorrencias";
import { formatBRL } from "@/lib/format-currency";
import { enviarParaUsuario, enviarUmaVez } from "@/lib/notificacoes/enviar";

/** Rotina diária: decide e envia os avisos do dia. Roda no servidor, depois da sincronização. */

function hojeBrasilia(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${iso}T12:00:00`);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaNoMes(ano: number, mes0: number, dia: number) {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(dia, ultimo), 12);
}

/** Próximo vencimento a partir da data do banco (que pode estar no passado) ou do dia manual. */
function proximoVencimento(dataBanco: string | null, hoje: Date): Date | null {
  if (!dataBanco) return null;
  let d = new Date(`${dataBanco}T12:00:00`);
  const dia = d.getDate();
  while (d < hoje) d = diaNoMes(d.getFullYear(), d.getMonth() + 1, dia);
  return d;
}

const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

export async function enviarAlertasDoDia(
  db: SupabaseClient,
  userId: string,
  sincronizacao: { novas: number; automaticas: number },
): Promise<string[]> {
  const enviados: string[] = [];
  const hoje = hojeBrasilia();
  const mes = iso(hoje).slice(0, 7);
  const inicioMes = `${mes}-01`;

  // 1. Revisão: um aviso por dia se houver algo esperando.
  const { count: pendentes } = await db
    .from("transacoes_importadas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pendente");
  if ((pendentes ?? 0) > 0) {
    const auto = sincronizacao.automaticas > 0 ? ` (${sincronizacao.automaticas} já confirmadas sozinhas)` : "";
    await enviarParaUsuario(db, userId, {
      titulo: `${pendentes} ${pendentes === 1 ? "transação" : "transações"} para revisar`,
      corpo: `O banco atualizou${auto}. Toque para revisar.`,
      url: "/importar",
      tag: "revisar",
    });
    enviados.push("revisar");
  }

  // 2. Orçamentos: avisa ao passar de 80% e de 100%, uma vez por mês e categoria.
  const [orc, desp] = await Promise.all([
    db.from("orcamentos").select("categoria, valor_mensal").eq("user_id", userId),
    db
      .from("lancamentos")
      .select("valor, tag")
      .eq("user_id", userId)
      .eq("tipo", "despesa")
      .gte("data", inicioMes)
      .lte("data", iso(hoje)),
  ]);
  const gastoPorCategoria = new Map<string, number>();
  for (const l of desp.data ?? []) {
    const k = normalizarTexto(l.tag ?? "");
    gastoPorCategoria.set(k, (gastoPorCategoria.get(k) ?? 0) + Math.abs(Number(l.valor) || 0));
  }
  for (const o of orc.data ?? []) {
    const limite = Number(o.valor_mensal) || 0;
    const gasto = gastoPorCategoria.get(normalizarTexto(o.categoria)) ?? 0;
    if (limite <= 0) continue;
    const nivel = gasto > limite ? 100 : gasto >= limite * 0.8 ? 80 : 0;
    if (!nivel) continue;
    const chave = `orc-${nivel}-${normalizarTexto(o.categoria)}-${mes}`;
    const ok = await enviarUmaVez(db, userId, chave, {
      titulo: nivel === 100 ? `${o.categoria}: orçamento estourado` : `${o.categoria}: 80% do orçamento`,
      corpo: `${formatBRL(gasto)} de ${formatBRL(limite)} este mês.`,
      url: "/orcamentos",
    });
    if (ok) enviados.push(chave);
  }

  // 3. Faturas: 3 dias antes e no dia do vencimento.
  const { data: cartoes } = await db
    .from("contas")
    .select("id, nome, saldo_banco, fatura_vencimento")
    .eq("user_id", userId)
    .eq("tipo", "cartao_credito");
  for (const c of cartoes ?? []) {
    const venc = proximoVencimento(c.fatura_vencimento as string | null, hoje);
    if (!venc || !(Number(c.saldo_banco) > 0)) continue;
    const dias = diasEntre(hoje, venc);
    if (dias !== 3 && dias !== 0) continue;
    const chave = `fatura-${c.id}-${iso(venc)}-${dias}`;
    const ok = await enviarUmaVez(db, userId, chave, {
      titulo: dias === 0 ? "Fatura vence hoje" : "Fatura vence em 3 dias",
      corpo: `${c.nome}: ${formatBRL(Number(c.saldo_banco))}.`,
      url: "/cartoes",
    });
    if (ok) enviados.push(chave);
  }

  // 4. Contas fixas que vencem hoje ou amanhã e ainda não foram pagas.
  const [recs, doMes] = await Promise.all([
    db
      .from("recorrencias")
      .select("id, descricao, tipo, valor, dia_do_mes, data_inicio")
      .eq("user_id", userId)
      .eq("status", "ativa")
      .eq("tipo", "despesa"),
    db
      .from("lancamentos")
      .select("descricao, tipo, valor, recorrencia_id")
      .eq("user_id", userId)
      .gte("data", inicioMes),
  ]);
  for (const r of recs.data ?? []) {
    const dia = Number(r.dia_do_mes) || Number(String(r.data_inicio).slice(8, 10)) || 1;
    const venc = diaNoMes(hoje.getFullYear(), hoje.getMonth(), dia);
    const dias = diasEntre(hoje, venc);
    if (dias !== 0 && dias !== 1) continue;
    const rec = { descricao: String(r.descricao), tipo: "despesa", valor: Math.abs(Number(r.valor)) } as Pick<
      Recorrencia,
      "descricao" | "tipo" | "valor"
    >;
    const paga = (doMes.data ?? []).some(
      (l) =>
        l.recorrencia_id === r.id ||
        lancamentoCombina(rec, { descricao: String(l.descricao ?? ""), tipo: String(l.tipo), valor: Number(l.valor) }),
    );
    if (paga) continue;
    const chave = `fixa-${r.id}-${iso(venc)}`;
    const ok = await enviarUmaVez(db, userId, chave, {
      titulo: dias === 0 ? `${r.descricao} vence hoje` : `${r.descricao} vence amanhã`,
      corpo: `${formatBRL(rec.valor)} · conta fixa ainda não paga.`,
      url: "/recorrencias",
    });
    if (ok) enviados.push(chave);
  }

  return enviados;
}
