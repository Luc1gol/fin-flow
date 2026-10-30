"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Inbox,
  UserRound,
} from "lucide-react";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";
import { Card, Chip, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { carregarResumoInicio, type MovimentoResumo, type ResumoInicio } from "@/lib/dados/inicio";
import { carregarPainelOrcamento, statusDoItem, type PainelOrcamento } from "@/lib/dados/orcamentos";
import { carregarContasFixas, type PainelContasFixas } from "@/lib/dados/recorrencias";
import { formatBRL } from "@/lib/format-currency";
import { CORES_CATEGORIA } from "@/lib/icone-categoria";
import { IconeCategoria } from "@/components/ui/IconeCategoria";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CHAVE_OCULTAR = "finflow:ocultar-valores";
const MAX_FATIAS = 5;

type Fatia = { nome: string; valor: number; pct: number; cor: string };

/** Agrupa por categoria, mantém as maiores e junta o resto em "Outros". */
function fatiasPorCategoria(movs: MovimentoResumo[], tipo: "despesa" | "receita"): Fatia[] {
  const soma = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== tipo) continue;
    const k = m.categoria?.trim() || "Sem categoria";
    soma.set(k, (soma.get(k) ?? 0) + m.valor);
  }
  const total = [...soma.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const ordenadas = [...soma.entries()].sort((a, b) => b[1] - a[1]);
  const principais = ordenadas.slice(0, MAX_FATIAS);
  const resto = ordenadas.slice(MAX_FATIAS).reduce((a, [, v]) => a + v, 0);
  if (resto > 0) principais.push(["Outros", resto]);
  return principais.map(([nome, valor], i) => ({
    nome,
    valor,
    pct: Math.round((valor / total) * 100),
    cor: CORES_CATEGORIA[Math.min(i, CORES_CATEGORIA.length - 1)]!,
  }));
}

