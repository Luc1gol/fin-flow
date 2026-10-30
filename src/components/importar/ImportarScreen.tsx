"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileUp,
  Landmark,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Botao, Card, Chip, Valor, campoClasse } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { getBancoById } from "@/data/bancos";
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

/** Descrições que não dizem nada: pedem que o usuário dê um nome. */
const DESCRICOES_GENERICAS = new Set(["Compra no débito", "Pix enviado"]);

const ROTULO_MEIO: Record<string, string> = {
  pix: "Pix",
  debito: "débito",
  credito: "crédito",
  boleto: "boleto",
};

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

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Hoje", "Ontem" ou "qua, 28 de out". */
function rotuloDia(iso: string): string {
  const hoje = new Date();
  if (iso === isoLocal(hoje)) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (iso === isoLocal(ontem)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${iso}T12:00:00`))
    .replace(".", "");
}

function ultimaSincronizacaoTexto(contas: Conta[]): string {
  const ultima = contas
    .map((c) => (c.ultima_sincronizacao ? Date.parse(c.ultima_sincronizacao) : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  if (!ultima) return "Ainda não sincronizado";
  return `Atualizado ${new Intl.DateTimeFormat("pt-BR", {
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

/** Precisa de atenção: sem categoria ou com descrição genérica (exceto transferências). */
function precisaRevisao(e: Edicao): boolean {
  if (e.tipo === "transferencia") return false;
  return !e.categoria.trim() || DESCRICOES_GENERICAS.has(e.descricao.trim());
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function ImportarScreen() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [pendentes, setPendentes] = useState<TransacaoImportada[]>([]);
  const [duplicados, setDuplicados] = useState<Map<string, string>>(new Map());
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<string | null>(null);
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
          : `${novas} transações novas do banco.`,
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
    const { novas, duplicadas, nomesPreenchidos } = await importarExtrato({
      conta,
      extrato: arquivo.extrato,
      arquivoNome: arquivo.nome,
      nomesTitular,
      regras,
    });
    await recarregarPendentes();
    const partes = [
      novas > 0 ? `${novas} transações novas para revisar` : null,
      nomesPreenchidos > 0 ? `${nomesPreenchidos} compras no débito ganharam o nome da loja` : null,
      novas === 0 && nomesPreenchidos === 0 && duplicadas > 0
        ? "Nada novo: essas transações já estavam no app"
        : null,
    ].filter(Boolean);
    setAviso(`${partes.join(". ")}.`);
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
      // A conta pode ter vindo da Pluggy ("14739068-0") ou de outro OFX ("147390680").
      const numeroArquivo = digitos(extrato.conta);
      const conta = contas.find(
        (c) => c.tipo !== "cartao_credito" && numeroArquivo && digitos(c.numero_conta) === numeroArquivo,
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

  const ehRevisar = useCallback(
    (t: TransacaoImportada) => {
      const e = edicoes[t.id];
      return (e ? precisaRevisao(e) : false) || duplicados.has(t.id);
    },
    [edicoes, duplicados],
  );

  const visiveis = useMemo(
    () =>
      pendentes.filter((t) =>
        filtro === "todas" ? true : filtro === "revisar" ? ehRevisar(t) : !ehRevisar(t),
      ),
    [pendentes, filtro, ehRevisar],
  );

  const contagemRevisar = useMemo(
    () => pendentes.filter(ehRevisar).length,
    [pendentes, ehRevisar],
  );

  const gruposPorDia = useMemo(() => {
    const grupos: { dia: string; itens: TransacaoImportada[] }[] = [];
    for (const t of visiveis) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === t.data) ultimo.itens.push(t);
      else grupos.push({ dia: t.data, itens: [t] });
    }
    return grupos;
  }, [visiveis]);

  function editar(id: string, parcial: Partial<Edicao>) {
    const atual = edicoes[id];
    if (!atual) return;
    const nova = { ...atual, ...parcial };
    setEdicoes((ed) => ({ ...ed, [id]: { ...ed[id]!, ...parcial } }));
    // Ao completar o que faltava, a transação já fica marcada para confirmar.
    if (!precisaRevisao(nova) && !duplicados.has(id)) {
      setSelecionadas((sel) => (sel.has(id) ? sel : new Set(sel).add(id)));
    }
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
      setAberta(null);
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
  const anteriores = pendentes.filter((t) => t.data < inicioUso).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link
          href="/inicio"
          aria-label="Voltar"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 hover:bg-superficie lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-texto">Revisar transações</h1>
        {pendentes.length > 0 ? (
          <span className="text-sm text-texto-3">{pendentes.length}</span>
        ) : null}
      </header>

      {/* Fontes: banco conectado e arquivo OFX */}
      <Card className="divide-y divide-borda">
        {openFinance ? (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca/15 text-marca">
              <Landmark className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-texto">Banco conectado</p>
              <p className="truncate text-xs text-texto-3">{ultimaSincronizacaoTexto(contas)}</p>
            </div>
            <Botao tamanho="sm" disabled={sincronizando || processando} onClick={() => void sincronizar()}>
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} aria-hidden />
              {sincronizando ? "Buscando" : "Buscar"}
            </Botao>
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
            <FileUp className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-texto">Arquivo OFX</p>
            <p className="truncate text-xs text-texto-3">
              {openFinance ? "Completa o nome das compras no débito" : "Extrato exportado do banco"}
            </p>
          </div>
          <input
            ref={inputArquivoRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleArquivo(f);
            }}
          />
          <Botao tamanho="sm" disabled={processando} onClick={() => inputArquivoRef.current?.click()}>
            {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Enviar
          </Botao>
        </div>
      </Card>

      {arquivoSemConta ? (
        <NovaContaForm
          arquivo={arquivoSemConta}
          processando={processando}
          onCancelar={() => setArquivoSemConta(null)}
          onConfirmar={(nome, saldo) => void handleCriarContaEImportar(nome, saldo)}
        />
      ) : null}

      {erro ? (
        <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p>
      ) : null}
      {aviso ? (
        <p className="rounded-xl bg-positivo/10 px-3 py-2.5 text-sm text-positivo">{aviso}</p>
      ) : null}

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-texto-3" aria-label="Carregando" />
        </div>
      ) : pendentes.length === 0 ? (
        <div className="py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-marca" aria-hidden />
          <p className="mt-2 text-sm text-texto">Tudo revisado</p>
          <p className="text-xs text-texto-3">As novas transações do banco aparecem aqui.</p>
        </div>
      ) : (
        <section className="flex flex-col gap-3 pb-24 lg:pb-4">
          {anteriores > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
              <span>Começar a partir de</span>
              <input
                type="date"
                value={inicioUso}
                onChange={(e) => setInicioUso(e.target.value)}
                className={`${campoClasse} h-8 w-auto`}
                aria-label="Data de início"
              />
              <Botao tamanho="sm" variante="fantasma" disabled={processando} onClick={() => void handleIgnorarAntes()}>
                Ignorar {anteriores} anteriores
              </Botao>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <Chip ativo={filtro === "todas"} onClick={() => setFiltro("todas")}>
              Todas {pendentes.length}
            </Chip>
            <Chip ativo={filtro === "revisar"} onClick={() => setFiltro("revisar")}>
              Precisam de você {contagemRevisar}
            </Chip>
            <Chip ativo={filtro === "prontas"} onClick={() => setFiltro("prontas")}>
              Prontas {pendentes.length - contagemRevisar}
            </Chip>
            <button
              type="button"
              onClick={alternarTodasVisiveis}
              className="ml-auto shrink-0 text-xs font-medium text-texto-2 hover:text-texto"
            >
              {todasVisiveisSelecionadas ? "Desmarcar" : "Marcar todas"}
            </button>
          </div>

          <datalist id={DATALIST_CATEGORIAS_ID}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {gruposPorDia.map((g) => (
            <div key={g.dia}>
              <p className="mb-1 text-xs font-medium capitalize text-texto-3">{rotuloDia(g.dia)}</p>
              <Card className="divide-y divide-borda px-3">
                {g.itens.map((t) => (
                  <LinhaRevisao
                    key={t.id}
                    transacao={t}
                    edicao={edicoes[t.id] ?? edicaoInicial(t)}
                    duplicadoDe={duplicados.get(t.id)}
                    contaNome={contasPorId.get(t.conta_id)?.nome}
                    selecionada={selecionadas.has(t.id)}
                    aberta={aberta === t.id}
                    onAbrir={() => setAberta((a) => (a === t.id ? null : t.id))}
                    onSelecionar={() => alternarSelecao(t.id)}
                    onEditar={(p) => editar(t.id, p)}
                  />
                ))}
              </Card>
            </div>
          ))}

          <div className="fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-40 px-4 lg:sticky lg:bottom-4 lg:px-0">
            <div className="vidro mx-auto flex max-w-[398px] gap-2 rounded-[22px] p-2 lg:max-w-none">
              <Botao disabled={processando || selecionadas.size === 0} onClick={() => void handleIgnorar()}>
                Ignorar
              </Botao>
              <Botao
                variante="primario"
                className="flex-1"
                disabled={processando || selecionadas.size === 0}
                onClick={() => void handleConfirmar()}
              >
                {processando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Confirmar {selecionadas.size}
              </Botao>
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
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-texto">Nova conta</h2>
          <p className="mt-0.5 text-xs text-texto-3">
            {bancoNome} · conta {arquivo.extrato.conta} · {arquivo.extrato.transacoes.length} transações
          </p>
        </div>
        <button type="button" onClick={onCancelar} aria-label="Cancelar" className="text-texto-3 hover:text-texto">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Nome da conta
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={campoClasse} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Saldo atual no banco (opcional)
        <input
          value={saldo}
          onChange={(e) => setSaldo(e.target.value)}
          inputMode="decimal"
          placeholder="1.411,58"
          className={campoClasse}
        />
      </label>
      <Botao variante="primario" disabled={processando} onClick={() => onConfirmar(nome, parseValorDigitado(saldo))}>
        {processando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Criar conta e importar
      </Botao>
    </Card>
  );
}

function LinhaRevisao({
  transacao: t,
  edicao,
  duplicadoDe,
  contaNome,
  selecionada,
  aberta,
  onAbrir,
  onSelecionar,
  onEditar,
}: {
  transacao: TransacaoImportada;
  edicao: Edicao;
  duplicadoDe: string | undefined;
  contaNome: string | undefined;
  selecionada: boolean;
  aberta: boolean;
  onAbrir: () => void;
  onSelecionar: () => void;
  onEditar: (p: Partial<Edicao>) => void;
}) {
  const transferencia = edicao.tipo === "transferencia";
  const revisar = precisaRevisao(edicao);
  const meio = t.sugestao_meio ? ROTULO_MEIO[t.sugestao_meio] : null;

  let subtitulo: React.ReactNode;
  if (duplicadoDe) {
    subtitulo = <span className="text-alerta">Talvez já lançado: {duplicadoDe}</span>;
  } else if (revisar) {
    subtitulo = (
      <span className="text-alerta">
        {DESCRICOES_GENERICAS.has(edicao.descricao.trim())
          ? "Toque para dar nome e categoria"
          : "Toque para escolher a categoria"}
      </span>
    );
  } else {
    subtitulo = [transferencia ? "Transferência · não conta no mês" : edicao.categoria, meio]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSelecionar}
          aria-pressed={selecionada}
          aria-label={selecionada ? "Desmarcar" : "Marcar para confirmar"}
          className="-m-1 flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center"
        >
          {selecionada ? (
            <CheckCircle2 className="h-[22px] w-[22px] text-marca" aria-hidden />
          ) : (
            <Circle className="h-[22px] w-[22px] text-texto-3" aria-hidden />
          )}
        </button>
        <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
            <IconeCategoria categoria={edicao.categoria} transferencia={transferencia} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-texto">{edicao.descricao}</span>
            <span className="mt-0.5 block truncate text-xs text-texto-3">{subtitulo}</span>
          </span>
          <span className="shrink-0 text-right">
            <Valor
              valor={t.valor}
              sinal={t.valor > 0}
              colorir={!transferencia && t.valor > 0}
              className={`text-sm ${transferencia ? "text-texto-3" : "text-texto"}`}
            />
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-texto-3 transition-transform ${aberta ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {aberta ? (
        <div className="mt-2.5 flex flex-col gap-2 pl-9">
          <p className="truncate text-[11px] text-texto-3" title={t.memo}>
            No banco: {t.memo}
            {contaNome ? ` · ${contaNome}` : ""}
          </p>
          <input
            value={edicao.descricao}
            onChange={(e) => onEditar({ descricao: e.target.value })}
            onFocus={(e) => {
              if (DESCRICOES_GENERICAS.has(e.target.value.trim())) e.target.select();
            }}
            aria-label="Descrição"
            placeholder="Nome da loja ou pessoa"
            className={campoClasse}
          />
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-superficie-2 p-0.5">
            {(
              [
                ["despesa", "Despesa"],
                ["receita", "Receita"],
                ["transferencia", "Transferência"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => onEditar({ tipo: valor })}
                className={`h-7 rounded-md text-xs font-medium transition ${
                  edicao.tipo === valor ? "bg-superficie text-texto shadow" : "text-texto-3"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {!transferencia ? (
            <input
              value={edicao.categoria}
              onChange={(e) => onEditar({ categoria: e.target.value })}
              list={DATALIST_CATEGORIAS_ID}
              placeholder="Categoria"
              aria-label="Categoria"
              className={`${campoClasse} ${!edicao.categoria.trim() ? "border-alerta/50" : ""}`}
            />
          ) : null}
          {duplicadoDe ? (
            <p className="flex items-center gap-1.5 text-[11px] text-alerta">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Se já foi lançado, deixe desmarcado e use Ignorar.
            </p>
          ) : null}
          <p className="text-[11px] text-texto-3">
            O app lembra desta escolha para as próximas vezes.
          </p>
        </div>
      ) : null}
    </div>
  );
}
