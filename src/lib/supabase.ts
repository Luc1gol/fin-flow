import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "[supabase] Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local",
  );
}

/**
 * Cliente Supabase único do app: use este módulo para queries e auth a partir do browser
 * ou de Server Components/actions (anon key + RLS). Evite duplicar `createClient` em outros arquivos.
 */
export const supabase = createClient(url, anonKey);
