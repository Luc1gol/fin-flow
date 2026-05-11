import { supabase } from "@/lib/supabase";

/** Tags/categorias distintas já usadas pelo usuário (`lancamentos.tag`). */
export async function fetchDistinctTagsForUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("tag")
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    return [];
  }

  const uniq = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { tag?: string | null };
    const t = r.tag != null ? String(r.tag).trim() : "";
    if (t) uniq.add(t);
  }

  return [...uniq].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}
