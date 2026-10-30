"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Inbox } from "lucide-react";
import type {
  LancamentoRelatorioRow,
  PeriodoRelatorioId,
  VisaoComposicao,
} from "@/types/relatorios";
import {
  labelContaCartaoPersistido,
  type CartaoUsuarioOrigem,
} from "@/lib/conta-cartao-lancamento";
import { coalesceTagsExtrasFromUnknown } from "@/lib/tags-extras-coalesce";
import { supabase } from "@/lib/supabase";
import { Card, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import {
  ROTULO_COMPARACAO,
  composicaoDeGastos,
  dentroDo,
  diasDecorridos,
  emFatias,
  evolucaoDoPeriodo,
  intervaloAnterior,
  intervaloDoPeriodo,
  isoDaData,
  maioresDespesas,
  rotuloIntervalo,
  somarTotais,
  tipoFluxo,
  valorNumerico,
  variacaoPct,
} from "@/components/relatorios/dados";
import { COR_ENTRADA, COR_SAIDA, GraficoEvolucao } from "@/components/relatorios/GraficoEvolucao";
import { Esqueleto, ListaComposicao, LogoBanco, Segmentado } from "@/components/relatorios/ui";

const PERIODOS: readonly { id: PeriodoRelatorioId; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "mes", label: "Mês" },
  { id: "3m", label: "3 meses" },
  { id: "ano", label: "Ano" },
];

const VISOES: readonly { id: VisaoComposicao; label: string }[] = [
  { id: "categoria", label: "Categoria" },
  { id: "cartao", label: "Conta/cartão" },
  { id: "tag", label: "Tag" },
];

const MAX_FATIAS = 5;
const TOP_INICIAL = 5;
const TOP_MAX = 10;

type DadosAnalise = {
  periodo: PeriodoRelatorioId;
  /** "Agora" no momento da busca: base de todas as janelas de datas. */
  ref: Date;
  lancamentos: LancamentoRelatorioRow[];
  cartoes: CartaoUsuarioOrigem[];
  erro: boolean;
};

/** Busca o período atual e o anterior (para comparação) numa única consulta. */
async function carregarAnalise(periodo: PeriodoRelatorioId): Promise<DadosAnalise> {
  const ref = new Date();
  const vazio: DadosAnalise = { periodo, ref, lancamentos: [], cartoes: [], erro: false };
  const atual = intervaloDoPeriodo(periodo, ref);
  const anterior = intervaloAnterior(periodo, ref);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return vazio;

  const [lacRes, cartRes] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id, tipo, valor, data, descricao, tag, conta_cartao, tags_extras")
      .eq("user_id", user.id)
      .gte("data", anterior.desde < atual.desde ? anterior.desde : atual.desde)
      .lte("data", atual.ate),
    supabase.from("cartoes").select("id, nome, banco").eq("user_id", user.id),
  ]);

  if (cartRes.error) console.error(cartRes.error);
  const cartoes = cartRes.error
    ? []
    : ((cartRes.data ?? []) as { id: string; nome: string | null; banco?: string | null }[]).map(
        (r) => ({
          id: String(r.id),
          nome: String(r.nome ?? "").trim(),
          banco: String(r.banco ?? "").trim(),
        }),
      );

  if (lacRes.error) {
    console.error(lacRes.error);
    return { ...vazio, cartoes, erro: true };
  }

  const lancamentos: LancamentoRelatorioRow[] = (lacRes.data ?? []).map(
    (item: Record<string, unknown>) => ({
      id: String(item.id),
      tipo: String(item.tipo ?? ""),
      valor: item.valor,
      data: String(item.data ?? "").slice(0, 10),
      descricao: item.descricao != null ? String(item.descricao) : null,
      tag: item.tag != null ? String(item.tag) : null,
      conta_cartao: item.conta_cartao != null ? String(item.conta_cartao) : null,
      tags_extras: coalesceTagsExtrasFromUnknown(item.tags_extras),
    }),
  );
  return { periodo, ref, lancamentos, cartoes, erro: false };
}

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "▲ 12%" colorido: subir é bom para entradas e ruim para saídas. */
function Variacao({ pct, subirEhBom }: { pct: number | null; subirEhBom: boolean }) {
  if (pct == null) return <span className="text-texto-3">sem base de comparação</span>;
  if (pct === 0) return <span className="text-texto-3">igual ao anterior</span>;
  const bom = pct > 0 === subirEhBom;
  return (
    <span className={bom ? "text-positivo" : "text-negativo"}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
      <span className="text-texto-3"> vs anterior</span>
    </span>
  );
}

