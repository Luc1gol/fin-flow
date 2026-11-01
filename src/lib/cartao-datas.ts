/**
 * Datas da fatura do cartão. Puro: usado na tela (navegador) e na sincronização (servidor).
 *
 * Alguns bancos (ex.: C6) não informam o fechamento pelo Open Finance, só o vencimento.
 * Nesses, o fechamento (= melhor dia de compra) fica sempre a um número fixo de dias
 * antes do vencimento, então dá para calcular todo mês a partir do vencimento do banco.
 */
const DIAS_FECHAMENTO_ANTES_DO_VENCIMENTO: Record<string, number> = {
  c6: 6, // C6: melhor dia de compra 4, vencimento 10
};

/**
 * Fechamento da fatura (yyyy-mm-dd): o informado pelo banco ou, se faltar,
 * calculado a partir do vencimento do banco. Null quando não há como saber.
 */
export function fechamentoDaFatura(
  faturaFechamento: string | null,
  faturaVencimento: string | null,
  banco: string | null,
): string | null {
  if (faturaFechamento) return faturaFechamento.slice(0, 10);
  const dias = banco ? DIAS_FECHAMENTO_ANTES_DO_VENCIMENTO[banco] : undefined;
  const m = faturaVencimento ? /^(\d{4})-(\d{2})-(\d{2})/.exec(faturaVencimento) : null;
  if (!dias || !m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - dias));
  return d.toISOString().slice(0, 10);
}
