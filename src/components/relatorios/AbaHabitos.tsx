"use client";

import { useMemo, useState } from "react";
import { Lightbulb, MapPin, Repeat, TrendingDown, TrendingUp } from "lucide-react";
import { Card, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import {
  gerarInsights,
  lugares,
  porDiaDaSemana,
  recorrentes,
  type Insight,
} from "@/components/relatorios/calculos";
import { COR_MARCA, GraficoBarras } from "@/components/relatorios/graficos";
import type { ContextoAnalise } from "@/components/relatorios/contexto";
import { BarraFina, Segmentado, Vazio, brlInteiro } from "@/components/relatorios/ui";

type OrdemLugares = "vezes" | "valor";

const ORDENS: readonly { id: OrdemLugares; label: string }[] = [
  { id: "vezes", label: "Mais frequentes" },
  { id: "valor", label: "Maior valor" },
];

const LUGARES_INICIAL = 6;
const RECORRENTES_INICIAL = 6;

function IconeInsight({ tom }: { tom: Insight["tom"] }) {
  if (tom === "ruim") return <TrendingUp className="h-4 w-4 text-negativo" aria-hidden />;
  if (tom === "bom") return <TrendingDown className="h-4 w-4 text-positivo" aria-hidden />;
  return <Lightbulb className="h-4 w-4 text-marca" aria-hidden />;
}

export function AbaHabitos({ ctx }: { ctx: ContextoAnalise }) {
  const [ordem, setOrdem] = useState<OrdemLugares>("vezes");
  const [todosLugares, setTodosLugares] = useState(false);
  const [todosRec, setTodosRec] = useState(false);

  const dias = useMemo(() => porDiaDaSemana(ctx.atuais, ctx.atual), [ctx]);
  const listaLugares = useMemo(() => lugares(ctx.atuais), [ctx]);
  const ordenados = useMemo(
    () =>
      [...listaLugares].sort((a, b) =>
        ordem === "vezes" ? b.vezes - a.vezes || b.total - a.total : b.total - a.total || b.vezes - a.vezes,
      ),
    [listaLugares, ordem],
  );
  const porFrequencia = useMemo(
    () => [...listaLugares].sort((a, b) => b.vezes - a.vezes || b.total - a.total),
    [listaLugares],
  );
  const recs = useMemo(() => recorrentes(ctx.dados.lancamentos, ctx.ref), [ctx]);
  const insights = useMemo(
    () =>
      gerarInsights({
        atuais: ctx.atuais,
        anteriores: ctx.anteriores,
        comparacaoNo: ctx.comparacaoNo,
        dias,
        lugaresTop: porFrequencia,
        recorrentes: recs,
        intervalo: ctx.atual,
      }),
    [ctx, dias, porFrequencia, recs],
  );

  const maxMedia = Math.max(...dias.map((d) => d.media), 0);
  const temGastos = dias.some((d) => d.total > 0);
  const totalFixos = recs.reduce((a, r) => a + r.valorMensal, 0);
  const maiorLugar = Math.max(...ordenados.map((l) => (ordem === "vezes" ? l.vezes : l.total)), 1);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* Insights */}
      {insights.length > 0 ? (
        <Card className="px-3 py-1 lg:min-w-0">
          <ul className="divide-y divide-borda">
            {insights.slice(0, 4).map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/[0.08]">
                  <IconeInsight tom={i.tom} />
                </span>
                <p className="text-[13px] leading-snug text-texto-2">{i.texto}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Dia da semana */}
      <Secao titulo="Gasto por dia da semana" className="lg:min-w-0">
        <Card className="p-3">
          {!temGastos ? (
            <Vazio icone={<Lightbulb className="h-5 w-5" aria-hidden />} titulo="Nenhum gasto neste período" />
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-texto-3">Média gasta em cada dia</p>
              <GraficoBarras
                altura={150}
                largura={24}
                dados={dias.map((d) => ({
                  label: d.label,
                  valor: d.media,
                  cor: COR_MARCA,
                  apagado: d.media < maxMedia,
                  tituloTooltip: d.nome.charAt(0).toUpperCase() + d.nome.slice(1),
                  tooltip: [
                    { rotulo: "Média por dia", valor: d.media, cor: COR_MARCA },
                    { rotulo: `Total (${d.qtd} ${d.qtd === 1 ? "gasto" : "gastos"})`, valor: d.total },
                  ],
                }))}
              />
            </>
          )}
        </Card>
      </Secao>

      {/* Lugares */}
      <Secao titulo="Onde você mais compra" className="lg:min-w-0">
        <Card className="px-3 pb-1 pt-3">
          <Segmentado
            rotulo="Ordenar lugares por"
            opcoes={ORDENS}
            valor={ordem}
            onChange={(o) => {
              setOrdem(o);
              setTodosLugares(false);
            }}
            pequeno
            className="mb-1"
          />
          {ordenados.length === 0 ? (
            <Vazio icone={<MapPin className="h-5 w-5" aria-hidden />} titulo="Nenhum gasto neste período" />
          ) : (
            <>
              <ul className="divide-y divide-borda">
                {(todosLugares ? ordenados.slice(0, 20) : ordenados.slice(0, LUGARES_INICIAL)).map((l, idx) => (
                  <li key={l.chave} className="flex items-center gap-3 py-2.5">
                    <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-texto-3">
                      {idx + 1}
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                      <IconeCategoria categoria={l.categoria} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-texto">{l.nome}</span>
                        <Valor valor={l.total} className="shrink-0 text-sm text-texto" />
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <BarraFina
                          fracao={(ordem === "vezes" ? l.vezes : l.total) / maiorLugar}
                          cor={COR_MARCA}
                          className="h-1 flex-1"
                        />
                        <span className="shrink-0 text-[11px] text-texto-3">
                          {l.vezes} {l.vezes === 1 ? "vez" : "vezes"}
                          {l.vezes > 1 ? ` · ${brlInteiro(l.total / l.vezes)} cada` : ""}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {ordenados.length > LUGARES_INICIAL ? (
                <button
                  type="button"
                  onClick={() => setTodosLugares((v) => !v)}
                  className="mb-1 h-9 w-full touch-manipulation rounded-xl border-t border-borda text-xs font-semibold text-marca hover:bg-white/[0.04]"
                >
                  {todosLugares ? "Mostrar menos" : "Ver mais"}
                </button>
              ) : null}
            </>
          )}
        </Card>
      </Secao>

      {/* Recorrentes */}
      <Secao titulo="Gastos que se repetem" acao={{ label: "Contas fixas", href: "/recorrencias" }} className="lg:min-w-0">
        <Card className="px-3">
          {recs.length === 0 ? (
            <Vazio
              icone={<Repeat className="h-5 w-5" aria-hidden />}
              titulo="Nenhum gasto repetido encontrado"
              texto="Assinaturas e contas que aparecem quase todo mês, com valor parecido, aparecem aqui."
            />
          ) : (
            <>
              <div className="flex justify-between gap-3 border-b border-borda px-1 py-2.5 text-xs text-texto-3">
                <span>
                  {recs.length} {recs.length === 1 ? "item" : "itens"} nos últimos 6 meses
                </span>
                <span>
                  ≈ <span className="valor font-medium text-texto">{brlInteiro(totalFixos)}</span>/mês
                </span>
              </div>
              <ul className="divide-y divide-borda">
                {(todosRec ? recs : recs.slice(0, RECORRENTES_INICIAL)).map((r) => (
                  <li key={r.chave} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                      <IconeCategoria categoria={r.categoria} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-texto">{r.nome}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-texto-3">
                        em {r.meses} de 6 meses
                        {r.cadastrada ? (
                          <span className="rounded-full bg-marca/15 px-1.5 py-px text-[10px] font-semibold text-marca">
                            conta fixa
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="valor shrink-0 text-sm text-texto">
                      {brlInteiro(r.valorMensal)}
                      <span className="text-[11px] text-texto-3">/mês</span>
                    </span>
                  </li>
                ))}
              </ul>
              {recs.length > RECORRENTES_INICIAL ? (
                <button
                  type="button"
                  onClick={() => setTodosRec((v) => !v)}
                  className="mb-1 h-9 w-full touch-manipulation rounded-xl border-t border-borda text-xs font-semibold text-marca hover:bg-white/[0.04]"
                >
                  {todosRec ? "Mostrar menos" : `Ver todos (${recs.length})`}
                </button>
              ) : null}
            </>
          )}
        </Card>
      </Secao>
    </div>
  );
}
