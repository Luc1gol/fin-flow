import { supabase } from "@/lib/supabase";
import { CATEGORIAS_PADRAO } from "@/lib/categorias-padrao";
import { normalizarTexto } from "@/lib/importacao/classificar";

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

/**
 * Categorias do usuário ordenadas da mais usada para a menos usada, juntando lançamentos,
 * orçamentos, regras aprendidas e as categorias padrão. Nomes que só diferem em acento ou
 * maiúsculas viram um só (fica a grafia mais usada).
 */
export async function carregarCategoriasPorUso(): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [...CATEGORIAS_PADRAO];

  const [lanc, orc, regras] = await Promise.all([
    supabase.from("lancamentos").select("tag").eq("user_id", userId).not("tag", "is", null).range(0, 4999),
    supabase.from("orcamentos").select("categoria"),
    supabase.from("regras_categorizacao").select("categoria").not("categoria", "is", null),
  ]);

  // chave normalizada → contagem por grafia
  const grafias = new Map<string, Map<string, number>>();
  const contar = (nome: string | null | undefined, peso: number) => {
    const n = String(nome ?? "").trim();
    if (!n) return;
    const k = normalizarTexto(n);
    const m = grafias.get(k) ?? new Map<string, number>();
    m.set(n, (m.get(n) ?? 0) + peso);
    grafias.set(k, m);
  };
  for (const r of lanc.data ?? []) contar(r.tag as string, 1);
  for (const r of orc.data ?? []) contar(r.categoria as string, 1);
  for (const r of regras.data ?? []) contar(r.categoria as string, 1);
  for (const p of CATEGORIAS_PADRAO) contar(p, 0);

  return [...grafias.values()]
    .map((m) => {
      const ordenadas = [...m.entries()].sort((a, b) => b[1] - a[1]);
      return { nome: ordenadas[0]![0], usos: ordenadas.reduce((a, [, n]) => a + n, 0) };
    })
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
    .map((c) => c.nome);
}
