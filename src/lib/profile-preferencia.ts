/** Preferência de chamada no perfil (coluna legacy `nome_preferencia` ou `apelido`). */
export function apelidoPreferenciaFromRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  const a = typeof o.apelido === "string" ? o.apelido.trim() : "";
  if (a) return a;
  const n =
    typeof o.nome_preferencia === "string"
      ? o.nome_preferencia.trim()
      : "";
  return n;
}
