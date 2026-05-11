"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Search, X } from "lucide-react";
import {
  type BancoInstituicao,
  bancosOrdenados,
  iniciaisInstituicao,
  logoGoogleFaviconUrl,
  logoIconHorseUrl,
} from "@/data/bancos";

function noopSubscribe(): () => void {
  return () => {};
}

type LogoTier = "horse" | "google";

function BancoListaLogo({ banco }: { banco: BancoInstituicao }) {
  const [tier, setTier] = useState<LogoTier | "fallback">("horse");
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

  const ini = useMemo(() => iniciaisInstituicao(banco.nome), [banco.nome]);
  const src =
    tier === "horse"
      ? logoIconHorseUrl(banco.domain)
      : tier === "google"
        ? logoGoogleFaviconUrl(banco.domain)
        : null;

  if (tier === "fallback") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-100">
        {ini}
      </span>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
      <img
        src={src!}
        alt=""
        className="h-full w-full object-cover"
        onError={handleImgError}
      />
    </div>
  );
}

type InstituicaoPickerSheetProps = {
  open: boolean;
  selectedId: string;
  onClose: () => void;
  onSelect: (bancoId: string) => void;
};

export function InstituicaoPickerSheet({
  open,
  selectedId,
  onClose,
  onSelect,
}: InstituicaoPickerSheetProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const todos = bancosOrdenados();
    const t = q.trim().toLowerCase();
    if (!t) return todos;
    return todos.filter(
      (b) =>
        b.nome.toLowerCase().includes(t) || b.id.toLowerCase().includes(t),
    );
  }, [q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!isClient || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Fechar lista de instituições"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-banco-titulo"
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1] mx-auto flex max-h-[min(88dvh,560px)] w-full max-w-[430px] flex-col rounded-t-[28px] border border-white/12 bg-[#121212]/98 shadow-[0_-14px_56px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-300"
            aria-label="Voltar"
            onClick={onClose}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <h2
            id="pick-banco-titulo"
            className="min-w-0 flex-1 text-center text-base font-semibold text-white"
          >
            Instituição
          </h2>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 hover:text-white"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="shrink-0 px-4 pb-3 pt-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar banco..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#10B981]/45"
            />
          </div>
        </div>

        <ul
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4"
          role="listbox"
          aria-label="Bancos"
        >
          {lista.map((b) => {
            const sel = b.id === selectedId;
            return (
              <li key={b.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onSelect(b.id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    sel
                      ? "bg-[#10B981]/14 ring-1 ring-[#10B981]/40"
                      : "hover:bg-white/[0.05]"
                  }`}
                >
                  <BancoListaLogo banco={b} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {b.nome}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
