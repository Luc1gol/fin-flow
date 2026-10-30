"use client";

import { Plus, X } from "lucide-react";
import type { KeyboardEvent } from "react";

type Variant = "lancar" | "extrato-edit";

const VARIANT = {
  lancar: {
    wrapperLabel: "block text-xs font-medium text-texto-2",
    help: "mt-1.5 text-[11px] leading-snug text-texto-3",
    container:
      "mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-borda-forte bg-white/[0.05] px-2 py-1 transition-colors focus-within:border-marca/60",
    input:
      "h-7 min-w-[min(100%,9rem)] flex-1 border-0 bg-transparent px-1 text-sm text-texto outline-none placeholder:text-texto-3",
    pill: "inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-marca/15 pl-2.5 pr-0.5 text-xs font-medium text-marca ring-1 ring-inset ring-marca/25",
    pillBtn:
      "relative flex h-5 w-5 shrink-0 touch-manipulation items-center justify-center rounded-full text-marca/80 transition after:absolute after:-inset-2 after:content-[''] hover:bg-white/10 hover:text-texto",
    sugestTitulo: "mt-2.5 text-[11px] font-medium text-texto-3",
    sugBtn:
      "inline-flex h-8 touch-manipulation items-center gap-1 rounded-full border border-borda-forte px-3 text-xs font-medium text-texto-2 transition hover:border-marca/40 hover:text-texto active:scale-[0.97]",
  },
  "extrato-edit": {
    wrapperLabel: "block text-xs text-texto-2",
    help: "mt-1 text-[11px] leading-snug text-texto-3",
    container:
      "mt-1 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-borda-forte bg-white/[0.05] px-2 py-1 transition-colors focus-within:border-marca/60",
    input:
      "h-7 min-w-[min(100%,9rem)] flex-1 border-0 bg-transparent px-1 text-sm text-texto outline-none placeholder:text-texto-3",
    pill: "inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-marca/15 pl-2.5 pr-0.5 text-xs font-medium text-marca ring-1 ring-inset ring-marca/25",
    pillBtn:
      "relative flex h-5 w-5 shrink-0 touch-manipulation items-center justify-center rounded-full text-marca/80 transition after:absolute after:-inset-2 after:content-[''] hover:bg-white/10 hover:text-texto",
    sugestTitulo: "mt-2 text-[11px] font-medium text-texto-3",
    sugBtn:
      "inline-flex h-8 touch-manipulation items-center gap-1 rounded-full border border-borda-forte px-3 text-xs font-medium text-texto-2 transition hover:border-marca/40 hover:text-texto active:scale-[0.97]",
  },
} as const;

export type TagsExtrasFieldProps = {
  variant: Variant;
  inputId: string;
  label: string;
  description?: string;
  tagsSelecionadas: string[];
  onTagsSelecionadasChange: (next: string[]) => void;
  tagInput: string;
  onTagInputChange: (v: string) => void;
  tagsHistorico: string[];
  ringFocus: string;
};

function normalizarToken(raw: string): string {
  return raw.replace(/,/g, " ").trim();
}

export function TagsExtrasField({
  variant,
  inputId,
  label,
  description,
  tagsSelecionadas,
  onTagsSelecionadasChange,
  tagInput,
  onTagInputChange,
  tagsHistorico,
  ringFocus,
}: TagsExtrasFieldProps) {
  const v = VARIANT[variant];

  const adicionarTag = (t: string) => {
    const nome = normalizarToken(t);
    if (!nome) return;
    if (tagsSelecionadas.includes(nome)) return;
    onTagsSelecionadasChange([...tagsSelecionadas, nome]);
  };

  const commitInput = () => {
    adicionarTag(tagInput);
    onTagInputChange("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitInput();
    }
  };

  const remover = (tag: string) => {
    onTagsSelecionadasChange(tagsSelecionadas.filter((x) => x !== tag));
  };

  const sugestoes = tagsHistorico.filter((t) => !tagsSelecionadas.includes(t));

  return (
    <div>
      <label htmlFor={inputId} className={v.wrapperLabel}>
        {label}
      </label>
      <div className={`${v.container} ${ringFocus}`}>
        {tagsSelecionadas.map((tag) => (
          <span key={tag} className={v.pill}>
            <span className="min-w-0 truncate">{tag}</span>
            <button
              type="button"
              className={v.pillBtn}
              aria-label={`Remover tag ${tag}`}
              onClick={() => remover(tag)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={tagInput}
          onChange={(e) => onTagInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            tagsSelecionadas.length === 0
              ? "Digite e pressione Enter ou vírgula"
              : "Adicionar…"
          }
          autoComplete="off"
          className={v.input}
        />
      </div>
      {description ? <p className={v.help}>{description}</p> : null}
      {sugestoes.length > 0 ? (
        <>
          <p className={v.sugestTitulo}>Tags sugeridas</p>
          <div className="mt-1.5 flex max-h-[6.75rem] flex-wrap gap-1.5 overflow-y-auto">
            {sugestoes.map((t) => (
              <button
                key={t}
                type="button"
                className={v.sugBtn}
                onClick={() => adicionarTag(t)}
                aria-label={`Adicionar tag ${t}`}
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                {t}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
