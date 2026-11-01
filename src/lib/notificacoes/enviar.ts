import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/** Uso exclusivo no servidor (chave privada VAPID). */

export type Notificacao = { titulo: string; corpo: string; url: string; tag?: string };

export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Envia para todos os aparelhos inscritos do usuário; remove inscrições vencidas. */
export async function enviarParaUsuario(
  db: SupabaseClient,
  userId: string,
  notificacao: Notificacao,
): Promise<number> {
  if (!pushConfigurado()) return 0;
  webpush.setVapidDetails(
    `mailto:${process.env.FINFLOW_EMAIL_DONO ?? "finflow@example.com"}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const { data: inscricoes } = await db
    .from("push_inscricoes")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  let enviadas = 0;
  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(notificacao),
      );
      enviadas++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: o aparelho cancelou a inscrição (app removido, permissão revogada).
      if (status === 404 || status === 410) {
        await db.from("push_inscricoes").delete().eq("id", i.id);
      } else {
        console.error("[push]", e);
      }
    }
  }
  return enviadas;
}

/**
 * Envia só se essa `chave` ainda não foi avisada (ex.: "orc-80-mercado-2026-11").
 * Devolve true se enviou.
 */
export async function enviarUmaVez(
  db: SupabaseClient,
  userId: string,
  chave: string,
  notificacao: Notificacao,
): Promise<boolean> {
  const { error } = await db.from("notificacoes_enviadas").insert({ user_id: userId, chave });
  if (error) return false; // já avisado (chave repetida) ou erro: não insiste
  await enviarParaUsuario(db, userId, notificacao);
  return true;
}
