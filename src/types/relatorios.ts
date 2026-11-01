/** Tipos da tela Análise (/relatorios). */

export type PeriodoRelatorioId = "7d" | "mes" | "3m" | "ano";

/** Abas da Análise (valor de `?aba=` na URL). */
export type AbaAnaliseId = "geral" | "para-onde" | "cartao" | "habitos";

export type PontoFluxo = {
  label: string;
  entradas: number;
  saidas: number;
  /** Mês em andamento (barra parcial). */
  parcial?: boolean;
};

/** Visão da composição de gastos. */
export type VisaoComposicao = "categoria" | "meio" | "tag";

/** Meio de pagamento normalizado para a análise. */
export type MeioAnalise = "Crédito" | "Débito" | "Pix" | "Dinheiro" | "Outros";

/** Um item agrupado da composição, já com % e cor para exibir. */
export type FatiaGasto = {
  nome: string;
  valor: number;
  pct: number;
  cor: string;
  /** Quantidade de lançamentos no grupo. */
  qtd: number;
  /** Variação vs o mesmo pedaço do período anterior (%), null sem base. */
  variacao: number | null;
  /** Nomes agrupados (em "Outros", os grupos que foram juntados). */
  membros: string[];
};

/** Lançamento como vem do Supabase, normalizado para a tela. */
export type LancamentoRelatorioRow = {
  id: string;
  tipo: string;
  /** Sempre positivo para receita/despesa (transferências não entram na análise). */
  valor: number;
  data: string;
  descricao: string | null;
  tag: string | null;
  conta_cartao: string | null;
  meio_pagamento: string | null;
  recorrencia_id: string | null;
  tags_extras: string[];
};

/** Totais de um período (transferências nunca entram). */
export type TotaisPeriodo = { entradas: number; saidas: number };

/** Conta de cartão de crédito sincronizada pelo banco. */
export type ContaCartaoAnalise = {
  id: string;
  nome: string;
  /** Id da instituição em `BANCOS` (via cartão vinculado ou a própria conta). */
  bancoId: string | null;
  /** Total devido hoje (fatura atual segundo o banco). */
  saldo: number | null;
  limite: number | null;
  limiteDisponivel: number | null;
  faturaVencimento: string | null;
};

/** Fatura do banco (tabela `faturas`). */
export type FaturaAnalise = {
  id: string;
  contaId: string;
  vencimento: string;
  valorTotal: number;
  valorPago: number;
};

/** Dados brutos carregados para a análise de um período. */
export type DadosAnalise = {
  periodo: PeriodoRelatorioId;
  /** "Agora" no momento da busca: base de todas as janelas de datas. */
  ref: Date;
  /** Receitas e despesas desde o início da janela mais antiga até +6 meses (parcelas futuras). */
  lancamentos: LancamentoRelatorioRow[];
  contasCartao: ContaCartaoAnalise[];
  faturas: FaturaAnalise[];
  /** Cartões manuais (nome persistido "Cartão X" → banco), para logos. */
  bancoPorCartao: Record<string, string>;
  erro: boolean;
};
