"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";
import { Botao, Card, Secao, Valor, campoClasse } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { formatBRL } from "@/lib/format-currency";
import {
  carregarPainelOrcamento,
  criarOrcamentosSugeridos,
  excluirOrcamento,
  salvarOrcamento,
  statusDoItem,
  sugerirLimite,
  type ItemOrcamento,
  type PainelOrcamento,
} from "@/lib/dados/orcamentos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const COR_STATUS = {
  ok: "bg-marca",
  atencao: "bg-alerta",
  estourado: "bg-negativo",
} as const;

/** Aceita "1.200,50", "1200.5" ou "1200". */
function parseValor(raw: string): number | null {
  const t = raw.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number.parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Barra de progresso com marcador do "ritmo ideal" (quanto do mês já passou). */
function BarraOrcamento({ gasto, limite, fracaoMes }: { gasto: number; limite: number; fracaoMes: number }) {
  const pct = Math.min(100, (gasto / limite) * 100);
  const status = statusDoItem(gasto, limite);
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.07]">
      <div className={`h-full rounded-full ${COR_STATUS[status]}`} style={{ width: `${pct}%` }} />
      {fracaoMes > 0 && fracaoMes < 1 ? (
        <div
          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-texto/60"
          style={{ left: `${fracaoMes * 100}%` }}
          title="Onde o gasto deveria estar hoje para fechar o mês no limite"
        />
      ) : null}
    </div>
  );
}

type Edicao = { id: string | null; categoria: string; valor: string };

