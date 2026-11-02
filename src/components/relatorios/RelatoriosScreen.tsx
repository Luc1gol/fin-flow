"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { AbaAnaliseId, DadosAnalise, PeriodoRelatorioId } from "@/types/relatorios";
import { carregarDadosAnalise } from "@/lib/dados/analise";
import { resumirInvestimentos } from "@/components/relatorios/calculos";
import { Botao } from "@/components/ui/base";
import {
  COMPARACAO_NO,
  dentroDo,
  intervaloAnterior,
  intervaloDoPeriodo,
  isoDaData,
  rotuloIntervalo,
} from "@/components/relatorios/dados";
import { BarraAbas, Esqueleto, Segmentado } from "@/components/relatorios/ui";
import type { ContextoAnalise } from "@/components/relatorios/contexto";
import { AbaVisaoGeral } from "@/components/relatorios/AbaVisaoGeral";
import { AbaParaOnde } from "@/components/relatorios/AbaParaOnde";
import { AbaCartao } from "@/components/relatorios/AbaCartao";
import { AbaHabitos } from "@/components/relatorios/AbaHabitos";

const PERIODOS: readonly { id: PeriodoRelatorioId; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "mes", label: "Mês" },
  { id: "3m", label: "3 meses" },
  { id: "ano", label: "Ano" },
];

const ABAS: readonly { id: AbaAnaliseId; label: string }[] = [
  { id: "geral", label: "Visão geral" },
  { id: "para-onde", label: "Para onde vai" },
  { id: "cartao", label: "Cartão" },
  { id: "habitos", label: "Hábitos" },
];

function lerAba(v: string | null): AbaAnaliseId {
  return ABAS.some((a) => a.id === v) ? (v as AbaAnaliseId) : "geral";
}

function lerPeriodo(v: string | null): PeriodoRelatorioId {
  return PERIODOS.some((p) => p.id === v) ? (v as PeriodoRelatorioId) : "mes";
}

/**
 * Busca numa ida tudo que as abas usam: do início da janela mais antiga
 * (período anterior ou 6 meses completos atrás) até o fim do 5º mês à frente (parcelas futuras).
 */
async function carregarAnalise(periodo: PeriodoRelatorioId): Promise<DadosAnalise> {
  const ref = new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const anterior = intervaloAnterior(periodo, ref);
  const seisMesesAtras = isoDaData(new Date(y, m - 6, 1, 12));
  const desde = anterior.desde < seisMesesAtras ? anterior.desde : seisMesesAtras;
  const ate = isoDaData(new Date(y, m + 6, 0, 12));
  const faturasDesde = isoDaData(new Date(y, m - 12, 1, 12));

  const vazio: DadosAnalise = {
    periodo,
    ref,
    lancamentos: [],
    contasCartao: [],
    faturas: [],
    bancoPorCartao: {},
    investimentos: [],
    erro: false,
  };
  try {
    const r = await carregarDadosAnalise({ desde, ate, faturasDesde });
    if (!r) return vazio;
    return { ...vazio, ...r };
  } catch (e) {
    console.error("[analise]", e);
    return { ...vazio, erro: true };
  }
}

function EsqueletoAnalise() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <Esqueleto className="h-24 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        <Esqueleto className="h-20 rounded-2xl" />
        <Esqueleto className="h-20 rounded-2xl" />
      </div>
      <Esqueleto className="h-56 rounded-2xl" />
    </div>
  );
}

export function RelatoriosScreen() {
  const params = useSearchParams();
  const aba = lerAba(params.get("aba"));
  const periodo = lerPeriodo(params.get("periodo"));
  const [tentativa, setTentativa] = useState(0);
  const chave = `${periodo}|${tentativa}`;
  const [dados, setDados] = useState<{ chave: string; dados: DadosAnalise } | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarAnalise(periodo).then((d) => {
      if (!cancelado) setDados({ chave, dados: d });
    });
    return () => {
      cancelado = true;
    };
  }, [chave, periodo]);

  /** Troca aba/período na URL sem recarregar (integra com useSearchParams). */
  const atualizarUrl = useCallback(
    (mudanca: { aba?: AbaAnaliseId; periodo?: PeriodoRelatorioId }) => {
      const p = new URLSearchParams(params.toString());
      const novaAba = mudanca.aba ?? aba;
      const novoPeriodo = mudanca.periodo ?? periodo;
      if (novaAba === "geral") p.delete("aba");
      else p.set("aba", novaAba);
      if (novoPeriodo === "mes") p.delete("periodo");
      else p.set("periodo", novoPeriodo);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [params, aba, periodo],
  );

  // Enquanto o novo período carrega, mantém o anterior na tela (esmaecido).
  const atualizando = dados != null && dados.chave !== chave;
  const d = dados?.dados ?? null;

  const ctx = useMemo<ContextoAnalise | null>(() => {
    if (!d) return null;
    const atual = intervaloDoPeriodo(d.periodo, d.ref);
    const anterior = intervaloAnterior(d.periodo, d.ref);
    return {
      dados: d,
      periodo: d.periodo,
      ref: d.ref,
      atual,
      anterior,
      atuais: d.lancamentos.filter((r) => dentroDo(atual, r.data)),
      anteriores: d.lancamentos.filter((r) => dentroDo(anterior, r.data)),
      investAtual: resumirInvestimentos(d.investimentos.filter((r) => dentroDo(atual, r.data))),
      investAnterior: resumirInvestimentos(d.investimentos.filter((r) => dentroDo(anterior, r.data))),
      comparacaoNo: COMPARACAO_NO[d.periodo],
      bancoDoCartao: (nome) => d.bancoPorCartao[String(nome ?? "").trim()] ?? null,
    };
  }, [d]);

  const irPara = useCallback(
    (nova: AbaAnaliseId) => {
      atualizarUrl({ aba: nova });
      document.getElementById("topo-analise")?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [atualizarUrl],
  );

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header id="topo-analise" className="flex scroll-mt-4 items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-texto">Análise</h1>
          <p className="mt-0.5 h-4 text-xs text-texto-3">
            {ctx && !atualizando ? rotuloIntervalo(ctx.atual) : ""}
          </p>
        </div>
      </header>

      <Segmentado
        rotulo="Período"
        opcoes={PERIODOS}
        valor={periodo}
        onChange={(p) => atualizarUrl({ periodo: p })}
      />

      <div className="sticky top-0 z-10 -mx-4 bg-fundo/75 px-4 backdrop-blur-xl">
        <BarraAbas abas={ABAS} valor={aba} onChange={irPara} />
      </div>

      {d?.erro && !atualizando ? (
        <div className="vidro-suave flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <p className="text-sm text-negativo">Não foi possível carregar seus dados.</p>
          <Botao tamanho="sm" onClick={() => setTentativa((t) => t + 1)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar de novo
          </Botao>
        </div>
      ) : null}

      <div
        id={`painel-${aba}`}
        role="tabpanel"
        aria-labelledby={`aba-${aba}`}
        className={`transition-opacity duration-200 ${atualizando ? "pointer-events-none opacity-50" : ""}`}
      >
        {!ctx ? (
          <EsqueletoAnalise />
        ) : aba === "geral" ? (
          <AbaVisaoGeral ctx={ctx} irPara={irPara} />
        ) : aba === "para-onde" ? (
          <AbaParaOnde ctx={ctx} />
        ) : aba === "cartao" ? (
          <AbaCartao ctx={ctx} />
        ) : (
          <AbaHabitos ctx={ctx} />
        )}
      </div>
    </div>
  );
}
