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
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Botao, Card, campoClasse } from "@/components/ui/base";

const campo = `${campoClasse} h-10 rounded-xl`;

/** Linha de configuração (estilo Ajustes do iOS) que expande conteúdo abaixo. */
function LinhaExpansivel({
  icone,
  titulo,
  subtitulo,
  aberta,
  onToggle,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  subtitulo?: string;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        className="flex min-h-12 w-full touch-manipulation items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-white/[0.03]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-texto">{titulo}</span>
          {subtitulo ? (
            <span className="block truncate text-xs text-texto-3">{subtitulo}</span>
          ) : null}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-texto-3 transition-transform ${aberta ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {aberta ? <div className="px-4 pb-4 pt-1">{children}</div> : null}
    </div>
  );
}

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

  const [secaoAtiva, setSecaoAtiva] = useState<"email" | "senha" | null>(
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

  function toggleSecao(secao: "email" | "senha") {
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

  const emailPrefix = (contaEmail || "").split("@")[0] || "";
  const nomeTopo = apelido.trim() || nomeCompleto.trim() || emailPrefix || "—";
  const iniciaisTopo =
    apelido.trim() || nomeCompleto.trim() || contaNome.trim() || emailPrefix;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="relative flex h-12 shrink-0 items-center justify-center px-4">
        <Link
          href="/inicio"
          className="vidro-suave absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-texto-2 transition-colors hover:text-texto"
          aria-label="Voltar para o início"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold text-texto">Perfil</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          {/* Identidade */}
          <section
            className="flex items-center gap-3.5 px-1 pt-1"
            aria-label="Informações da conta"
          >
            <div
              className="vidro-marca flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold tracking-tight"
              aria-hidden
            >
              {perfilCarregado ? iniciaisDeNome(iniciaisTopo) : "—"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-texto">
                {perfilCarregado ? nomeTopo : "Carregando…"}
              </p>
              <p className="truncate text-sm text-texto-2">{contaEmail || "—"}</p>
            </div>
          </section>

          {/* Seus dados */}
          <section aria-labelledby="perfil-secao-dados">
            <h2
              id="perfil-secao-dados"
              className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-texto-3"
            >
              Seus dados
            </h2>
            <Card className="divide-y divide-borda overflow-hidden">
              <label
                htmlFor="perfil-nome-completo"
                className="flex min-h-12 items-center gap-3 px-4"
              >
                <span className="w-28 shrink-0 text-sm text-texto">Nome completo</span>
                <input
                  id="perfil-nome-completo"
                  name="nomeCompleto"
                  type="text"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  disabled={!perfilCarregado}
                  placeholder="Seu nome"
                  className="h-11 min-w-0 flex-1 bg-transparent text-right text-sm text-texto outline-none placeholder:text-texto-3 disabled:opacity-60"
                  autoComplete="name"
                />
              </label>
              <label
                htmlFor="perfil-apelido"
                className="flex min-h-12 items-center gap-3 px-4"
              >
                <span className="w-28 shrink-0 text-sm text-texto">Apelido</span>
                <input
                  id="perfil-apelido"
                  name="apelido"
                  type="text"
                  value={apelido}
                  onChange={(e) => setApelido(e.target.value)}
                  disabled={!perfilCarregado}
                  placeholder="Como deseja ser chamado?"
                  className="h-11 min-w-0 flex-1 bg-transparent text-right text-sm text-texto outline-none placeholder:text-texto-3 disabled:opacity-60"
                  autoComplete="nickname"
                />
              </label>
            </Card>
            <Botao
              variante="primario"
              disabled={salvandoInfo || !perfilCarregado}
              onClick={() => void handleSalvarInformacoes()}
              className="mt-3 w-full"
            >
              {salvandoInfo ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              {salvandoInfo ? "Salvando…" : "Salvar alterações"}
            </Botao>
          </section>

          {/* Conta */}
          <section aria-labelledby="perfil-secao-conta">
            <h2
              id="perfil-secao-conta"
              className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-texto-3"
            >
              Conta
            </h2>
            <Card className="divide-y divide-borda overflow-hidden">
              <LinhaExpansivel
                icone={<Mail className="h-4 w-4" aria-hidden />}
                titulo="Alterar e-mail"
                subtitulo={contaEmail || undefined}
                aberta={secaoAtiva === "email"}
                onToggle={() => toggleSecao("email")}
              >
                <label
                  htmlFor="perfil-novo-email"
                  className="mb-1 block text-xs font-medium text-texto-2"
                >
                  Novo e-mail
                </label>
                <input
                  id="perfil-novo-email"
                  name="novoEmail"
                  type="email"
                  inputMode="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="novo@email.com"
                  className={campo}
                  autoComplete="email"
                />
                <Botao
                  variante="primario"
                  disabled={loadingEmail}
                  onClick={() => void handleAtualizarEmail()}
                  className="mt-3 w-full"
                >
                  {loadingEmail ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  {loadingEmail ? "Processando…" : "Atualizar e-mail"}
                </Botao>
              </LinhaExpansivel>

              <LinhaExpansivel
                icone={<KeyRound className="h-4 w-4" aria-hidden />}
                titulo="Alterar senha"
                aberta={secaoAtiva === "senha"}
                onToggle={() => toggleSecao("senha")}
              >
                <form onSubmit={handleAtualizarSenha} className="space-y-3">
                  <div>
                    <label
                      htmlFor="perfil-nova-senha"
                      className="mb-1 block text-xs font-medium text-texto-2"
                    >
                      Nova senha
                    </label>
                    <input
                      id="perfil-nova-senha"
                      name="novaSenha"
                      type="password"
                      autoComplete="new-password"
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className={campo}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="perfil-confirmar-senha"
                      className="mb-1 block text-xs font-medium text-texto-2"
                    >
                      Confirmar nova senha
                    </label>
                    <input
                      id="perfil-confirmar-senha"
                      name="confirmarSenha"
                      type="password"
                      autoComplete="new-password"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      className={campo}
                    />
                  </div>
                  <Botao
                    type="submit"
                    variante="primario"
                    disabled={loadingSenha}
                    className="w-full"
                  >
                    {loadingSenha ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : null}
                    {loadingSenha ? "Processando…" : "Atualizar senha"}
                  </Botao>
                </form>
              </LinhaExpansivel>
            </Card>
          </section>

          {/* Sair */}
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={saindoDaConta}
              className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 px-4 text-sm font-semibold text-negativo transition-colors active:bg-white/[0.03] disabled:opacity-50"
            >
              {saindoDaConta ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {saindoDaConta ? "Saindo…" : "Sair da conta"}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
