import type { PluggyConta, PluggyTransacao } from "@/lib/pluggy/cliente";

export type TransacaoNormalizada = {
  idExterno: string;
  /** yyyy-mm-dd no fuso de Brasília. */
  data: string;
  /** Do ponto de vista da conta: negativo = saiu dinheiro / gasto no cartão. */
  valor: number;
  /** Texto no mesmo formato que o classificador já entende. */
  memo: string;
};

/** A Pluggy devolve datas em UTC; o dia que importa é o de Brasília. */
function dataBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

/**
 * Converte uma transação da Pluggy para o formato do importador.
 * Em cartão de crédito a Pluggy usa valor positivo para compras; invertemos
 * para manter a convenção "negativo = gasto".
 */
export function normalizarTransacao(
  t: PluggyTransacao,
  conta: PluggyConta,
): TransacaoNormalizada {
  const cartao = conta.type === "CREDIT";
  const valor = cartao
    ? -t.amount
    : t.type === "DEBIT"
      ? -Math.abs(t.amount)
      : Math.abs(t.amount);

  let memo = (t.description || t.descriptionRaw || "").trim();
  const pix = t.paymentData?.paymentMethod?.toUpperCase() === "PIX";
  const pagador = t.paymentData?.payer?.name?.trim();
  const recebedor = t.paymentData?.receiver?.name?.trim();

  if (cartao && (t.operationType === "PAGAMENTO_FATURA" || /pagamento/i.test(memo)) && valor > 0) {
    memo = "Pagamento de fatura";
  } else if (!cartao && pix && valor > 0 && pagador) {
    memo = `Pix recebido de ${pagador}`;
  } else if (!cartao && pix && valor < 0 && recebedor) {
    // Diferente do OFX, aqui sabemos para quem foi o Pix.
    memo = `Pix enviado para ${recebedor}`;
  } else if (!cartao && /fatura/i.test(memo) && valor < 0) {
    memo = "Fatura de cartão";
  }

  const parcela = t.creditCardMetadata;
  if (cartao && parcela?.totalInstallments && parcela.totalInstallments > 1) {
    memo = `${memo} (${parcela.installmentNumber ?? 1}/${parcela.totalInstallments})`;
  }

  return { idExterno: t.id, data: dataBrasilia(t.date), valor, memo };
}
