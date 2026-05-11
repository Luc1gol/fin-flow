"use client";

import { X } from "lucide-react";
import type { KeyboardEvent } from "react";

type Variant = "lancar" | "extrato-edit";

const VARIANT = {
  lancar: {
    wrapperLabel: "text-sm font-semibold text-[#34D399]",
    help: "mt-2 text-[11px] leading-snug text-zinc-400",
    container:
      "flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-2xl border border-[#10B981]/25 bg-black/35 px-3 py-2 backdrop-blur-sm",
    input:
      "min-w-[min(100%,12rem)] flex-1 border-0 bg-transparent py-2 text-sm text-white outline-none placeholder:text-zinc-500",
    pill: "inline-flex max-w-full items-center gap-1 rounded-full border border-[#10B981]/40 bg-[#10B981]/25 px-2.5 py-1 text-xs font-semibold text-emerald-100",
    pillBtn:
      "ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-200/90 transition hover:bg-white/10 hover:text-white",
    sugestTitulo:
      "mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
    sugBtn:
      "rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/35 hover:bg-white/[0.07] hover:text-zinc-100",
  },
  "extrato-edit": {
    wrapperLabel: "text-xs font-semibold uppercase tracking-wide text-zinc-500",
    help: "mt-2 text-[11px] leading-snug text-zinc-500",
    container:
      "flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm",
    input:
      "min-w-[min(100%,12rem)] flex-1 border-0 bg-transparent py-2 text-sm font-medium text-white outline-none placeholder:text-zinc-600",
    pill: "inline-flex max-w-full items-center gap-1 rounded-full border border-[#10B981]/40 bg-[#10B981]/18 px-2.5 py-1 text-xs font-semibold text-emerald-200",
    pillBtn:
      "ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-200/90 transition hover:bg-white/10 hover:text-white",
    sugestTitulo:
      "mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
    sugBtn:
      "rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/35 hover:bg-white/[0.08] hover:text-zinc-100",
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
          <div className="mt-1.5 flex flex-wrap gap-2">
            {sugestoes.map((t) => (
              <button
                key={t}
                type="button"
                className={v.sugBtn}
                onClick={() => adicionarTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
