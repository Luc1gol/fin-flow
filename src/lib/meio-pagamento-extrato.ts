import type { PaymentMethod } from "@/types/finflow";

/** Labels únicos dos botões do filtro de Extrato — alinhados à UI `/lancar`. */
export const LABELS_MEIO_PAGAMENTO_EXTRATO = [
  "Pix",
  "Crédito",
  "Débito",
  "Dinheiro",
] as const;

export type MeioPagamentoExtratoLabel =
  (typeof LABELS_MEIO_PAGAMENTO_EXTRATO)[number];

/** Remove acentos e passa para minúsculas (comparação insensível). */
export function comparableMeioPagamento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Interpreta valores da coluna `meio_pagamento` ou equivalentes vindos da API,
 * sempre para um dos rótulos canônicos exibidos no filtro (quando reconhecível).
 */
export function canonicalMeioPagamentoLabel(
  raw: unknown,
): MeioPagamentoExtratoLabel | undefined {
  if (raw === null || raw === undefined) return undefined;
  const rawStr = String(raw).trim();
  if (!rawStr) return undefined;
  const k = comparableMeioPagamento(rawStr);
  const mapNorm = new Map<string, MeioPagamentoExtratoLabel>([
    ["pix", "Pix"],
    ["credito", "Crédito"],
    ["credit", "Crédito"],
    ["creditcard", "Crédito"],
    ["credito_credito", "Crédito"],
    ["cartao_credito", "Crédito"],
    ["debito", "Débito"],
    ["debit", "Débito"],
    ["cartao_debito", "Débito"],
    ["dinheiro", "Dinheiro"],
    ["cash", "Dinheiro"],
    ["money", "Dinheiro"],
  ]);
  const direct = mapNorm.get(k);
  if (direct) return direct;

  const byUiLabel = LABELS_MEIO_PAGAMENTO_EXTRATO.find(
    (lbl) => comparableMeioPagamento(lbl) === k,
  );
  return byUiLabel;
}

/** Valor a gravar na coluna `meio_pagamento` conforme escolha do `/lançar`. */
export function paymentMethodParaColunaMeio(
  me: PaymentMethod,
): MeioPagamentoExtratoLabel {
  const map: Record<PaymentMethod, MeioPagamentoExtratoLabel> = {
    pix: "Pix",
    credito: "Crédito",
    debito: "Débito",
    dinheiro: "Dinheiro",
  };
  return map[me];
}
