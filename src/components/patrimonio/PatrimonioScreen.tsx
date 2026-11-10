"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  CreditCard,
  Landmark,
  Loader2,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { BancoLogo } from "@/components/cartoes/BancoLogo";
import { Card, Chip, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { getBancoById } from "@/data/bancos";
import {
  carregarPatrimonio,
  filtrarHistorico,
  rotuloTipoConta,
  rotuloTipoInvestimento,
  type ContaPatrimonio,
  type InvestimentoPatrimonio,
  type Patrimonio,
  type PeriodoPatrimonio,
} from "@/lib/dados/patrimonio";
import { GraficoPatrimonio, dataCurta } from "./GraficoPatrimonio";
import { VariacaoPatrimonio } from "./VariacaoPatrimonio";
import { bancoPorTexto } from "./instituicao";

const PERIODOS: { id: PeriodoPatrimonio; label: string }[] = [
  { id: "30d", label: "30 dias" },
  { id: "6m", label: "6 meses" },
  { id: "1a", label: "1 ano" },
  { id: "tudo", label: "Tudo" },
];

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IconeConta({ conta }: { conta: ContaPatrimonio }) {
  if (conta.banco && conta.banco !== "outros") {
    return <BancoLogo banco={getBancoById(conta.banco)} className="h-9 w-9" />;
  }
  const Icone =
    conta.tipo === "cartao_credito" ? CreditCard : conta.tipo === "poupanca" ? PiggyBank : conta.tipo === "carteira" ? Wallet : Landmark;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
      <Icone className="h-4 w-4" aria-hidden />
    </span>
  );
}

function IconeInvestimento({ inv }: { inv: InvestimentoPatrimonio }) {
  const banco = bancoPorTexto(inv.instituicao, inv.nome);
  if (banco) return <BancoLogo banco={banco} className="h-9 w-9" />;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
      <TrendingUp className="h-4 w-4" aria-hidden />
    </span>
  );
}

function LinhaInvestimento({ inv }: { inv: InvestimentoPatrimonio }) {
  const subtitulo = [inv.taxa, inv.instituicao].filter(Boolean).join(" · ");
  return (
    <LinhaLista
      icone={<IconeInvestimento inv={inv} />}
      titulo={inv.nome}
      subtitulo={subtitulo || rotuloTipoInvestimento(inv.tipo)}
      direita={<Valor valor={inv.saldo} className={inv.saldo === 0 ? "text-texto-3" : ""} />}
      className="px-4"
    />
  );
}

