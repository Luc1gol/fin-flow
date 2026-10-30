"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Info, Repeat, CalendarClock, TrendingUp } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Secao, Valor } from "@/components/ui/base";
import { formatBRL } from "@/lib/format-currency";
import { carregarProjecao, type EventoPrevisto, type Projecao } from "@/lib/dados/projecao";

const ICONE_EVENTO = {
  conta_fixa: Repeat,
  receita_fixa: TrendingUp,
  fatura: CreditCard,
  agendado: CalendarClock,
} as const;

const ROTULO_GRUPO = {
  conta_fixa: "Contas fixas",
  receita_fixa: "Receitas fixas",
  fatura: "Faturas de cartão",
  agendado: "Lançamentos futuros",
} as const;

const ROTULO_EVENTO = {
  conta_fixa: "Conta fixa",
  receita_fixa: "Receita fixa",
  fatura: "Fatura do cartão",
  agendado: "Lançamento futuro",
} as const;

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function IconeEvento({ tipo }: { tipo: EventoPrevisto["tipo"] }) {
  const Icone = ICONE_EVENTO[tipo];
  return <Icone className="h-4 w-4" aria-hidden />;
}

function TooltipGrafico({ active, payload }: { active?: boolean; payload?: { payload: Projecao["serie"][number] }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="vidro rounded-xl px-3 py-2 text-xs">
      <p className="text-texto-3">{dataCurta(p.data)}</p>
      <p className="text-texto">Previsto: {formatBRL(p.previsto)}</p>
      <p className="text-texto-2">Com dia a dia: {formatBRL(p.comDiaADia)}</p>
    </div>
  );
}

export function ProjecaoScreen() {
  const [projecao, setProjecao] = useState<Projecao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarProjecao()
      .then((p) => {
        if (!cancelado) setProjecao(p);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível calcular a projeção.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const p = projecao;
  const semSaldo = p && !p.saldoHoje;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-center gap-2">
        <Link href="/inicio" aria-label="Voltar" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 lg:hidden">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-texto">Projeção</h1>
          {p ? (
            <p className="text-xs text-texto-3">
              Até {dataCurta(p.fimMes)} · {p.diasRestantes === 1 ? "falta 1 dia" : `faltam ${p.diasRestantes} dias`}
            </p>
          ) : null}
        </div>
      </header>

      {erro ? <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p> : null}

      {!p ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-xs text-texto-3">
              {semSaldo ? `Variação prevista até ${dataCurta(p.fimMes)}` : `Saldo previsto em ${dataCurta(p.fimMes)}`}
            </p>
            <p className={`mt-0.5 text-[28px] font-semibold leading-tight ${p.saldoPrevisto < 0 ? "text-negativo" : "text-texto"}`}>
              <Valor valor={p.saldoPrevisto} />
            </p>
            <p className="mt-1 text-xs text-texto-2">
              Com seu gasto do dia a dia (~{formatBRL(p.gastoMedioDiario)}/dia):{" "}
              <span className={`font-semibold ${p.saldoComDiaADia < 0 ? "text-negativo" : "text-texto"}`}>
                <Valor valor={p.saldoComDiaADia} />
              </span>
            </p>
            {p.saldoComDiaADia < 0 ? (
              <p className="mt-2 rounded-lg bg-negativo/10 px-2.5 py-1.5 text-xs text-negativo">
                Nesse ritmo a conta fica negativa antes de {dataCurta(p.fimMes)}.
              </p>
            ) : null}

            <div className="mt-4 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={p.serie} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradPrevisto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="data"
                    tickFormatter={(d: string) => d.slice(8, 10)}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                  <ReferenceLine y={0} stroke="rgb(248 113 113 / 0.4)" strokeDasharray="3 3" />
                  <Tooltip content={<TooltipGrafico />} cursor={{ stroke: "rgb(255 255 255 / 0.15)" }} />
                  <Area type="stepAfter" dataKey="previsto" stroke="#4f8cff" strokeWidth={2} fill="url(#gradPrevisto)" />
                  <Area type="linear" dataKey="comDiaADia" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-4 text-[11px] text-texto-3">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-marca" /> Só o previsto
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded border-t border-dashed border-texto-2" /> Com dia a dia
              </span>
            </div>
          </Card>

          <Secao titulo="Como chegamos nesse valor">
            <Card className="divide-y divide-borda px-3 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-texto-2">
                  {p.saldoHoje ? "Saldo hoje no banco" : "Ponto de partida"}
                </span>
                <Valor valor={p.saldoHoje?.valor ?? 0} className="text-texto" />
              </div>
              {(["receita_fixa", "agendado", "conta_fixa", "fatura"] as const).map((tipo) => {
                const soma = p.eventos.filter((e) => e.tipo === tipo).reduce((a, e) => a + e.valor, 0);
                if (soma === 0) return null;
                return (
                  <div key={tipo} className="flex items-center justify-between py-2.5">
                    <span className="text-texto-2">{ROTULO_GRUPO[tipo]}</span>
                    <Valor valor={soma} sinal colorir />
                  </div>
                );
              })}
              <div className="flex items-center justify-between py-2.5 font-semibold">
                <span className="text-texto">Saldo previsto</span>
                <Valor valor={p.saldoPrevisto} className="text-texto" />
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-texto-3">Gasto do dia a dia ({p.diasRestantes} dias)</span>
                <Valor valor={-p.gastoMedioDiario * p.diasRestantes} sinal className="text-texto-3" />
              </div>
            </Card>
          </Secao>

          <Secao titulo={`O que ainda vem até ${dataCurta(p.fimMes)}`}>
            {p.eventos.length === 0 ? (
              <Card className="p-4 text-center text-xs text-texto-3">
                Nada previsto. Cadastre suas contas fixas para a projeção ficar mais precisa.
              </Card>
            ) : (
              <Card className="divide-y divide-borda px-3">
                {p.eventos.map((e, i) => (
                  <div key={`${e.data}-${e.descricao}-${i}`} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                      <IconeEvento tipo={e.tipo} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-texto">{e.descricao}</span>
                      <span className="block text-xs text-texto-3">
                        {dataCurta(e.data)} · {ROTULO_EVENTO[e.tipo]}
                        {e.doBanco ? " · valor do banco" : e.estimado ? " · estimada pelos lançamentos" : ""}
                      </span>
                    </span>
                    <Valor valor={e.valor} sinal colorir={e.valor > 0} className="text-sm" />
                  </div>
                ))}
              </Card>
            )}
          </Secao>

          <p className="flex gap-2 text-[11px] text-texto-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {p.saldoHoje?.em
                ? `Saldo do banco de ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(p.saldoHoje.em))}. `
                : semSaldo
                  ? "Conecte o banco para partir do saldo real. "
                  : ""}
              Compras no crédito entram no dia do vencimento da fatura. A fatura é estimada pelos
              lançamentos do cartão. O dia a dia é a média dos últimos 90 dias em débito, Pix e dinheiro.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
