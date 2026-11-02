import { normalizarTexto } from "@/lib/importacao/classificar";

/**
 * Aplicar e resgatar investimento não é gastar nem ganhar: o dinheiro continua seu, só muda
 * de lugar. Por isso esses movimentos são gravados como transferência (fora de entradas e
 * saídas) com a categoria "Investimentos": aplicação com valor negativo, resgate positivo.
 */
export const CATEGORIA_INVESTIMENTOS = "Investimentos";

export function ehCategoriaInvestimento(categoria: string | null | undefined): boolean {
  return normalizarTexto(categoria ?? "") === "investimentos";
}

/**
 * Converte uma receita/despesa com categoria "Investimentos" em transferência com sinal.
 * `valor` é o valor do formulário (positivo) ou o já gravado; demais casos passam iguais.
 */
export function ajustarInvestimento<T extends string>(
  tipo: T,
  valor: number,
  categoria: string | null | undefined,
): { tipo: T | "transferencia"; valor: number } {
  if (!ehCategoriaInvestimento(categoria)) return { tipo, valor };
  if (tipo === "despesa") return { tipo: "transferencia", valor: -Math.abs(valor) };
  if (tipo === "receita") return { tipo: "transferencia", valor: Math.abs(valor) };
  return { tipo, valor };
}
