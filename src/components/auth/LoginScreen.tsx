"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Lock, Mail } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Botao, campoClasse } from "@/components/ui/base";
import { FundoAmbiente } from "@/components/layout/FundoAmbiente";

const campo = `${campoClasse} h-10 rounded-xl`;
const rotulo = "mb-1 block text-xs font-medium text-texto-2";

function LogoGoogle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29V6.6H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

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
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-fundo px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <FundoAmbiente />

      <main className="relative flex flex-1 flex-col items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <header className="mb-5 flex flex-col items-center text-center">
            <div
              className="vidro-marca flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold tracking-tight"
              aria-hidden
            >
              F
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-texto">
              FinFlow
            </h1>
            <p className="mt-0.5 text-sm text-texto-2">
              {isLoginMode
                ? "O controle financeiro da sua vida."
                : "Crie sua conta para começar."}
            </p>
          </header>

          <div className="vidro rounded-3xl p-5 sm:p-6">
            <form onSubmit={handleAuth} className="space-y-3">
              {!isLoginMode ? (
                <>
                  <div>
                    <label htmlFor="cadastro-nome" className={rotulo}>
                      Nome completo
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
                      className={`${campo} disabled:opacity-60`}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="cadastro-apelido" className={rotulo}>
                      Como deseja ser chamado?
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
                      className={`${campo} disabled:opacity-60`}
                    />
                  </div>
                </>
              ) : null}

              <div>
                <label htmlFor="login-email" className={rotulo}>
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
                    aria-hidden
                  />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className={`${campo} pl-9 disabled:opacity-60`}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-texto-2"
                  >
                    Senha
                  </label>
                  {isLoginMode ? (
                    <a
                      href="#"
                      className="text-xs font-medium text-marca transition-colors hover:brightness-125"
                      onClick={(e) => e.preventDefault()}
                    >
                      Esqueci a senha
                    </a>
                  ) : null}
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
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
                    className={`${campo} pl-9 disabled:opacity-60`}
                  />
                </div>
              </div>

              {successMessage ? (
                <p
                  className="rounded-xl border border-positivo/30 bg-positivo/10 px-3 py-2 text-center text-xs text-positivo"
                  role="status"
                >
                  {successMessage}
                </p>
              ) : null}

              {error ? (
                <p
                  className="rounded-xl border border-negativo/30 bg-negativo/10 px-3 py-2 text-center text-xs text-negativo"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <Botao
                type="submit"
                variante="primario"
                disabled={isLoading}
                className="mt-1 w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : null}
                {isLoading
                  ? "Processando…"
                  : isLoginMode
                    ? "Entrar"
                    : "Criar conta"}
              </Botao>
            </form>

            <div className="my-4 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-borda-forte" />
              <span className="text-xs text-texto-3">ou</span>
              <span className="h-px flex-1 bg-borda-forte" />
            </div>

            <Botao
              variante="secundario"
              onClick={() => void handleGoogleLogin()}
              disabled={isLoading || isGoogleLoading}
              className="w-full"
            >
              {isGoogleLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <LogoGoogle />
              )}
              {isGoogleLoading ? "Conectando…" : "Continuar com o Google"}
            </Botao>
          </div>

          <p className="mt-5 text-center text-sm text-texto-2">
            {isLoginMode ? "Ainda não tem uma conta?" : "Já tem uma conta?"}{" "}
            <button
              type="button"
              onClick={toggleAuthMode}
              className="inline-flex min-h-9 items-center font-semibold text-marca transition-colors hover:brightness-125"
            >
              {isLoginMode ? "Criar conta" : "Fazer login"}
            </button>
          </p>
        </div>
      </main>

      <div className="h-[env(safe-area-inset-bottom)] shrink-0" aria-hidden />
    </div>
  );
}
