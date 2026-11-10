"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Landmark, PieChart } from "lucide-react";
import { Card, LinhaLista, Secao, Valor } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { formatBRL } from "@/lib/format-currency";
import {
  carregarResumoMes,
  chaveMes,
  lerMes,
  nomeMes,
  podeAvancar,
  somarMeses,
  type CategoriaResumo,
  type ResumoMes,
} from "@/lib/dados/resumo";
import { GraficoSemanas } from "./GraficoSemanas";

const CORES_CATEGORIA = ["#4f8cff", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#71717a"];

function maiuscula(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctTexto(fracao: number): string {
  const p = fracao * 100;
  if (p > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Variação vs mês anterior com seta. `bomSubir` define a cor:
 * entradas subindo = verde; gastos subindo = vermelho.
 */
function Variacao({ valor, bomSubir, className = "" }: { valor: number | null; bomSubir: boolean; className?: string }) {
  if (valor == null) return <span className={`text-texto-3 ${className}`}>sem base no mês anterior</span>;
  const p = Math.round(valor * 100);
  if (p === 0) return <span className={`text-texto-3 ${className}`}>= igual ao mês anterior</span>;
  const subiu = p > 0;
  const bom = subiu === bomSubir;
  return (
    <span className={`${bom ? "text-positivo" : "text-negativo"} ${className}`}>
      {subiu ? "▲" : "▼"} {Math.abs(p)}%
    </span>
  );
}

function Veredito({ r }: { r: ResumoMes }) {
  if (r.entradas === 0 && r.saidas === 0) {
    return <p className="mt-1.5 text-sm text-texto-2">Nenhuma entrada ou saída registrada neste mês.</p>;
  }
  if (r.resultado >= 0) {
    return (
      <p className="mt-1.5 text-sm text-texto-2">
        Você guardou <span className="font-semibold text-positivo">{formatBRL(r.resultado)}</span>
        {r.entradas > 0 ? ` (${pctTexto(r.resultado / r.entradas)} do que entrou)` : ""}
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-sm text-texto-2">
      Gastou <span className="font-semibold text-negativo">{formatBRL(-r.resultado)}</span> a mais do que entrou
    </p>
  );
}

function LinhaCategoria({ c, cor }: { c: CategoriaResumo; cor: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${cor}22`, color: cor }}
      >
        <IconeCategoria categoria={c.categoria === "Outros" ? null : c.categoria} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-texto">{c.categoria}</span>
          <Valor valor={c.valor} className="shrink-0 text-sm text-texto" />
        </span>
        <span className="mt-1 block h-1 rounded-full bg-white/[0.07]">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, c.pct * 100)}%`, background: cor }} />
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-texto-3">{pctTexto(c.pct)} das saídas</span>
          {c.variacao == null ? (
            <span className="text-texto-3">novo no mês</span>
          ) : (
            <Variacao valor={c.variacao} bomSubir={false} />
          )}
        </span>
      </span>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
      ))}
    </div>
  );
}

