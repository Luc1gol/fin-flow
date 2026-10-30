/** Tipos das agregações da tela Relatórios. */

export type PeriodoRelatorioId = "7d" | "mes" | "3m" | "ano";

export type PontoFluxo = {
  label: string;
  entradas: number;
  saidas: number;
};

export type GastoPorTag = { tag: string; valor: number };

export type GastoPorCartao = { nome: string; valor: number };
