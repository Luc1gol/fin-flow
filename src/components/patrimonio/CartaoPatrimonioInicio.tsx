"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Valor } from "@/components/ui/base";
import { carregarPatrimonio, filtrarHistorico, type Patrimonio } from "@/lib/dados/patrimonio";
import { SparklinePatrimonio } from "./GraficoPatrimonio";
import { VariacaoPatrimonio } from "./VariacaoPatrimonio";

/** Cartão compacto do Início: patrimônio líquido, variação em 30 dias e mini gráfico. */
export function CartaoPatrimonioInicio({ oculto = false }: { oculto?: boolean }) {
  const [dados, setDados] = useState<Patrimonio | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarPatrimonio()
      .then((p) => {
        if (!cancelado) setDados(p);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const pontos = dados ? filtrarHistorico(dados.historico, "30d") : [];

  return (
    <Link href="/patrimonio" className="block transition active:scale-[0.99]">
      <Card className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-texto-3">Patrimônio</p>
          {dados ? (
            <>
              <p className={`mt-0.5 truncate text-lg font-semibold ${dados.liquido < 0 && !oculto ? "text-negativo" : "text-texto"}`}>
                <Valor valor={dados.liquido} oculto={oculto} />
              </p>
              {dados.variacao30 ? (
                <p className="truncate text-[11px]">
                  <VariacaoPatrimonio variacao={dados.variacao30} oculto={oculto} />
                  <span className="text-texto-3"> em 30 dias</span>
                </p>
              ) : null}
            </>
          ) : erro ? (
            <p className="mt-0.5 text-xs text-texto-3">Não foi possível carregar.</p>
          ) : (
            <div className="mt-1.5 h-5 w-28 animate-pulse rounded bg-white/[0.06]" aria-hidden />
          )}
        </div>
        {pontos.length >= 2 ? (
          <div className="h-10 w-24 shrink-0" aria-hidden>
            <SparklinePatrimonio pontos={pontos} />
          </div>
        ) : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
      </Card>
    </Link>
  );
}
