import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { pluggyConfigurado } from "@/lib/pluggy/cliente";
import {
  carregarNomesTitular,
  diagnosticoParcelas,
  sincronizarBanco,
  situacaoDosBancos,
} from "@/lib/pluggy/sincronizar";

export const maxDuration = 60;

/**
 * Autentica pelo token do Supabase enviado pelo app e devolve um cliente que age
 * como o usuário (RLS aplicada). Só o dono configurado em FINFLOW_EMAIL_DONO pode
 * usar a conexão, já que as credenciais da Pluggy são de uma pessoa só.
 */
async function autenticarRequisicao(
  request: Request,
): Promise<{ db: SupabaseClient; user: User; permitido: boolean } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ erro: "Não autenticado." }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }
  const dono = process.env.FINFLOW_EMAIL_DONO?.trim().toLowerCase();
  const permitido = Boolean(dono) && data.user.email?.toLowerCase() === dono;
  return { db, user: data.user, permitido };
}

export async function GET(request: Request) {
  const auth = await autenticarRequisicao(request);
  if (auth instanceof Response) return auth;
  const disponivel = pluggyConfigurado() && auth.permitido;
  if (!disponivel) return Response.json({ disponivel, bancos: [] });
  if (new URL(request.url).searchParams.get("diagnostico") === "parcelas") {
    return Response.json({ parcelas: await diagnosticoParcelas() });
  }
  // Situação de cada banco para os cards de Revisar; se a Pluggy falhar, a tela abre igual.
  const bancos = await situacaoDosBancos().catch((e) => {
    console.error("[open-finance] situação", e);
    return [];
  });
  return Response.json({ disponivel, bancos });
}

export async function POST(request: Request) {
  const auth = await autenticarRequisicao(request);
  if (auth instanceof Response) return auth;
  if (!pluggyConfigurado()) {
    return Response.json({ erro: "Conexão com o banco não configurada." }, { status: 503 });
  }
  if (!auth.permitido) {
    return Response.json({ erro: "Conexão disponível só para o dono do app." }, { status: 403 });
  }

  try {
    const { db, user } = auth;
    const nomes = await carregarNomesTitular(db, user.id, user.user_metadata);
    return Response.json(await sincronizarBanco(db, user.id, nomes));
  } catch (e) {
    console.error("[open-finance]", e);
    return Response.json(
      { erro: "Falha ao buscar dados do banco. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
