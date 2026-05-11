"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleUser, Loader2, Lock, Mail } from "lucide-react";

import { supabase } from "@/lib/supabase";

export function LoginScreen() {
  const router = useRouter();
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [apelido, setApelido] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);

  function toggleAuthMode() {
    setIsLoginMode((v) => !v);
    setError("");
    setSuccessMessage("");
    setNomeCompleto("");
    setApelido("");
    setEmail("");
    setSenha("");
  }

  // Se o OAuth redirecionar para fora, este finally pode nunca rodar.
  // Ainda assim, no erro/cancelamento do popup ele garante feedback.
  // (No fluxo padrão do Supabase, a página vai redirecionar e recriar o estado.)

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      if (isLoginMode) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.push("/inicio");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        const { error: profileErr } = await supabase.from("profiles").upsert({
          id: data.user.id,
          nome_completo: nomeCompleto.trim(),
          apelido: apelido.trim(),
        });
        if (profileErr) {
          setError(profileErr.message ?? "Erro ao salvar perfil do usuário.");
          return;
        }
      }
      if (data.session) {
        setNomeCompleto("");
        setApelido("");
        setEmail("");
        setSenha("");
        router.push("/inicio");
      } else {
        setSuccessMessage(
          "Conta criada. Verifique seu e-mail para confirmar o cadastro antes de entrar.",
        );
        setNomeCompleto("");
        setApelido("");
        setEmail("");
        setSenha("");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (isLoading || isGoogleLoading) return;
    setIsGoogleLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
    } catch (err) {
      console.error(err);
      setError("Não foi possível continuar com o Google. Tente novamente.");
      setIsGoogleLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#121212] px-6">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto w-full max-w-sm">
          <header className="mb-8 text-center">
            <h1 className="font-semibold tracking-tight text-[clamp(1.75rem,5vw,2.125rem)] text-zinc-50">
              Fin-Flow
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              O controle financeiro da sua vida.
            </p>
          </header>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-md">
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLoginMode ? (
                <>
                  <div>
                    <label
                      htmlFor="cadastro-nome"
                      className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      NOME COMPLETO
                    </label>
                    <input
                      id="cadastro-nome"
                      name="nomeCompleto"
                      type="text"
                      autoComplete="name"
                      placeholder="Digite seu nome"
                      value={nomeCompleto}
                      onChange={(e) => setNomeCompleto(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-white/10 bg-[#121212] py-2.5 px-3 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition-[box-shadow,border-color] placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cadastro-apelido"
                      className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      COMO DESEJA SER CHAMADO?
                    </label>
                    <input
                      id="cadastro-apelido"
                      name="apelido"
                      type="text"
                      autoComplete="nickname"
                      placeholder="Seu apelido ou nome curto"
                      value={apelido}
                      onChange={(e) => setApelido(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-white/10 bg-[#121212] py-2.5 px-3 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition-[box-shadow,border-color] placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                    />
                  </div>
                </>
              ) : null}

              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden
                  />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-[#121212] py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition-[box-shadow,border-color] placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden
                  />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete={
                      isLoginMode ? "current-password" : "new-password"
                    }
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-[#121212] py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition-[box-shadow,border-color] placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                  />
                </div>
                {isLoginMode ? (
                  <div className="mt-2 flex justify-end">
                    <Link
                      href="#"
                      className="text-sm text-emerald-400 transition-colors hover:text-emerald-300"
                      onClick={(e) => e.preventDefault()}
                    >
                      Esqueci a senha
                    </Link>
                  </div>
                ) : null}
              </div>

              {successMessage ? (
                <p
                  className="rounded-xl border border-[#10B981]/35 bg-[#10B981]/10 px-3 py-2 text-center text-xs text-emerald-200/95"
                  role="status"
                >
                  {successMessage}
                </p>
              ) : null}

              {error ? (
                <p
                  className="rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-center text-xs text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-sm font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] transition-[filter] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
                {isLoading
                  ? "Processando…"
                  : isLoginMode
                    ? "Entrar"
                    : "Criar Conta"}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/5 px-3 text-zinc-500 backdrop-blur-sm">
                  ou
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={isLoading || isGoogleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent py-3 text-sm font-medium text-white transition-colors hover:border-white/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGoogleLoading ? (
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin opacity-90"
                  strokeWidth={2}
                  aria-hidden
                />
              ) : (
                <CircleUser className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              )}
              {isGoogleLoading ? "Conectando…" : "Continuar com o Google"}
            </button>
          </div>
        </div>
      </div>

      <footer className="shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 text-center text-sm text-zinc-500">
        {isLoginMode ? (
          <>
            Ainda não tem uma conta?{" "}
            <button
              type="button"
              onClick={toggleAuthMode}
              className="font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Criar conta
            </button>
          </>
        ) : (
          <>
            Já tem uma conta?{" "}
            <button
              type="button"
              onClick={toggleAuthMode}
              className="font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Fazer login
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
