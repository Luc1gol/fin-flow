"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  FileUp,
  Landmark,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { getBancoById } from "@/data/bancos";
import { formatBRL } from "@/lib/format-currency";
import { mergeCategoriasPadraoComBanco } from "@/lib/categorias-padrao";
import { fetchDistinctTagsForUser } from "@/lib/categorias-tags";
import { supabase } from "@/lib/supabase";
import type { TipoMovimento } from "@/lib/importacao/classificar";
import { decodificarArquivoOfx, parseOfx, type OfxExtrato } from "@/lib/importacao/ofx";
import {
  buscarPossiveisDuplicados,
  carregarRegras,
  confirmarTransacoes,
  criarConta,
  ignorarPendentesAntesDe,
  ignorarTransacoes,
  importarExtrato,
  listarContas,
  listarPendentes,
  nomesDoTitular,
  sincronizarOpenFinance,
  statusOpenFinance,
  type Conta,
  type TransacaoImportada,
} from "@/lib/importacao/repositorio";

/** Código COMPE do banco no OFX → id em `src/data/bancos.ts`. */
const BANCO_POR_CODIGO: Record<string, string> = {
  "336": "c6",
  "260": "nubank",
  "341": "itau",
  "077": "banco-inter",
  "237": "bradesco",
  "001": "bb",
  "104": "caixa",
  "033": "santander",
  "323": "mercado-pago",
  "536": "neon",
};

const DATALIST_CATEGORIAS_ID = "lista-categorias-importar";

/** Ao abrir a tela, sincroniza sozinho se a última busca tiver mais que isso. */
const HORAS_ENTRE_SINCRONIZACOES = 6;

const inputGlass =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-[#10B981]/50";

type Edicao = { tipo: TipoMovimento; descricao: string; categoria: string };

type Filtro = "todas" | "revisar" | "prontas";

type ArquivoLido = { nome: string; extrato: OfxExtrato };

/** Aceita "1.411,58", "1411.58" ou "1411". */
function parseValorDigitado(raw: string): number | null {
  const t = raw.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) ? n : null;
}

