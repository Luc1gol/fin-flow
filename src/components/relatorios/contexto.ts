import type { DadosAnalise, LancamentoRelatorioRow, PeriodoRelatorioId } from "@/types/relatorios";
import type { Intervalo } from "@/components/relatorios/dados";

/** O que todas as abas recebem: dados brutos + janelas do período já filtradas. */
export type ContextoAnalise = {
  dados: DadosAnalise;
  periodo: PeriodoRelatorioId;
  ref: Date;
  atual: Intervalo;
  anterior: Intervalo;
  /** Receitas/despesas do período atual (até hoje). */
  atuais: LancamentoRelatorioRow[];
  /** Receitas/despesas do mesmo pedaço do período anterior. */
  anteriores: LancamentoRelatorioRow[];
  /** "no mesmo período do mês passado" etc. */
  comparacaoNo: string;
  /** Banco de um "Cartão X" (para logo), ou null. */
  bancoDoCartao: (contaCartao: string | null | undefined) => string | null;
};
