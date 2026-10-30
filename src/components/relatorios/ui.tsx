"use client";

import { useState } from "react";
import { CreditCard, Hash } from "lucide-react";
import { getBancoById, logoIconHorseUrl } from "@/data/bancos";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { Valor } from "@/components/ui/base";
import type { FatiaGasto, VisaoComposicao } from "@/types/relatorios";

/** Controle segmentado numa pílula de vidro (alvos de 36px). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  className = "",
}: {
  opcoes: readonly { id: T; label: string }[];
  valor: T;
  onChange: (id: T) => void;
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className={`vidro flex rounded-full p-1 ${className}`}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.id)}
            className={`h-9 flex-1 touch-manipulation rounded-full px-2 text-xs font-semibold transition ${
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

/** Logo do banco num círculo; cai para ícone de cartão se a imagem falhar. */
export function LogoBanco({ bancoId, className = "h-8 w-8" }: { bancoId: string | null; className?: string }) {
  const [erro, setErro] = useState(false);
  if (!bancoId || erro) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08] ${className}`}
      >
        <CreditCard className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  const banco = getBancoById(bancoId);
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

/** Ícone de um item da composição, tingido com a cor da fatia. */
function IconeFatia({
  fatia,
  visao,
  bancoId,
}: {
  fatia: FatiaGasto;
  visao: VisaoComposicao;
  bancoId: string | null;
}) {
  if (visao === "cartao") return <LogoBanco bancoId={bancoId} />;
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: `${fatia.cor}22`, color: fatia.cor }}
    >
      {visao === "tag" ? (
        <Hash className="h-4 w-4" aria-hidden />
      ) : (
        <IconeCategoria categoria={fatia.nome === "Outros" ? null : fatia.nome} />
      )}
    </span>
  );
}

function pctTexto(pct: number): string {
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** Barra empilhada + lista com %, valor e barra proporcional. */
export function ListaComposicao({
  fatias,
  visao,
  bancoDoCartao,
}: {
  fatias: FatiaGasto[];
  visao: VisaoComposicao;
  bancoDoCartao: (nome: string) => string | null;
}) {
  const maior = Math.max(...fatias.map((f) => f.pct), 1);
  return (
    <>
      {visao !== "tag" ? (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {fatias.map((f) => (
            <div key={f.nome} style={{ flex: f.valor, background: f.cor }} />
          ))}
        </div>
      ) : null}
      <ul className="mt-2 flex flex-col">
        {fatias.map((f) => (
          <li key={f.nome} className="flex items-center gap-3 py-2">
            <IconeFatia fatia={f} visao={visao} bancoId={bancoDoCartao(f.nome)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-texto">{f.nome}</span>
                <Valor valor={f.valor} className="shrink-0 text-sm font-medium text-texto" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(f.pct / maior) * 100}%`, background: f.cor }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] text-texto-3">
                  {pctTexto(f.pct)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Bloco cinza animado enquanto carrega. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-superficie-2 ${className}`} />;
}
