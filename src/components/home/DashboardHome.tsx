"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Inbox,
  Repeat,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";
import { ITENS_NAV_EXTRAS } from "@/components/layout/BottomNav";
import { CartaoResumoInicio } from "@/components/resumo/CartaoResumoInicio";
import { Card, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { carregarResumoInicio, type ResumoInicio } from "@/lib/dados/inicio";
import { carregarPainelOrcamento, statusDoItem, type PainelOrcamento } from "@/lib/dados/orcamentos";
import { carregarContasFixas, type PainelContasFixas } from "@/lib/dados/recorrencias";
import { carregarProjecao, type Projecao } from "@/lib/dados/projecao";
import { formatBRL } from "@/lib/format-currency";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CHAVE_OCULTAR = "finflow:ocultar-valores";
const MOVIMENTOS_NO_INICIO = 5;

type Aviso = {
  id: string;
  href: string;
  texto: string;
  detalhe?: string;
  Icone: LucideIcon;
  /** "alerta" pede atenção; "urgente" é problema (atrasado/estourado). */
  nivel: "alerta" | "urgente";
};

function lista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Junta tudo o que pede uma ação num lugar só. Só entra o que é acionável:
 * revisar, fatura perto do vencimento, contas fixas atrasadas/vencendo e orçamento apertado.
 */
function montarAvisos(
  resumo: ResumoInicio | undefined,
  orcamento: PainelOrcamento | null,
  fixas: PainelContasFixas | null,
  mesAtual: boolean,
  oculto: boolean,
): Aviso[] {
  const avisos: Aviso[] = [];
  const valor = (v: number) => (oculto ? "R$ ••••" : formatBRL(v));
  if (!resumo) return avisos;

  if (resumo.pendentesRevisao > 0) {
    avisos.push({
      id: "revisar",
      href: "/importar",
      texto: `${resumo.pendentesRevisao} ${resumo.pendentesRevisao === 1 ? "transação" : "transações"} para revisar`,
      Icone: Inbox,
      nivel: "alerta",
    });
  }
  if (!mesAtual) return avisos;

  if (resumo.cartaoVencendo) {
    const { nome, dias } = resumo.cartaoVencendo;
    avisos.push({
      id: "fatura",
      href: "/cartoes",
      texto: `Fatura do ${nome} ${dias === 0 ? "vence hoje" : `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`}`,
      Icone: CreditCard,
      nivel: dias <= 1 ? "urgente" : "alerta",
    });
  }

  if (fixas) {
    const despesas = fixas.contas.filter((c) => c.recorrencia.tipo === "despesa" && c.situacao !== "paga");
    const atrasadas = despesas.filter((c) => c.situacao === "atrasada");
    const hoje = new Date();
    const emBreve = despesas.filter((c) => {
      if (c.situacao !== "a_vencer") return false;
      const dias = Math.round(
        (new Date(`${c.vencimento}T12:00:00`).getTime() - new Date(hoje.toDateString()).getTime()) / 86_400_000,
      );
      return dias <= 3;
    });
    if (atrasadas.length > 0) {
      avisos.push({
        id: "fixas-atrasadas",
        href: "/recorrencias",
        texto: `${lista(atrasadas.map((c) => c.recorrencia.descricao))} ${atrasadas.length === 1 ? "está atrasada" : "estão atrasadas"}`,
        detalhe: valor(atrasadas.reduce((a, c) => a + c.recorrencia.valor, 0)),
        Icone: Repeat,
        nivel: "urgente",
      });
    } else if (emBreve.length > 0) {
      avisos.push({
        id: "fixas-em-breve",
        href: "/recorrencias",
        texto: `${lista(emBreve.map((c) => c.recorrencia.descricao))} ${emBreve.length === 1 ? "vence" : "vencem"} nos próximos dias`,
        detalhe: valor(emBreve.reduce((a, c) => a + c.recorrencia.valor, 0)),
        Icone: Repeat,
        nivel: "alerta",
      });
    }
  }

  if (orcamento) {
    const comLimite = orcamento.itens.filter((i): i is typeof i & { limite: number } => i.limite != null);
    const estouradas = comLimite.filter((i) => statusDoItem(i.gasto, i.limite) === "estourado");
    const atencao = comLimite.filter((i) => statusDoItem(i.gasto, i.limite) === "atencao");
    if (estouradas.length > 0) {
      avisos.push({
        id: "orc-estourado",
        href: "/orcamentos",
        texto: `${lista(estouradas.map((i) => i.categoria))} ${estouradas.length === 1 ? "passou" : "passaram"} do orçamento`,
        Icone: Target,
        nivel: "urgente",
      });
    } else if (atencao.length > 0) {
      avisos.push({
        id: "orc-atencao",
        href: "/orcamentos",
        texto: `${lista(atencao.map((i) => i.categoria))} ${atencao.length === 1 ? "está" : "estão"} perto do limite`,
        Icone: Target,
        nivel: "alerta",
      });
    }
  }
  return avisos;
}

/** "▲ 12% vs 1–15 de set": compara sempre o mesmo pedaço do mês anterior. */
function Variacao({ pct, rotulo, visivel }: { pct: number | null; rotulo: string; visivel: boolean }) {
  if (pct == null || !visivel) return null;
  return (
    <p className="mt-0.5 text-[11px] text-texto-3">
      {pct === 0 ? "igual" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`} {rotulo}
    </p>
  );
}

/** Atalhos para as telas que não cabem na barra de baixo (no computador ficam no menu lateral). */
function Atalhos() {
  const itens = ITENS_NAV_EXTRAS.filter((i) => i.href !== "/perfil");
  return (
    <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2 lg:hidden">
      {itens.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="vidro-suave flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-center text-[11px] leading-tight text-texto-2 active:scale-95"
        >
          <Icon className="h-[18px] w-[18px] text-marca" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function PainelAvisos({ avisos, carregando }: { avisos: Aviso[]; carregando: boolean }) {
  if (carregando) return <div className="h-12 animate-pulse rounded-2xl bg-white/[0.04]" />;
  if (avisos.length === 0) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-texto-3">
        <CheckCircle2 className="h-4 w-4 text-positivo" aria-hidden />
        Tudo em dia. Nada pedindo a sua atenção.
      </p>
    );
  }
  return (
    <Card className="divide-y divide-borda px-3">
      {avisos.map(({ id, href, texto, detalhe, Icone, nivel }) => (
        <Link key={id} href={href} className="flex items-center gap-3 py-2.5 text-sm active:opacity-80">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              nivel === "urgente" ? "bg-negativo/15 text-negativo" : "bg-alerta/15 text-alerta"
            }`}
          >
            <Icone className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-texto">{texto}</span>
          {detalhe ? <span className="shrink-0 text-xs text-texto-2">{detalhe}</span> : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
        </Link>
      ))}
    </Card>
  );
}

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function DashboardHome() {
  const { period, setPeriod } = useDashboardPeriod();
  const chave = `${period.year}-${period.monthIndex}`;
  const [dados, setDados] = useState<{
    chave: string;
    resumo: ResumoInicio;
    orcamento: PainelOrcamento | null;
    contasFixas: PainelContasFixas | null;
    projecao: Projecao | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [oculto, setOculto] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(CHAVE_OCULTAR) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelado = false;
    // Orçamento, contas fixas e projeção são extras: se falharem, o Início continua funcionando.
    const extra = <T,>(p: Promise<T>) =>
      p.catch((e) => {
        console.error(e);
        return null;
      });
    Promise.all([
      carregarResumoInicio(period.year, period.monthIndex),
      extra(carregarPainelOrcamento(period.year, period.monthIndex)),
      extra(carregarContasFixas(period.year, period.monthIndex)),
      extra(carregarProjecao()),
    ])
      .then(([resumo, orcamento, contasFixas, projecao]) => {
        if (!cancelado) {
          setDados({ chave, resumo, orcamento, contasFixas, projecao });
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar seus dados.");
      });
    return () => {
      cancelado = true;
    };
  }, [chave, period.year, period.monthIndex]);

  const carregando = dados?.chave !== chave;
  const resumo = dados?.resumo;

  function alternarOculto() {
    setOculto((v) => {
      try {
        localStorage.setItem(CHAVE_OCULTAR, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  function mudarMes(delta: number) {
    const d = new Date(period.year, period.monthIndex + delta, 1);
    setPeriod({ year: d.getFullYear(), monthIndex: d.getMonth() });
  }

  const hoje = new Date();
  const mesAtual = period.year === hoje.getFullYear() && period.monthIndex === hoje.getMonth();
  const resultado = (resumo?.entradas ?? 0) - (resumo?.saidas ?? 0);
  const comp = resumo?.comparacao;
  const variacao = (par: { atual: number; anterior: number } | undefined) =>
    par && par.anterior > 0 ? Math.round(((par.atual - par.anterior) / par.anterior) * 100) : null;
  // Ex.: "vs 1–15 de set" no mês atual; "vs setembro" em meses passados.
  const rotuloComparacao = comp
    ? comp.ateDia != null
      ? `vs 1–${comp.ateDia} de ${MESES[comp.mesAnterior0]!.slice(0, 3).toLowerCase()}`
      : `vs ${MESES[comp.mesAnterior0]!.toLowerCase()}`
    : "";
  const avisos = useMemo(
    () => montarAvisos(resumo, dados?.orcamento ?? null, dados?.contasFixas ?? null, mesAtual, oculto),
    [resumo, dados, mesAtual, oculto],
  );

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Cabeçalho: saudação, mês e ações */}
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-texto-3">Olá, {resumo?.nome || "…"}</p>
          <div className="-ml-1.5 flex items-center">
            <button
              type="button"
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
              className="flex h-8 w-7 items-center justify-center text-texto-2"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPeriod({ year: hoje.getFullYear(), monthIndex: hoje.getMonth() })}
              className="text-base font-semibold text-texto"
              title="Voltar para o mês atual"
            >
              {MESES[period.monthIndex]}
              {period.year !== hoje.getFullYear() ? ` ${period.year}` : ""}
            </button>
            <button
              type="button"
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
              className="flex h-8 w-7 items-center justify-center text-texto-2"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={alternarOculto}
            aria-label={oculto ? "Mostrar valores" : "Ocultar valores"}
            className="vidro flex h-9 w-9 items-center justify-center rounded-full text-texto-2"
          >
            {oculto ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
          <Link href="/perfil" aria-label="Perfil" className="vidro flex h-9 w-9 items-center justify-center rounded-full text-texto-2">
            <UserRound className="h-[18px] w-[18px]" aria-hidden />
          </Link>
        </div>
      </header>

      {erro ? <p className="text-sm text-negativo">{erro}</p> : null}

      <CartaoResumoInicio oculto={oculto} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          {/* 1. Saldo e previsão */}
          <section>
            <p className="text-xs text-texto-3">{resumo?.saldoContas ? "Saldo em contas" : "Resultado do mês"}</p>
            {carregando ? (
              <div className="mt-1 h-9 w-44 animate-pulse rounded-lg bg-white/[0.06]" />
            ) : (
              <p className="mt-0.5 text-[32px] font-semibold leading-tight tracking-tight text-texto">
                <Valor valor={resumo?.saldoContas?.valor ?? resultado} oculto={oculto} />
              </p>
            )}
            {mesAtual && dados?.projecao && !carregando ? (
              <Link href="/projecao" className="mt-1 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
                Previsto para {dados.projecao.fimMes.slice(8, 10)}/{dados.projecao.fimMes.slice(5, 7)}:{" "}
                <Valor
                  valor={dados.projecao.saldoComDiaADia}
                  oculto={oculto}
                  className={`font-semibold ${dados.projecao.saldoComDiaADia < 0 ? "text-negativo" : "text-texto"}`}
                />
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}

            {/* 2. Entradas e saídas do mês */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/relatorios" className="block">
                <Card className="px-3 py-2.5">
                  <p className="flex items-center gap-1 text-xs text-texto-3">
                    <ArrowDownLeft className="h-3.5 w-3.5 text-positivo" aria-hidden /> Entradas
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-positivo">
                    {carregando ? "…" : <Valor valor={resumo?.entradas ?? 0} oculto={oculto} />}
                  </p>
                  <Variacao pct={variacao(comp?.entradas)} rotulo={rotuloComparacao} visivel={!oculto && !carregando} />
                </Card>
              </Link>
              <Link href="/relatorios?aba=para-onde" className="block">
                <Card className="px-3 py-2.5">
                  <p className="flex items-center gap-1 text-xs text-texto-3">
                    <ArrowUpRight className="h-3.5 w-3.5 text-negativo" aria-hidden /> Saídas
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-negativo">
                    {carregando ? "…" : <Valor valor={resumo?.saidas ?? 0} oculto={oculto} />}
                  </p>
                  <Variacao pct={variacao(comp?.saidas)} rotulo={rotuloComparacao} visivel={!oculto && !carregando} />
                </Card>
              </Link>
            </div>
          </section>

          {/* 3. Avisos que pedem ação */}
          <PainelAvisos avisos={avisos} carregando={carregando} />

          <Atalhos />
        </div>

        {/* 4. Últimas movimentações */}
        <Secao titulo="Últimas movimentações" acao={{ label: "Ver extrato", href: "/extrato" }}>
          <Card className="px-3">
            {carregando ? (
              <div className="flex flex-col gap-3 py-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-white/[0.06]" />
                ))}
              </div>
            ) : resumo && resumo.movimentos.length > 0 ? (
              <ul className="divide-y divide-borda">
                {resumo.movimentos.slice(0, MOVIMENTOS_NO_INICIO).map((m) => (
                  <li key={m.id}>
                    <LinhaLista
                      icone={<IconeCategoria categoria={m.categoria} transferencia={m.tipo === "transferencia"} />}
                      titulo={m.descricao || "Sem descrição"}
                      subtitulo={[
                        m.tipo === "transferencia" ? "Transferência" : m.categoria || "Sem categoria",
                        dataCurta(m.data),
                      ].join(" · ")}
                      direita={
                        m.tipo === "transferencia" ? (
                          <Valor valor={Math.abs(m.valor)} oculto={oculto} className="text-texto-3" />
                        ) : (
                          <Valor
                            valor={m.tipo === "despesa" ? -m.valor : m.valor}
                            sinal={m.tipo === "receita"}
                            colorir={m.tipo === "receita"}
                            oculto={oculto}
                          />
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-texto-2">Nenhuma movimentação neste mês</p>
                <Link href="/lancar" className="mt-1 inline-block text-xs font-semibold text-marca">
                  Fazer um lançamento
                </Link>
              </div>
            )}
          </Card>
        </Secao>
      </div>
    </div>
  );
}