export function OrcamentosScreen() {
  const { period, setPeriod } = useDashboardPeriod();
  const chave = `${period.year}-${period.monthIndex}`;
  const [dados, setDados] = useState<{ chave: string; painel: PainelOrcamento } | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarPainelOrcamento(period.year, period.monthIndex)
      .then((painel) => {
        if (!cancelado) {
          setDados({ chave, painel });
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar os orçamentos.");
      });
    return () => {
      cancelado = true;
    };
  }, [chave, period.year, period.monthIndex, versao]);

  const carregando = dados?.chave !== chave;
  const painel = dados?.painel;

  const { comLimite, semLimite, total, sugestoes } = useMemo(() => {
    const itens = painel?.itens ?? [];
    const comLimite = itens
      .filter((i): i is ItemOrcamento & { limite: number } => i.limite != null)
      .sort((a, b) => b.gasto / b.limite - a.gasto / a.limite);
    const semLimite = itens
      .filter((i) => i.limite == null && (i.gasto > 0 || i.mediaAnterior > 0))
      .sort((a, b) => Math.max(b.gasto, b.mediaAnterior) - Math.max(a.gasto, a.mediaAnterior));
    const total = comLimite.reduce(
      (acc, i) => ({ gasto: acc.gasto + i.gasto, limite: acc.limite + i.limite }),
      { gasto: 0, limite: 0 },
    );
    const sugestoes = semLimite
      .filter((i) => i.mediaAnterior >= 20 && i.categoria !== "Sem categoria")
      .slice(0, 8)
      .map((i) => ({ categoria: i.categoria, valor: sugerirLimite(i.mediaAnterior) }));
    return { comLimite, semLimite, total, sugestoes };
  }, [painel]);

  function mudarMes(delta: number) {
    const d = new Date(period.year, period.monthIndex + delta, 1);
    setPeriod({ year: d.getFullYear(), monthIndex: d.getMonth() });
  }

  async function executar(acao: () => Promise<void>) {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
      setEdicao(null);
      setVersao((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const restante = total.limite - total.gasto;
  const porDia =
    painel?.diasRestantes && restante > 0 ? restante / painel.diasRestantes : null;

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
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-texto">Orçamentos</h1>
          <div className="-ml-1.5 flex items-center text-xs text-texto-2">
            <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="flex h-7 w-6 items-center justify-center">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            {MESES[period.monthIndex]} {period.year}
            <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="flex h-7 w-6 items-center justify-center">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        <Botao tamanho="sm" onClick={() => setEdicao({ id: null, categoria: "", valor: "" })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Novo
        </Botao>
      </header>

      {erro ? <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p> : null}

      {carregando ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div
          className={`flex flex-col gap-5 ${
            comLimite.length + semLimite.length > 0
              ? "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start"
              : ""
          }`}
        >
          {/* Resumo do mês (no computador: coluna lateral que acompanha a rolagem) */}
          {comLimite.length > 0 ? (
            <Card className="p-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-texto-3">Gasto nas categorias com orçamento</p>
                <p className="text-xs text-texto-3">{Math.round((total.gasto / total.limite) * 100)}%</p>
              </div>
              <p className="mt-1 text-[22px] font-semibold text-texto">
                <Valor valor={total.gasto} />{" "}
                <span className="text-sm font-normal text-texto-3">de {formatBRL(total.limite)}</span>
              </p>
              <div className="mt-3">
                <BarraOrcamento gasto={total.gasto} limite={total.limite} fracaoMes={painel?.fracaoMes ?? 0} />
              </div>
              <p className="mt-2.5 text-xs text-texto-2">
                {restante >= 0 ? (
                  <>
                    Restam <span className="font-semibold text-texto">{formatBRL(restante)}</span>
                    {porDia != null ? (
                      <>
                        {" "}· até <span className="font-semibold text-texto">{formatBRL(porDia)}/dia</span> nos{" "}
                        {painel?.diasRestantes} dias que faltam
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="text-negativo">{formatBRL(-restante)} acima do planejado</span>
                )}
              </p>
            </Card>
          ) : sugestoes.length > 0 ? (
            <Card className="p-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="flex items-start gap-3">
                <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-texto">Comece com uma sugestão</p>
                  <p className="mt-0.5 text-xs text-texto-2">
                    Criamos limites pela sua média dos últimos 3 meses. Você ajusta depois.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {sugestoes.map((s) => (
                      <li key={s.categoria} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-texto-2">
                        {s.categoria} {formatBRL(s.valor)}
                      </li>
                    ))}
                  </ul>
                  <Botao
                    variante="primario"
                    tamanho="sm"
                    className="mt-3"
                    disabled={salvando}
                    onClick={() => void executar(() => criarOrcamentosSugeridos(sugestoes))}
                  >
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    Criar {sugestoes.length} orçamentos
                  </Botao>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-4 text-center lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <p className="text-sm text-texto">Defina quanto quer gastar por categoria</p>
              <p className="mt-1 text-xs text-texto-3">O app avisa quando você chegar perto do limite.</p>
            </Card>
          )}

          {comLimite.length > 0 ? (
            <Secao titulo="Por categoria" className="min-w-0 lg:col-start-1">
              <Card className="divide-y divide-borda px-3">
                {comLimite.map((i) => {
                  const resto = i.limite - i.gasto;
                  const status = statusDoItem(i.gasto, i.limite);
                  return (
                    <button
                      key={i.categoria}
                      type="button"
                      onClick={() =>
                        setEdicao({ id: i.id, categoria: i.categoria, valor: String(i.limite).replace(".", ",") })
                      }
                      className="flex w-full flex-col gap-2 py-3 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                          <IconeCategoria categoria={i.categoria} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-texto">{i.categoria}</span>
                          <span className="block text-xs text-texto-3">
                            {formatBRL(i.gasto)} de {formatBRL(i.limite)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-right text-xs font-medium ${
                            status === "estourado" ? "text-negativo" : status === "atencao" ? "text-alerta" : "text-texto-2"
                          }`}
                        >
                          {resto >= 0 ? `Restam ${formatBRL(resto)}` : `${formatBRL(-resto)} acima`}
                        </span>
                      </div>
                      <div className="pl-11">
                        <BarraOrcamento gasto={i.gasto} limite={i.limite} fracaoMes={painel?.fracaoMes ?? 0} />
                      </div>
                    </button>
                  );
                })}
              </Card>
              {painel && painel.fracaoMes > 0 && painel.fracaoMes < 1 ? (
                <p className="mt-2 text-[11px] text-texto-3">
                  O tracinho na barra mostra onde o gasto deveria estar hoje para fechar o mês no limite.
                </p>
              ) : null}
            </Secao>
          ) : null}

          {semLimite.length > 0 ? (
            <Secao titulo="Sem orçamento" className="min-w-0 lg:col-start-1">
              <Card className="divide-y divide-borda px-3">
                {semLimite.map((i) => (
                  <div key={i.categoria} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                      <IconeCategoria categoria={i.categoria} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-texto">{i.categoria}</span>
                      <span className="block text-xs text-texto-3">
                        {formatBRL(i.gasto)} este mês
                        {i.mediaAnterior > 0 ? ` · média ${formatBRL(i.mediaAnterior)}` : ""}
                      </span>
                    </span>
                    {i.categoria !== "Sem categoria" ? (
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        onClick={() =>
                          setEdicao({
                            id: null,
                            categoria: i.categoria,
                            valor: i.mediaAnterior > 0 ? String(sugerirLimite(i.mediaAnterior)) : "",
                          })
                        }
                      >
                        Definir
                      </Botao>
                    ) : null}
                  </div>
                ))}
              </Card>
            </Secao>
          ) : null}
        </div>
      )}

      {edicao ? (
        <FolhaOrcamento
          edicao={edicao}
          categorias={(painel?.itens ?? []).map((i) => i.categoria).filter((c) => c !== "Sem categoria")}
          salvando={salvando}
          onFechar={() => setEdicao(null)}
          onSalvar={(categoria, valor) => void executar(() => salvarOrcamento(categoria, valor))}
          onExcluir={edicao.id ? () => void executar(() => excluirOrcamento(edicao.id!)) : undefined}
        />
      ) : null}
    </div>
  );
}

function FolhaOrcamento({
  edicao,
  categorias,
  salvando,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  edicao: Edicao;
  categorias: string[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (categoria: string, valor: number) => void;
  onExcluir?: () => void;
}) {
  const [categoria, setCategoria] = useState(edicao.categoria);
  const [valor, setValor] = useState(edicao.valor);
  const [aviso, setAviso] = useState<string | null>(null);

  function salvar() {
    const v = parseValor(valor);
    if (!categoria.trim()) return setAviso("Escolha uma categoria.");
    if (v == null) return setAviso("Informe um valor maior que zero.");
    onSalvar(categoria, v);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 lg:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={edicao.id ? "Editar orçamento" : "Novo orçamento"}
        onClick={(e) => e.stopPropagation()}
        className="vidro w-full max-w-[430px] rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-texto">{edicao.id ? "Editar orçamento" : "Novo orçamento"}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-3 hover:text-texto">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Categoria
            <input
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setAviso(null);
              }}
              list="lista-categorias-orcamento"
              disabled={edicao.id != null}
              placeholder="Mercado"
              className={`${campoClasse} h-10 disabled:opacity-60`}
            />
            <datalist id="lista-categorias-orcamento">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Limite por mês (R$)
            <input
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setAviso(null);
              }}
              inputMode="decimal"
              placeholder="800"
              className={`${campoClasse} h-10`}
            />
          </label>
          {aviso ? <p className="text-xs text-negativo">{aviso}</p> : null}
          <div className="mt-1 flex gap-2">
            {onExcluir ? (
              <Botao variante="fantasma" className="text-negativo" disabled={salvando} onClick={onExcluir}>
                Excluir
              </Botao>
            ) : null}
            <Botao variante="primario" className="flex-1" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Salvar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
