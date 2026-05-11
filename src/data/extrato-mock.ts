export type LancamentoExtrato = {
  id: string;
  tipo: "receita" | "despesa";
  descricao: string;
  /** Valor em reais (positivo). */
  valor: number;
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
export const LANCAMENTOS_EXTRATO_MOCK: LancamentoExtrato[] = [
  {
    id: "ex-1",
    tipo: "despesa",
    descricao: "Supermercado Pão de Açúcar",
    valor: 187.45,
    categoriaNome: "Alimentação",
    tag: "Mercado",
    meioPagamento: "Débito",
    bancoId: "itau",
    dataISO: "2026-05-06",
  },
  {
    id: "ex-2",
    tipo: "despesa",
    descricao: "Spotify Premium",
    valor: 21.9,
    categoriaNome: "Lazer",
    meioPagamento: "Crédito",
    bancoId: "nubank",
    dataISO: "2026-05-06",
  },
  {
    id: "ex-3",
    tipo: "receita",
    descricao: "Salário — ACME Ltda",
    valor: 5800,
    categoriaNome: "Salário",
    tag: "CLT",
    meioPagamento: "Pix",
    dataISO: "2026-05-06",
  },
  {
    id: "ex-4",
    tipo: "despesa",
    descricao: "Uber para o aeroporto",
    valor: 45,
    categoriaNome: "Transporte",
    meioPagamento: "Crédito",
    bancoId: "nubank",
    dataISO: "2026-05-05",
  },
  {
    id: "ex-5",
    tipo: "despesa",
    descricao: "Farmácia Droga Raia",
    valor: 62.3,
    categoriaNome: "Saúde",
    meioPagamento: "Pix",
    dataISO: "2026-05-05",
  },
  {
    id: "ex-6",
    tipo: "despesa",
    descricao: "Cinema — ingressos",
    valor: 64,
    categoriaNome: "Lazer",
    tag: "Viagem SP",
    meioPagamento: "Crédito",
    bancoId: "itau",
    dataISO: "2026-05-05",
  },
  {
    id: "ex-7",
    tipo: "receita",
    descricao: "Freelance design — Nota 1023",
    valor: 1200,
    categoriaNome: "Trabalho extra",
    meioPagamento: "Pix",
    dataISO: "2026-05-04",
  },
  {
    id: "ex-8",
    tipo: "despesa",
    descricao: "Conta de luz Enel",
    valor: 198.77,
    categoriaNome: "Moradia",
    meioPagamento: "Débito",
    bancoId: "bb",
    dataISO: "2026-05-04",
  },
  {
    id: "ex-9",
    tipo: "despesa",
    descricao: "Padaria Central",
    valor: 18.5,
    categoriaNome: "Alimentação",
    meioPagamento: "Pix",
    dataISO: "2026-05-01",
  },
];
