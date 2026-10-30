"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { bancosOrdenados } from "@/data/bancos";
import { campoClasse } from "@/components/ui/base";
import { BancoLogo } from "@/components/cartoes/BancoLogo";

function noopSubscribe(): () => void {
  return () => {};
}

type InstituicaoPickerSheetProps = {
  open: boolean;
  selectedId: string;
  onClose: () => void;
  onSelect: (bancoId: string) => void;
};

export function InstituicaoPickerSheet(props: InstituicaoPickerSheetProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient || !props.open) return null;
  // Montado só quando aberto: a busca começa vazia a cada abertura, sem reset em efeito.
  return createPortal(<PickerConteudo {...props} />, document.body);
}

function PickerConteudo({ selectedId, onClose, onSelect }: InstituicaoPickerSheetProps) {
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const todos = bancosOrdenados();
    const t = q.trim().toLowerCase();
    if (!t) return todos;
    return todos.filter(
      (b) => b.nome.toLowerCase().includes(t) || b.id.toLowerCase().includes(t),
    );
  }, [q]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar lista de instituições"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-banco-titulo"
        className="vidro relative z-[1] mx-auto flex h-[min(80dvh,560px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl !bg-superficie/90 lg:max-w-md lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-2 lg:pt-4">
          <h2 id="pick-banco-titulo" className="text-base font-semibold text-texto">
            Instituição
          </h2>
          <button
            type="button"
            className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-texto-2 hover:bg-white/[0.06] hover:text-texto"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar banco…"
              aria-label="Buscar banco"
              className={`${campoClasse} pl-9`}
            />
          </div>
        </div>

        <ul
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]"
          role="listbox"
          aria-label="Bancos"
        >
          {lista.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-texto-3">Nenhum banco encontrado.</li>
          ) : null}
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
                  className={`flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    sel ? "bg-marca/12" : "hover:bg-white/[0.05] active:bg-white/[0.05]"
                  }`}
                >
                  <BancoLogo banco={b} className="h-8 w-8" />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${sel ? "font-semibold text-marca" : "text-texto"}`}
                  >
                    {b.nome}
                  </span>
                  {sel ? <Check className="h-4 w-4 shrink-0 text-marca" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
