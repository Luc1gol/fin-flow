"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { normalizarTexto } from "@/lib/importacao/classificar";

/**
 * Campo de categoria que funciona bem no iPhone (o `datalist` do Safari quase não aparece).
 * Abre uma folha de vidro com busca, as categorias do usuário (mais usadas primeiro) e a
 * opção de criar uma nova só digitando o nome.
 */
export function SeletorCategoria({
  valor,
  onChange,
  categorias,
  destaque = false,
  className = "",
  rotulo = "Categoria",
  variante = "campo",
}: {
  valor: string;
  onChange: (categoria: string) => void;
  /** Já ordenadas por uso (as mais usadas primeiro). */
  categorias: string[];
  /** Realça o campo vazio (ex.: transação que precisa de categoria). */
  destaque?: boolean;
  className?: string;
  rotulo?: string;
  /** "linha": sem borda e alinhado à direita, para listas no estilo Ajustes do iOS. */
  variante?: "campo" | "linha";
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        className={`flex w-full touch-manipulation items-center gap-2 text-sm transition-colors ${
          variante === "linha"
            ? "h-11 min-w-0 flex-1 justify-end text-right"
            : `h-9 rounded-lg border bg-white/[0.05] px-3 text-left ${destaque && !valor.trim() ? "border-alerta/50" : "border-borda-forte"}`
        } ${className}`}
      >
        {valor.trim() ? (
          <>
            <IconeCategoria categoria={valor} className="h-4 w-4 shrink-0 text-texto-2" />
            <span className={`min-w-0 truncate text-texto ${variante === "linha" ? "" : "flex-1"}`}>{valor}</span>
          </>
        ) : (
          <span className={`text-texto-3 ${variante === "linha" ? "" : "flex-1"}`}>Escolher{variante === "linha" ? "" : ` ${rotulo.toLowerCase()}`}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
      </button>
      {aberto
        ? createPortal(
            <FolhaCategorias
              valor={valor}
              categorias={categorias}
              rotulo={rotulo}
              onEscolher={(c) => {
                onChange(c);
                setAberto(false);
              }}
              onFechar={() => setAberto(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function FolhaCategorias({
  valor,
  categorias,
  rotulo,
  onEscolher,
  onFechar,
}: {
  valor: string;
  categorias: string[];
  rotulo: string;
  onEscolher: (c: string) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);
  const termo = normalizarTexto(busca);

  const filtradas = useMemo(
    () => (termo ? categorias.filter((c) => normalizarTexto(c).includes(termo)) : categorias),
    [categorias, termo],
  );
  // Só oferece "criar" quando o nome digitado ainda não existe (ignorando acentos e maiúsculas).
  const existeIgual = categorias.some((c) => normalizarTexto(c) === termo);
  const nomeNovo = busca.trim().replace(/\s+/g, " ");
  const nomeFormatado = nomeNovo ? nomeNovo[0]!.toUpperCase() + nomeNovo.slice(1) : "";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 lg:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Escolher ${rotulo.toLowerCase()}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] border border-borda-forte bg-superficie/95 shadow-2xl backdrop-blur-xl w-full max-w-[430px] flex-col rounded-t-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-3xl"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-base font-semibold text-texto">{rotulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-3 hover:text-texto">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="px-4 pb-2">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-borda-forte bg-white/[0.05] px-3">
            <Search className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
            <input
              ref={campoRef}
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeFormatado) {
                  e.preventDefault();
                  onEscolher(filtradas.length === 1 && !existeIgual ? filtradas[0]! : existeIgual ? categorias.find((c) => normalizarTexto(c) === termo)! : nomeFormatado);
                }
              }}
              placeholder="Buscar ou criar categoria"
              className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-3"
              aria-label="Buscar ou criar categoria"
            />
            {busca ? (
              <button type="button" onClick={() => { setBusca(""); campoRef.current?.focus(); }} aria-label="Limpar busca" className="text-texto-3">
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </label>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
          {nomeFormatado && !existeIgual ? (
            <li>
              <button
                type="button"
                onClick={() => onEscolher(nomeFormatado)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm text-marca active:bg-white/[0.05]"
              >
                <span className="vidro-marca flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
                Criar categoria “{nomeFormatado}”
              </button>
            </li>
          ) : null}
          {filtradas.map((c) => {
            const atual = normalizarTexto(c) === normalizarTexto(valor);
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => onEscolher(c)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm active:bg-white/[0.05]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                    <IconeCategoria categoria={c} />
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${atual ? "font-semibold text-texto" : "text-texto"}`}>{c}</span>
                  {atual ? <Check className="h-4 w-4 shrink-0 text-marca" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
          {filtradas.length === 0 && !nomeFormatado ? (
            <li className="px-2 py-6 text-center text-xs text-texto-3">Digite para criar a primeira categoria.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
