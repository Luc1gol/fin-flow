"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Lock,
  User,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apelidoPreferenciaFromRow } from "@/lib/profile-preferencia";

function iniciaisDeNome(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0];
  const b = parts[parts.length - 1][0];
  return (a && b ? `${a}${b}` : (parts[0].slice(0, 2) || "?")).toUpperCase();
}

export function PerfilScreen() {
  const [contaNome, setContaNome] = useState("—");
  const [contaEmail, setContaEmail] = useState("");

  const [secaoAtiva, setSecaoAtiva] = useState<"info" | "seguranca" | null>(
    null,
  );

  const [nomeCompleto, setNomeCompleto] = useState("");
  const [apelido, setApelido] = useState("");
  const [perfilCarregado, setPerfilCarregado] = useState(false);

  const [salvandoInfo, setSalvandoInfo] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [saindoDaConta, setSaindoDaConta] = useState(false);
  const logoutEmAndamentoRef = useRef(false);

  function toggleSecao(secao: "info" | "seguranca") {
    setSecaoAtiva((prev) => (prev === secao ? null : secao));
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (cancel) return;
      if (uErr || !user) {
        setContaNome("—");
        setContaEmail("");
        setNomeCompleto("");
        setApelido("");
        setPerfilCarregado(true);
        return;
      }
      const md = user.user_metadata as Record<string, unknown> | undefined;
      const nomeMeta =
        typeof md?.nome === "string" && md.nome.trim() ? md.nome.trim() : "";
      const email = user.email ?? "";
      const slug = email.split("@")[0]?.trim().replace(/\./g, " ") ?? "";
      const nome = nomeMeta || slug || "Financeiro";
      setContaNome(nome);
      setContaEmail(email);

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("nome_completo, apelido")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancel) {
        if (pErr) {
          console.error(pErr);
          setNomeCompleto(nome);
          setApelido("");
        } else {
          const nomeDb =
            profile && typeof (profile as Record<string, unknown>).nome_completo === "string"
              ? String((profile as Record<string, unknown>).nome_completo).trim()
              : "";
          const apelidoDb =
            profile && typeof (profile as Record<string, unknown>).apelido === "string"
              ? String((profile as Record<string, unknown>).apelido).trim()
              : "";

          setNomeCompleto(nomeDb || nome);
          setApelido(apelidoDb || "");
        }
        setPerfilCarregado(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function handleSalvarInformacoes() {
    if (salvandoInfo) return;
    setSalvandoInfo(true);
    try {
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr || !user) {
        window.alert("Não foi possível identificar o usuário. Entre novamente.");
        return;
      }

      const apelidoTrim = apelido.trim();
      const nomeTrim = nomeCompleto.trim();

      if (!nomeTrim) {
        window.alert("Preencha o Nome Completo.");
        return;
      }

      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          nome_completo: nomeTrim,
          apelido: apelidoTrim,
        },
        { onConflict: "id" },
      );

      if (error) {
        console.error(error);
        window.alert(
          error.message ??
            "Não foi possível salvar. Verifique se a tabela `profiles` existe e tem as colunas `nome_completo` e `apelido`.",
        );
        return;
      }

      setContaNome(nomeTrim);
      window.alert("Informações salvas com sucesso.");
    } catch (err) {
      console.error(err);
      window.alert("Erro ao salvar as informações. Tente novamente.");
    } finally {
      setSalvandoInfo(false);
    }
  }

  async function handleAtualizarEmail() {
    if (loadingEmail) return;
    setLoadingEmail(true);
    try {
      const email = novoEmail.trim();
      if (!email) {
        window.alert("Digite o novo e-mail.");
        return;
      }
      if (!email.includes("@") || !email.includes(".")) {
        window.alert("Digite um e-mail válido.");
        return;
      }
      if (email.toLowerCase() === contaEmail.trim().toLowerCase()) {
        window.alert("O novo e-mail é igual ao e-mail atual.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        console.error(error);
        window.alert(error.message ?? "Não foi possível atualizar o e-mail.");
        return;
      }
      setNovoEmail("");
      window.alert(
        "Verifique a caixa de entrada do seu novo e-mail para confirmar a alteração.",
      );
    } catch (err) {
      console.error(err);
      window.alert("Erro ao atualizar o e-mail. Tente novamente.");
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleAtualizarSenha(e: FormEvent) {
    e.preventDefault();
    if (loadingSenha) return;
    setLoadingSenha(true);
    try {
      const minLen = 6;
      if (novaSenha.length < minLen) {
        window.alert(`A nova senha deve ter pelo menos ${minLen} caracteres.`);
        return;
      }
      if (novaSenha !== confirmarSenha) {
        window.alert("As senhas não coincidem.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });
      if (error) {
        console.error(error);
        window.alert(error.message ?? "Não foi possível atualizar a senha.");
        return;
      }
      setNovaSenha("");
      setConfirmarSenha("");
      window.alert("Senha atualizada com sucesso.");
    } catch (err) {
      console.error(err);
      window.alert("Erro ao atualizar a senha. Tente novamente.");
    } finally {
      setLoadingSenha(false);
    }
  }

  const limparEstadoLocalPerfil = useCallback(() => {
    setContaNome("—");
    setContaEmail("");
    setSecaoAtiva(null);
    setNomeCompleto("");
    setApelido("");
    setPerfilCarregado(false);
    setNovoEmail("");
    setNovaSenha("");
    setConfirmarSenha("");
  }, []);

  const handleLogout = useCallback(async () => {
    if (logoutEmAndamentoRef.current) return;
    logoutEmAndamentoRef.current = true;
    setSaindoDaConta(true);
    let redirecionar = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) {
        console.error(error);
        window.alert(
          error.message ?? "Não foi possível encerrar a sessão. Tente novamente.",
        );
        return;
      }
      limparEstadoLocalPerfil();
      redirecionar = true;
      window.location.replace("/login");
    } catch (err) {
      console.error("Erro ao sair da conta:", err);
      window.alert("Erro ao sair da conta. Tente novamente.");
    } finally {
      if (!redirecionar) {
        logoutEmAndamentoRef.current = false;
        setSaindoDaConta(false);
      }
    }
  }, [limparEstadoLocalPerfil]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
      <header className="relative mb-2 flex h-11 shrink-0 items-center justify-center px-4">
        <Link
          href="/inicio"
          className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Voltar para o início"
        >
          <ArrowLeft className="h-5 w-5 stroke-[2]" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold text-white">Meu Perfil</h1>
      </header>

      <div className="flex flex-1 min-h-0 w-full flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 w-full overflow-y-auto px-4 pb-32 pt-2">
          <div className="mx-auto flex w-full max-w-[398px] flex-col">
            {(() => {
              const emailPrefix = (contaEmail || "").split("@")[0] || "";
              const nomeTopo =
                apelido.trim() || nomeCompleto.trim() || emailPrefix || "—";
              const iniciaisTopo =
                apelido.trim() || nomeCompleto.trim() || contaNome.trim() || emailPrefix;
              return (
            <section
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
              aria-label="Informações da conta"
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] text-2xl font-bold tracking-tight text-white shadow-lg shadow-black/40 ring-2 ring-white/10"
                  aria-hidden
                >
                  {perfilCarregado ? iniciaisDeNome(iniciaisTopo) : "—"}
                </div>
                <p className="mt-5 text-lg font-semibold tracking-tight text-white">
                  {nomeTopo}
                </p>
                <p className="mt-1 text-sm text-zinc-400">{contaEmail || "—"}</p>
              </div>
            </section>
              );
            })()}

            <div className="mt-6 space-y-4">
              {/* Informações Pessoais */}
              <div className="overflow-hidden rounded-xl border border-zinc-700/60">
                <button
                  type="button"
                  onClick={() => toggleSecao("info")}
                  className={`flex w-full items-center gap-3 bg-zinc-800/50 p-4 text-left transition-colors hover:bg-zinc-800/60 ${secaoAtiva === "info" ? "rounded-t-xl" : "rounded-xl"}`}
                  aria-expanded={secaoAtiva === "info"}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#10B981]">
                    <User className="h-5 w-5 stroke-[1.75]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">
                      Informações Pessoais
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      Apelido e nome completo
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${secaoAtiva === "info" ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>

                {secaoAtiva === "info" ? (
                  <div className="bg-zinc-900/50 p-4">
                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="perfil-apelido"
                          className="text-xs font-medium text-zinc-500"
                        >
                          Como deseja ser chamado?
                        </label>
                        <input
                          id="perfil-apelido"
                          name="apelido"
                          type="text"
                          value={apelido}
                          onChange={(e) => setApelido(e.target.value)}
                          disabled={!perfilCarregado}
                          placeholder="Ex.: Lu, Dani…"
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                          autoComplete="nickname"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="perfil-nome-completo"
                          className="text-xs font-medium text-zinc-500"
                        >
                          Nome Completo
                        </label>
                        <input
                          id="perfil-nome-completo"
                          name="nomeCompleto"
                          type="text"
                          value={nomeCompleto}
                          onChange={(e) => setNomeCompleto(e.target.value)}
                          disabled={!perfilCarregado}
                          placeholder="Seu nome"
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                          autoComplete="name"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={salvandoInfo || !perfilCarregado}
                      onClick={() => void handleSalvarInformacoes()}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-sm font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] transition-[filter] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {salvandoInfo ? (
                        <Loader2
                          className="h-4 w-4 shrink-0 animate-spin"
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : null}
                      {salvandoInfo ? "Salvando…" : "Salvar Informações"}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Segurança */}
              <div className="overflow-hidden rounded-xl border border-zinc-700/60">
                <button
                  type="button"
                  onClick={() => toggleSecao("seguranca")}
                  className={`flex w-full items-center gap-3 bg-zinc-800/50 p-4 text-left transition-colors hover:bg-zinc-800/60 ${secaoAtiva === "seguranca" ? "rounded-t-xl" : "rounded-xl"}`}
                  aria-expanded={secaoAtiva === "seguranca"}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#10B981]">
                    <Lock className="h-5 w-5 stroke-[1.75]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">
                      Segurança e Acesso
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      E-mail e senha
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${secaoAtiva === "seguranca" ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>

                {secaoAtiva === "seguranca" ? (
                  <div className="bg-zinc-900/50 p-4">
                    <div>
                      <label
                        htmlFor="perfil-novo-email"
                        className="text-xs font-medium text-zinc-500"
                      >
                        Novo E-mail
                      </label>
                      <input
                        id="perfil-novo-email"
                        name="novoEmail"
                        type="email"
                        value={novoEmail}
                        onChange={(e) => setNovoEmail(e.target.value)}
                        placeholder="novo@email.com"
                        className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20"
                        autoComplete="email"
                      />
                      <button
                        type="button"
                        disabled={loadingEmail}
                        onClick={() => void handleAtualizarEmail()}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-sm font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] transition-[filter] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingEmail ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                        {loadingEmail ? "Processando…" : "Atualizar E-mail"}
                      </button>
                    </div>

                    <hr className="my-4 border-zinc-800" />

                    <form onSubmit={handleAtualizarSenha}>
                      <div>
                        <label
                          htmlFor="perfil-nova-senha"
                          className="text-xs font-medium text-zinc-500"
                        >
                          Nova Senha
                        </label>
                        <input
                          id="perfil-nova-senha"
                          name="novaSenha"
                          type="password"
                          autoComplete="new-password"
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                          placeholder="••••••••"
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      <div className="mt-4">
                        <label
                          htmlFor="perfil-confirmar-senha"
                          className="text-xs font-medium text-zinc-500"
                        >
                          Confirmar Nova Senha
                        </label>
                        <input
                          id="perfil-confirmar-senha"
                          name="confirmarSenha"
                          type="password"
                          autoComplete="new-password"
                          value={confirmarSenha}
                          onChange={(e) => setConfirmarSenha(e.target.value)}
                          placeholder="••••••••"
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-emerald-500/0 transition placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loadingSenha}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] py-3 text-sm font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] transition-[filter] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingSenha ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                        {loadingSenha ? "Processando…" : "Atualizar Senha"}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-12">
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={saindoDaConta}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-950/35 py-3.5 text-sm font-semibold text-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.08)_inset] transition-colors hover:border-red-500/55 hover:bg-red-950/45 hover:text-red-300 active:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saindoDaConta ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
                {saindoDaConta ? "Saindo…" : "Sair da conta"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
