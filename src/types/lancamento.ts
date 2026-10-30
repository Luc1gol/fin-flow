/** Lançamento normalizado para exibição no Extrato. */
export type LancamentoExtrato = {
  id: string;
  tipo: "receita" | "despesa" | "transferencia";
  descricao: string;
  /** Valor em reais (positivo). */
  valor: number;
  /** Só em transferências: true quando o dinheiro saiu da conta. */
  transferenciaSaida?: boolean;
  categoriaNome: string;
  tag?: string;
  /** Presente em compras no cartão — exibe logo do banco no lugar do ícone de categoria. */
  bancoId?: string;
  /** Valor persistido na coluna `conta_cartao` (compatível com edição). */
  meioPagamento: string;
  /** Pix, Crédito, Débito, Dinheiro — coluna opcional `meio_pagamento`. */
  meioPagamentoTipo?: string;
  /** Data yyyy-mm-dd (fuso local). */
  dataISO: string;
  /** Quando preenchido, o lançamento pertence a uma série recorrente. */
  recorrencia_id?: string | null;
  /** Tags livres vindas da coluna `tags_extras` (TEXT[]). */
  tags_extras?: string[];
};

/** Seeder para a tela Extrato — será substituído por API / store. */