function Parcela({
  titulo,
  valor,
  icone,
  negativo,
}: {
  titulo: string;
  valor: number;
  icone: ReactNode;
  negativo?: boolean;
}) {
  return (
    <Card className="min-w-0 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-texto-3">
        {icone}
        <span className="truncate">{titulo}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-semibold ${negativo && valor > 0 ? "text-negativo" : "text-texto"}`}>
        {negativo && valor > 0 ? "− " : ""}
        <Valor valor={Math.abs(valor)} />
      </p>
    </Card>
  );
}

export function PatrimonioScreen() {
  const [dados, setDados] = useState<Patrimonio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoPatrimonio>("30d");
  const [verResgatados, setVerResgatados] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarPatrimonio()
      .then((p) => {
        if (!cancelado) {
          setDados(p);
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar o patrimônio.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const pontos = useMemo(
    () => (dados ? filtrarHistorico(dados.historico, periodo) : []),
    [dados, periodo],
  );

  const { grupos, resgatados } = useMemo(() => {
    const ativos = (dados?.investimentos ?? []).filter((i) => i.saldo !== 0);
    const resgatados = (dados?.investimentos ?? []).filter((i) => i.saldo === 0);
    const mapa = new Map<string, InvestimentoPatrimonio[]>();
    for (const i of ativos) {
      const g = rotuloTipoInvestimento(i.tipo);
      mapa.set(g, [...(mapa.get(g) ?? []), i]);
    }
    const grupos = [...mapa.entries()]
      .map(([nome, itens]) => ({ nome, itens, total: itens.reduce((s, i) => s + i.saldo, 0) }))
      .sort((a, b) => b.total - a.total);
    return { grupos, resgatados };
  }, [dados]);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-center gap-2">
        <Link
          href="/inicio"
          aria-label="Voltar"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-texto">Patrimônio</h1>
      </header>

      {erro ? (
        <p className="rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">{erro}</p>
      ) : null}

      {!dados && !erro ? (
        <div className="flex justify-center py-16 text-texto-3">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : null}

      {dados ? (
        // No computador: total e evolução à esquerda, contas e investimentos à direita.
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
          <div className="contents lg:sticky lg:top-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <section>
            <p className="text-xs text-texto-3">Patrimônio líquido</p>
            <p className={`mt-1 text-3xl font-semibold tracking-tight ${dados.liquido < 0 ? "text-negativo" : "text-texto"}`}>
              <Valor valor={dados.liquido} />
            </p>
            {dados.variacao30 ? (
              <p className="mt-1 text-xs">
                <VariacaoPatrimonio variacao={dados.variacao30} />
                <span className="text-texto-3"> desde {dataCurta(dados.variacao30.desde)}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-texto-3">Em conta + investido − cartões a pagar</p>
            )}
          </section>

          <div className="grid grid-cols-3 gap-2">
            <Parcela titulo="Em conta" valor={dados.emConta} icone={<Landmark className="h-3.5 w-3.5" aria-hidden />} />
            <Parcela titulo="Investido" valor={dados.investido} icone={<TrendingUp className="h-3.5 w-3.5" aria-hidden />} />
            <Parcela
              titulo="Cartões a pagar"
              valor={dados.cartoes}
              negativo
              icone={<CreditCard className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>

          <Secao titulo="Evolução">
            <Card className="p-4">
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
                {PERIODOS.map((p) => (
                  <Chip key={p.id} ativo={periodo === p.id} onClick={() => setPeriodo(p.id)}>
                    {p.label}
                  </Chip>
                ))}
              </div>
              {pontos.length >= 2 ? (
                <div className="h-44 lg:h-60">
                  <GraficoPatrimonio pontos={pontos} porMes={periodo !== "30d"} />
                </div>
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 px-6 text-center lg:h-60">
                  <TrendingUp className="h-6 w-6 text-marca" aria-hidden />
                  <p className="text-sm text-texto-2">
                    {dados.historico.length >= 2
                      ? "Ainda não há fotos suficientes nesse período."
                      : "O gráfico aparece a partir de amanhã: o app guarda uma foto do seu patrimônio por dia."}
                  </p>
                </div>
              )}
            </Card>
          </Secao>
          </div>

          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          {dados.contas.length > 0 || dados.cartoesLista.length > 0 ? (
            <Secao titulo="Contas">
              <Card className="divide-y divide-borda py-1">
                {dados.contas.map((c) => (
                  <LinhaLista
                    key={c.id}
                    icone={<IconeConta conta={c} />}
                    titulo={c.nome}
                    subtitulo={rotuloTipoConta(c.tipo)}
                    direita={<Valor valor={c.saldo} className={c.saldo < 0 ? "text-negativo" : ""} />}
                    className="px-4"
                  />
                ))}
                {dados.cartoesLista.map((c) => (
                  <LinhaLista
                    key={c.id}
                    icone={<IconeConta conta={c} />}
                    titulo={c.nome}
                    subtitulo="Cartão de crédito · a pagar"
                    direita={
                      <span className={c.saldo > 0 ? "text-negativo" : ""}>
                        {c.saldo > 0 ? "− " : ""}
                        <Valor valor={Math.abs(c.saldo)} />
                      </span>
                    }
                    className="px-4"
                  />
                ))}
              </Card>
            </Secao>
          ) : null}

          {grupos.length > 0 || resgatados.length > 0 ? (
            <Secao titulo="Investimentos">
              <div className="flex flex-col gap-3">
                {grupos.map((g) => (
                  <Card key={g.nome} className="py-1">
                    <div className="flex items-baseline justify-between px-4 pb-1 pt-2.5">
                      <span className="text-xs font-medium text-texto-2">{g.nome}</span>
                      <Valor valor={g.total} className="text-xs text-texto-2" />
                    </div>
                    <div className="divide-y divide-borda">
                      {g.itens.map((i) => (
                        <LinhaInvestimento key={i.id} inv={i} />
                      ))}
                    </div>
                  </Card>
                ))}
                {resgatados.length > 0 ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setVerResgatados((v) => !v)}
                      aria-expanded={verResgatados}
                      className="flex items-center gap-1 text-xs font-medium text-texto-2 hover:text-texto"
                    >
                      Resgatados ({resgatados.length})
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${verResgatados ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {verResgatados ? (
                      <Card className="mt-2 divide-y divide-borda py-1 opacity-80">
                        {resgatados.map((i) => (
                          <LinhaInvestimento key={i.id} inv={i} />
                        ))}
                      </Card>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Secao>
          ) : null}

          {dados.contas.length === 0 && dados.cartoesLista.length === 0 && dados.investimentos.length === 0 ? (
            <Card className="px-4 py-6 text-center text-sm text-texto-2">
              Conecte um banco para ver seu patrimônio aqui.
            </Card>
          ) : null}
          </div>

          <p className="text-center text-[11px] leading-relaxed text-texto-3 lg:col-span-2">
            Os valores vêm da atualização diária do banco
            {dados.atualizadoEm ? ` (última em ${dataHora(dados.atualizadoEm)})` : ""}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
