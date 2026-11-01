"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, Landmark, Plus, Sparkles, Target } from "lucide-react";
import { Botao, Card, Secao, Valor } from "@/components/ui/base";
import { formatBRL } from "@/lib/format-currency";
import {
  atualizarMeta,
  calcularProgresso,
  carregarPainelMetas,
  criarMeta,
  definirConclusaoMeta,
  excluirMeta,
  sugerirReservaEmergencia,
  type InvestimentoMeta,
  type Meta,
  type PainelMetas,
} from "@/lib/dados/metas";
import { FolhaMeta, type EdicaoMeta } from "@/components/metas/FolhaMeta";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesAno(iso: string) {
  const [a, m] = iso.split("-");
  return `${MESES_CURTOS[Number.parseInt(m, 10) - 1]}/${a}`;
}

function BarraMeta({ fracao, alcancada }: { fracao: number; alcancada: boolean }) {
  return (
    <div className="h-1.5 rounded-full bg-white/[0.07]">
      <div
        className={`h-full rounded-full ${alcancada ? "bg-positivo" : "bg-marca"}`}
        style={{ width: `${Math.max(fracao > 0 ? 2 : 0, fracao * 100)}%` }}
      />
    </div>
  );
}

function CartaoMeta({
  meta,
  investimentos,
  salvando,
  onAbrir,
  onConcluir,
}: {
  meta: Meta;
  investimentos: InvestimentoMeta[];
  salvando: boolean;
  onAbrir: () => void;
  onConcluir: () => void;
}) {
  const p = calcularProgresso(meta, investimentos);
  const concluida = meta.concluidaEm != null;
  const qtdInvest = meta.investimentoIds.filter((id) => investimentos.some((i) => i.id === id)).length;
  const ok = p.alcancada || concluida;

  return (
    <Card className={`p-4 ${concluida ? "opacity-75" : ""}`}>
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.08] ${
              ok ? "bg-positivo/15 text-positivo" : "bg-white/[0.06] text-texto-2"
            }`}
          >
            {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Target className="h-4 w-4" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-texto">{meta.nome}</span>
            <span className="mt-0.5 block text-xs text-texto-3">
              <Valor valor={p.atual} className="text-texto-2" /> de {formatBRL(meta.valorAlvo)}
            </span>
          </span>
          <span className={`shrink-0 text-sm font-semibold ${p.alcancada ? "text-positivo" : "text-texto"}`}>
            {Math.floor(p.fracao * 100)}%
          </span>
        </div>
        <div className="mt-3">
          <BarraMeta fracao={p.fracao} alcancada={p.alcancada} />
        </div>
        <div className="mt-2.5 flex flex-col gap-0.5 text-xs text-texto-2">
          {concluida ? (
            <span className="text-positivo">Concluída em {mesAno(meta.concluidaEm!.slice(0, 10))}</span>
          ) : p.alcancada ? (
            <span className="text-positivo">Meta alcançada!</span>
          ) : (
            <span>
              Faltam <span className="font-semibold text-texto">{formatBRL(p.falta)}</span>
              {meta.dataAlvo && !p.prazoVencido ? (
                <>
                  {" "}·{" "}
                  {p.mesesRestantes === 0
                    ? "o prazo é este mês"
                    : `${p.mesesRestantes} ${p.mesesRestantes === 1 ? "mês" : "meses"} até ${mesAno(meta.dataAlvo)}`}
                </>
              ) : null}
            </span>
          )}
          {!ok && p.porMes != null ? (
            <span>
              Guarde <span className="font-semibold text-marca">{formatBRL(p.porMes)}/mês</span> para chegar lá
            </span>
          ) : null}
          {!ok && p.prazoVencido && meta.dataAlvo ? (
            <span className="text-alerta">O prazo era {mesAno(meta.dataAlvo)} · ajuste a data se quiser</span>
          ) : null}
          {qtdInvest > 0 ? (
            <span className="flex items-center gap-1 text-texto-3">
              <Landmark className="h-3 w-3 shrink-0" aria-hidden />
              {qtdInvest} {qtdInvest === 1 ? "investimento vinculado" : "investimentos vinculados"} ·{" "}
              {formatBRL(p.saldoInvestimentos)}
            </span>
          ) : null}
        </div>
      </button>
      {!concluida && p.alcancada ? (
        <Botao variante="primario" tamanho="sm" className="mt-3 w-full" disabled={salvando} onClick={onConcluir}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Marcar como concluída
        </Botao>
      ) : null}
    </Card>
  );
}

export function MetasScreen() {
  const [painel, setPainel] = useState<PainelMetas | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EdicaoMeta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarPainelMetas()
      .then((p) => {
        if (!cancelado) {
          setPainel(p);
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar as metas.");
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const carregando = painel == null && erro == null;
  const investimentos = useMemo(() => painel?.investimentos ?? [], [painel]);

  const { ativas, concluidas } = useMemo(() => {
    const metas = painel?.metas ?? [];
    return {
      ativas: metas.filter((m) => !m.concluidaEm),
      concluidas: metas.filter((m) => m.concluidaEm),
    };
  }, [painel]);

  const sugestaoReserva = sugerirReservaEmergencia(painel?.mediaDespesasMensal ?? 0);

  async function executar(acao: () => Promise<void>, fecharFolha = true) {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
      if (fecharFolha) setEdicao(null);
      setVersao((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirNova(inicial?: Partial<EdicaoMeta>) {
    setEdicao({
      meta: null,
      nome: "",
      valorAlvo: "",
      dataAlvo: "",
      valorManual: "",
      investimentoIds: [],
      ...inicial,
    });
  }

  function abrirEdicao(meta: Meta) {
    setEdicao({
      meta,
      nome: meta.nome,
      valorAlvo: String(meta.valorAlvo).replace(".", ","),
      dataAlvo: meta.dataAlvo ?? "",
      valorManual: meta.valorManual > 0 ? String(meta.valorManual).replace(".", ",") : "",
      investimentoIds: meta.investimentoIds,
    });
  }

  function cartao(m: Meta) {
    return (
      <CartaoMeta
        key={m.id}
        meta={m}
        investimentos={investimentos}
        salvando={salvando}
        onAbrir={() => abrirEdicao(m)}
        onConcluir={() => void executar(() => definirConclusaoMeta(m.id, true), false)}
      />
    );
  }

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
          <h1 className="text-lg font-semibold text-texto">Metas</h1>
          <p className="text-xs text-texto-2">Para onde vai o dinheiro que você guarda</p>
        </div>
        <Botao tamanho="sm" onClick={() => abrirNova()}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Nova
        </Botao>
      </header>

      {erro ? <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p> : null}

      {carregando ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : painel ? (
        <>
          {painel.metas.length === 0 ? (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-texto">Comece pela reserva de emergência</p>
                  <p className="mt-0.5 text-xs text-texto-2">
                    {sugestaoReserva != null ? (
                      <>
                        O ideal é ter uns 6 meses de gastos guardados. Pela sua média dos últimos 3 meses (
                        {formatBRL(painel.mediaDespesasMensal)}/mês), seriam{" "}
                        <span className="font-semibold text-texto">{formatBRL(sugestaoReserva)}</span>.
                      </>
                    ) : (
                      "O ideal é ter uns 6 meses de gastos guardados para imprevistos."
                    )}
                  </p>
                  <Botao
                    variante="primario"
                    tamanho="sm"
                    className="mt-3"
                    onClick={() =>
                      abrirNova({
                        nome: "Reserva de emergência",
                        valorAlvo: sugestaoReserva != null ? String(sugestaoReserva) : "",
                      })
                    }
                  >
                    Criar reserva de emergência
                  </Botao>
                </div>
              </div>
            </Card>
          ) : null}

          {ativas.length > 0 ? (
            <Secao titulo="Em andamento">
              <div className="flex flex-col gap-3">{ativas.map(cartao)}</div>
            </Secao>
          ) : null}

          {concluidas.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => setMostrarConcluidas((v) => !v)}
                aria-expanded={mostrarConcluidas}
                className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-texto"
              >
                Concluídas ({concluidas.length})
                <ChevronDown
                  className={`h-4 w-4 text-texto-3 transition-transform ${mostrarConcluidas ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {mostrarConcluidas ? <div className="flex flex-col gap-3">{concluidas.map(cartao)}</div> : null}
            </section>
          ) : null}

          {painel.metas.length > 0 && investimentos.length > 0 ? (
            <p className="text-[11px] text-texto-3">
              Os saldos dos investimentos vinculados são atualizados todo dia pelo banco.
            </p>
          ) : null}
        </>
      ) : null}

      {edicao ? (
        <FolhaMeta
          edicao={edicao}
          investimentos={investimentos}
          outrasMetas={(painel?.metas ?? []).filter((m) => m.id !== edicao.meta?.id && !m.concluidaEm)}
          salvando={salvando}
          onFechar={() => setEdicao(null)}
          onSalvar={(dados) =>
            void executar(() => (edicao.meta ? atualizarMeta(edicao.meta.id, dados) : criarMeta(dados)))
          }
          onConcluir={
            edicao.meta
              ? (concluir) => void executar(() => definirConclusaoMeta(edicao.meta!.id, concluir))
              : undefined
          }
          onExcluir={edicao.meta ? () => void executar(() => excluirMeta(edicao.meta!.id)) : undefined}
        />
      ) : null}
    </div>
  );
}
