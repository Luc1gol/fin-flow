"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { Valor } from "@/components/ui/base";
import { carregarResultadoMes, chaveMes, mesFechadoMaisRecente, nomeMes } from "@/lib/dados/resumo";

const DIAS_VISIVEL = 7;

/**
 * Aviso na tela inicial nos 7 primeiros dias do mês: o resumo do mês anterior está pronto.
 * Fora desse período não renderiza nada.
 */
export function CartaoResumoInicio({ oculto = false }: { oculto?: boolean }) {
  const [hoje] = useState(() => new Date());
  const visivel = hoje.getDate() <= DIAS_VISIVEL;
  const mes = mesFechadoMaisRecente(hoje);
  const chave = chaveMes(mes);
  const [resultado, setResultado] = useState<number | null>(null);

  useEffect(() => {
    if (!visivel) return;
    let cancelado = false;
    const [ano, m] = chave.split("-").map(Number);
    carregarResultadoMes({ ano, mes0: m - 1 })
      .then((r) => {
        if (!cancelado) setResultado(r.resultado);
      })
      .catch((e) => console.error("[resumo] cartão início", e));
    return () => {
      cancelado = true;
    };
  }, [visivel, chave]);

  if (!visivel) return null;

  return (
    <Link
      href={`/resumo?mes=${chave}`}
      className="vidro-suave flex items-center gap-3 rounded-2xl p-3 transition active:scale-[0.99]"
    >
      <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <CalendarCheck className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-texto">
          Resumo de {nomeMes(mes, false)} pronto
        </span>
        <span className="mt-0.5 block text-xs text-texto-3">
          {resultado == null ? (
            "Veja como foi o mês"
          ) : (
            <>
              Resultado <Valor valor={resultado} sinal colorir={!oculto} oculto={oculto} />
            </>
          )}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
    </Link>
  );
}
