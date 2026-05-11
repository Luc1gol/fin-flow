"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Edit2, Landmark, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  type BancoInstituicao,
  bancosOrdenados,
  getBancoById,
  iniciaisInstituicao,
  logoGoogleFaviconUrl,
  logoIconHorseUrl,
} from "@/data/bancos";

type LogoTier = "horse" | "google";

function BancoLogo({
  banco,
  sizeClass = "h-10 w-10",
}: {
  banco: BancoInstituicao;
  sizeClass?: string;
}) {
  const [tier, setTier] = useState<LogoTier | "fallback">("horse");
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetTier = useCallback(
    (updater: (prev: LogoTier | "fallback") => LogoTier | "fallback") => {
      queueMicrotask(() => {
        if (!mountedRef.current) return;
        setTier(updater);
      });
    },
    [],
  );

  const handleImgError = useCallback(() => {
    safeSetTier((t) => (t === "horse" ? "google" : "fallback"));
  }, [safeSetTier]);

  const ini = useMemo(() => iniciaisInstituicao(banco.nome), [banco.nome]);
  const src =
    tier === "horse"
      ? logoIconHorseUrl(banco.domain)
      : tier === "google"
        ? logoGoogleFaviconUrl(banco.domain)
        : null;

  if (tier === "fallback") {
    const ok = ini.length >= 1 && ini !== "?";
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-100 ${sizeClass}`}
      >
        {ok ? (
          ini
        ) : (
          <Landmark className="h-3.5 w-3.5 text-zinc-300" strokeWidth={2} aria-hidden />
        )}
      </span>
    );
  }

  return (
    <div className={`shrink-0 overflow-hidden rounded-full ${sizeClass}`}>
      <img
        src={src!}
        alt=""
        className="h-full w-full object-cover"
        onError={handleImgError}
      />
    </div>
  );
}

type CartaoUsuario = {
  id: string;
  /** Id da instituição em `BANCOS` (ex.: nubank, itau). */
  banco: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
};

function parseIntSafe(v: unknown): number {
  const n =
    typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapCartaoRow(row: Record<string, unknown>): CartaoUsuario {
  const bancoRaw = String(row.banco ?? "").trim();
  return {
    id: String(row.id),
    banco: bancoRaw || "outros",
    nome: String(row.nome ?? "").trim(),
    diaFechamento: parseIntSafe(row.dia_fechamento),
    diaVencimento: parseIntSafe(row.dia_vencimento),
  };
}

const BANCO_PADRAO_ID = "nubank";

function CartaoVisual({
  cartao,
  onEdit,
  onDelete,
}: {
  cartao: CartaoUsuario;
  onEdit: (c: CartaoUsuario) => void;
  onDelete: (id: string) => void;
}) {
  const bancoInfo = useMemo(
    () => getBancoById(cartao.banco || "outros"),
    [cartao.banco],
  );

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border-x border-b border-white/10 ${bancoInfo.colorClass} p-5 shadow-[0_22px_50px_-12px_rgba(0,0,0,0.72)] shadow-black/50 backdrop-blur-sm`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl bg-[#121212]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: `radial-gradient(ellipse 115% 50% at 50% -12%, ${bancoInfo.radialGlow} 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 38%)`,
        }}
        aria-hidden
      />

      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <BancoLogo key={bancoInfo.domain} banco={bancoInfo} sizeClass="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-semibold leading-snug tracking-tight text-white sm:text-[1.35rem]">
                {bancoInfo.nome}
              </h2>
              {cartao.nome ? (
                <p className="mt-1 truncate text-sm font-medium text-zinc-400">
                  {cartao.nome}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => onEdit(cartao)}
              className="rounded-xl border border-white/10 bg-black/35 p-2 text-zinc-500 transition hover:border-[#10B981]/40 hover:text-[#10B981]"
              aria-label="Editar cartão"
            >
              <Edit2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDelete(cartao.id)}
              className="rounded-xl border border-white/10 bg-black/35 p-2 text-zinc-500 transition hover:border-red-500/40 hover:text-red-400"
              aria-label="Excluir cartão"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Fechamento
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-white">
              Dia {cartao.diaFechamento}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Vencimento
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-[#10B981]">
              Dia {cartao.diaVencimento}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CartoesScreen() {
  const [cartoes, setCartoes] = useState<CartaoUsuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cartaoEditando, setCartaoEditando] = useState<string | null>(null);
  const [selectedBanco, setSelectedBanco] = useState<string>(BANCO_PADRAO_ID);
  const [nome, setNome] = useState("");
  const [diaFechamento, setDiaFechamento] = useState(1);
  const [diaVencimento, setDiaVencimento] = useState(10);

  const bancosLista = useMemo(() => bancosOrdenados(), []);

  const bancoModalVisual = useMemo(
    () => getBancoById(selectedBanco || "outros"),
    [selectedBanco],
  );

  useEffect(() => {
    async function fetchCartoes() {
      setIsLoading(true);
      try {
        const {
          data: { user },
          error: uErr,
        } = await supabase.auth.getUser();
        if (uErr || !user) {
          console.error(uErr);
          setCartoes([]);
          return;
        }

        const bundle = await supabase
          .from("cartoes")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const error = bundle.error;
        let data = bundle.data;

        if (error) {
          const retry = await supabase
            .from("cartoes")
            .select("*")
            .eq("user_id", user.id);
          if (retry.error) {
            console.error(error, retry.error);
            setCartoes([]);
            return;
          }
          data = retry.data;
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        setCartoes(rows.map(mapCartaoRow));
      } finally {
        setIsLoading(false);
      }
    }

    fetchCartoes();
  }, []);

  const cartoesOrdenados = useMemo(
    () =>
      [...cartoes].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      ),
    [cartoes],
  );

  function resetForm() {
    setCartaoEditando(null);
    setSelectedBanco(BANCO_PADRAO_ID);
    setNome("");
    setDiaFechamento(1);
    setDiaVencimento(10);
  }

  const handleEditar = useCallback((cartao: CartaoUsuario) => {
    setSelectedBanco(cartao.banco || "outros");
    setNome(cartao.nome);
    setDiaFechamento(cartao.diaFechamento);
    setDiaVencimento(cartao.diaVencimento);
    setCartaoEditando(cartao.id);
    setIsModalOpen(true);
  }, []);

  const handleSalvarCartao = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!nome.trim()) {
        window.alert("Preencha o nome do cartão.");
        return;
      }
      if (!cartaoEditando && !selectedBanco.trim()) {
        window.alert("Selecione o banco do cartão.");
        return;
      }
      const df = Math.min(31, Math.max(1, Math.round(diaFechamento)));
      const dv = Math.min(31, Math.max(1, Math.round(diaVencimento)));

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr || !user) {
        console.error(uErr);
        window.alert("Não foi possível identificar o usuário. Entre novamente.");
        return;
      }

      if (cartaoEditando) {
        const updatePayload = {
          nome: nome.trim(),
          dia_fechamento: df,
          dia_vencimento: dv,
        };
        const { data: updated, error } = await supabase
          .from("cartoes")
          .update(updatePayload)
          .eq("id", cartaoEditando)
          .eq("user_id", user.id)
          .select("*")
          .single();

        if (error) {
          console.error(error);
          window.alert(error.message ?? "Erro ao atualizar o cartão.");
          return;
        }

        if (updated) {
          const mapped = mapCartaoRow(updated as Record<string, unknown>);
          setCartoes((prev) =>
            prev.map((c) => (c.id === cartaoEditando ? mapped : c)),
          );
          resetForm();
          setIsModalOpen(false);
        }
        return;
      }

      const insertRow = {
        user_id: user.id,
        banco: selectedBanco,
        nome: nome.trim(),
        dia_fechamento: df,
        dia_vencimento: dv,
      };

      const { data: inserted, error } = await supabase
        .from("cartoes")
        .insert(insertRow)
        .select("*")
        .single();

      if (error) {
        console.error(error);
        window.alert(error.message ?? "Erro ao salvar o cartão.");
        return;
      }

      if (inserted) {
        setCartoes((prev) => [
          ...prev,
          mapCartaoRow(inserted as Record<string, unknown>),
        ]);
        resetForm();
        setIsModalOpen(false);
      }
    },
    [selectedBanco, nome, diaFechamento, diaVencimento, cartaoEditando],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este cartão?")) {
      return;
    }
    const { error } = await supabase.from("cartoes").delete().eq("id", id);
    if (error) {
      console.error(error);
      window.alert(error.message ?? "Não foi possível excluir o cartão.");
      return;
    }
    setCartoes((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Meus Cartões
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Gerencie instituição e datas de ciclo dos seus cartões.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex shrink-0 items-center gap-2 rounded-full bg-[#10B981] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#10B981]/35 transition hover:bg-[#0ea271] active:opacity-95"
        >
          <Plus className="h-5 w-5 stroke-[2.25]" aria-hidden />
          Novo Cartão
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-28">
        {isLoading ? (
          <div className="space-y-3 px-0.5">
            <p className="text-center text-sm text-zinc-500">Carregando…</p>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-3xl border border-white/10 bg-white/[0.06]"
              />
            ))}
          </div>
        ) : cartoesOrdenados.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum cartão cadastrado. Use &quot;Novo Cartão&quot; para adicionar o
            primeiro.
          </p>
        ) : (
          cartoesOrdenados.map((c) => (
            <CartaoVisual
              key={c.id}
              cartao={c}
              onEdit={handleEditar}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            aria-label="Fechar formulário"
            onClick={() => {
              resetForm();
              setIsModalOpen(false);
            }}
          />
          <div
            className="relative z-[1] mx-auto mb-0 w-full max-w-[430px] rounded-t-[1.65rem] border border-white/12 bg-[#121212]/98 shadow-[0_-16px_64px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:mb-auto sm:rounded-3xl sm:shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-cartoes-titulo"
          >
            <div className="border-b border-white/10 px-5 py-4">
              <h2
                id="modal-cartoes-titulo"
                className="text-lg font-semibold text-white"
              >
                {cartaoEditando ? "Editar Cartão" : "Novo Cartão"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {cartaoEditando
                  ? "A instituição não pode ser alterada. Edite nome e datas."
                  : "Escolha o banco e preencha os dados do cartão."}
              </p>
            </div>
            <form
              onSubmit={handleSalvarCartao}
              className="flex max-h-[min(85dvh,620px)] flex-col"
            >
              <div className="max-h-[min(58dvh,380px)] space-y-4 overflow-y-auto px-5 py-5">
                {!cartaoEditando ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Banco
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Lista em ordem alfabética — o logo aparecerá no cartão.
                    </p>
                    <div className="mt-3 flex max-h-60 flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.06] bg-black/20 p-1.5 pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
                      {bancosLista.map((b) => {
                        const ativo = selectedBanco === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBanco(b.id)}
                            className={`flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                              ativo
                                ? "border border-[#10B981]/45 bg-[#10B981]/14 ring-1 ring-[#10B981]/30"
                                : "border border-transparent bg-white/[0.05] hover:bg-white/[0.085]"
                            }`}
                          >
                            <BancoLogo key={b.domain} banco={b} sizeClass="h-9 w-9" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                              {b.nome}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {cartaoEditando ? (
                  <div className="pointer-events-none cursor-not-allowed opacity-50">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Banco
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Instituição vinculada a este cadastro não pode ser alterada.
                    </p>
                    <div
                      className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                      aria-readonly="true"
                    >
                      <BancoLogo
                        key={bancoModalVisual.domain}
                        banco={bancoModalVisual}
                        sizeClass="h-9 w-9"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
                        {bancoModalVisual.nome}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="cartao-nome"
                    className="text-xs font-medium uppercase tracking-wide text-zinc-500"
                  >
                    Nome do cartão
                  </label>
                  <input
                    id="cartao-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none ring-emerald-500/0 placeholder:text-zinc-600 focus:border-[#10B981]/35 focus:ring-2 focus:ring-[#10B981]/25"
                    placeholder="Ex.: Platinum, Gold…"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pb-2">
                  <div>
                    <label
                      htmlFor="cartao-fechar"
                      className="text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      Dia fechamento
                    </label>
                    <input
                      id="cartao-fechar"
                      type="number"
                      min={1}
                      max={31}
                      value={diaFechamento}
                      onChange={(e) =>
                        setDiaFechamento(
                          Number.parseInt(e.target.value, 10) || 1,
                        )
                      }
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm tabular-nums text-white outline-none focus:border-[#10B981]/35 focus:ring-2 focus:ring-[#10B981]/25"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cartao-venc"
                      className="text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      Dia vencimento
                    </label>
                    <input
                      id="cartao-venc"
                      type="number"
                      min={1}
                      max={31}
                      value={diaVencimento}
                      onChange={(e) =>
                        setDiaVencimento(
                          Number.parseInt(e.target.value, 10) || 1,
                        )
                      }
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm tabular-nums text-white outline-none focus:border-[#10B981]/35 focus:ring-2 focus:ring-[#10B981]/25"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 border-t border-white/10 px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="flex-1 rounded-2xl border border-white/15 bg-transparent py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-[#10B981] py-3.5 text-sm font-bold text-white shadow-inner shadow-black/25 transition hover:bg-[#0ea271]"
                >
                  {cartaoEditando ? "Atualizar" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
