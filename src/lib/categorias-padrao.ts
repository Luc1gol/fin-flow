/**
 * Categorias nativas do app (sugestões fixas).
 * Também aparecem nos filtros do extrato (ícones em `ExtratoScreen`).
 */
export const CATEGORIAS_PADRAO = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Saúde",
  "Educação",
  "Lazer",
  "Salário",
  "Trabalho extra",
] as const satisfies readonly string[];

/** Mescla padrões com tags vindas do banco, deduplica e ordena (pt-BR). */
export function mergeCategoriasPadraoComBanco(
  tagsDoBanco: readonly string[],
): string[] {
  const doBanco = tagsDoBanco
    .map((t) => String(t ?? "").trim())
    .filter((t) => t.length > 0);
  const combinadas = [...CATEGORIAS_PADRAO, ...doBanco];
  const unicas = Array.from(new Set(combinadas));
  return unicas.sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}