/** Linha "Contas fixas": quantas faltam pagar no mês e quanto. */
function ResumoContasFixas({
  painel,
  oculto,
  carregando,
}: {
  painel: PainelContasFixas | null;
  oculto: boolean;
  carregando: boolean;
}) {
  if (carregando || !painel) return null;
  const pendentes = painel.contas.filter(
    (c) => c.recorrencia.tipo === "despesa" && c.situacao !== "paga",
  );
  const atrasadas = pendentes.filter((c) => c.situacao === "atrasada").length;
  const total = pendentes.reduce((a, c) => a + c.recorrencia.valor, 0);
  let texto: string;
  if (painel.contas.length === 0) {
    texto =
      painel.sugestoes.length > 0
        ? `Encontramos ${painel.sugestoes.length} possíveis contas fixas`
        : "Cadastre suas contas fixas";
  } else if (pendentes.length === 0) {
    texto = "Contas fixas do mês em dia";
  } else {
    texto = `${pendentes.length} ${pendentes.length === 1 ? "conta fixa" : "contas fixas"} a pagar · ${
      oculto ? "R$ ••••" : formatBRL(total)
    }`;
  }
  return (
    <Link
      href="/recorrencias"
      className={`vidro-suave flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
        atrasadas > 0 ? "!border-negativo/25 text-negativo" : "text-texto-2"
      }`}
    >
      <span className="flex-1">
        {texto}
        {atrasadas > 0 ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}
      </span>
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** Cartão "Orçamento do mês": total planejado e as categorias mais apertadas. */
function ResumoOrcamento({
  painel,
  oculto,
  carregando,
}: {
  painel: PainelOrcamento | null;
  oculto: boolean;
  carregando: boolean;
}) {
  if (carregando || !painel) return null;
  const comLimite = painel.itens.filter(
    (i): i is typeof i & { limite: number } => i.limite != null,
  );
  if (comLimite.length === 0) {
    return (
      <Link href="/orcamentos" className="vidro-suave flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-texto-2">
        <span className="flex-1">Defina quanto quer gastar por categoria</span>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  const gasto = comLimite.reduce((a, i) => a + i.gasto, 0);
  const limite = comLimite.reduce((a, i) => a + i.limite, 0);
  const status = statusDoItem(gasto, limite);
  const apertadas = comLimite
    .filter((i) => statusDoItem(i.gasto, i.limite) !== "ok")
    .sort((a, b) => b.gasto / b.limite - a.gasto / a.limite)
    .slice(0, 2);
  const cor = status === "estourado" ? "bg-negativo" : status === "atencao" ? "bg-alerta" : "bg-marca";
  return (
    <Secao titulo="Orçamento do mês" acao={{ label: "Ver todos", href: "/orcamentos" }}>
      <Card className="p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-texto-2">
            {oculto ? "R$ ••••" : formatBRL(gasto)} de {oculto ? "R$ ••••" : formatBRL(limite)}
          </span>
          <span className="text-texto-3">{Math.round((gasto / limite) * 100)}%</span>
        </div>
        <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, (gasto / limite) * 100)}%` }} />
          {painel.fracaoMes > 0 && painel.fracaoMes < 1 ? (
            <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-texto/60" style={{ left: `${painel.fracaoMes * 100}%` }} />
          ) : null}
        </div>
        {apertadas.length > 0 ? (
          <ul className="mt-2.5 flex flex-col gap-1">
            {apertadas.map((i) => (
              <li key={i.categoria} className="flex items-center gap-2 text-xs">
                <AlertTriangle
                  className={`h-3.5 w-3.5 ${i.gasto > i.limite ? "text-negativo" : "text-alerta"}`}
                  aria-hidden
                />
                <span className="flex-1 text-texto-2">{i.categoria}</span>
                <span className={i.gasto > i.limite ? "text-negativo" : "text-alerta"}>
                  {Math.round((i.gasto / i.limite) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </Secao>
  );
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
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [oculto, setOculto] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(CHAVE_OCULTAR) === "1";
    } catch {
      return false;
    }
  });
  const [tipoGrafico, setTipoGrafico] = useState<"despesa" | "receita">("despesa");

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      carregarResumoInicio(period.year, period.monthIndex),
      // O orçamento é um extra: se falhar, o Início continua funcionando.
      carregarPainelOrcamento(period.year, period.monthIndex).catch((e) => {
        console.error(e);
        return null;
      }),
      carregarContasFixas(period.year, period.monthIndex).catch((e) => {
        console.error(e);
        return null;
      }),
    ])
      .then(([resumo, orcamento, contasFixas]) => {
        if (!cancelado) {
          setDados({ chave, resumo, orcamento, contasFixas });
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
  const fatias = useMemo(
    () => fatiasPorCategoria(resumo?.movimentos ?? [], tipoGrafico),
    [resumo, tipoGrafico],
  );
  const resultado = (resumo?.entradas ?? 0) - (resumo?.saidas ?? 0);
  const comp = resumo?.comparacao;
  const variacao = (par: { atual: number; anterior: number } | undefined) =>
    par && par.anterior > 0 ? Math.round(((par.atual - par.anterior) / par.anterior) * 100) : null;
  const variacaoEntradas = variacao(comp?.entradas);
  const variacaoSaidas = variacao(comp?.saidas);
  // Ex.: "vs 1–15 de set" no mês atual; "vs setembro" em meses passados.
  const rotuloComparacao = comp
    ? comp.ateDia != null
      ? `vs 1–${comp.ateDia} de ${MESES[comp.mesAnterior0]!.slice(0, 3).toLowerCase()}`
      : `vs ${MESES[comp.mesAnterior0]!.toLowerCase()}`
    : "";

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
          <Link
            href="/perfil"
            aria-label="Perfil"
            className="vidro flex h-9 w-9 items-center justify-center rounded-full text-texto-2"
          >
            <UserRound className="h-[18px] w-[18px]" aria-hidden />
          </Link>
        </div>
      </header>

      {erro ? <p className="text-sm text-negativo">{erro}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          {/* Saldo e resultado do mês */}
          <section>
            <p className="text-xs text-texto-3">
              {resumo?.saldoContas ? "Saldo em contas" : "Resultado do mês"}
            </p>
            {carregando ? (
              <div className="mt-1 h-8 w-40 animate-pulse rounded-lg bg-superficie-2" />
            ) : (
              <p className="mt-0.5 text-[28px] font-semibold leading-tight text-texto">
                <Valor valor={resumo?.saldoContas?.valor ?? resultado} oculto={oculto} />
              </p>
            )}
            {resumo?.saldoContas && mesAtual ? (
              <p className="mt-0.5 text-xs text-texto-3">
                Resultado do mês:{" "}
                <Valor valor={resultado} sinal colorir oculto={oculto} />
              </p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Card className="px-3 py-2.5">
                <p className="flex items-center gap-1 text-xs text-texto-3">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-positivo" aria-hidden /> Entradas
                </p>
                <p className="mt-0.5 text-[15px] font-semibold text-positivo">
                  {carregando ? "…" : <Valor valor={resumo?.entradas ?? 0} oculto={oculto} />}
                </p>
                <Variacao pct={variacaoEntradas} rotulo={rotuloComparacao} visivel={!oculto && !carregando} />
              </Card>
              <Card className="px-3 py-2.5">
                <p className="flex items-center gap-1 text-xs text-texto-3">
                  <ArrowUpRight className="h-3.5 w-3.5 text-negativo" aria-hidden /> Saídas
                </p>
                <p className="mt-0.5 text-[15px] font-semibold text-negativo">
                  {carregando ? "…" : <Valor valor={resumo?.saidas ?? 0} oculto={oculto} />}
                </p>
                <Variacao pct={variacaoSaidas} rotulo={rotuloComparacao} visivel={!oculto && !carregando} />
              </Card>
            </div>
          </section>

          {/* Avisos */}
          {resumo && resumo.pendentesRevisao > 0 ? (
            <Link
              href="/importar"
              className="vidro-suave flex items-center gap-3 rounded-xl !border-alerta/25 !bg-alerta/10 px-3 py-2.5 text-sm text-alerta"
            >
              <Inbox className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">
                {resumo.pendentesRevisao}{" "}
                {resumo.pendentesRevisao === 1 ? "transação para revisar" : "transações para revisar"}
              </span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          {resumo?.cartaoVencendo ? (
            <Link
              href="/cartoes"
              className="vidro-suave flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-texto-2"
            >
              <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-alerta" aria-hidden />
              <span className="flex-1">
                Fatura do {resumo.cartaoVencendo.nome}{" "}
                {resumo.cartaoVencendo.dias === 0
                  ? "vence hoje"
                  : `vence em ${resumo.cartaoVencendo.dias} ${resumo.cartaoVencendo.dias === 1 ? "dia" : "dias"}`}
              </span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}

          <ResumoOrcamento painel={dados?.orcamento ?? null} oculto={oculto} carregando={carregando} />
          <ResumoContasFixas painel={dados?.contasFixas ?? null} oculto={oculto} carregando={carregando} />

          {/* Categorias */}
          <Secao titulo="Por categoria" acao={{ label: "Ver análise", href: "/relatorios" }}>
            <Card className="p-3">
              <div className="mb-3 flex gap-1.5">
                <Chip ativo={tipoGrafico === "despesa"} onClick={() => setTipoGrafico("despesa")}>
                  Despesas
                </Chip>
                <Chip ativo={tipoGrafico === "receita"} onClick={() => setTipoGrafico("receita")}>
                  Receitas
                </Chip>
              </div>
              {carregando ? (
                <div className="h-2 animate-pulse rounded-full bg-superficie-2" />
              ) : fatias.length === 0 ? (
                <p className="py-2 text-center text-xs text-texto-3">
                  Nenhuma {tipoGrafico} neste mês.
                </p>
              ) : (
                <>
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                    {fatias.map((f) => (
                      <div key={f.nome} style={{ flex: f.valor, background: f.cor }} />
                    ))}
                  </div>
                  <ul className="mt-3 flex flex-col gap-2">
                    {fatias.map((f) => (
                      <li key={f.nome} className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.cor }} />
                        <span className="min-w-0 flex-1 truncate text-texto-2">{f.nome}</span>
                        <span className="w-9 text-right text-xs text-texto-3">{f.pct}%</span>
                        <Valor valor={f.valor} oculto={oculto} className="w-24 text-right text-texto" />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </Secao>
        </div>

        {/* Últimas movimentações */}
        <Secao titulo="Últimas movimentações" acao={{ label: "Extrato", href: "/extrato" }}>
          <Card className="px-3">
            {carregando ? (
              <div className="flex flex-col gap-3 py-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-superficie-2" />
                ))}
              </div>
            ) : resumo && resumo.movimentos.length > 0 ? (
              <ul className="divide-y divide-borda">
                {resumo.movimentos.slice(0, 8).map((m) => {
                  const valorExibido =
                    m.tipo === "despesa" ? -m.valor : m.tipo === "receita" ? m.valor : m.valor;
                  return (
                    <li key={m.id}>
                      <LinhaLista
                        icone={<IconeCategoria categoria={m.categoria} transferencia={m.tipo === "transferencia"} />}
                        titulo={m.descricao || "Sem descrição"}
                        subtitulo={[
                          m.tipo === "transferencia" ? "Transferência" : m.categoria || "Sem categoria",
                          m.meio,
                          dataCurta(m.data),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        direita={
                          m.tipo === "transferencia" ? (
                            <Valor valor={Math.abs(m.valor)} oculto={oculto} className="text-texto-3" />
                          ) : (
                            <Valor
                              valor={valorExibido}
                              sinal={m.tipo === "receita"}
                              colorir={m.tipo === "receita"}
                              oculto={oculto}
                            />
                          )
                        }
                      />
                    </li>
                  );
                })}
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
