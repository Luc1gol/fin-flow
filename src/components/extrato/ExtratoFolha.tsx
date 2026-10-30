"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Folha de vidro: sobe de baixo no celular e vira diálogo central no computador.
 * Renderiza em portal no `body` (só chamar no cliente).
 */
export function ExtratoFolha({
  titulo,
  tituloId,
  subtitulo,
  acaoTopo,
  onClose,
  fecharDesabilitado = false,
  rotuloFundo = "Fechar",
  rodape,
  camada = "z-[70]",
  children,
}: {
  titulo: ReactNode;
  tituloId: string;
  subtitulo?: ReactNode;
  acaoTopo?: ReactNode;
  onClose: () => void;
  fecharDesabilitado?: boolean;
  rotuloFundo?: string;
  rodape?: ReactNode;
  camada?: string;
  children?: ReactNode;
}) {
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    let idB = 0;
    const idA = requestAnimationFrame(() => {
      idB = requestAnimationFrame(() => setEntrada(true));
    });
    return () => {
      cancelAnimationFrame(idA);
      cancelAnimationFrame(idB);
    };
  }, []);

  const fechar = () => {
    if (fecharDesabilitado) return;
    onClose();
  };

  return createPortal(
    <div className={`fixed inset-0 ${camada} flex items-end justify-center lg:items-center lg:p-6`}>
      <button
        type="button"
        tabIndex={-1}
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${
          entrada ? "opacity-100" : "opacity-0"
        }`}
        aria-label={rotuloFundo}
        onClick={fechar}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`vidro relative isolate flex max-h-[min(92dvh,720px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-3xl transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:max-w-md lg:rounded-3xl ${
          entrada
            ? "translate-y-0 opacity-100 lg:scale-100"
            : "translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0"
        }`}
      >
        {/* Escurece o vidro para manter a leitura sobre a lista. */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-fundo/60" aria-hidden />
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2 lg:pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="truncate text-base font-semibold text-texto">
              {titulo}
            </h2>
            {subtitulo ? (
              <p className="truncate text-xs text-texto-3">{subtitulo}</p>
            ) : null}
          </div>
          {acaoTopo}
          <button
            type="button"
            onClick={fechar}
            disabled={fecharDesabilitado}
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-texto-2 transition hover:bg-white/[0.06] hover:text-texto disabled:opacity-40"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        {children !== undefined ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
            {children}
          </div>
        ) : null}
        {rodape ? (
          <div className="shrink-0 border-t border-borda px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4">
            {rodape}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
