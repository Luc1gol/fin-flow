"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Inbox, PiggyBank, CalendarDays, Landmark } from "lucide-react";
import type { AbaAnaliseId } from "@/types/relatorios";
import { Card, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { rotuloIntervalo } from "@/components/relatorios/dados";
import { composicao, resumoGeral, ultimosSeisMeses } from "@/components/relatorios/calculos";
import { COR_ENTRADA, COR_SAIDA, GraficoEvolucao } from "@/components/relatorios/graficos";
import type { ContextoAnalise } from "@/components/relatorios/contexto";
import { BarraFina, Bolha, Variacao, Vazio, brlInteiro, pctTexto } from "@/components/relatorios/ui";

function Legenda() {
  return (
    <div className="flex items-center gap-4 text-xs text-texto-2">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: COR_ENTRADA }} />
        Entradas
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: COR_SAIDA }} />
        Saídas
      </span>
    </div>
  );
}

export function AbaVisaoGeral({
  ctx,
  irPara,
}: {
  ctx: ContextoAnalise;
  irPara: (aba: AbaAnaliseId) => void;
}) {
  const r = useMemo(
    () => resumoGeral(ctx.atuais, ctx.anteriores, ctx.atual, ctx.anterior),
    [ctx],
  );
  const meses = useMemo(() => ultimosSeisMeses(ctx.dados.lancamentos, ctx.ref), [ctx]);
  const top = useMemo(
    () => composicao(ctx.atuais, ctx.anteriores, "categoria", 3).fatias.filter((f) => f.nome !== "Outros"),
    [ctx],
  );
  const temHistorico = meses.some((m) => m.entradas > 0 || m.saidas > 0);

  const taxa = r.taxaPoupanca;
  const difTaxa =
    taxa != null && r.taxaPoupancaAnterior != null
      ? Math.round((taxa - r.taxaPoupancaAnterior) * 100)
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Resultado */}
      <Card className="px-4 py-4">
        <p className="text-xs text-texto-3">Resultado do período</p>
        <p
          className={`mt-0.5 text-[30px] font-semibold leading-tight ${
            r.resultado >= 0 ? "text-texto" : "text-negativo"
          }`}
        >
          <Valor valor={r.resultado} sinal />
        </p>
        <p className="mt-1 text-xs text-texto-3">
          {r.semFluxo ? (
            "Nada lançado neste período ainda."
          ) : r.difResultado === 0 ? (
            <>Igual {ctx.comparacaoNo}.</>
          ) : (
            <>
              <span className={r.difResultado > 0 ? "text-positivo" : "text-negativo"}>
                {brlInteiro(Math.abs(r.difResultado))} {r.difResultado > 0 ? "melhor" : "pior"}
              </span>{" "}
              que {ctx.comparacaoNo}
            </>
          )}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-borda pt-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowDownLeft className="h-3.5 w-3.5 text-positivo" aria-hidden /> Entradas
            </p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-positivo">
              <Valor valor={r.entradas} />
            </p>
            <Variacao pct={r.varEntradas} subirEhBom />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowUpRight className="h-3.5 w-3.5 text-negativo" aria-hidden /> Saídas
            </p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-negativo">
              <Valor valor={r.saidas} />
            </p>
            <Variacao pct={r.varSaidas} subirEhBom={false} />
          </div>
        </div>
      </Card>

      {r.semFluxo && !temHistorico ? (
        <Card>
          <Vazio
            icone={<Inbox className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            titulo="Ainda não há entradas ou saídas"
            texto="Lance seus gastos ou conecte o banco para ver para onde vai seu dinheiro."
            acao={
              <Link href="/lancar" className="inline-flex h-9 items-center text-xs font-semibold text-marca">
                Fazer um lançamento
              </Link>
            }
          />
        </Card>
      ) : null}

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="px-3 py-3">
          <p className="flex items-center gap-1.5 text-xs text-texto-3">
            <PiggyBank className="h-3.5 w-3.5" aria-hidden /> Taxa de poupança
          </p>
          <p
            className={`valor mt-1 text-lg font-semibold ${
              taxa == null ? "text-texto-3" : taxa >= 0 ? "text-texto" : "text-negativo"
            }`}
          >
            {taxa == null ? "—" : `${Math.round(taxa * 100)}%`}
          </p>
          <BarraFina
            fracao={taxa ?? 0}
            cor={taxa != null && taxa >= 0.2 ? COR_ENTRADA : "#4f8cff"}
            className="mt-1.5 h-1"
          />
          <p className="mt-1.5 truncate text-[11px] text-texto-3">
            {taxa == null
              ? "sem entradas no período"
              : difTaxa == null || difTaxa === 0
                ? "do que entrou, sobrou"
                : `${difTaxa > 0 ? "+" : "−"}${Math.abs(difTaxa)} p.p. vs anterior`}
          </p>
        </Card>
        <Card className="px-3 py-3">
          <p className="flex items-center gap-1.5 text-xs text-texto-3">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Gasto médio/dia
          </p>
          <p className="mt-1 text-lg font-semibold text-texto">
            <Valor valor={r.mediaDiaria} />
          </p>
          <div className="mt-1.5 h-1" />
          <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-texto-3">
            {r.varMediaDiaria != null ? (
              <>
                <Variacao pct={r.varMediaDiaria} subirEhBom={false} /> vs anterior
              </>
            ) : (
              `${r.qtdDespesas} ${r.qtdDespesas === 1 ? "gasto" : "gastos"} no período`
            )}
          </p>
        </Card>
      </div>

      <CardInvestimentos ctx={ctx} />

      {/* Últimos 6 meses */}
      {temHistorico ? (
        <Secao titulo="Últimos 6 meses">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <Legenda />
            </div>
            <GraficoEvolucao dados={meses} />
          </Card>
        </Secao>
      ) : null}

      {/* Prévia de para onde vai */}
      {top.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-texto">Onde você mais gastou</h2>
            <button
              type="button"
              onClick={() => irPara("para-onde")}
              className="flex items-center text-xs font-medium text-texto-2 hover:text-texto"
            >
              Ver tudo <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <Card className="px-3 py-1">
            <ul className="divide-y divide-borda">
              {top.map((f) => (
                <li key={f.nome}>
                  <button
                    type="button"
                    onClick={() => irPara("para-onde")}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <Bolha cor={f.cor}>
                      <IconeCategoria categoria={f.nome} />
                    </Bolha>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-texto">{f.nome}</span>
                        <Valor valor={f.valor} className="shrink-0 text-sm font-medium text-texto" />
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <BarraFina fracao={f.pct / 100} cor={f.cor} className="h-1 flex-1" />
                        <span className="w-8 shrink-0 text-right text-[11px] text-texto-3">
                          {pctTexto(f.pct)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <p className="text-center text-[11px] text-texto-3">
        Comparações com {rotuloIntervalo(ctx.anterior)} · transferências não entram
      </p>
    </div>
  );
}

/**
 * Quanto ficou investido no período: aplicado − resgatado. Aplicações e resgates não entram
 * em entradas nem saídas (o dinheiro continua seu), então cada real conta uma vez só.
 */
function CardInvestimentos({ ctx }: { ctx: ContextoAnalise }) {
  const { aplicado, resgatado, liquido } = ctx.investAtual;
  const anterior = ctx.investAnterior.liquido;
  if (aplicado === 0 && resgatado === 0 && anterior === 0) return null;
  const dif = liquido - anterior;
  const resgatouMais = liquido < 0;

  return (
    <Secao titulo="Investimentos">
      <Card className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Bolha cor="#4f8cff" className="h-9 w-9">
            <Landmark className="h-4 w-4" aria-hidden />
          </Bolha>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-texto-3">{resgatouMais ? "Resgatado a mais no período" : "Investido no período"}</p>
            <p className={`text-xl font-semibold leading-tight ${resgatouMais ? "text-alerta" : "text-texto"}`}>
              <Valor valor={Math.abs(liquido)} />
            </p>
            {anterior !== 0 || liquido !== 0 ? (
              <p className="mt-0.5 text-[11px] text-texto-3">
                {dif === 0 ? (
                  <>Igual {ctx.comparacaoNo}</>
                ) : (
                  <>
                    <span className={dif > 0 ? "text-positivo" : "text-negativo"}>
                      {brlInteiro(Math.abs(dif))} {dif > 0 ? "a mais" : "a menos"}
                    </span>{" "}
                    que {ctx.comparacaoNo}
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-borda pt-3 text-xs">
          <div>
            <p className="text-texto-3">Aplicado</p>
            <p className="mt-0.5 text-[15px] font-semibold text-texto">
              <Valor valor={aplicado} />
            </p>
          </div>
          <div>
            <p className="text-texto-3">Resgatado</p>
            <p className="mt-0.5 text-[15px] font-semibold text-texto">
              <Valor valor={resgatado} />
            </p>
          </div>
        </div>
        {aplicado > 0 ? (
          <BarraFina fracao={Math.min(1, resgatado / aplicado)} cor="#f59e0b" className="mt-2 h-1" />
        ) : null}
        <p className="mt-2 text-[11px] text-texto-3">
          Aplicações e resgates não contam como entrada nem saída: o dinheiro continua seu.{" "}
          <Link href="/patrimonio" className="font-medium text-marca">
            Ver patrimônio
          </Link>
        </p>
      </Card>
    </Secao>
  );
}