function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ultimaSincronizacaoTexto(contas: Conta[]): string {
  const ultima = contas
    .map((c) => (c.ultima_sincronizacao ? Date.parse(c.ultima_sincronizacao) : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  if (!ultima) return "Ainda não sincronizado";
  return `Última busca: ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ultima))}`;
}

function edicaoInicial(t: TransacaoImportada): Edicao {
  return {
    tipo: t.sugestao_tipo,
    descricao: t.sugestao_descricao,
    categoria: t.sugestao_categoria ?? "",
  };
}

/** Precisa de atenção: sem categoria (exceto transferências). */
function precisaRevisao(e: Edicao): boolean {
  return e.tipo !== "transferencia" && !e.categoria.trim();
}

export function ImportarScreen() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [pendentes, setPendentes] = useState<TransacaoImportada[]>([]);
  const [duplicados, setDuplicados] = useState<Map<string, string>>(new Map());
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  // Por padrão sugere começar no 1º dia do mês atual.
  const [inicioUso, setInicioUso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arquivoSemConta, setArquivoSemConta] = useState<ArquivoLido | null>(null);
  const [openFinance, setOpenFinance] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizouAoAbrir = useRef(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const recarregarPendentes = useCallback(async () => {
    const lista = await listarPendentes();
    const dups = await buscarPossiveisDuplicados(lista);
    setPendentes(lista);
    setDuplicados(dups);
    setEdicoes((anteriores) => {
      const proximas: Record<string, Edicao> = {};
      for (const t of lista) proximas[t.id] = anteriores[t.id] ?? edicaoInicial(t);
      return proximas;
    });
    // Pré-seleciona o que já está pronto e não parece duplicado.
    setSelecionadas(
      new Set(
        lista
          .filter((t) => !dups.has(t.id) && !precisaRevisao(edicaoInicial(t)))
          .map((t) => t.id),
      ),
    );
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [listaContas, { data: auth }, status] = await Promise.all([
          listarContas(),
          supabase.auth.getUser(),
          statusOpenFinance(),
        ]);
        const tags = auth.user ? await fetchDistinctTagsForUser(auth.user.id) : [];
        if (cancelado) return;
        setContas(listaContas);
        setCategorias(mergeCategoriasPadraoComBanco(tags));
        setOpenFinance(status.disponivel);
        await recarregarPendentes();
      } catch (e) {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar os dados de importação.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [recarregarPendentes]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setErro(null);
    setAviso(null);
    try {
      const { contas: porConta } = await sincronizarOpenFinance();
      const novas = porConta.reduce((acc, c) => acc + c.novas, 0);
      setContas(await listarContas());
      await recarregarPendentes();
      setAviso(
        novas === 0
          ? "Tudo em dia: nenhuma transação nova no banco."
          : `${novas} transações novas do banco: ${porConta
              .filter((c) => c.novas > 0)
              .map((c) => `${c.nome} (${c.novas})`)
              .join(", ")}.`,
      );
    } catch (e) {
      console.error(e);
      setErro(e instanceof Error ? e.message : "Falha ao buscar dados do banco.");
    } finally {
      setSincronizando(false);
    }
  }, [recarregarPendentes]);

  useEffect(() => {
    if (!openFinance || sincronizouAoAbrir.current) return;
    sincronizouAoAbrir.current = true;
    const ultima = contas
      .map((c) => (c.ultima_sincronizacao ? Date.parse(c.ultima_sincronizacao) : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    if (Date.now() - ultima > HORAS_ENTRE_SINCRONIZACOES * 3_600_000) {
      const id = window.setTimeout(() => void sincronizar(), 0);
      return () => window.clearTimeout(id);
    }
  }, [openFinance, contas, sincronizar]);

  async function importarParaConta(conta: Conta, arquivo: ArquivoLido) {
    const [nomesTitular, regras] = await Promise.all([nomesDoTitular(), carregarRegras()]);
    const { novas, duplicadas } = await importarExtrato({
      conta,
      extrato: arquivo.extrato,
      arquivoNome: arquivo.nome,
      nomesTitular,
      regras,
    });
    await recarregarPendentes();
    setAviso(
      novas === 0
        ? "Nenhuma transação nova: este arquivo já tinha sido importado."
        : `${novas} transações novas para revisar${duplicadas ? ` (${duplicadas} já importadas antes foram ignoradas)` : ""}.`,
    );
  }

  async function handleArquivo(file: File) {
    setErro(null);
    setAviso(null);
    setProcessando(true);
    try {
      const texto = decodificarArquivoOfx(await file.arrayBuffer());
      const extrato = parseOfx(texto);
      if (extrato.transacoes.length === 0) {
        setErro("O arquivo não tem transações.");
        return;
      }
      const arquivo = { nome: file.name, extrato };
      const conta = contas.find(
        (c) => c.numero_conta && c.numero_conta === extrato.conta,
      );
      if (conta) {
        await importarParaConta(conta, arquivo);
      } else {
        setArquivoSemConta(arquivo);
      }
    } catch (e) {
      console.error(e);
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setProcessando(false);
      if (inputArquivoRef.current) inputArquivoRef.current.value = "";
    }
  }

  async function handleCriarContaEImportar(nome: string, saldoAtual: number | null) {
    if (!arquivoSemConta) return;
    setProcessando(true);
    setErro(null);
    try {
      const { extrato } = arquivoSemConta;
      const datas = extrato.transacoes.map((t) => t.data).sort();
      const somaArquivo = extrato.transacoes.reduce((acc, t) => acc + t.valor, 0);
      // Saldo antes da primeira transação do arquivo = saldo de hoje − movimentação do arquivo.
      const saldoInicial =
        saldoAtual != null ? Math.round((saldoAtual - somaArquivo) * 100) / 100 : 0;
      const conta = await criarConta({
        nome: nome.trim() || "Conta corrente",
        banco: BANCO_POR_CODIGO[extrato.bancoCodigo ?? ""] ?? null,
        numero_conta: extrato.conta,
        saldo_inicial: saldoInicial,
        data_saldo_inicial: diaAnterior(datas[0]!),
      });
      setContas((cs) => [...cs, conta]);
      setArquivoSemConta(null);
      await importarParaConta(conta, arquivoSemConta);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível criar a conta.");
    } finally {
      setProcessando(false);
    }
  }

  const visiveis = useMemo(
    () =>
      pendentes.filter((t) => {
        const e = edicoes[t.id];
        if (!e || filtro === "todas") return true;
        const revisar = precisaRevisao(e) || duplicados.has(t.id);
        return filtro === "revisar" ? revisar : !revisar;
      }),
    [pendentes, edicoes, filtro, duplicados],
  );

  const contagemRevisar = useMemo(
    () =>
      pendentes.filter((t) => {
        const e = edicoes[t.id];
        return (e && precisaRevisao(e)) || duplicados.has(t.id);
      }).length,
    [pendentes, edicoes, duplicados],
  );

  function editar(id: string, parcial: Partial<Edicao>) {
    setEdicoes((ed) => ({ ...ed, [id]: { ...ed[id]!, ...parcial } }));
  }

  function alternarSelecao(id: string) {
    setSelecionadas((sel) => {
      const nova = new Set(sel);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const todasVisiveisSelecionadas =
    visiveis.length > 0 && visiveis.every((t) => selecionadas.has(t.id));

  function alternarTodasVisiveis() {
    setSelecionadas((sel) => {
      const nova = new Set(sel);
      for (const t of visiveis) {
        if (todasVisiveisSelecionadas) nova.delete(t.id);
        else nova.add(t.id);
      }
      return nova;
    });
  }

  async function handleConfirmar() {
    const itens = pendentes
      .filter((t) => selecionadas.has(t.id))
      .map((t) => ({ transacao: t, ...edicoes[t.id]! }));
    if (itens.length === 0) return;
    setProcessando(true);
    setErro(null);
    try {
      await confirmarTransacoes(itens);
      await recarregarPendentes();
      setAviso(`${itens.length} lançamentos criados.`);
    } catch (e) {
      console.error(e);
      setErro("Erro ao confirmar as transações.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleIgnorar() {
    const ids = [...selecionadas];
    if (ids.length === 0) return;
    setProcessando(true);
    setErro(null);
    try {
      await ignorarTransacoes(ids);
      await recarregarPendentes();
      setAviso(`${ids.length} transações ignoradas.`);
    } catch (e) {
      console.error(e);
      setErro("Erro ao ignorar as transações.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleIgnorarAntes() {
    setProcessando(true);
    setErro(null);
    try {
      const n = await ignorarPendentesAntesDe(inicioUso);
      await recarregarPendentes();
      setAviso(`${n} transações anteriores a ${formatarData(inicioUso)} foram ignoradas.`);
    } catch (e) {
      console.error(e);
      setErro("Erro ao ignorar as transações antigas.");
    } finally {
      setProcessando(false);
    }
  }

  const contasPorId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="relative flex h-11 shrink-0 items-center justify-center">
        <Link
          href="/lancar"
          className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5 stroke-[2]" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold text-white">Importar extrato</h1>
      </header>

      {openFinance ? (
        <GlassPanel className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-[#10B981]">
              <Landmark className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Conectado ao banco</p>
              <p className="text-xs text-zinc-500">
                {ultimaSincronizacaoTexto(contas)}
              </p>
            </div>
            <button
              type="button"
              disabled={sincronizando || processando}
              onClick={() => void sincronizar()}
              className="flex h-10 items-center gap-1.5 rounded-2xl bg-[#10B981] px-3 text-xs font-bold text-white transition hover:bg-[#0ea371] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} aria-hidden />
              {sincronizando ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-4">
        <p className="text-sm text-zinc-300">
          {openFinance ? "Ou envie" : "Exporte o extrato do banco em"} um arquivo{" "}
          <strong className="text-white">OFX</strong>. Nada é lançado sem a sua confirmação.
        </p>
        <input
          ref={inputArquivoRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleArquivo(f);
          }}
        />
        <button
          type="button"
          disabled={processando}
          onClick={() => inputArquivoRef.current?.click()}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10B981] text-sm font-bold text-white transition hover:bg-[#0ea371] disabled:opacity-50"
        >
          {processando ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <FileUp className="h-5 w-5" aria-hidden />
          )}
          Escolher arquivo OFX
        </button>
        {contas.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Contas: {contas.map((c) => c.nome).join(", ")}
          </p>
        ) : null}
      </GlassPanel>

      {arquivoSemConta ? (
        <NovaContaForm
          arquivo={arquivoSemConta}
          processando={processando}
          onCancelar={() => setArquivoSemConta(null)}
          onConfirmar={(nome, saldo) => void handleCriarContaEImportar(nome, saldo)}
        />
      ) : null}

      {erro ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {aviso}
        </p>
      ) : null}

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Carregando" />
        </div>
      ) : pendentes.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          Nenhuma transação aguardando revisão.
        </p>
      ) : (
        <section className="flex flex-col gap-3 pb-28">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              A revisar <span className="text-zinc-500">({pendentes.length})</span>
            </h2>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={todasVisiveisSelecionadas}
                onChange={alternarTodasVisiveis}
                className="h-4 w-4 accent-[#10B981]"
              />
              Selecionar todas
            </label>
          </div>

          {pendentes.some((t) => t.data < inicioUso) ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-zinc-400">
              <span>Começar a usar a partir de</span>
              <input
                type="date"
                value={inicioUso}
                onChange={(e) => setInicioUso(e.target.value)}
                className={`${inputGlass} py-1.5`}
                aria-label="Data de início"
              />
              <button
                type="button"
                disabled={processando || !inicioUso}
                onClick={() => void handleIgnorarAntes()}
                className="rounded-xl border border-white/10 px-3 py-1.5 font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-40"
              >
                Ignorar {pendentes.filter((t) => t.data < inicioUso).length} anteriores
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            {(
              [
                ["todas", `Todas`],
                ["revisar", `Revisar (${contagemRevisar})`],
                ["prontas", `Prontas (${pendentes.length - contagemRevisar})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  filtro === id ? "bg-white/10 text-white" : "text-zinc-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <datalist id={DATALIST_CATEGORIAS_ID}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {visiveis.map((t) => (
            <LinhaRevisao
              key={t.id}
              transacao={t}
              edicao={edicoes[t.id] ?? edicaoInicial(t)}
              duplicadoDe={duplicados.get(t.id)}
              contaNome={contasPorId.get(t.conta_id)?.nome}
              selecionada={selecionadas.has(t.id)}
              onSelecionar={() => alternarSelecao(t.id)}
              onEditar={(p) => editar(t.id, p)}
            />
          ))}

          <div className="fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-40 px-4">
            <div className="mx-auto flex max-w-[430px] gap-2 rounded-3xl border border-white/10 bg-[#1a1a1a]/95 p-2 shadow-xl backdrop-blur-xl">
              <button
                type="button"
                disabled={processando || selecionadas.size === 0}
                onClick={() => void handleIgnorar()}
                className="h-12 rounded-2xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                Ignorar
              </button>
              <button
                type="button"
                disabled={processando || selecionadas.size === 0}
                onClick={() => void handleConfirmar()}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#10B981] text-sm font-bold text-white transition hover:bg-[#0ea371] disabled:opacity-40"
              >
                {processando ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                )}
                Confirmar {selecionadas.size}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function NovaContaForm({
  arquivo,
  processando,
  onCancelar,
  onConfirmar,
}: {
  arquivo: ArquivoLido;
  processando: boolean;
  onCancelar: () => void;
  onConfirmar: (nome: string, saldoAtual: number | null) => void;
}) {
  const bancoId = BANCO_POR_CODIGO[arquivo.extrato.bancoCodigo ?? ""];
  const bancoNome = bancoId ? getBancoById(bancoId).nome : arquivo.extrato.bancoNome;
  const [nome, setNome] = useState(`${bancoNome ?? "Banco"} - Conta corrente`);
  const [saldo, setSaldo] = useState("");

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Nova conta</h2>
          <p className="mt-1 text-xs text-zinc-400">
            {bancoNome} · conta {arquivo.extrato.conta} ·{" "}
            {arquivo.extrato.transacoes.length} transações
          </p>
        </div>
        <button type="button" onClick={onCancelar} aria-label="Cancelar" className="text-zinc-500 hover:text-white">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Nome da conta
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputGlass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Saldo atual no banco (opcional)
        <input
          value={saldo}
          onChange={(e) => setSaldo(e.target.value)}
          inputMode="decimal"
          placeholder="Ex.: 1.411,58"
          className={inputGlass}
        />
        <span className="text-[11px] font-normal normal-case tracking-normal text-zinc-500">
          Usado para o app mostrar o saldo real da conta.
        </span>
      </label>
      <button
        type="button"
        disabled={processando}
        onClick={() => onConfirmar(nome, parseValorDigitado(saldo))}
        className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#10B981] text-sm font-bold text-white disabled:opacity-50"
      >
        {processando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Criar conta e importar
      </button>
    </GlassPanel>
  );
}

function LinhaRevisao({
  transacao: t,
  edicao,
  duplicadoDe,
  contaNome,
  selecionada,
  onSelecionar,
  onEditar,
}: {
  transacao: TransacaoImportada;
  edicao: Edicao;
  duplicadoDe: string | undefined;
  contaNome: string | undefined;
  selecionada: boolean;
  onSelecionar: () => void;
  onEditar: (p: Partial<Edicao>) => void;
}) {
  const entrada = t.valor > 0;
  const corValor =
    edicao.tipo === "transferencia"
      ? "text-zinc-400"
      : entrada
        ? "text-[#10B981]"
        : "text-[#EF4444]";
  const revisar = precisaRevisao(edicao);

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        selecionada ? "border-[#10B981]/40 bg-emerald-950/20" : "border-white/[0.07] bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selecionada}
          onChange={onSelecionar}
          aria-label={`Selecionar ${edicao.descricao}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[#10B981]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-500">
              {formatarData(t.data)}
              {contaNome ? ` · ${contaNome}` : ""}
            </span>
            <span className={`flex items-center gap-1 text-sm font-bold tabular-nums ${corValor}`}>
              {edicao.tipo === "transferencia" ? (
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
              ) : null}
              {entrada ? "+" : "−"} {formatBRL(Math.abs(t.valor))}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-600" title={t.memo}>
            {t.memo}
          </p>

          {duplicadoDe ? (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-950/40 px-2 py-1 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Talvez já lançado: {duplicadoDe}
            </p>
          ) : null}

          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={edicao.descricao}
              onChange={(e) => onEditar({ descricao: e.target.value })}
              aria-label="Descrição"
              className={inputGlass}
            />
            <select
              value={edicao.tipo}
              onChange={(e) => onEditar({ tipo: e.target.value as TipoMovimento })}
              aria-label="Tipo"
              className={`${inputGlass} pr-2`}
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>
          {edicao.tipo !== "transferencia" ? (
            <input
              value={edicao.categoria}
              onChange={(e) => onEditar({ categoria: e.target.value })}
              list={DATALIST_CATEGORIAS_ID}
              placeholder="Categoria"
              aria-label="Categoria"
              className={`${inputGlass} mt-2 w-full ${revisar ? "border-amber-500/40" : ""}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
