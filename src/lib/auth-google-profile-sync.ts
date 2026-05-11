import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Sincroniza nome do Google OAuth na tabela `profiles` (não bloqueia o fluxo de auth).
 */
export async function syncGoogleProfileIfNeeded(
  nextSession: Session,
): Promise<void> {
  try {
    const metadata = nextSession.user?.user_metadata as
      | Record<string, unknown>
      | undefined;
    const fullNameRaw =
      typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";
    if (!fullNameRaw) return;

    const firstName =
      fullNameRaw.split(/\s+/).filter(Boolean)[0] ?? fullNameRaw;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: nextSession.user.id,
        nome_completo: fullNameRaw,
        apelido: firstName,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[auth] upsert profiles:", error);
    }
  } catch (err) {
    console.error("[auth] syncGoogleProfileIfNeeded:", err);
  }
}
