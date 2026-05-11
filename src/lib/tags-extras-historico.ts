import { supabase } from "@/lib/supabase";
import {
  coalesceTagsExtrasFromUnknown,
  sanitizeTagsExtrasList,
} from "@/lib/tags-extras-coalesce";

/** Tags únicas já presentes em `lancamentos.tags_extras` (mesma ideia do filtro do extrato). */
export async function fetchDistinctTagsExtrasHistoricoForUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("tags_extras")
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    return [];
  }

  const rows = (data ?? []) as { tags_extras?: unknown }[];
  const flat = rows.flatMap((r) =>
    coalesceTagsExtrasFromUnknown(r.tags_extras),
  );

  return sanitizeTagsExtrasList(flat);
}