export function ResumoScreen() {
  const params = useSearchParams();
  const [hoje] = useState(() => new Date());
  const mes = lerMes(params.get("mes"), hoje);
  const chave = chaveMes(mes);
  const anterior = somarMeses(mes, -1);
  const proximo = podeAvancar(mes, hoje) ? somarMeses(mes, 1) : null;

  const [dados, setDados] = useState<{ chave: string; resumo: ResumoMes } | null>(null);
  const [erro, setErro] = useState<{ chave: string; msg: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    const [ano, m] = chave.split("-").map(Number);
    carregarResumoMes({ ano, mes0: m - 1 })
      .then((resumo) => {
        if (!cancelado) setDados({ chave, resumo });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro({ chave, msg: "Não foi possível carregar o resumo." });
      });
    return () => {
      cancelado = true;
    };
  }, [chave]);

  const erroAtual = erro?.chave === chave ? erro.msg : null;
  const r = dados?.chave === chave ? dados.resumo : null;
  const nomeAnterior = nomeMes(anterior, false);
  /** No computador: duas colunas só quando há listas para a coluna da direita. */
  const colunas = r != null && (r.categorias.length > 0 || r.orcamentos != null || r.maioresGastos.length > 0);
  const bloco = colunas ? "lg:flex lg:min-w-0 lg:flex-col lg:gap-5" : "";

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
          <h1 className="text-lg font-semibold text-texto">Resumo do mês</h1>
          <div className="-ml-1.5 flex items-center text-xs text-texto-2">
            <Link
              href={`/resumo?mes=${chaveMes(anterior)}`}
              aria-label="Mês anterior"
              className="flex h-7 w-6 items-center justify-center"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </Link>
            {maiuscula(nomeMes(mes))}
            {proximo ? (
              <Link
                href={`/resumo?mes=${chaveMes(proximo)}`}
                aria-label="Próximo mês"
                className="flex h-7 w-6 items-center justify-center"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              <span className="flex h-7 w-6 items-center justify-center opacity-30" aria-hidden>
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      </header>

      {erroAtual ? (
        <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erroAtual}</p>
      ) : !r ? (
        <Esqueleto />
      ) : (
        <div
          className={`flex flex-col gap-5 ${
            colunas
              ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:items-start"
              : "lg:max-w-2xl"
          }`}
        >
          {/* No celular os blocos abaixo são "contents" (mesma ordem de sempre). No computador:
              resultado + semanas + patrimônio à esquerda; categorias, orçamentos e maiores gastos à direita. */}
          <div className={`contents lg:col-start-1 lg:row-start-1 ${bloco}`}>
          {/* Resultado */}
          <Card className="p-4">
            <p className="text-xs text-texto-3">Resultado de {nomeMes(mes, false)}</p>
            <p className="mt-1 text-[28px] font-semibold leading-tight text-texto">
              <Valor valor={r.resultado} sinal colorir />
            </p>
            <Veredito r={r} />
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-borda pt-3">
              <div>
                <p className="text-xs text-texto-3">Entradas</p>
                <p className="mt-0.5 text-base font-semibold text-texto">
                  <Valor valor={r.entradas} />
                </p>
                <p className="mt-0.5 text-[11px]">
                  <Variacao valor={r.variacaoEntradas} bomSubir />
                  {r.variacaoEntradas != null ? <span className="text-texto-3"> vs {nomeAnterior}</span> : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-texto-3">Saídas</p>
                <p className="mt-0.5 text-base font-semibold text-texto">
                  <Valor valor={r.saidas} />
                </p>
                <p className="mt-0.5 text-[11px]">
                  <Variacao valor={r.variacaoSaidas} bomSubir={false} />
                  {r.variacaoSaidas != null ? <span className="text-texto-3"> vs {nomeAnterior}</span> : null}
                </p>
              </div>
            </div>
          </Card>

          {r.quantidadeLancamentos === 0 ? (
            <Card className="p-4 text-center">
              <p className="text-sm text-texto">Nada lançado em {nomeMes(mes, false)}</p>
              <p className="mt-1 text-xs text-texto-3">Quando houver lançamentos, o resumo aparece aqui.</p>
            </Card>
          ) : null}
          </div>

          <div className={`contents lg:col-start-2 lg:row-span-2 lg:row-start-1 ${bloco}`}>
          {/* Categorias */}
          {r.categorias.length > 0 ? (
            <Secao titulo="Para onde foi o dinheiro" acao={{ label: "Relatórios", href: "/relatorios" }}>
              <Card className="divide-y divide-borda px-3">
                {r.categorias.map((c, i) => (
                  <LinhaCategoria key={c.categoria} c={c} cor={CORES_CATEGORIA[Math.min(i, CORES_CATEGORIA.length - 1)]} />
                ))}
              </Card>
            </Secao>
          ) : null}

          {/* Orçamentos */}
          {r.orcamentos ? (
            <Secao titulo="Orçamentos" acao={{ label: "Ver orçamentos", href: "/orcamentos" }}>
              <Card className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                    <PieChart className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="text-sm text-texto">
                    {r.orcamentos.estourados.length === 0 ? (
                      <>Todas as {r.orcamentos.total} categorias ficaram dentro do orçamento.</>
                    ) : (
                      <>
                        <span className="font-semibold">
                          {r.orcamentos.dentro} de {r.orcamentos.total}
                        </span>{" "}
                        {r.orcamentos.total === 1 ? "categoria ficou" : "categorias ficaram"} dentro do orçamento
                      </>
                    )}
                  </p>
                </div>
                {r.orcamentos.estourados.length > 0 ? (
                  <div className="mt-2 divide-y divide-borda border-t border-borda">
                    {r.orcamentos.estourados.map((o) => (
                      <LinhaLista
                        key={o.categoria}
                        icone={<IconeCategoria categoria={o.categoria} />}
                        titulo={o.categoria}
                        subtitulo={`${formatBRL(o.gasto)} de ${formatBRL(o.limite)}`}
                        direita={
                          <span className="text-xs font-medium text-negativo">
                            {formatBRL(o.gasto - o.limite)} acima
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </Card>
            </Secao>
          ) : null}

          {/* Maiores gastos */}
          {r.maioresGastos.length > 0 ? (
            <Secao titulo="Maiores gastos">
              <Card className="divide-y divide-borda px-3">
                {r.maioresGastos.map((g) => (
                  <LinhaLista
                    key={g.id}
                    icone={<IconeCategoria categoria={g.categoria} />}
                    titulo={g.descricao}
                    subtitulo={`${dataCurta(g.data)} · ${g.categoria}`}
                    direita={<Valor valor={g.valor} />}
                  />
                ))}
              </Card>
            </Secao>
          ) : null}
          </div>

          <div className={`contents lg:col-start-1 lg:row-start-2 ${bloco}`}>
          {/* Semanas */}
          {r.saidas > 0 ? (
            <Secao titulo="Gastos por semana">
              <Card className="p-3">
                <GraficoSemanas semanas={r.semanas} />
              </Card>
            </Secao>
          ) : null}

          {/* Patrimônio */}
          {r.patrimonio ? (
            <Secao titulo="Patrimônio">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                    <Landmark className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-texto-3">Variação no mês</p>
                    <p className="text-base font-semibold">
                      <Valor valor={r.patrimonio.fim - r.patrimonio.inicio} sinal colorir />
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-borda pt-3 text-xs">
                  <div>
                    <p className="text-texto-3">Em {dataCurta(r.patrimonio.dataInicio)}</p>
                    <Valor valor={r.patrimonio.inicio} className="text-sm text-texto" />
                  </div>
                  <div>
                    <p className="text-texto-3">Em {dataCurta(r.patrimonio.dataFim)}</p>
                    <Valor valor={r.patrimonio.fim} className="text-sm text-texto" />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-texto-3">Contas + investimentos − faturas de cartão.</p>
              </Card>
            </Secao>
          ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
