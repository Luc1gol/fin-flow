"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Landmark, MoreVertical } from "lucide-react";
import type { CartaoCreditoUsuario } from "@/types/cartoes";
import {
  getBancoById,
  iniciaisInstituicao,
  logoGoogleFaviconUrl,
  logoIconHorseUrl,
  type BancoInstituicao,
} from "@/data/bancos";
import { getInvoiceStatusBadge } from "@/lib/fatura-cycle-badge";

type CartaoUsuarioCardProps = {
  cartao: CartaoCreditoUsuario;
  onEdit: () => void;
  onDelete: () => void;
};

type LogoTier = "horse" | "google";

function BancoAvatar({ banco }: { banco: BancoInstituicao }) {
  const [tier, setTier] = useState<LogoTier | "fallback">("horse");
  const ini = useMemo(() => iniciaisInstituicao(banco.nome), [banco.nome]);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setTier("horse");
  }, [banco.domain]);

  const safeSetTier = useCallback((updater: (prev: LogoTier | "fallback") => LogoTier | "fallback") => {
    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setTier(updater);
    });
  }, []);

  const handleImgError = useCallback(() => {
    safeSetTier((t) => (t === "horse" ? "google" : "fallback"));
  }, [safeSetTier]);

  const src =
    tier === "horse"
      ? logoIconHorseUrl(banco.domain)
      : tier === "google"
        ? logoGoogleFaviconUrl(banco.domain)
        : null;

  if (tier === "fallback") {
    const okIniciais = ini.length >= 1 && ini !== "?";
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[10px] font-bold leading-none tracking-tight text-zinc-100">
        {okIniciais ? (
          ini
        ) : (
          <Landmark className="h-3.5 w-3.5 text-zinc-300" strokeWidth={2} aria-hidden />
        )}
      </span>
    );
  }

  return (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
      <img
        src={src!}
        alt=""
        className="h-full w-full object-cover"
        onError={handleImgError}
      />
    </div>
  );
}

export function CartaoUsuarioCard({
  cartao,
  onEdit,
  onDelete,
}: CartaoUsuarioCardProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const banco = useMemo(
    () => getBancoById(cartao.bancoId),
    [cartao.bancoId],
  );

  const faturaBadge = useMemo(
    () =>
      getInvoiceStatusBadge(cartao.diaFechamento, cartao.diaVencimento),
    [cartao.diaFechamento, cartao.diaVencimento],
  );

  const valorFaturaFormatado = useMemo(() => {
    const n = Number(cartao.valorFatura);
    const seguro = Number.isFinite(n) ? n : 0;
    return seguro.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }, [cartao.valorFatura]);

  useEffect(() => {
    if (!menuAberto) return;
    function fecharAoClicarFora(ev: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(ev.target as Node)
      ) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", fecharAoClicarFora);
    return () => document.removeEventListener("mousedown", fecharAoClicarFora);
  }, [menuAberto]);

  function handleEditar() {
    setMenuAberto(false);
    onEdit();
  }

  function handleExcluir() {
    setMenuAberto(false);
    onDelete();
  }

  const apelido = cartao.nomeCartao.trim();

  return (
    <article
      className={`relative overflow-visible rounded-3xl border-x border-b border-white/10 ${banco.colorClass} p-5 shadow-xl shadow-black/40 backdrop-blur-sm`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl bg-[#121212]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: `radial-gradient(ellipse 115% 50% at 50% -12%, ${banco.radialGlow} 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 38%)`,
        }}
        aria-hidden
      />

      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <BancoAvatar banco={banco} />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-white">
                {banco.nome}
              </h2>
              {apelido ? (
                <p className="mt-0.5 truncate text-xs font-medium text-zinc-400">
                  {apelido}
                </p>
              ) : null}
              <p className="mt-1 font-mono text-sm tracking-[0.15em] text-white/85">
                •••• {cartao.final4}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span className={faturaBadge.className}>{faturaBadge.label}</span>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                aria-label="Opções do cartão"
                onClick={() => setMenuAberto((v) => !v)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/35 text-white/90 backdrop-blur-sm transition hover:bg-black/45 ${menuAberto ? "ring-2 ring-[#10B981]/35" : ""}`}
              >
                <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              {menuAberto ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 min-w-[11.5rem] rounded-2xl border border-white/12 bg-[#161616]/96 py-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-3 text-left text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.06]"
                    onClick={handleEditar}
                  >
                    Editar Cartão
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-3 text-left text-sm font-semibold text-[#F87171] transition hover:bg-red-500/10"
                    onClick={handleExcluir}
                  >
                    Excluir Cartão
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 mb-6 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            Valor da Fatura
          </p>
          <p
            className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-white"
            aria-label={`Valor da fatura ${valorFaturaFormatado}`}
          >
            {valorFaturaFormatado}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Fechamento
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-white">
              Dia {cartao.diaFechamento}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-sm">
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
