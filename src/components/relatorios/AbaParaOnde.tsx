"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CircleEllipsis, Hash, Inbox } from "lucide-react";
import type { FatiaGasto, MeioAnalise, VisaoComposicao } from "@/types/relatorios";
import { Card, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { dataCurta, variacaoPct } from "@/components/relatorios/dados";
import {
  composicao,
  lancamentosDoGrupo,
  meioDoLancamento,
  tendenciaDoGrupo,
} from "@/components/relatorios/calculos";
import { GraficoBarras } from "@/components/relatorios/graficos";
import type { ContextoAnalise } from "@/components/relatorios/contexto";
import {
  BarraFina,
  Bolha,
  ICONE_MEIO,
  Segmentado,
  Variacao,
  Vazio,
  brlInteiro,
  pctTexto,
} from "@/components/relatorios/ui";

const VISOES: readonly { id: VisaoComposicao; label: string }[] = [
  { id: "categoria", label: "Categoria" },
  { id: "meio", label: "Meio de pagamento" },
  { id: "tag", label: "Tag" },
];

const ROTULO_MEIO: Record<MeioAnalise, string> = {
  Crédito: "Crédito",
  Débito: "Débito",
  Pix: "Pix",
  Dinheiro: "Dinheiro",
  Outros: "Outros / não informado",
};

function IconeGrupo({ fatia, visao }: { fatia: FatiaGasto; visao: VisaoComposicao }) {
  let icone;
  if (visao === "tag") icone = <Hash className="h-4 w-4" aria-hidden />;
  else if (visao === "meio") {
    const I = ICONE_MEIO[fatia.nome as MeioAnalise] ?? CircleEllipsis;
    icone = <I className="h-4 w-4" aria-hidden />;
  } else icone = <IconeCategoria categoria={fatia.nome === "Outros" ? null : fatia.nome} />;
  return (
    <Bolha cor={fatia.cor} className="h-9 w-9">
      {icone}
    </Bolha>
  );
}

const LISTA_INICIAL = 6;

/** Detalhe de um grupo: tendência de 6 meses + lançamentos do período. */
function DetalheGrupo({
  ctx,
  fatia,
  visao,
}: {
  ctx: ContextoAnalise;
  fatia: FatiaGasto;
  visao: VisaoComposicao;
}) {
  const [todos, setTodos] = useState(false);
  const tendencia = useMemo(
    () => tendenciaDoGrupo(ctx.dados.lancamentos, ctx.ref, visao, fatia.membros),
    [ctx, visao, fatia.membros],
  );
  const lancs = useMemo(
    () => lancamentosDoGrupo(ctx.atuais, visao, fatia.membros),
    [ctx, visao, fatia.membros],
  );
  const anteriores = tendencia.slice(0, 5);
  const media = anteriores.reduce((a, t) => a + t.valor, 0) / anteriores.length;
  const visiveis = todos ? lancs : lancs.slice(0, LISTA_INICIAL);

  return (
    <div className="mb-2 rounded-xl bg-white/[0.03] px-3 pb-2 pt-3 ring-1 ring-inset ring-white/[0.05]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-texto-2">Últimos 6 meses</p>
        <p className="text-[11px] text-texto-3">
          média de {brlInteiro(media)}/mês nos 5 anteriores
        </p>
      </div>
      <div className="mt-1">
        <GraficoBarras
          altura={112}
          largura={18}
          rotuloValor={fatia.nome}
          dados={tendencia.map((t) => ({
            label: t.label,
            valor: t.valor,
            cor: fatia.cor,
            apagado: t.parcial,
            sub: t.parcial ? "parcial" : undefined,
            tituloTooltip: t.parcial ? `${t.label} (até hoje)` : t.label,
          }))}
        />
      </div>

      <p className="mt-2 text-xs font-medium text-texto-2">
        {lancs.length} {lancs.length === 1 ? "lançamento" : "lançamentos"} no período
      </p>
      <ul className="mt-1 divide-y divide-borda">
        {visiveis.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-texto">{l.descricao || "Despesa"}</span>
              <span className="mt-0.5 block truncate text-[11px] text-texto-3">
                {[
                  dataCurta(l.data),
                  visao === "categoria" && fatia.nome !== "Outros" ? null : l.tag || "Sem categoria",
                  visao === "meio" ? l.conta_cartao : meioDoLancamento(l),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <Valor valor={-l.valor} className="shrink-0 text-[13px] text-texto" />
          </li>
        ))}
      </ul>
      {lancs.length > LISTA_INICIAL ? (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="h-9 w-full touch-manipulation rounded-lg text-xs font-semibold text-marca hover:bg-white/[0.04]"
        >
          {todos ? "Mostrar menos" : `Ver todos (${lancs.length})`}
        </button>
      ) : null}
    </div>
  );
}

export function AbaParaOnde({ ctx }: { ctx: ContextoAnalise }) {
  const [visao, setVisao] = useState<VisaoComposicao>("categoria");
  const [aberto, setAberto] = useState<string | null>(null);

  const { fatias, total } = useMemo(
    () => composicao(ctx.atuais, ctx.anteriores, visao, 8),
    [ctx, visao],
  );
  const totalDespesas = useMemo(
    () => ctx.atuais.reduce((a, r) => (r.tipo === "despesa" ? a + r.valor : a), 0),
    [ctx],
  );
  const totalAnterior = useMemo(
    () => ctx.anteriores.reduce((a, r) => (r.tipo === "despesa" ? a + r.valor : a), 0),
    [ctx],
  );
  const qtd = ctx.atuais.filter((r) => r.tipo === "despesa").length;

  return (
    <div className="flex flex-col gap-4">
      <Segmentado
        rotulo="Agrupar gastos por"
        opcoes={VISOES}
        valor={visao}
        pequeno
        onChange={(v) => {
          setVisao(v);
          setAberto(null);
        }}
      />

      <Card className="px-3 pb-2 pt-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-xs text-texto-3">Total gasto</p>
            <p className="text-2xl font-semibold leading-tight text-texto">
              <Valor valor={totalDespesas} />
            </p>
          </div>
          <div className="pb-0.5 text-right text-[11px] text-texto-3">
            <Variacao pct={variacaoPct(totalDespesas, totalAnterior)} subirEhBom={false} />
            <p>
              {qtd} {qtd === 1 ? "gasto" : "gastos"}
            </p>
          </div>
        </div>

        {fatias.length === 0 ? (
          <Vazio
            icone={visao === "tag" ? <Hash className="h-5 w-5" aria-hidden /> : <Inbox className="h-5 w-5" aria-hidden />}
            titulo={visao === "tag" ? "Nenhum gasto com tag neste período" : "Nenhum gasto neste período"}
            texto={
              visao === "tag"
                ? "Adicione tags aos lançamentos (ex.: #viagem) para agrupar gastos do seu jeito."
                : "Quando houver despesas, você vê aqui para onde foi cada real."
            }
          />
        ) : (
          <>
            {visao !== "tag" ? (
              <div className="mx-1 mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {fatias.map((f) => (
                  <div key={f.nome} style={{ flex: f.valor, background: f.cor }} />
                ))}
              </div>
            ) : null}

            <ul className="mt-2 flex flex-col">
              {fatias.map((f) => {
                const estaAberto = aberto === f.nome;
                const maior = fatias.reduce((m, x) => Math.max(m, x.pct), 1);
                return (
                  <li key={f.nome}>
                    <button
                      type="button"
                      aria-expanded={estaAberto}
                      onClick={() => setAberto(estaAberto ? null : f.nome)}
                      className={`flex w-full touch-manipulation items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-white/[0.03] ${
                        estaAberto ? "bg-white/[0.03]" : ""
                      }`}
                    >
                      <IconeGrupo fatia={f} visao={visao} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm text-texto">
                            {visao === "meio" ? ROTULO_MEIO[f.nome as MeioAnalise] ?? f.nome : f.nome}
                            {f.nome === "Outros" && f.membros.length > 1 ? (
                              <span className="text-texto-3"> · {f.membros.length}</span>
                            ) : null}
                          </span>
                          <Valor valor={f.valor} className="shrink-0 text-sm font-medium text-texto" />
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <BarraFina fracao={f.pct / maior} cor={f.cor} className="h-1 flex-1" />
                          <span className="w-8 shrink-0 text-right text-[11px] text-texto-3">
                            {pctTexto(f.pct)}
                          </span>
                          <span className="flex w-11 shrink-0 justify-end">
                            <Variacao pct={f.variacao} subirEhBom={false} />
                          </span>
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-texto-3 transition-transform ${
                          estaAberto ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                    {estaAberto ? <DetalheGrupo ctx={ctx} fatia={f} visao={visao} /> : null}
                  </li>
                );
              })}
            </ul>
            <p className="px-1 pb-1 pt-1 text-[11px] text-texto-3">
              {visao === "tag"
                ? `Um gasto com várias tags conta em cada uma (soma das tags: ${brlInteiro(total)}).`
                : `Toque num item para ver os lançamentos. Variação vs ${ctx.comparacaoNo.replace(/^n(o|os) /, "")}.`}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
