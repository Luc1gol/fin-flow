import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { formatBRL } from "@/lib/format-currency";

/** Superfície padrão: cartões, painéis e listas. */
export function Card({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`rounded-2xl border border-borda bg-superficie ${className}`}
      {...props}
    />
  );
}

/** Título de seção com ação opcional à direita ("Ver tudo"). */
export function Secao({
  titulo,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  acao?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-texto">{titulo}</h2>
        {acao ? (
          <Link href={acao.href} className="text-xs font-medium text-texto-2 hover:text-texto">
            {acao.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const MASCARA = "••••";

/**
 * Valor em reais. `sinal` mostra + ou −; `colorir` usa verde/vermelho.
 * `oculto` troca por pontos (botão de olho).
 */
export function Valor({
  valor,
  sinal = false,
  colorir = false,
  oculto = false,
  className = "",
}: {
  valor: number;
  sinal?: boolean;
  colorir?: boolean;
  oculto?: boolean;
  className?: string;
}) {
  if (oculto) return <span className={`valor ${className}`}>R$ {MASCARA}</span>;
  const prefixo = sinal ? (valor > 0 ? "+ " : valor < 0 ? "− " : "") : valor < 0 ? "− " : "";
  const cor = colorir ? (valor > 0 ? "text-positivo" : valor < 0 ? "text-negativo" : "") : "";
  return (
    <span className={`valor ${cor} ${className}`}>
      {prefixo}
      {formatBRL(Math.abs(valor))}
    </span>
  );
}

/** Linha de lista compacta: ícone, título, subtítulo e valor à direita. */
export function LinhaLista({
  icone,
  titulo,
  subtitulo,
  direita,
  onClick,
  href,
  className = "",
}: {
  icone?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  direita?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <>
      {icone ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-texto-2">
          {icone}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-texto">{titulo}</span>
        {subtitulo ? (
          <span className="mt-0.5 block truncate text-xs text-texto-3">{subtitulo}</span>
        ) : null}
      </span>
      {direita ? <span className="shrink-0 text-sm text-texto">{direita}</span> : null}
    </>
  );
  const classes = `flex w-full items-center gap-3 py-2.5 text-left ${
    onClick || href ? "transition-colors active:bg-white/[0.03]" : ""
  } ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {conteudo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {conteudo}
      </button>
    );
  }
  return <div className={classes}>{conteudo}</div>;
}

type VarianteBotao = "primario" | "secundario" | "fantasma";

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  primario: "bg-marca text-white hover:bg-marca-forte",
  secundario: "border border-borda-forte bg-superficie-2 text-texto hover:bg-white/[0.06]",
  fantasma: "text-texto-2 hover:bg-white/[0.05] hover:text-texto",
};

/** Botão padrão. Altura 40px (`md`) ou 32px (`sm`). */
export function Botao({
  variante = "secundario",
  tamanho = "md",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variante?: VarianteBotao;
  tamanho?: "sm" | "md";
}) {
  const altura = tamanho === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";
  return (
    <button
      type="button"
      className={`inline-flex touch-manipulation items-center justify-center gap-1.5 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-40 ${altura} ${ESTILO_BOTAO[variante]} ${className}`}
      {...props}
    />
  );
}

/** Filtro em pílula (selecionável). */
export function Chip({
  ativo,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & { ativo?: boolean }) {
  return (
    <button
      type="button"
      className={`h-7 shrink-0 touch-manipulation rounded-full px-3 text-xs font-medium transition ${
        ativo
          ? "bg-marca/15 text-marca"
          : "border border-borda-forte text-texto-2 hover:text-texto"
      } ${className}`}
      {...props}
    />
  );
}

/** Campo de texto padrão (36px). */
export const campoClasse =
  "h-9 w-full rounded-lg border border-borda-forte bg-superficie-2 px-3 text-sm text-texto outline-none transition-colors [color-scheme:dark] placeholder:text-texto-3 focus:border-marca/60";
