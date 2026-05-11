import { formatBRLNumberPart } from "@/lib/format-currency";

/** Mesmo limite da tela de Lançar (dígitos = centavos). */
export const MAX_AMOUNT_DIGITS_LANCAMENTO = 12;

/** Monta string de apenas dígitos (centavos) a partir de um valor em reais. */
export function reaisToAmountDigits(reais: number): string {
  if (!Number.isFinite(reais) || reais <= 0) return "";
  const cents = Math.round(reais * 100 + Number.EPSILON);
  if (cents <= 0) return "";
  const capped = Math.min(cents, 10 ** MAX_AMOUNT_DIGITS_LANCAMENTO - 1);
  return String(capped).slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO);
}

export function parseAmountDigitsToReais(amountDigits: string): number {
  if (!amountDigits) return 0;
  const cents = Number.parseInt(amountDigits.replace(/\D/g, ""), 10);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

export function formatMaskedValorDisplay(amountDigits: string): string {
  return formatBRLNumberPart(parseAmountDigitsToReais(amountDigits));
}
