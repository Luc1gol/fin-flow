/**
 * Normaliza `tags_extras` vindo do Supabase/PG (array, string de array PG, ausente).
 * Evita que .flatMap quebre quando o driver devolve formato inesperado.
 */
export function coalesceTagsExtrasFromUnknown(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s || s === "{}") return [];
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .map((x) => String(x ?? "").trim())
            .filter((x) => x.length > 0);
        }
      } catch {
        /* formato texto do PG abaixo */
      }
    }
    const inner = s.replace(/^\{/, "").replace(/\}$/, "").trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((t) => t.replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);
}

/** Lista final deduplicada, ordenada, sem vazios (para payloads e filtros). */
export function sanitizeTagsExtrasList(tags: readonly string[]): string[] {
  const uniq = new Set<string>();
  for (const t of tags) {
    const x = String(t ?? "").trim();
    if (x) uniq.add(x);
  }
  return [...uniq].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

/** Inclui o texto pendente no input (equiv. a Enter), sem duplicar. */
export function mergePendingTagInputIntoSeleccionadas(
  seleccionadas: readonly string[],
  tagInputRaw: string,
): string[] {
  const pendente = tagInputRaw.replace(/,/g, " ").trim();
  if (!pendente) return sanitizeTagsExtrasList([...seleccionadas]);
  const base = sanitizeTagsExtrasList([...seleccionadas]);
  if (base.includes(pendente)) return base;
  return sanitizeTagsExtrasList([...base, pendente]);
}

/** Valor armazenado em `tags_extras` no Postgres: array limpio ou null se vazio. */
export function tagsExtrasPayloadForDb(
  tags: readonly string[],
): string[] | null {
  const clean = sanitizeTagsExtrasList(tags);
  return clean.length > 0 ? clean : null;
}