export function RelatoriosScreen() {
  const [periodo, setPeriodo] = useState<PeriodoRelatorioId>("mes");
  const [visao, setVisao] = useState<VisaoComposicao>("categoria");
  const [composicaoAberta, setComposicaoAberta] = useState(false);
  const [topAberto, setTopAberto] = useState(false);
  const [dados, setDados] = useState<DadosAnalise | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarAnalise(periodo)
      .then((d) => {
        if (!cancelado) setDados(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) {
          setDados({ periodo, ref: new Date(), lancamentos: [], cartoes: [], erro: true });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [periodo]);

  // Carregando = ainda não chegaram os dados do período escolhido.
  const carregando = dados?.periodo !== periodo;
  const ref = dados?.ref;

  const analise = useMemo(() => {
    if (!dados) return null;
    const atual = intervaloDoPeriodo(dados.periodo, dados.ref);
    const anterior = intervaloAnterior(dados.periodo, dados.ref);
    const atuais = dados.lancamentos.filter((r) => dentroDo(atual, r.data));
    const anteriores = dados.lancamentos.filter((r) => dentroDo(anterior, r.data));
    const totais = somarTotais(atuais);
    const totaisAnt = somarTotais(anteriores);
    const hoje = isoDaData(dados.ref);
    // Média só com gastos até hoje (o "Ano" inclui lançamentos futuros, como parcelas).
    const gastoAteHoje = somarTotais(atuais.filter((r) => r.data <= hoje)).saidas;
    const despesas = atuais.filter((r) => tipoFluxo(r.tipo) === "despesa");
    return {
      atual,
      anterior,
      atuais,
      totais,
      varEntradas: variacaoPct(totais.entradas, totaisAnt.entradas),
      varSaidas: variacaoPct(totais.saidas, totaisAnt.saidas),
      mediaDiaria: gastoAteHoje / diasDecorridos(dados.periodo, dados.ref),
      qtdDespesas: despesas.length,
      ticketMedio: despesas.length ? totais.saidas / despesas.length : 0,
      evolucao: evolucaoDoPeriodo(atuais, dados.periodo, dados.ref),
      semFluxo: atuais.every((r) => tipoFluxo(r.tipo) == null),
    };
  }, [dados]);

  const grupos = useMemo(
    () => composicaoDeGastos(analise?.atuais ?? [], visao),
    [analise, visao],
  );
  const fatias = useMemo(
    () => emFatias(grupos, composicaoAberta ? grupos.length : MAX_FATIAS),
    [grupos, composicaoAberta],
  );
  const topGastos = useMemo(
    () => maioresDespesas(analise?.atuais ?? [], TOP_MAX),
    [analise],
  );

  const cartoes = dados?.cartoes;
  const bancoDoCartao = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of cartoes ?? []) {
      if (c.banco) mapa.set(labelContaCartaoPersistido(c.nome), c.banco);
    }
    return (nome: string | null | undefined) => mapa.get(String(nome ?? "").trim()) ?? null;
  }, [cartoes]);

  const intervaloTexto = ref ? rotuloIntervalo(intervaloDoPeriodo(periodo, ref)) : "";
  const pronto = !carregando && analise != null;
  const resultado = analise ? analise.totais.entradas - analise.totais.saidas : 0;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-texto">Análise</h1>
          <p className="mt-0.5 h-4 text-xs text-texto-3">{carregando ? "" : intervaloTexto}</p>
        </div>
      </header>

      <Segmentado
        rotulo="Período"
        opcoes={PERIODOS}
        valor={periodo}
        onChange={(p) => {
          setPeriodo(p);
          setComposicaoAberta(false);
          setTopAberto(false);
        }}
      />

      {pronto && dados?.erro ? (
        <p className="text-sm text-negativo">Não foi possível carregar seus dados.</p>
      ) : null}

      {/* Resumo */}
      <section>
        <p className="text-xs text-texto-3">Resultado do período</p>
        {pronto ? (
          <p className="mt-0.5 text-[28px] font-semibold leading-tight text-texto">
            <Valor valor={resultado} sinal />
          </p>
        ) : (
          <Esqueleto className="mt-1 h-8 w-40" />
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Card className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowDownLeft className="h-3.5 w-3.5 text-positivo" aria-hidden /> Entradas
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-positivo">
              {pronto ? <Valor valor={analise.totais.entradas} /> : "…"}
            </p>
            <p className="mt-0.5 truncate text-[11px]">
              {pronto ? <Variacao pct={analise.varEntradas} subirEhBom /> : " "}
            </p>
          </Card>
          <Card className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowUpRight className="h-3.5 w-3.5 text-negativo" aria-hidden /> Saídas
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-negativo">
              {pronto ? <Valor valor={analise.totais.saidas} /> : "…"}
            </p>
            <p className="mt-0.5 truncate text-[11px]">
              {pronto ? <Variacao pct={analise.varSaidas} subirEhBom={false} /> : " "}
            </p>
          </Card>
        </div>

        <Card className="mt-2 grid grid-cols-3 divide-x divide-borda py-2.5">
          {[
            { rotulo: "Gasto médio/dia", conteudo: pronto ? <Valor valor={analise.mediaDiaria} /> : "…" },
            { rotulo: "Despesas", conteudo: pronto ? analise.qtdDespesas : "…" },
            { rotulo: "Ticket médio", conteudo: pronto ? <Valor valor={analise.ticketMedio} /> : "…" },
          ].map((s) => (
            <div key={s.rotulo} className="min-w-0 px-3">
              <p className="truncate text-[11px] text-texto-3">{s.rotulo}</p>
              <p className="valor mt-0.5 truncate text-sm font-semibold text-texto">{s.conteudo}</p>
            </div>
          ))}
        </Card>
        {pronto && (analise.varEntradas != null || analise.varSaidas != null) ? (
          <p className="mt-1.5 text-[11px] text-texto-3">
            Comparação {ROTULO_COMPARACAO[periodo]} ({rotuloIntervalo(analise.anterior)})
          </p>
        ) : null}
      </section>

      {pronto && analise.semFluxo ? (
        <Card className="flex flex-col items-center px-4 py-8 text-center">
          <Inbox className="h-8 w-8 text-texto-3" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-texto-2">Nenhuma entrada ou saída neste período.</p>
          <Link href="/lancar" className="mt-1 inline-flex h-9 items-center text-xs font-semibold text-marca">
            Fazer um lançamento
          </Link>
        </Card>
      ) : (
        <>
          {/* Evolução */}
          <Secao titulo="Entradas vs saídas">
            <Card className="p-3">
              <div className="mb-2 flex items-center gap-4 text-xs text-texto-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COR_ENTRADA }} />
                  Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COR_SAIDA }} />
                  Saídas
                </span>
              </div>
              {pronto ? (
                <GraficoEvolucao dados={analise.evolucao} />
              ) : (
                <Esqueleto className="h-48 w-full" />
              )}
            </Card>
          </Secao>

          {/* Composição */}
          <Secao titulo="Para onde foi o dinheiro">
            <Card className="p-3">
              <Segmentado
                rotulo="Agrupar gastos por"
                opcoes={VISOES}
                valor={visao}
                onChange={(v) => {
                  setVisao(v);
                  setComposicaoAberta(false);
                }}
                className="mb-3"
              />
              {!pronto ? (
                <div className="flex flex-col gap-3">
                  <Esqueleto className="h-2 rounded-full" />
                  {[0, 1, 2].map((i) => (
                    <Esqueleto key={i} className="h-8" />
                  ))}
                </div>
              ) : fatias.length === 0 ? (
                <p className="py-3 text-center text-xs text-texto-3">
                  {visao === "tag"
                    ? "Nenhum gasto com tag neste período."
                    : "Nenhum gasto neste período."}
                </p>
              ) : (
                <>
                  <ListaComposicao fatias={fatias} visao={visao} bancoDoCartao={bancoDoCartao} />
                  {grupos.length > MAX_FATIAS ? (
                    <button
                      type="button"
                      onClick={() => setComposicaoAberta((v) => !v)}
                      className="mt-1 h-9 w-full touch-manipulation rounded-xl text-xs font-semibold text-marca hover:bg-white/[0.04]"
                    >
                      {composicaoAberta ? "Mostrar menos" : `Ver todas (${grupos.length})`}
                    </button>
                  ) : null}
                  {visao === "tag" ? (
                    <p className="mt-1 text-[11px] text-texto-3">
                      Um gasto com várias tags conta em cada uma delas.
                    </p>
                  ) : null}
                </>
              )}
            </Card>
          </Secao>

          {/* Maiores gastos */}
          <Secao titulo="Maiores gastos">
            <Card className="px-3">
              {!pronto ? (
                <div className="flex flex-col gap-3 py-3">
                  {[0, 1, 2].map((i) => (
                    <Esqueleto key={i} className="h-9" />
                  ))}
                </div>
              ) : topGastos.length === 0 ? (
                <p className="py-4 text-center text-xs text-texto-3">Nenhum gasto neste período.</p>
              ) : (
                <>
                  <ul className="divide-y divide-borda">
                    {topGastos.slice(0, topAberto ? TOP_MAX : TOP_INICIAL).map((g) => {
                      const bancoId = bancoDoCartao(g.conta_cartao);
                      return (
                        <li key={g.id}>
                          <LinhaLista
                            icone={
                              bancoId ? (
                                <LogoBanco bancoId={bancoId} className="h-full w-full" />
                              ) : (
                                <IconeCategoria categoria={g.tag} />
                              )
                            }
                            titulo={g.descricao?.trim() || "Despesa"}
                            subtitulo={[
                              g.tag?.trim() || "Sem categoria",
                              g.conta_cartao?.trim(),
                              dataCurta(g.data),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            direita={<Valor valor={-valorNumerico(g.valor)} />}
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {topGastos.length > TOP_INICIAL ? (
                    <button
                      type="button"
                      onClick={() => setTopAberto((v) => !v)}
                      className="mb-1 h-9 w-full touch-manipulation rounded-xl border-t border-borda text-xs font-semibold text-marca hover:bg-white/[0.04]"
                    >
                      {topAberto ? "Mostrar menos" : `Ver top ${topGastos.length}`}
                    </button>
                  ) : null}
                </>
              )}
            </Card>
          </Secao>
        </>
      )}
    </div>
  );
}
