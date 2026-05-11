"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { syncGoogleProfileIfNeeded } from "@/lib/auth-google-profile-sync";
import { supabase } from "@/lib/supabase";

import { AuthLoadingShell } from "./AuthLoadingShell";

const AUTH_RESOLVE_FAILSAFE_MS = 12_000;

/**
 * Protege rotas do app principal: exige sessão Supabase (auth no browser).
 * Para validação já no edge com cookies, seria preciso `@supabase/ssr` + middleware.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let mounted = true;
    let failSafeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFailSafe = () => {
      if (failSafeTimer != null) {
        clearTimeout(failSafeTimer);
        failSafeTimer = null;
      }
    };

    const armFailSafe = () => {
      clearFailSafe();
      failSafeTimer = setTimeout(() => {
        if (!mounted) return;
        console.warn(
          "[AuthGuard] Timeout ao resolver sessão — destravando UI (estado: sem sessão).",
        );
        setSession((prev) => (prev === undefined ? null : prev));
      }, AUTH_RESOLVE_FAILSAFE_MS);
    };

    armFailSafe();

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        clearFailSafe();
        if (!mounted) return;
        if (error) {
          console.error("[AuthGuard] getSession:", error);
          setSession(null);
          return;
        }
        setSession(data.session ?? null);
      })
      .catch((err) => {
        clearFailSafe();
        if (!mounted) return;
        console.error("[AuthGuard] getSession rejeitado:", err);
        setSession(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      try {
        clearFailSafe();
        setSession(nextSession);

        if (event === "SIGNED_IN" && nextSession) {
          void syncGoogleProfileIfNeeded(nextSession);
        }
      } catch (err) {
        console.error("[AuthGuard] onAuthStateChange:", err);
        try {
          setSession(nextSession ?? null);
        } catch {
          /* noop */
        }
      }
    });

    return () => {
      mounted = false;
      clearFailSafe();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) router.replace("/login");
  }, [router, session]);

  useEffect(() => {
    console.log(
      "Estado Global de Loading (AuthGuard):",
      session === undefined
        ? "pendente"
        : session === null
          ? "sem_sessão → /login"
          : "autenticado",
      "Usuário:",
      session?.user?.id ?? null,
    );
  }, [session]);

  if (session === undefined || session === null) {
    return <AuthLoadingShell />;
  }

  return <>{children}</>;
}
