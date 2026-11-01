import type { LancamentoExtrato } from "@/types/lancamento";
import {
  canonicalMeioPagamentoLabel,
} from "@/lib/meio-pagamento-extrato";
import { coalesceTagsExtrasFromUnknown } from "@/lib/tags-extras-coalesce";

function parseValorDb(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function mapLancamentoRowFromDb(
  row: Record<string, unknown>,
): LancamentoExtrato {
  const tipoRaw = String(row.tipo ?? "").toLowerCase().trim();
  const tipo =
    tipoRaw === "receita" || tipoRaw === "transferencia" ? tipoRaw : "despesa";
  // Transferências guardam o sentido no sinal do valor (negativo = saída).
  const valorDb = parseValorDb(row.valor);
  const valor = Math.abs(valorDb);
  const dataISO = String(row.data ?? "").slice(0, 10);
  const descricao = String(row.descricao ?? "").trim();
  const tag =
    row.tag != null && String(row.tag).trim()
      ? String(row.tag).trim()
      : undefined;
  const contaSalva =
    row.conta_cartao != null && String(row.conta_cartao).trim()
      ? String(row.conta_cartao).trim()
      : "—";
  const meioTipoRaw = canonicalMeioPagamentoLabel(row.meio_pagamento);
  const categoriaNome = tag ?? "Outros";
  const tags_extras = coalesceTagsExtrasFromUnknown(row.tags_extras);
  const recId = row.recorrencia_id;
  const recorrencia_id =
    recId != null && String(recId).trim() !== ""
      ? String(recId).trim()
      : null;

  return {
    id: String(row.id),
    tipo,
    descricao:
      descricao ||
      (tipo === "receita" ? "Receita" : tipo === "despesa" ? "Despesa" : "Transferência"),
    valor,
    ...(tipo === "transferencia" ? { transferenciaSaida: valorDb < 0 } : {}),
    categoriaNome,
    tag,
    meioPagamento: contaSalva,
    ...(meioTipoRaw ? { meioPagamentoTipo: meioTipoRaw } : {}),
    dataISO,
    ...(recorrencia_id ? { recorrencia_id } : {}),
    ...(tags_extras.length > 0 ? { tags_extras } : {}),
    ...(row.observacao != null && String(row.observacao).trim()
      ? { observacao: String(row.observacao).trim() }
      : {}),
    ...(row.dividido_com != null && String(row.dividido_com).trim()
      ? { divididoCom: String(row.dividido_com).trim() }
      : {}),
    ...(row.valor_a_receber != null && parseValorDb(row.valor_a_receber) > 0
      ? { valorAReceber: parseValorDb(row.valor_a_receber) }
      : {}),
    ...(row.recebido_em != null && String(row.recebido_em).trim()
      ? { recebidoEm: String(row.recebido_em).slice(0, 10) }
      : {}),
  };
}
