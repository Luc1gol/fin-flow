import type { LancamentoExtrato } from "@/data/extrato-mock";
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
  const tipo = tipoRaw === "receita" ? "receita" : "despesa";
  const valor = parseValorDb(row.valor);
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
    descricao: descricao || (tipo === "receita" ? "Receita" : "Despesa"),
    valor,
    categoriaNome,
    tag,
    meioPagamento: contaSalva,
    ...(meioTipoRaw ? { meioPagamentoTipo: meioTipoRaw } : {}),
    dataISO,
    ...(recorrencia_id ? { recorrencia_id } : {}),
    ...(tags_extras.length > 0 ? { tags_extras } : {}),
  };
}
