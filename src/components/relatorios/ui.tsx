"use client";

import { useState, type ReactNode } from "react";
import {
  Banknote,
  CircleEllipsis,
  CreditCard,
  Landmark,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { getBancoById, logoIconHorseUrl } from "@/data/bancos";
import type { MeioAnalise } from "@/types/relatorios";

/** Ícone de cada meio de pagamento. */
export const ICONE_MEIO: Record<MeioAnalise, LucideIcon> = {
  Crédito: CreditCard,
  Débito: Landmark,
  Pix: QrCode,
  Dinheiro: Banknote,
  Outros: CircleEllipsis,
};

/** Controle segmentado numa pílula de vidro (alvos de 36px). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  className = "",
  pequeno = false,
}: {
  opcoes: readonly { id: T; label: string }[];
  valor: T;
  onChange: (id: T) => void;
  rotulo: string;
  className?: string;
  pequeno?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={`vidro flex rounded-full p-1 ${className}`}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.id)}
            className={`${pequeno ? "h-7" : "h-9"} flex-1 touch-manipulation whitespace-nowrap rounded-full px-2 text-xs font-semibold transition ${
              ativo
                ? "bg-white/[0.14] text-texto shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]"
                : "text-texto-3 hover:text-texto-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de abas com sublinhado; rola na horizontal se faltar espaço. */
export function BarraAbas<T extends string>({
  abas,
  valor,
  onChange,
}: {
  abas: readonly { id: T; label: string }[];
  valor: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Seções da análise"
      className="flex gap-1 overflow-x-auto border-b border-borda [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {abas.map((a) => {
        const ativo = a.id === valor;
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-selected={ativo}
            aria-controls={`painel-${a.id}`}
            onClick={() => onChange(a.id)}
            className={`relative h-10 shrink-0 touch-manipulation whitespace-nowrap px-3 text-sm font-medium transition-colors ${
              ativo ? "text-texto" : "text-texto-3 hover:text-texto-2"
            }`}
          >
            {a.label}
            <span
              aria-hidden
              className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-opacity ${
                ativo ? "bg-marca opacity-100" : "opacity-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Logo do banco num círculo; cai para ícone de cartão se a imagem falhar. */
export function LogoBanco({ bancoId, className = "h-8 w-8" }: { bancoId: string | null; className?: string }) {
  const [erro, setErro] = useState(false);
  const banco = bancoId ? getBancoById(bancoId) : null;
  if (!banco || banco.id === "outros" || erro) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08] ${className}`}
      >
        <CreditCard className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoIconHorseUrl(banco.domain)}
      alt=""
      className={`shrink-0 rounded-full object-cover ring-1 ring-white/10 ${className}`}
      onError={() => setErro(true)}
    />
  );
}

/** Ícone redondo tingido com uma cor. */
export function Bolha({ cor, children, className = "h-8 w-8" }: { cor: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ background: `${cor}24`, color: cor }}
    >
      {children}
    </span>
  );
}

/** Bloco cinza animado enquanto carrega. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />;
}

/** Estado vazio amigável. */
export function Vazio({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-7 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.05] text-texto-3 ring-1 ring-inset ring-white/[0.08]">
        {icone}
      </span>
      <p className="mt-3 text-sm font-medium text-texto-2">{titulo}</p>
      {texto ? <p className="mt-1 max-w-72 text-xs text-texto-3">{texto}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}

/**
 * Variação em pílula: "▲ 12%". `subirEhBom` define a cor (gasto subir é ruim).
 * Sem base de comparação não mostra nada (ou "novo" se `novo`).
 */
export function Variacao({
  pct,
  subirEhBom,
  className = "",
}: {
  pct: number | null;
  subirEhBom: boolean;
  className?: string;
}) {
  if (pct == null) return null;
  if (pct === 0) {
    return <span className={`text-[11px] font-medium text-texto-3 ${className}`}>= 0%</span>;
  }
  const bom = pct > 0 === subirEhBom;
  const forte = Math.abs(pct) >= 1000 ? "+999" : String(Math.abs(pct));
  return (
    <span
      className={`valor inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        bom ? "text-positivo" : "text-negativo"
      } ${className}`}
    >
      <span aria-hidden className="text-[9px]">
        {pct > 0 ? "▲" : "▼"}
      </span>
      <span className="sr-only">{pct > 0 ? "subiu" : "caiu"}</span>
      {forte}%
    </span>
  );
}

/** Barra fina proporcional. */
export function BarraFina({ fracao, cor, className = "h-1.5" }: { fracao: number; cor: string; className?: string }) {
  const w = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${w}%`, background: cor, minWidth: w > 0 ? 4 : 0 }}
      />
    </div>
  );
}

export function pctTexto(pct: number): string {
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

const compactoBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "R$ 1,2 mil" — para eixos e rótulos curtos. */
export function brlCompacto(v: number): string {
  return compactoBRL.format(v);
}

const inteiroBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** "R$ 396" — sem centavos, para frases. */
export function brlInteiro(v: number): string {
  return inteiroBRL.format(v);
}
