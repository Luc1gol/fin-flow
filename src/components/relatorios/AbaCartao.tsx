"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CreditCard, Layers, ShoppingBag } from "lucide-react";
import type { MeioAnalise } from "@/types/relatorios";
import { Card, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { dataCurta, dataDoIso } from "@/components/relatorios/dados";
import {
  CORES_MEIO,
  compromissoFuturo,
  composicao,
  ehCredito,
  faturasPorMes,
  parcelamentosAtivos,
  rendaMediaMensal,
  resumoCartoes,
} from "@/components/relatorios/calculos";
import { COR_MARCA, GraficoBarras, GraficoEmpilhado } from "@/components/relatorios/graficos";
import type { ContextoAnalise } from "@/components/relatorios/contexto";
import {
  BarraFina,
  Bolha,
  ICONE_MEIO,
  LogoBanco,
  Vazio,
  brlInteiro,
  pctTexto,
} from "@/components/relatorios/ui";

const COR_ABERTA = "#fbbf24";
const PARCELAS_INICIAL = 5;

function dataLonga(iso: string): string {
  return dataDoIso(iso)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    .replace(".", "");
}

export function AbaCartao({ ctx }: { ctx: ContextoAnalise }) {
  const [todasParcelas, setTodasParcelas] = useState(false);
  const { dados, ref } = ctx;

  const meios = useMemo(() => composicao(ctx.atuais, ctx.anteriores, "meio", 5), [ctx]);
  const credito = meios.fatias.find((f) => f.nome === "Crédito");
  const cartoes = useMemo(() => resumoCartoes(dados.contasCartao, ref), [dados, ref]);
  const faturas = useMemo(() => faturasPorMes(dados.faturas, ref), [dados, ref]);
  const fechadas = faturas.filter((f) => !f.aberta && f.total > 0).slice(-6);
  const mediaFaturas = fechadas.length
    ? fechadas.reduce((a, f) => a + f.total, 0) / fechadas.length
    : 0;
  const compromisso = useMemo(() => compromissoFuturo(dados.lancamentos, ref), [dados, ref]);
  const totalCompromisso = compromisso.reduce((a, m) => a + m.lancado + m.previsto, 0);
  const renda = useMemo(() => rendaMediaMensal(dados.lancamentos, ref), [dados, ref]);
  const proximoMes = compromisso[1];
  const parcelas = useMemo(() => parcelamentosAtivos(dados.lancamentos, ref), [dados, ref]);
  const faltaParcelas = parcelas.reduce((a, p) => a + p.falta, 0);
  const porMesParcelas = parcelas.reduce((a, p) => a + p.valorParcela, 0);
  const maiores = useMemo(
    () =>
      ctx.atuais
        .filter((r) => r.tipo === "despesa" && ehCredito(r))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5),
    [ctx],
  );

  const temContas = dados.contasCartao.length > 0;
  const usoLimite = cartoes.temLimite ? 1 - cartoes.disponivel / cartoes.limite : 0;

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* Como você paga */}
      <Card className="px-4 py-4 lg:min-w-0">
        <p className="text-xs text-texto-3">Gasto no crédito no período</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-[26px] font-semibold leading-tight text-texto">
            <Valor valor={credito?.valor ?? 0} />
          </p>
          {credito ? (
            <span className="text-sm text-texto-3">{pctTexto(credito.pct)} dos gastos</span>
          ) : null}
        </div>
        {meios.fatias.length > 0 ? (
          <>
            <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {meios.fatias.map((f) => (
                <div key={f.nome} style={{ flex: f.valor, background: f.cor }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {meios.fatias.map((f) => {
                const I = ICONE_MEIO[f.nome as MeioAnalise];
                return (
                  <li key={f.nome} className="flex min-w-0 items-center gap-2">
                    <Bolha cor={CORES_MEIO[f.nome as MeioAnalise] ?? f.cor} className="h-7 w-7">
                      <I className="h-3.5 w-3.5" aria-hidden />
                    </Bolha>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-texto-2">
                        {f.nome === "Outros" ? "Outros" : f.nome}{" "}
                        <span className="text-texto-3">{pctTexto(f.pct)}</span>
                      </span>
                      <Valor valor={f.valor} className="block truncate text-[13px] font-medium text-texto" />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-texto-3">Nenhum gasto neste período.</p>
        )}
      </Card>

      {/* Cartões hoje (banco) */}
      {temContas ? (
        <Secao titulo="Seus cartões hoje" acao={{ label: "Cartões", href: "/cartoes" }} className="lg:min-w-0">
          <Card className="px-4 py-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-texto-3">Fatura atual (segundo o banco)</p>
                <p className="text-xl font-semibold text-texto">
                  <Valor valor={cartoes.devido} />
                </p>
              </div>
              {cartoes.proximoVencimento ? (
                <p className="flex items-center gap-1 pb-1 text-[11px] text-texto-3">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  vence {dataLonga(cartoes.proximoVencimento)}
                </p>
              ) : null}
            </div>
            {cartoes.temLimite ? (
              <div className="mt-2">
                <BarraFina
                  fracao={usoLimite}
                  cor={usoLimite >= 0.8 ? "#f87171" : usoLimite >= 0.5 ? COR_ABERTA : COR_MARCA}
                  className="h-1.5"
                />
                <p className="mt-1 flex justify-between text-[11px] text-texto-3">
                  <span>{Math.round(usoLimite * 100)}% do limite usado</span>
                  <span>
                    {brlInteiro(cartoes.disponivel)} livres de {brlInteiro(cartoes.limite)}
                  </span>
                </p>
              </div>
            ) : null}
            {dados.contasCartao.length > 1 ? (
              <ul className="mt-2 divide-y divide-borda border-t border-borda">
                {dados.contasCartao.map((c) => (
                  <li key={c.id}>
                    <LinhaLista
                      icone={<LogoBanco bancoId={c.bancoId} className="h-full w-full" />}
                      titulo={c.nome}
                      subtitulo={
                        c.limite
                          ? `Limite ${brlInteiro(c.limite)}${
                              c.limiteDisponivel != null ? ` · ${brlInteiro(c.limiteDisponivel)} livres` : ""
                            }`
                          : "Sem limite informado"
                      }
                      direita={<Valor valor={Math.max(0, c.saldo ?? 0)} />}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </Secao>
      ) : null}

      {/* Histórico de faturas */}
      <Secao titulo="Faturas" className="lg:min-w-0">
        <Card className="p-3">
          {faturas.length === 0 ? (
            <Vazio
              icone={<CreditCard className="h-5 w-5" aria-hidden />}
              titulo="Sem histórico de faturas"
              texto="Conecte seu banco para ver o valor real de cada fatura do cartão."
              acao={
                <Link href="/cartoes" className="inline-flex h-9 items-center text-xs font-semibold text-marca">
                  Ir para cartões
                </Link>
              }
            />
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <p className="text-xs text-texto-3">
                  {fechadas.length > 0 ? (
                    <>
                      Média das últimas {fechadas.length}:{" "}
                      <span className="valor font-medium text-texto">{brlInteiro(mediaFaturas)}</span>
                    </>
                  ) : (
                    "Por mês de vencimento"
                  )}
                </p>
                <span className="flex items-center gap-3 text-[11px] text-texto-3">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: COR_MARCA }} /> fechada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: COR_ABERTA }} /> aberta
                  </span>
                </span>
              </div>
              <GraficoBarras
                altura={160}
                largura={faturas.length > 8 ? 14 : 20}
                dados={faturas.map((f) => ({
                  label: f.label,
                  valor: f.total,
                  cor: f.aberta ? COR_ABERTA : COR_MARCA,
                  apagado: f.aberta,
                  tituloTooltip: `Fatura de ${f.label}${f.aberta ? " (aberta)" : ""}`,
                  tooltip: [
                    { rotulo: "Total", valor: f.total, cor: f.aberta ? COR_ABERTA : COR_MARCA },
                    { rotulo: "Pago", valor: f.pago },
                  ],
                }))}
              />
            </>
          )}
        </Card>
      </Secao>

      {/* Compromisso futuro */}
      <Secao titulo="Compromisso futuro" className="lg:min-w-0">
        <Card className="p-3">
          {totalCompromisso <= 0 ? (
            <Vazio
              icone={<Layers className="h-5 w-5" aria-hidden />}
              titulo="Nada comprometido para os próximos meses"
              texto="Parcelas e compras no crédito com data futura aparecem aqui."
            />
          ) : (
            <>
              <div className="px-1">
                <p className="text-xs text-texto-3">Já comprometido nos próximos 6 meses</p>
                <p className="text-xl font-semibold text-texto">
                  <Valor valor={totalCompromisso} />
                </p>
                {proximoMes && renda > 0 && proximoMes.lancado + proximoMes.previsto > 0 ? (
                  <p className="mt-0.5 text-xs text-texto-2">
                    Em {proximoMes.label.toLowerCase()},{" "}
                    <span className="font-semibold text-texto">
                      {Math.round(((proximoMes.lancado + proximoMes.previsto) / renda) * 100)}%
                    </span>{" "}
                    da sua renda média já está comprometida.
                  </p>
                ) : null}
              </div>
              <div className="mt-2">
                <GraficoEmpilhado
                  rotuloBase="Já lançado"
                  rotuloTopo="Parcelas previstas"
                  dados={compromisso.map((m) => ({
                    label: m.label,
                    base: m.lancado,
                    topo: m.previsto,
                    sub: m.atual ? "resto" : undefined,
                    tituloTooltip: m.atual ? `${m.label} (depois de hoje)` : m.label,
                  }))}
                />
              </div>
              <p className="px-1 text-[11px] text-texto-3">
                Compras no crédito com data futura + parcelas que ainda vão entrar (translúcido).
              </p>
            </>
          )}
        </Card>
      </Secao>

      {/* Parcelamentos ativos */}
      {parcelas.length > 0 ? (
        <Secao titulo="Parcelamentos ativos" className="lg:min-w-0">
          <Card className="px-3">
            <div className="flex justify-between gap-3 border-b border-borda px-1 py-2.5 text-xs text-texto-3">
              <span>
                {parcelas.length} {parcelas.length === 1 ? "compra" : "compras"} ·{" "}
                <span className="valor text-texto">{brlInteiro(porMesParcelas)}</span>/mês
              </span>
              <span>
                faltam <span className="valor font-medium text-texto">{brlInteiro(faltaParcelas)}</span>
              </span>
            </div>
            <ul className="divide-y divide-borda">
              {(todasParcelas ? parcelas : parcelas.slice(0, PARCELAS_INICIAL)).map((p) => (
                <li key={p.chave} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                    <IconeCategoria categoria={p.categoria} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-texto">{p.nome}</span>
                      <span className="valor shrink-0 text-sm text-texto">
                        {brlInteiro(p.valorParcela)}
                        <span className="text-[11px] text-texto-3">/mês</span>
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <BarraFina fracao={p.pagas / p.total} cor={COR_MARCA} className="h-1 flex-1" />
                      <span className="shrink-0 text-[11px] text-texto-3">
                        {p.pagas}/{p.total} · faltam {brlInteiro(p.falta)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {parcelas.length > PARCELAS_INICIAL ? (
              <button
                type="button"
                onClick={() => setTodasParcelas((v) => !v)}
                className="mb-1 h-9 w-full touch-manipulation rounded-xl border-t border-borda text-xs font-semibold text-marca hover:bg-white/[0.04]"
              >
                {todasParcelas ? "Mostrar menos" : `Ver todas (${parcelas.length})`}
              </button>
            ) : null}
          </Card>
        </Secao>
      ) : null}

      {/* Maiores compras no crédito */}
      <Secao titulo="Maiores compras no crédito" className="lg:min-w-0">
        <Card className="px-3">
          {maiores.length === 0 ? (
            <Vazio
              icone={<ShoppingBag className="h-5 w-5" aria-hidden />}
              titulo="Nenhuma compra no crédito neste período"
            />
          ) : (
            <ul className="divide-y divide-borda">
              {maiores.map((g) => {
                const bancoId = ctx.bancoDoCartao(g.conta_cartao);
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
                      titulo={g.descricao || "Compra"}
                      subtitulo={[g.tag || "Sem categoria", g.conta_cartao, dataCurta(g.data)]
                        .filter(Boolean)
                        .join(" · ")}
                      direita={<Valor valor={-g.valor} />}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Secao>
    </div>
  );
}
