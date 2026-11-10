"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";
import { Botao, Card, Chip, Secao, Valor, campoClasse } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { formatBRL } from "@/lib/format-currency";
import {
  atualizarRecorrencia,
  carregarContasFixas,
  criarRecorrencia,
  marcarComoPaga,
  mudarStatusRecorrencia,
  type ContaDoMes,
  type DadosRecorrencia,
  type PainelContasFixas,
  type Recorrencia,
  type SugestaoRecorrencia,
} from "@/lib/dados/recorrencias";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MEIOS = ["Pix", "Débito", "Crédito", "Boleto", "Dinheiro"] as const;

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function diasAte(iso: string) {
  const hoje = new Date();
  const alvo = new Date(`${iso}T12:00:00`);
  return Math.round((alvo.getTime() - new Date(hoje.toDateString()).getTime() - 12 * 3_600_000) / 86_400_000);
}

function textoSituacao(c: ContaDoMes): { texto: string; cor: string } {
  if (c.situacao === "paga") {
    return { texto: `${c.recorrencia.tipo === "receita" ? "Recebida" : "Paga"} em ${dataCurta(c.pagamento!.data)}`, cor: "text-positivo" };
  }
  if (c.situacao === "atrasada") return { texto: `Atrasada · dia ${dataCurta(c.vencimento)}`, cor: "text-negativo" };
  if (c.situacao === "prevista") return { texto: `Dia ${dataCurta(c.vencimento)}`, cor: "text-texto-3" };
  const d = diasAte(c.vencimento);
  return {
    texto: d <= 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias · ${dataCurta(c.vencimento)}`,
    cor: d <= 3 ? "text-alerta" : "text-texto-3",
  };
}

type Edicao = { recorrencia: Recorrencia | null; inicial: DadosRecorrencia };

const VAZIO: DadosRecorrencia = {
  descricao: "",
  tipo: "despesa",
  valor: 0,
  dia: new Date().getDate(),
  categoria: null,
  meioPagamento: "Pix",
};

export function RecorrenciasScreen() {
  const { period, setPeriod } = useDashboardPeriod();
  const chave = `${period.year}-${period.monthIndex}`;
  const [dados, setDados] = useState<{ chave: string; painel: PainelContasFixas } | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarContasFixas(period.year, period.monthIndex)
      .then((painel) => {
        if (!cancelado) {
          setDados({ chave, painel });
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar as contas fixas.");
      });
    return () => {
      cancelado = true;
    };
  }, [chave, period.year, period.monthIndex, versao]);

  const carregando = dados?.chave !== chave;
  const painel = dados?.painel;

  const { despesas, receitas, totais } = useMemo(() => {
    const contas = painel?.contas ?? [];
    const despesas = contas.filter((c) => c.recorrencia.tipo === "despesa");
    const receitas = contas.filter((c) => c.recorrencia.tipo === "receita");
    const soma = (lista: ContaDoMes[], pagas: boolean) =>
      lista
        .filter((c) => (c.situacao === "paga") === pagas)
        .reduce((a, c) => a + (c.pagamento?.valor ?? c.recorrencia.valor), 0);
    return {
      despesas,
      receitas,
      totais: {
        pago: soma(despesas, true),
        aPagar: soma(despesas, false),
        recebido: soma(receitas, true),
        aReceber: soma(receitas, false),
      },
    };
  }, [painel]);

  function mudarMes(delta: number) {
    const d = new Date(period.year, period.monthIndex + delta, 1);
    setPeriod({ year: d.getFullYear(), monthIndex: d.getMonth() });
  }

  async function executar(id: string, acao: () => Promise<void>) {
    setOcupado(id);
    setErro(null);
    try {
      await acao();
      setEdicao(null);
      setVersao((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  function adicionarSugestao(s: SugestaoRecorrencia) {
    void executar(`sug-${s.descricao}`, () => criarRecorrencia(s));
  }

  const vazio = !carregando && (painel?.contas.length ?? 0) === 0;
  /** No computador: duas colunas, a não ser que só exista o aviso de "cadastre suas contas". */
  const colunas = !vazio || (painel?.sugestoes.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-center gap-2">
        <Link href="/inicio" aria-label="Voltar" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 lg:hidden">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-texto">Contas fixas</h1>
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
        <Botao tamanho="sm" onClick={() => setEdicao({ recorrencia: null, inicial: VAZIO })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Nova
        </Botao>
      </header>

      {erro ? <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p> : null}

      {carregando ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div
          className={`flex flex-col gap-5 ${
            colunas ? "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start" : ""
          }`}
        >
          {/* No celular os três blocos abaixo são "contents" (mesma ordem de sempre); no computador,
              totais + sugestões ficam na coluna lateral e as contas na principal. */}
          <div className={`contents lg:col-start-2 lg:row-start-1 ${colunas ? "lg:flex lg:min-w-0 lg:flex-col lg:gap-5" : ""}`}>
          {!vazio ? (
            <div className="grid grid-cols-2 gap-2">
              <Card className="px-3 py-2.5">
                <p className="text-xs text-texto-3">Contas a pagar</p>
                <p className="mt-0.5 text-[15px] font-semibold text-texto">
                  <Valor valor={totais.aPagar} />
                </p>
                <p className="text-[11px] text-texto-3">já pago {formatBRL(totais.pago)}</p>
              </Card>
              <Card className="px-3 py-2.5">
                <p className="text-xs text-texto-3">A receber</p>
                <p className="mt-0.5 text-[15px] font-semibold text-positivo">
                  <Valor valor={totais.aReceber} />
                </p>
                <p className="text-[11px] text-texto-3">já recebido {formatBRL(totais.recebido)}</p>
              </Card>
            </div>
          ) : null}

          {painel && painel.sugestoes.length > 0 ? (
            <Secao titulo="Encontramos no seu histórico">
              <Card className="divide-y divide-borda px-3">
                {painel.sugestoes.map((s) => (
                  <div key={`${s.tipo}-${s.descricao}`} className="flex items-center gap-3 py-2.5">
                    <span className="vidro-marca flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-texto">{s.descricao}</span>
                      <span className="block truncate text-xs text-texto-3">
                        {s.tipo === "receita" ? "Receita" : "Despesa"} · todo dia {s.dia} · em {s.meses} dos últimos 6 meses
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm ${s.tipo === "receita" ? "text-positivo" : "text-texto"}`}>
                      {formatBRL(s.valor)}
                    </span>
                    <Botao
                      tamanho="sm"
                      disabled={ocupado != null}
                      onClick={() => adicionarSugestao(s)}
                      aria-label={`Adicionar ${s.descricao} como conta fixa`}
                    >
                      {ocupado === `sug-${s.descricao}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                    </Botao>
                  </div>
                ))}
              </Card>
            </Secao>
          ) : null}
          </div>

          <div className={`contents lg:col-start-1 lg:row-span-2 lg:row-start-1 ${colunas ? "lg:flex lg:min-w-0 lg:flex-col lg:gap-5" : ""}`}>
          {vazio ? (
            <Card className="p-5 text-center">
              <p className="text-sm text-texto">Cadastre suas contas e receitas fixas</p>
              <p className="mt-1 text-xs text-texto-3">
                Aluguel, salário, internet, assinaturas. O app mostra o que já foi pago no mês e o que falta.
              </p>
            </Card>
          ) : null}

          {[
            { titulo: "Despesas fixas", lista: despesas },
            { titulo: "Receitas fixas", lista: receitas },
          ]
            .filter((g) => g.lista.length > 0)
            .map((g) => (
              <Secao key={g.titulo} titulo={g.titulo}>
                <Card className="divide-y divide-borda px-3">
                  {g.lista.map((c) => {
                    const { texto, cor } = textoSituacao(c);
                    const rec = c.recorrencia;
                    return (
                      <div key={rec.id} className="flex items-center gap-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setEdicao({ recorrencia: rec, inicial: rec })}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
                            <IconeCategoria categoria={rec.categoria} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-texto">{rec.descricao}</span>
                            <span className={`block truncate text-xs ${cor}`}>{texto}</span>
                          </span>
                          <span className={`shrink-0 text-sm ${rec.tipo === "receita" ? "text-positivo" : "text-texto"}`}>
                            {formatBRL(c.pagamento?.valor ?? rec.valor)}
                          </span>
                        </button>
                        {c.situacao === "paga" ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-positivo" aria-label="Paga" />
                        ) : c.situacao !== "prevista" ? (
                          <Botao
                            tamanho="sm"
                            variante="fantasma"
                            disabled={ocupado != null}
                            onClick={() => void executar(rec.id, () => marcarComoPaga(c))}
                          >
                            {ocupado === rec.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                            {rec.tipo === "receita" ? "Recebi" : "Paguei"}
                          </Botao>
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                </Card>
              </Secao>
            ))}
          </div>

          <div className={`contents lg:col-start-2 lg:row-start-2 ${colunas ? "lg:flex lg:min-w-0 lg:flex-col lg:gap-5" : ""}`}>
          {painel && painel.pausadas.length > 0 ? (
            <Secao titulo="Pausadas">
              <Card className="divide-y divide-borda px-3">
                {painel.pausadas.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setEdicao({ recorrencia: rec, inicial: rec })}
                    className="flex w-full items-center gap-3 py-2.5 text-left opacity-60"
                  >
                    <IconeCategoria categoria={rec.categoria} />
                    <span className="flex-1 truncate text-sm text-texto">{rec.descricao}</span>
                    <span className="text-sm text-texto-2">{formatBRL(rec.valor)}</span>
                  </button>
                ))}
              </Card>
            </Secao>
          ) : null}

          {!vazio ? (
            <p className="text-[11px] text-texto-3">
              Quando o pagamento chega pelo banco com nome e valor parecidos, ele é reconhecido sozinho.
              Para o que você paga em dinheiro, use “Paguei”.
            </p>
          ) : null}
          </div>
        </div>
      )}

      {edicao ? (
        <FolhaRecorrencia
          edicao={edicao}
          ocupado={ocupado != null}
          onFechar={() => setEdicao(null)}
          onSalvar={(d) =>
            void executar("form", () =>
              edicao.recorrencia ? atualizarRecorrencia(edicao.recorrencia.id, d) : criarRecorrencia(d),
            )
          }
          onStatus={(status) => void executar("form", () => mudarStatusRecorrencia(edicao.recorrencia!.id, status))}
        />
      ) : null}
    </div>
  );
}

function FolhaRecorrencia({
  edicao,
  ocupado,
  onFechar,
  onSalvar,
  onStatus,
}: {
  edicao: Edicao;
  ocupado: boolean;
  onFechar: () => void;
  onSalvar: (d: DadosRecorrencia) => void;
  onStatus: (s: "ativa" | "pausada" | "encerrada") => void;
}) {
  const ini = edicao.inicial;
  const [descricao, setDescricao] = useState(ini.descricao);
  const [tipo, setTipo] = useState(ini.tipo);
  const [valor, setValor] = useState(ini.valor ? String(ini.valor).replace(".", ",") : "");
  const [dia, setDia] = useState(String(ini.dia));
  const [categoria, setCategoria] = useState(ini.categoria ?? "");
  const [meio, setMeio] = useState(ini.meioPagamento);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const rec = edicao.recorrencia;

  function salvar() {
    const t = valor.trim().replace(/[R$\s]/g, "");
    const v = Number.parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    const d = Number.parseInt(dia, 10);
    if (!descricao.trim()) return setAviso("Dê um nome, por exemplo Aluguel.");
    if (!Number.isFinite(v) || v <= 0) return setAviso("Informe o valor.");
    if (!Number.isFinite(d) || d < 1 || d > 31) return setAviso("O dia deve ser de 1 a 31.");
    onSalvar({ descricao, tipo, valor: v, dia: d, categoria: categoria || null, meioPagamento: meio });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 lg:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rec ? "Editar conta fixa" : "Nova conta fixa"}
        onClick={(e) => e.stopPropagation()}
        className="vidro max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-texto">{rec ? "Editar conta fixa" : "Nova conta fixa"}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-3 hover:text-texto">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-0.5">
            {(["despesa", "receita"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`h-8 rounded-lg text-xs font-semibold transition ${
                  tipo === t ? (t === "despesa" ? "bg-negativo/20 text-negativo" : "bg-positivo/20 text-positivo") : "text-texto-3"
                }`}
              >
                {t === "despesa" ? "Despesa" : "Receita"}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Nome
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Aluguel" className={`${campoClasse} h-10`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Valor (R$)
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="1.500" className={`${campoClasse} h-10`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Todo dia
              <input value={dia} onChange={(e) => setDia(e.target.value)} inputMode="numeric" placeholder="10" className={`${campoClasse} h-10`} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Categoria
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Moradia" className={`${campoClasse} h-10`} />
          </label>
          <div className="flex flex-col gap-1 text-xs text-texto-2">
            Como paga
            <div className="flex flex-wrap gap-1.5">
              {MEIOS.map((m) => (
                <Chip key={m} ativo={meio === m} onClick={() => setMeio(m)}>
                  {m}
                </Chip>
              ))}
            </div>
          </div>
          {aviso ? <p className="text-xs text-negativo">{aviso}</p> : null}
          <Botao variante="primario" disabled={ocupado} onClick={salvar}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Salvar
          </Botao>
          {rec ? (
            <div className="flex gap-2">
              <Botao
                variante="fantasma"
                className="flex-1"
                disabled={ocupado}
                onClick={() => onStatus(rec.status === "pausada" ? "ativa" : "pausada")}
              >
                {rec.status === "pausada" ? "Reativar" : "Pausar"}
              </Botao>
              <Botao
                variante="fantasma"
                className="flex-1 text-negativo"
                disabled={ocupado}
                onClick={() => (confirmarEncerrar ? onStatus("encerrada") : setConfirmarEncerrar(true))}
              >
                {confirmarEncerrar ? "Toque de novo para encerrar" : "Encerrar"}
              </Botao>
            </div>
          ) : null}
          {rec ? (
            <p className="text-[11px] text-texto-3">
              Encerrar não apaga nada: os pagamentos já lançados continuam no extrato.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
