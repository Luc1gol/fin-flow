/**
 * Dados fictícios para relatórios — substituíveis por agregações reais.
 */

export type PeriodoRelatorioId = "7d" | "mes" | "3m" | "ano";

export type PontoFluxo = {
  label: string;
  entradas: number;
  saidas: number;
};

/** Série temporal por aba de período */
export const EVOLUCAO_FLUXO_MOCK: Record<PeriodoRelatorioId, PontoFluxo[]> = {
  "7d": [
    { label: "Seg", entradas: 4200, saidas: 3100 },
    { label: "Ter", entradas: 800, saidas: 1800 },
    { label: "Qua", entradas: 200, saidas: 950 },
    { label: "Qui", entradas: 6100, saidas: 2400 },
    { label: "Sex", entradas: 900, saidas: 4100 },
    { label: "Sáb", entradas: 0, saidas: 680 },
    { label: "Dom", entradas: 150, saidas: 320 },
  ],
  mes: [
    { label: "S1", entradas: 12000, saidas: 8200 },
    { label: "S2", entradas: 5800, saidas: 9100 },
    { label: "S3", entradas: 6400, saidas: 7300 },
    { label: "S4", entradas: 7000, saidas: 6900 },
  ],
  "3m": [
    { label: "Mar", entradas: 18500, saidas: 14200 },
    { label: "Abr", entradas: 19200, saidas: 15800 },
    { label: "Mai", entradas: 20100, saidas: 16100 },
  ],
  ano: [
    { label: "Jan", entradas: 17800, saidas: 15200 },
    { label: "Fev", entradas: 18100, saidas: 14900 },
    { label: "Mar", entradas: 18500, saidas: 14200 },
    { label: "Abr", entradas: 19200, saidas: 15800 },
    { label: "Mai", entradas: 20100, saidas: 16100 },
    { label: "Jun", entradas: 19800, saidas: 15900 },
    { label: "Jul", entradas: 20400, saidas: 16300 },
    { label: "Ago", entradas: 19600, saidas: 17100 },
    { label: "Set", entradas: 21100, saidas: 16800 },
    { label: "Out", entradas: 20800, saidas: 17400 },
    { label: "Nov", entradas: 19900, saidas: 16900 },
    { label: "Dez", entradas: 21500, saidas: 18200 },
  ],
};

export type GastoPorTag = { tag: string; valor: number };

/** Gastos agregados por tag de evento. */
export const GASTOS_POR_TAG_MOCK: GastoPorTag[] = [
  { tag: "Viagem SP", valor: 4280 },
  { tag: "Carro", valor: 3100 },
  { tag: "Mercado", valor: 2420 },
  { tag: "Reforma", valor: 1890 },
  { tag: "Pets", valor: 640 },
];

export type GastoPorCartao = { nome: string; valor: number };

export const GASTOS_POR_CARTAO_MOCK: GastoPorCartao[] = [
  { nome: "Nubank", valor: 3200 },
  { nome: "Itaú", valor: 1850 },
  { nome: "Inter", valor: 800 },
  { nome: "C6 Bank", valor: 420 },
];

export type TopGastoMock = {
  id: string;
  descricao: string;
  categoriaNome: string;
  valor: number;
  tag?: string;
  bancoId?: string;
};

export const TOP3_GASTOS_MOCK: TopGastoMock[] = [
  {
    id: "t1",
    descricao: "Passagens e hotel — SP",
    categoriaNome: "Lazer",
    valor: 2850,
    tag: "Viagem SP",
    bancoId: "itau",
  },
  {
    id: "t2",
    descricao: "Oficina + peças revisão",
    categoriaNome: "Transporte",
    valor: 1890,
    tag: "Carro",
  },
  {
    id: "t3",
    descricao: "Supermercado atacado",
    categoriaNome: "Alimentação",
    valor: 942.5,
    tag: "Mercado",
    bancoId: "nubank",
  },
];
