export type FaturaStatusLabel = "Fatura Atual" | "Fatura Fechada";

/**
 * Calcula o status da fatura com base no dia civil atual (apenas `getDate()`),
 * considerando os dois padrões de ciclo (fechamento antes ou depois do vencimento).
 */
export function getInvoiceStatus(
  fechamento: number,
  vencimento: number,
): FaturaStatusLabel {
  const hoje = new Date().getDate();

  if (fechamento < vencimento) {
    if (hoje < fechamento) return "Fatura Atual";
    if (hoje >= fechamento && hoje <= vencimento) return "Fatura Fechada";
    return "Fatura Atual";
  }

  if (fechamento > vencimento) {
    if (hoje <= vencimento) return "Fatura Fechada";
    if (hoje > vencimento && hoje < fechamento) return "Fatura Atual";
    return "Fatura Fechada";
  }

  if (hoje < fechamento) return "Fatura Atual";
  if (hoje >= fechamento && hoje <= vencimento) return "Fatura Fechada";
  return "Fatura Atual";
}

const badgeAtual =
  "whitespace-nowrap rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400";

const badgeFechada =
  "whitespace-nowrap rounded-full border border-orange-500/35 bg-orange-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-orange-400";

/** Estilo da tag alinhado a `getInvoiceStatus` (verde = atual, laranja = fechada aguardando pagamento). */
export function getInvoiceStatusBadge(
  fechamento: number,
  vencimento: number,
): { label: FaturaStatusLabel; className: string } {
  const label = getInvoiceStatus(fechamento, vencimento);
  return {
    label,
    className: label === "Fatura Atual" ? badgeAtual : badgeFechada,
  };
}
