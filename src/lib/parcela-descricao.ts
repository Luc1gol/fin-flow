/** Detecta descrição que contém trecho `(k/n)`. */
export function descricaoTemParcela(descricao: string): boolean {
  return /\(\d+\/\d+\)/.test(descricao);
}

/** Ex.: `Renner (1/3)` → `Renner`. Exige parcela no final. */
export function extrairNomeBaseParcela(descricao: string): string | null {
  const m = descricao.match(/^(.*?)\s*\(\d+\/\d+\)\s*$/);
  const base = m?.[1]?.trim();
  return base && base.length > 0 ? base : null;
}

/** Índice e total na parcela no final da descrição, ex.: `(1/3)`. */
export function extrairFracParcelaFim(
  descricao: string,
): { i: number; n: number } | null {
  const m = descricao.trim().match(/\((\d+)\/(\d+)\)\s*$/);
  if (!m) return null;
  const i = Number.parseInt(m[1], 10);
  const n = Number.parseInt(m[2], 10);
  if (
    !Number.isFinite(i) ||
    !Number.isFinite(n) ||
    i <= 0 ||
    n <= 0 ||
    i > n
  ) {
    return null;
  }
  return { i, n };
}
