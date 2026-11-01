import { createClient } from "@supabase/supabase-js";
import { pluggyConfigurado } from "@/lib/pluggy/cliente";
import { carregarNomesTitular, sincronizarBanco } from "@/lib/pluggy/sincronizar";
import { enviarAlertasDoDia } from "@/lib/notificacoes/alertas";

export const maxDuration = 60;

/**
 * Rotina diária (Vercel Cron, ver vercel.json): sincroniza o banco do dono do app,
 * confirma o que as regras reconhecem e envia os avisos do dia — mesmo com o app fechado.
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>`; sem ele, recusa.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dono = process.env.FINFLOW_EMAIL_DONO?.trim().toLowerCase();
  if (!chaveServico || !dono) {
    return Response.json({ erro: "Rotina diária não configurada." }, { status: 503 });
  }

  // Cliente de serviço: ignora RLS, por isso todo acesso filtra pelo id do dono.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuarios, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("[cron] usuários", error);
    return Response.json({ erro: "Falha ao localizar o usuário." }, { status: 500 });
  }
  const user = usuarios.users.find((u) => u.email?.toLowerCase() === dono);
  if (!user) return Response.json({ erro: "Dono não encontrado." }, { status: 404 });

  let novas = 0;
  let automaticas = 0;
  try {
    if (pluggyConfigurado()) {
      const nomes = await carregarNomesTitular(db, user.id, user.user_metadata);
      const r = await sincronizarBanco(db, user.id, nomes);
      novas = r.contas.reduce((a, c) => a + c.novas, 0);
      automaticas = r.contas.reduce((a, c) => a + c.automaticas, 0);
    }
  } catch (e) {
    // Mesmo sem sincronizar, os avisos (fatura, orçamento) continuam valendo.
    console.error("[cron] sincronização", e);
  }

  const avisos = await enviarAlertasDoDia(db, user.id, { novas, automaticas }).catch((e) => {
    console.error("[cron] avisos", e);
    return [];
  });
  return Response.json({ novas, automaticas, avisos });
}
