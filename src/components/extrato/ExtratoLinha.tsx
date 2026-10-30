"use client";

import { useState } from "react";
import { CreditCard, Repeat } from "lucide-react";
import type { LancamentoExtrato } from "@/types/lancamento";
import { getBancoById, logoIconHorseUrl } from "@/data/bancos";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { Valor } from "@/components/ui/base";

const CIRCULO_ICONE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]";

/** Logo do banco (compras no cartão); cai para um ícone de cartão se falhar. */
export function MiniLogoBanco({
  bancoId,
  className = "h-9 w-9",
}: {
  bancoId: string;
  className?: string;
}) {
  const [erro, setErro] = useState(false);
  const banco = getBancoById(bancoId);
  if (erro) {
    return (
      <span className={`${CIRCULO_ICONE} ${className}`}>
        <CreditCard className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/[0.08] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- logo externo pequeno */}
      <img
        src={logoIconHorseUrl(banco.domain)}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setErro(true)}
      />
    </span>
  );
}

/** Texto secundário da linha: categoria (ou sentido da transferência) e meio. */
function subtituloLinha(item: LancamentoExtrato): string {
  const partes: string[] = [];
  if (item.tipo === "transferencia") {
    partes.push(item.transferenciaSaida ? "Transferência enviada" : "Transferência recebida");
  } else {
    partes.push(item.tag?.trim() || item.categoriaNome || "Sem categoria");
  }
  if (item.meioPagamentoTipo) partes.push(item.meioPagamentoTipo);
  if (item.meioPagamento && item.meioPagamento !== "—") partes.push(item.meioPagamento);
  return partes.join(" · ");
}

export function LinhaExtrato({
  item,
  onSelect,
}: {
  item: LancamentoExtrato;
  onSelect: (item: LancamentoExtrato) => void;
}) {
  const transferencia = item.tipo === "transferencia";
  const receita = item.tipo === "receita";
  const ehRecorrente = Boolean(item.recorrencia_id?.trim());
  const extras = item.tags_extras ?? [];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex min-h-[3.25rem] w-full touch-manipulation items-center gap-3 py-2.5 text-left outline-none transition-colors active:bg-white/[0.03] focus-visible:bg-white/[0.04]"
    >
      {transferencia ? (
        <span className={`${CIRCULO_ICONE} text-texto-3`}>
          <IconeCategoria categoria={null} transferencia />
        </span>
      ) : item.bancoId ? (
        <MiniLogoBanco bancoId={item.bancoId} />
      ) : (
        <span className={CIRCULO_ICONE}>
          <IconeCategoria categoria={item.tag ?? item.categoriaNome} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm text-texto">{item.descricao}</span>
          {ehRecorrente ? (
            <Repeat
              className="h-3 w-3 shrink-0 text-texto-3"
              aria-label="Lançamento recorrente"
            />
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-texto-3">{subtituloLinha(item)}</span>
          {extras.length > 0 ? (
            <span className="shrink-0 rounded-full bg-marca/12 px-1.5 py-px text-[10px] font-medium text-marca">
              #{extras[0]}
              {extras.length > 1 ? ` +${extras.length - 1}` : ""}
            </span>
          ) : null}
        </span>
      </span>

      <span className="shrink-0 text-sm">
        {transferencia ? (
          <Valor valor={item.valor} className="text-texto-3" />
        ) : receita ? (
          <Valor valor={item.valor} sinal colorir className="font-medium" />
        ) : (
          <Valor valor={-item.valor} className="text-texto" />
        )}
      </span>
    </button>
  );
}
