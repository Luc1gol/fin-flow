/** Tipos das agregações da tela Análise (/relatorios). */

export type PeriodoRelatorioId = "7d" | "mes" | "3m" | "ano";

export type PontoFluxo = {
  label: string;
  entradas: number;
  saidas: number;
};

export type GastoPorTag = { tag: string; valor: number };

export type GastoPorCartao = { nome: string; valor: number };

/** Visão da composição de gastos. */
export type VisaoComposicao = "categoria" | "cartao" | "tag";

/** Um item agrupado da composição, já com % e cor para exibir. */
export type FatiaGasto = { nome: string; valor: number; pct: number; cor: string };

/** Lançamento como vem do Supabase, normalizado para a tela. */
export type LancamentoRelatorioRow = {
  id: string;
  tipo: string;
  valor: unknown;
  data: string;
  descricao: string | null;
  tag: string | null;
  conta_cartao: string | null;
  tags_extras: string[];
};

/** Totais de um período (transferências nunca entram). */
export type TotaisPeriodo = { entradas: number; saidas: number };
