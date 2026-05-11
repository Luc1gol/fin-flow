/**
 * Fonte da verdade dos cartões do usuário.
 * Estado voltará para Context/Zustand; campos estáveis favorecem a migração.
 */
export type CartaoCreditoUsuario = {
  id: string;
  /** id da instituição em `src/data/bancos.ts`. */
  bancoId: string;
  /** Apelido opcional (ex.: Crédito Principal). */
  nomeCartao: string;
  final4: string;
  diaFechamento: number;
  diaVencimento: number;
  /** Valor corrente da fatura (mock / integração futura). */
  valorFatura: number;
};
