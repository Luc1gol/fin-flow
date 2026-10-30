"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  Search,
  SearchX,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { LancamentoExtrato } from "@/types/lancamento";
import { getBancoById } from "@/data/bancos";
import { mergeCategoriasPadraoComBanco } from "@/lib/categorias-padrao";
import { fetchDistinctTagsForUser } from "@/lib/categorias-tags";
import { mapLancamentoRowFromDb } from "@/lib/map-lancamento-extrato";
import { supabase } from "@/lib/supabase";
import {
  LABELS_MEIO_PAGAMENTO_EXTRATO,
  comparableMeioPagamento,
} from "@/lib/meio-pagamento-extrato";
import {
  coalesceTagsExtrasFromUnknown,
  sanitizeTagsExtrasList,
} from "@/lib/tags-extras-coalesce";
import {
  type CartaoUsuarioOrigem,
  labelContaCartaoPersistido,
} from "@/lib/conta-cartao-lancamento";
import { Botao, Card, Valor, campoClasse } from "@/components/ui/base";
import { ExtratoEditarLancamentoModal } from "@/components/extrato/ExtratoEditarLancamentoModal";
import { ExtratoFolha } from "@/components/extrato/ExtratoFolha";
import { LinhaExtrato, MiniLogoBanco } from "@/components/extrato/ExtratoLinha";
import {
  CSV_SEP_EXTRATO,
  FILTROS_APLICADOS_INICIAL,
  type FiltroExtratoId,
  type FiltrosAplicadosState,
  OPCOES_PERIODO,
  PERIODO_PADRAO_EXTRATO,
  type PeriodoPresetId,
  buscarLancamentosExtratoParaUsuario,
  csvEscaparExtrato,
  formatDdMmYyyy,
  formatISODateLocal,
  isoNoIntervalo,
  labelChipPeriodo,
  labelPresetPeriodo,
  primeiraDataInclusivePreset,
  tituloGrupoData,
  ultimaDataInclusivePreset,
} from "@/components/extrato/extrato-utils";

export {
  PERIODO_PADRAO_EXTRATO,
  type FiltroExtratoId,
  type FiltrosAplicadosState,
  type PeriodoPresetId,
};

function noopSubscribe(): () => void {
  return () => {};
}

/** Pílula de filtro com seta; área de toque estendida para ~40px. */
function ChipFiltro({
  icone: Icone,
  ativo,
  aberto,
  onClick,
  rotuloAcessivel,
  children,
}: {
  icone: LucideIcon;
  ativo: boolean;
  aberto: boolean;
  onClick: () => void;
  rotuloAcessivel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotuloAcessivel}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      className={`relative inline-flex h-8 max-w-[13rem] shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3 text-xs font-medium transition after:absolute after:-inset-y-1 after:inset-x-0 ${
        ativo
          ? "vidro text-marca"
          : "border border-borda-forte text-texto-2 hover:text-texto"
      }`}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
    </button>
  );
}

/** Opção selecionável dentro das folhas de filtro (lista com check). */
function OpcaoFiltro({
  selecionada,
  onClick,
  papel = "option",
  icone,
  children,
  detalhe,
}: {
  selecionada: boolean;
  onClick: () => void;
  papel?: "option" | "radio";
  icone?: ReactNode;
  children: ReactNode;
  detalhe?: ReactNode;
}) {
  return (
    <button
      type="button"
      role={papel}
      aria-selected={papel === "option" ? selecionada : undefined}
      aria-checked={papel === "radio" ? selecionada : undefined}
      onClick={onClick}
      className="flex min-h-11 w-full touch-manipulation items-center gap-3 px-3 py-2 text-left transition-colors active:bg-white/[0.04]"
    >
      {icone}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${selecionada ? "text-texto" : "text-texto-2"}`}>
          {children}
        </span>
        {detalhe ? <span className="block truncate text-xs text-texto-3">{detalhe}</span> : null}
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition ${
          selecionada ? "bg-marca text-white" : "ring-1 ring-inset ring-borda-forte"
        }`}
        aria-hidden
      >
        {selecionada ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** Pílula de opção (categorias, tags e meios), multi-seleção. */
function PilulaOpcao({
  selecionada,
  onClick,
  children,
}: {
  selecionada: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selecionada}
      onClick={onClick}
      className={`inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-sm transition ${
        selecionada
          ? "bg-marca/15 text-marca ring-1 ring-inset ring-marca/40"
          : "text-texto-2 ring-1 ring-inset ring-borda-forte hover:text-texto"
      }`}
    >
      {selecionada ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : null}
      {children}
    </button>
  );
}

function BotaoLimparFolha({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 shrink-0 touch-manipulation px-2 text-xs font-medium text-marca hover:brightness-110"
    >
      Limpar
    </button>
  );
}

export function ExtratoScreen() {
  const [busca, setBusca] = useState("");
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoExtrato[]>([]);
  const [lancamentoEmEdicao, setLancamentoEmEdicao] = useState<LancamentoExtrato | null>(null);
  const [cartoesUsuario, setCartoesUsuario] = useState<CartaoUsuarioOrigem[]>([]);
  const [categoriasSalvas, setCategoriasSalvas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAplicadosState>(() => ({
    ...FILTROS_APLICADOS_INICIAL,
  }));
  /** Folha de filtro aberta (uma por vez). */
  const [filtroAberto, setFiltroAberto] = useState<FiltroExtratoId | null>(null);
  const [periodoSelecionado, setPeriodoSelecionado] =
    useState<PeriodoPresetId>(PERIODO_PADRAO_EXTRATO);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cartoesSelecionados, setCartoesSelecionados] = useState<string[]>([]);
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [meiosPagamentoSelecionados, setMeiosPagamentoSelecionados] = useState<string[]>([]);
  const [excluirEscopoRecorrencia, setExcluirEscopoRecorrencia] =
    useState<LancamentoExtrato | null>(null);
  const [excluirEscopoLoading, setExcluirEscopoLoading] = useState(false);
  const exclusaoRecorrenteLockRef = useRef(false);
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setAuthUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const fecharFiltro = useCallback(() => {
    setFiltroAberto(null);
  }, []);

  const aplicarPeriodo = useCallback(() => {
    setFiltrosAplicados((prev) => ({ ...prev, periodo: true }));
    setFiltroAberto(null);
  }, []);

  const handleLimparFiltros = useCallback(() => {
    setBusca("");
    setCategoriasSelecionadas([]);
    setPeriodoSelecionado(PERIODO_PADRAO_EXTRATO);
    setDataInicio("");
    setDataFim("");
    setFiltrosAplicados({ ...FILTROS_APLICADOS_INICIAL });
    setTagsSelecionadas([]);
    setCartoesSelecionados([]);
    setMeiosPagamentoSelecionados([]);
  }, []);

  const toggleCartaoSelecionado = useCallback((contaCartaoValor: string) => {
    setCartoesSelecionados((prev) =>
      prev.includes(contaCartaoValor)
        ? prev.filter((x) => x !== contaCartaoValor)
        : [...prev, contaCartaoValor],
    );
  }, []);

  const toggleCategoriaListaSelecionada = useCallback((nome: string) => {
    setCategoriasSelecionadas((prev) =>
      prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome],
    );
  }, []);

  const toggleTagSelecionada = useCallback((tag: string) => {
    setTagsSelecionadas((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const toggleMeioPagamentoSeleccionado = useCallback((meioLabel: string) => {
    const key = comparableMeioPagamento(meioLabel);
    setMeiosPagamentoSelecionados((prev) =>
      prev.some((m) => comparableMeioPagamento(m) === key)
        ? prev.filter((m) => comparableMeioPagamento(m) !== key)
        : [...prev, meioLabel],
    );
  }, []);

  const aplicarPersonalizadoIncomplete =
    periodoSelecionado === "personalizado" &&
    (dataInicio.trim() === "" || dataFim.trim() === "");

  const handleDataPersonalizadoInicioChange = useCallback(
    (v: string) => {
      const inicioSlice = v.slice(0, 10);
      setDataInicio(inicioSlice);
      const fin = dataFim.trim().slice(0, 10);
      if (fin !== "" && inicioSlice > fin) {
        setDataFim(inicioSlice);
      }
    },
    [dataFim],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCartoesECategorias() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) return;

      const [tags, cartRes] = await Promise.all([
        fetchDistinctTagsForUser(user.id),
        supabase.from("cartoes").select("*").eq("user_id", user.id),
      ]);
      if (cancelled) return;

      setCategoriasSalvas(mergeCategoriasPadraoComBanco(tags));

      if (cartRes.error) {
        console.error(cartRes.error);
        return;
      }
      const rows = (cartRes.data ?? []) as {
        id: string;
        nome: string | null;
        banco?: string | null;
      }[];
      setCartoesUsuario(
        rows.map((r) => ({
          id: String(r.id),
          nome: String(r.nome ?? "").trim(),
          banco: String(r.banco ?? "").trim(),
        })),
      );
    }
    loadCartoesECategorias();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(async (item: LancamentoExtrato) => {
    if (item.recorrencia_id?.trim()) {
      setExcluirEscopoRecorrencia(item);
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) {
      return;
    }
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      window.alert("Sessão inválida. Entre novamente.");
      return;
    }
    const { error } = await supabase
      .from("lancamentos")
      .delete()
      .eq("id", item.id)
      .eq("user_id", user.id);
    if (error) {
      console.error(error);
      window.alert("Não foi possível excluir o lançamento.");
      return;
    }
    setLancamentos((prev) => prev.filter((x) => x.id !== item.id));
    setLancamentoEmEdicao((cur) => (cur?.id === item.id ? null : cur));
  }, []);

  const algumaFolhaAberta = filtroAberto !== null || excluirEscopoRecorrencia !== null;

  useEffect(() => {
    if (!algumaFolhaAberta) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [algumaFolhaAberta]);

  useEffect(() => {
    if (!algumaFolhaAberta) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (excluirEscopoRecorrencia !== null) {
        if (!excluirEscopoLoading) setExcluirEscopoRecorrencia(null);
        return;
      }
      setFiltroAberto(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [algumaFolhaAberta, excluirEscopoRecorrencia, excluirEscopoLoading]);

  useEffect(() => {
    // Sem usuário (undefined = ainda verificando, null = deslogado) não há o que buscar;
    // a lista exibida é derivada de `authUser` abaixo.
    if (!authUser) return;

    let isMounted = true;

    const carregarDados = async () => {
      setIsLoading(true);
      try {
        const bundle = await supabase
          .from("lancamentos")
          .select("*")
          .eq("user_id", authUser.id)
          .order("data", { ascending: false })
          .order("created_at", { ascending: false });

        let data = bundle.data;
        if (bundle.error) {
          const retry = await supabase
            .from("lancamentos")
            .select("*")
            .eq("user_id", authUser.id)
            .order("data", { ascending: false });
          if (retry.error) {
            console.error(bundle.error, retry.error);
            if (isMounted) setLancamentos([]);
            return;
          }
          data = retry.data;
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        if (isMounted) {
          setLancamentos(rows.map(mapLancamentoRowFromDb));
        }
      } catch (error) {
        console.error("Erro no fetch do extrato:", error);
        if (isMounted) setLancamentos([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void carregarDados();

    return () => {
      isMounted = false;
    };
  }, [authUser]);

  /** Deslogado: lista vazia e sem carregamento. */
  const lancamentosDoUsuario = useMemo(
    () => (authUser === null ? [] : lancamentos),
    [authUser, lancamentos],
  );
  const carregando = authUser !== null && isLoading;

  const refreshCategoriasSalvas = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return;
    const tagsDeBanco = await fetchDistinctTagsForUser(user.id);
    setCategoriasSalvas(mergeCategoriasPadraoComBanco(tagsDeBanco));
  }, []);

  const handleRefreshAfterEdit = useCallback(async () => {
    if (!authUser?.id) return;
    try {
      const rows = await buscarLancamentosExtratoParaUsuario(authUser.id);
      setLancamentos(rows);
    } catch (e) {
      console.error(e);
      setLancamentos([]);
    }
    await refreshCategoriasSalvas();
  }, [authUser, refreshCategoriasSalvas]);

  const fecharModalEdicaoExtrato = useCallback(() => {
    setLancamentoEmEdicao(null);
  }, []);

  const aplicarItemEditadoNoExtrato = useCallback((updated: LancamentoExtrato) => {
    setLancamentos((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setLancamentoEmEdicao(null);
  }, []);

  const aplicarExclusaoRecorrente = useCallback(
    async (scope: "single" | "series") => {
      if (exclusaoRecorrenteLockRef.current) return;
      exclusaoRecorrenteLockRef.current = true;
      setExcluirEscopoLoading(true);
      try {
        const alvo = excluirEscopoRecorrencia;
        const rid = alvo?.recorrencia_id?.trim();
        if (!alvo || !rid) return;

        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr || !user) {
          window.alert("Sessão inválida. Entre novamente.");
          return;
        }

        if (scope === "single") {
          const { error } = await supabase
            .from("lancamentos")
            .delete()
            .eq("id", alvo.id)
            .eq("user_id", user.id);
          if (error) {
            console.error(error);
            window.alert("Não foi possível excluir o lançamento.");
            return;
          }
          setLancamentos((prev) => prev.filter((x) => x.id !== alvo.id));
          setLancamentoEmEdicao((cur) => (cur?.id === alvo.id ? null : cur));
          window.alert("Lançamento excluído");
          setExcluirEscopoRecorrencia(null);
          return;
        }

        const { error } = await supabase
          .from("lancamentos")
          .delete()
          .eq("user_id", user.id)
          .eq("recorrencia_id", rid)
          .gte("data", alvo.dataISO);
        if (error) {
          console.error(error);
          window.alert("Não foi possível excluir os lançamentos.");
          return;
        }

        const hojeISO = formatISODateLocal(new Date());
        const { count, error: countErr } = await supabase
          .from("lancamentos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("recorrencia_id", rid)
          .gte("data", hojeISO);
        if (!countErr && (count ?? 0) === 0) {
          const { error: recErr } = await supabase
            .from("recorrencias")
            .update({ status: "cancelada" })
            .eq("id", rid)
            .eq("user_id", user.id);
          if (recErr) {
            console.error("Não foi possível marcar recorrência como cancelada:", recErr);
          }
        }

        await handleRefreshAfterEdit();
        setLancamentoEmEdicao(null);
        window.alert("Série de lançamentos excluída com sucesso");
        setExcluirEscopoRecorrencia(null);
      } catch (err) {
        console.error("Erro ao excluir lançamentos:", err);
        window.alert("Erro ao excluir. Tente novamente.");
      } finally {
        exclusaoRecorrenteLockRef.current = false;
        setExcluirEscopoLoading(false);
      }
    },
    [excluirEscopoRecorrencia, handleRefreshAfterEdit],
  );

  const tagsDisponiveis = useMemo(() => {
    const flat = lancamentosDoUsuario.flatMap((l) => coalesceTagsExtrasFromUnknown(l.tags_extras));
    return sanitizeTagsExtrasList(flat);
  }, [lancamentosDoUsuario]);

  const lancamentosNoPeriodo = useMemo(() => {
    const base = lancamentosDoUsuario;
    if (periodoSelecionado === "personalizado") {
      const min = dataInicio.trim() !== "" ? dataInicio.trim().slice(0, 10) : null;
      const max = dataFim.trim() !== "" ? dataFim.trim().slice(0, 10) : null;
      if (min !== null && max !== null && min > max) {
        return base.filter((l) => isoNoIntervalo(l.dataISO, max, min));
      }
      return base.filter((l) => isoNoIntervalo(l.dataISO, min, max));
    }
    const min = primeiraDataInclusivePreset(periodoSelecionado);
    const max = ultimaDataInclusivePreset(periodoSelecionado);
    if (min === null && max === null) return base;
    return base.filter((l) => isoNoIntervalo(l.dataISO, min, max));
  }, [lancamentosDoUsuario, periodoSelecionado, dataInicio, dataFim]);

  const lancamentosFiltrados = useMemo(() => {
    let list = lancamentosNoPeriodo;
    const q = busca.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter((l) => l.descricao.toLowerCase().includes(q));
    }
    if (categoriasSelecionadas.length > 0) {
      list = list.filter((l) => {
        const t = l.tag != null && String(l.tag).trim() ? String(l.tag).trim() : "";
        return categoriasSelecionadas.includes(t);
      });
    }
    if (tagsSelecionadas.length > 0) {
      const setSel = new Set(tagsSelecionadas);
      list = list.filter((l) =>
        coalesceTagsExtrasFromUnknown(l.tags_extras).some((t) => setSel.has(t)),
      );
    }
    if (cartoesSelecionados.length > 0) {
      const setCart = new Set(cartoesSelecionados.map((x) => x.trim()));
      list = list.filter((l) => setCart.has(String(l.meioPagamento ?? "").trim()));
    }
    if (meiosPagamentoSelecionados.length > 0) {
      const setMeios = new Set(meiosPagamentoSelecionados.map((m) => comparableMeioPagamento(m)));
      list = list.filter((l) => {
        const tipo = typeof l.meioPagamentoTipo === "string" ? l.meioPagamentoTipo : "";
        return tipo.length > 0 && setMeios.has(comparableMeioPagamento(tipo));
      });
    }
    return list;
  }, [
    lancamentosNoPeriodo,
    busca,
    categoriasSelecionadas,
    tagsSelecionadas,
    cartoesSelecionados,
    meiosPagamentoSelecionados,
  ]);

  const handleExportCSV = useCallback(() => {
    if (lancamentosFiltrados.length === 0) return;
    const header = ["Data", "Descrição", "Valor", "Tipo", "Categoria", "Cartão/Conta"].join(
      CSV_SEP_EXTRATO,
    );
    const linhas = lancamentosFiltrados.map((l) => {
      const categoria = l.tag != null && String(l.tag).trim() ? String(l.tag).trim() : l.categoriaNome;
      const partes = [
        csvEscaparExtrato(formatDdMmYyyy(l.dataISO)),
        csvEscaparExtrato(l.descricao),
        csvEscaparExtrato(
          Number.isFinite(l.valor) ? l.valor.toFixed(2).replace(".", ",") : String(l.valor),
        ),
        csvEscaparExtrato(l.tipo),
        csvEscaparExtrato(categoria),
        csvEscaparExtrato(String(l.meioPagamento ?? "").trim()),
      ];
      return partes.join(CSV_SEP_EXTRATO);
    });
    const conteudo = `﻿${header}\r\n${linhas.join("\r\n")}`;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "finflow_extrato.csv";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [lancamentosFiltrados]);

  /** Transferências não entram em entradas nem saídas. */
  const totaisFiltrados = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentosFiltrados) {
      if (l.tipo === "receita") entradas += l.valor;
      else if (l.tipo === "despesa") saidas += l.valor;
    }
    return { entradas, saidas };
  }, [lancamentosFiltrados]);

  const gruposPorData = useMemo(() => {
    const map = new Map<string, LancamentoExtrato[]>();
    for (const l of lancamentosFiltrados) {
      const arr = map.get(l.dataISO) ?? [];
      arr.push(l);
      map.set(l.dataISO, arr);
    }
    const chaves = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return chaves.map((dataISO) => ({
      dataISO,
      titulo: tituloGrupoData(dataISO),
      itens: map.get(dataISO)!,
    }));
  }, [lancamentosFiltrados]);

  const periodoForaDoPadrao =
    periodoSelecionado !== PERIODO_PADRAO_EXTRATO || filtrosAplicados.periodo;

  const isFiltroAtivo =
    busca.trim() !== "" ||
    categoriasSelecionadas.length > 0 ||
    periodoForaDoPadrao ||
    tagsSelecionadas.length > 0 ||
    cartoesSelecionados.length > 0 ||
    meiosPagamentoSelecionados.length > 0;

  const textoChipLista = (lista: string[], label: string, plural: string) =>
    lista.length === 0 ? label : lista.length === 1 ? (lista[0] ?? label) : `${lista.length} ${plural}`;

  const textoChipCartao =
    cartoesSelecionados.length === 1
      ? (cartoesSelecionados[0]?.replace(/^Cartão\s+/i, "") ?? "Cartão")
      : textoChipLista(cartoesSelecionados, "Cartão", "cartões");

  const textoChipMeio =
    meiosPagamentoSelecionados.length === 1
      ? (LABELS_MEIO_PAGAMENTO_EXTRATO.find(
          (lbl) =>
            comparableMeioPagamento(lbl) ===
            comparableMeioPagamento(meiosPagamentoSelecionados[0] ?? ""),
        ) ??
        meiosPagamentoSelecionados[0] ??
        "Meio")
      : textoChipLista(meiosPagamentoSelecionados, "Meio de pagamento", "meios");

  const qtd = lancamentosFiltrados.length;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold text-texto">Extrato</h1>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={qtd === 0}
          aria-label="Exportar lançamentos filtrados como CSV"
          title="Exportar CSV"
          className="vidro flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-texto-2 transition hover:text-texto disabled:opacity-40"
        >
          <Download className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </header>

      {/* Busca e filtros: ficam presos no topo ao rolar a lista. */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 bg-fundo/75 px-4 pb-2 pt-1 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-[max(1rem,env(safe-area-inset-top))] before:bg-fundo/75 before:backdrop-blur-xl lg:-mx-1 lg:px-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
            aria-hidden
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lançamentos"
            aria-label="Buscar lançamentos"
            enterKeyHint="search"
            className={`${campoClasse} h-10 rounded-xl pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden`}
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full text-texto-3 hover:text-texto"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div
          className="-mx-4 overflow-x-auto px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:-mx-1 lg:px-1 [&::-webkit-scrollbar]:hidden"
          role="toolbar"
          aria-label="Filtros do extrato"
        >
          <div className="flex w-max items-center gap-1.5">
            <ChipFiltro
              icone={Calendar}
              ativo={periodoForaDoPadrao}
              aberto={filtroAberto === "periodo"}
              onClick={() => setFiltroAberto("periodo")}
              rotuloAcessivel={`Período: ${labelPresetPeriodo(periodoSelecionado)}`}
            >
              {labelChipPeriodo(periodoSelecionado, dataInicio, dataFim)}
            </ChipFiltro>
            <ChipFiltro
              icone={LayoutGrid}
              ativo={categoriasSelecionadas.length > 0}
              aberto={filtroAberto === "categorias"}
              onClick={() => setFiltroAberto("categorias")}
              rotuloAcessivel={
                categoriasSelecionadas.length > 0
                  ? `Categorias selecionadas: ${categoriasSelecionadas.join(", ")}`
                  : "Filtrar por categorias"
              }
            >
              {textoChipLista(categoriasSelecionadas, "Categorias", "categorias")}
            </ChipFiltro>
            <ChipFiltro
              icone={Wallet}
              ativo={meiosPagamentoSelecionados.length > 0}
              aberto={filtroAberto === "meio"}
              onClick={() => setFiltroAberto("meio")}
              rotuloAcessivel={
                meiosPagamentoSelecionados.length > 0
                  ? `Meios de pagamento: ${meiosPagamentoSelecionados.join(", ")}`
                  : "Filtrar por meio de pagamento"
              }
            >
              {textoChipMeio}
            </ChipFiltro>
            <ChipFiltro
              icone={CreditCard}
              ativo={cartoesSelecionados.length > 0}
              aberto={filtroAberto === "cartao"}
              onClick={() => setFiltroAberto("cartao")}
              rotuloAcessivel={
                cartoesSelecionados.length > 0
                  ? `Cartões selecionados: ${cartoesSelecionados.join(", ")}`
                  : "Filtrar por cartão"
              }
            >
              {textoChipCartao}
            </ChipFiltro>
            <ChipFiltro
              icone={Tag}
              ativo={tagsSelecionadas.length > 0}
              aberto={filtroAberto === "tags"}
              onClick={() => setFiltroAberto("tags")}
              rotuloAcessivel={
                tagsSelecionadas.length > 0
                  ? `Tags selecionadas: ${tagsSelecionadas.join(", ")}`
                  : "Filtrar por tags"
              }
            >
              {textoChipLista(tagsSelecionadas, "Tags", "tags")}
            </ChipFiltro>
            {isFiltroAtivo ? (
              <button
                type="button"
                onClick={handleLimparFiltros}
                className="relative inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full px-2.5 text-xs font-medium text-texto-2 transition after:absolute after:-inset-y-1 after:inset-x-0 hover:text-texto"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Limpar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Resumo do conjunto filtrado */}
      <section aria-label="Resumo filtrado" className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2">
          <Card className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowDownLeft className="h-3.5 w-3.5 text-positivo" aria-hidden /> Entradas
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-positivo">
              {carregando ? "…" : <Valor valor={totaisFiltrados.entradas} />}
            </p>
          </Card>
          <Card className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-xs text-texto-3">
              <ArrowUpRight className="h-3.5 w-3.5 text-negativo" aria-hidden /> Saídas
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-negativo">
              {carregando ? "…" : <Valor valor={totaisFiltrados.saidas} />}
            </p>
          </Card>
        </div>
        {!carregando ? (
          <p className="px-0.5 text-[11px] text-texto-3">
            {labelChipPeriodo(periodoSelecionado, dataInicio, dataFim)} · {qtd}{" "}
            {qtd === 1 ? "lançamento" : "lançamentos"}
          </p>
        ) : null}
      </section>

      {carregando ? (
        <div aria-busy="true" aria-label="Carregando extrato">
          <div className="mb-1 h-3 w-16 animate-pulse rounded bg-superficie-2" />
          <Card className="divide-y divide-borda px-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`sk-${String(i)}`} className="flex items-center gap-3 py-2.5">
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-superficie-2" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3 w-2/3 max-w-[12rem] animate-pulse rounded bg-superficie-2" />
                  <span className="block h-2.5 w-24 animate-pulse rounded bg-superficie-2" />
                </span>
                <span className="h-3 w-16 shrink-0 animate-pulse rounded bg-superficie-2" />
              </div>
            ))}
          </Card>
        </div>
      ) : gruposPorData.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <SearchX className="h-7 w-7 text-texto-3" aria-hidden />
          <p className="mt-2 text-sm text-texto">
            {lancamentosDoUsuario.length === 0
              ? "Nenhum lançamento ainda"
              : lancamentosNoPeriodo.length === 0
                ? "Nada neste período"
                : "Nada encontrado"}
          </p>
          <p className="mt-0.5 text-xs text-texto-3">
            {lancamentosDoUsuario.length === 0
              ? "Seus lançamentos aparecem aqui."
              : lancamentosNoPeriodo.length === 0
                ? `Nenhum lançamento em: ${labelPresetPeriodo(periodoSelecionado)}.`
                : "Nenhum lançamento para estes filtros."}
          </p>
          {isFiltroAtivo ? (
            <Botao tamanho="sm" variante="fantasma" className="mt-2 text-marca" onClick={handleLimparFiltros}>
              Limpar filtros
            </Botao>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          {gruposPorData.map((grupo) => (
            <section key={grupo.dataISO} aria-labelledby={`grp-${grupo.dataISO}`}>
              <h2 id={`grp-${grupo.dataISO}`} className="mb-1 px-0.5 text-xs font-medium text-texto-3">
                {grupo.titulo}
              </h2>
              <Card className="px-3">
                <ul className="divide-y divide-borda">
                  {grupo.itens.map((item) => (
                    <li key={item.id}>
                      <LinhaExtrato item={item} onSelect={setLancamentoEmEdicao} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      {/* Folhas de filtro */}
      {isClient && filtroAberto === "periodo" ? (
        <ExtratoFolha
          titulo="Período"
          tituloId="extrato-filtro-titulo"
          rotuloFundo="Fechar filtro"
          onClose={fecharFiltro}
          rodape={
            <Botao
              variante="primario"
              className="w-full"
              onClick={aplicarPeriodo}
              disabled={aplicarPersonalizadoIncomplete}
            >
              Aplicar
            </Botao>
          }
        >
          <Card className="divide-y divide-borda" role="radiogroup" aria-labelledby="extrato-filtro-titulo">
            {OPCOES_PERIODO.map((op) => (
              <OpcaoFiltro
                key={op.id}
                papel="radio"
                selecionada={periodoSelecionado === op.id}
                onClick={() => setPeriodoSelecionado(op.id)}
              >
                {op.label}
              </OpcaoFiltro>
            ))}
          </Card>
          {periodoSelecionado === "personalizado" ? (
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Intervalo de datas personalizado">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-texto-2">
                De
                <input
                  id="extrato-periodo-de"
                  type="date"
                  value={dataInicio}
                  max={dataFim.trim() !== "" ? dataFim.trim().slice(0, 10) : undefined}
                  onChange={(e) => handleDataPersonalizadoInicioChange(e.target.value)}
                  className={campoClasse}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-texto-2">
                Até
                <input
                  id="extrato-periodo-ate"
                  type="date"
                  value={dataFim}
                  min={dataInicio.trim() !== "" ? dataInicio.trim().slice(0, 10) : undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                  className={campoClasse}
                />
              </label>
            </div>
          ) : null}
        </ExtratoFolha>
      ) : null}

      {isClient && filtroAberto === "categorias" ? (
        <ExtratoFolha
          titulo="Categorias"
          tituloId="extrato-categoria-filtro-titulo"
          rotuloFundo="Fechar filtro de categorias"
          onClose={fecharFiltro}
          acaoTopo={
            categoriasSelecionadas.length > 0 ? (
              <BotaoLimparFolha onClick={() => setCategoriasSelecionadas([])} />
            ) : undefined
          }
          rodape={
            <Botao variante="primario" className="w-full" onClick={fecharFiltro}>
              Aplicar
            </Botao>
          }
        >
          <div
            className="flex flex-wrap gap-2"
            role="listbox"
            aria-multiselectable
            aria-labelledby="extrato-categoria-filtro-titulo"
          >
            <PilulaOpcao
              selecionada={categoriasSelecionadas.length === 0}
              onClick={() => setCategoriasSelecionadas([])}
            >
              Todas
            </PilulaOpcao>
            {categoriasSalvas.map((nome) => (
              <PilulaOpcao
                key={nome}
                selecionada={categoriasSelecionadas.includes(nome)}
                onClick={() => toggleCategoriaListaSelecionada(nome)}
              >
                {nome}
              </PilulaOpcao>
            ))}
          </div>
        </ExtratoFolha>
      ) : null}

      {isClient && filtroAberto === "tags" ? (
        <ExtratoFolha
          titulo="Tags"
          tituloId="extrato-tags-filtro-titulo"
          rotuloFundo="Fechar filtro de tags"
          onClose={fecharFiltro}
          acaoTopo={
            tagsSelecionadas.length > 0 ? (
              <BotaoLimparFolha onClick={() => setTagsSelecionadas([])} />
            ) : undefined
          }
          rodape={
            <Botao variante="primario" className="w-full" onClick={fecharFiltro}>
              Aplicar
            </Botao>
          }
        >
          {tagsDisponiveis.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-3">
              Nenhuma tag nos lançamentos carregados.
            </p>
          ) : (
            <div
              className="flex flex-wrap gap-2"
              role="listbox"
              aria-labelledby="extrato-tags-filtro-titulo"
              aria-multiselectable
            >
              {tagsDisponiveis.map((tag) => (
                <PilulaOpcao
                  key={tag}
                  selecionada={tagsSelecionadas.includes(tag)}
                  onClick={() => toggleTagSelecionada(tag)}
                >
                  #{tag}
                </PilulaOpcao>
              ))}
            </div>
          )}
        </ExtratoFolha>
      ) : null}

      {isClient && filtroAberto === "cartao" ? (
        <ExtratoFolha
          titulo="Cartões"
          subtitulo="Selecione um ou mais cartões"
          tituloId="extrato-cartoes-filtro-titulo"
          rotuloFundo="Fechar filtro de cartões"
          onClose={fecharFiltro}
          acaoTopo={
            cartoesSelecionados.length > 0 ? (
              <BotaoLimparFolha onClick={() => setCartoesSelecionados([])} />
            ) : undefined
          }
          rodape={
            <Botao variante="primario" className="w-full" onClick={fecharFiltro}>
              Aplicar
            </Botao>
          }
        >
          {cartoesUsuario.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-3">Nenhum cartão cadastrado.</p>
          ) : (
            <Card
              className="divide-y divide-borda"
              role="listbox"
              aria-labelledby="extrato-cartoes-filtro-titulo"
              aria-multiselectable
            >
              {cartoesUsuario.map((c) => {
                const bancoInst = getBancoById((c.banco ?? "").trim());
                const contaDbLabel = labelContaCartaoPersistido(c.nome);
                const apelido = c.nome.trim();
                const bancoIconId = (c.banco ?? "").trim() || "outros";
                return (
                  <OpcaoFiltro
                    key={c.id}
                    selecionada={cartoesSelecionados.includes(contaDbLabel)}
                    onClick={() => toggleCartaoSelecionado(contaDbLabel)}
                    icone={<MiniLogoBanco bancoId={bancoIconId} className="h-8 w-8" />}
                    detalhe={apelido ? bancoInst.nome : undefined}
                  >
                    {apelido || bancoInst.nome}
                  </OpcaoFiltro>
                );
              })}
            </Card>
          )}
        </ExtratoFolha>
      ) : null}

      {isClient && filtroAberto === "meio" ? (
        <ExtratoFolha
          titulo="Meio de pagamento"
          tituloId="extrato-meios-pagamento-filtro-titulo"
          rotuloFundo="Fechar filtro de meio de pagamento"
          onClose={fecharFiltro}
          acaoTopo={
            meiosPagamentoSelecionados.length > 0 ? (
              <BotaoLimparFolha onClick={() => setMeiosPagamentoSelecionados([])} />
            ) : undefined
          }
          rodape={
            <Botao variante="primario" className="w-full" onClick={fecharFiltro}>
              Aplicar
            </Botao>
          }
        >
          <div
            className="flex flex-wrap gap-2"
            role="listbox"
            aria-multiselectable
            aria-labelledby="extrato-meios-pagamento-filtro-titulo"
          >
            {LABELS_MEIO_PAGAMENTO_EXTRATO.map((meio) => (
              <PilulaOpcao
                key={meio}
                selecionada={meiosPagamentoSelecionados.some(
                  (m) => comparableMeioPagamento(m) === comparableMeioPagamento(meio),
                )}
                onClick={() => toggleMeioPagamentoSeleccionado(meio)}
              >
                {meio}
              </PilulaOpcao>
            ))}
          </div>
        </ExtratoFolha>
      ) : null}

      {isClient && lancamentoEmEdicao ? (
        <ExtratoEditarLancamentoModal
          key={lancamentoEmEdicao.id}
          item={lancamentoEmEdicao}
          cartoesUsuario={cartoesUsuario}
          categoriasSalvas={categoriasSalvas}
          onClose={fecharModalEdicaoExtrato}
          onSaved={aplicarItemEditadoNoExtrato}
          onRefreshList={handleRefreshAfterEdit}
          onDelete={handleDelete}
          pausado={excluirEscopoRecorrencia !== null}
        />
      ) : null}

      {isClient && excluirEscopoRecorrencia !== null ? (
        <ExtratoFolha
          titulo="Excluir recorrência"
          tituloId="extrato-del-rec-titulo"
          rotuloFundo="Fechar exclusão em série"
          camada="z-[130]"
          fecharDesabilitado={excluirEscopoLoading}
          onClose={() => setExcluirEscopoRecorrencia(null)}
          rodape={
            <div className="flex flex-col gap-2">
              <Botao
                className="w-full !text-negativo"
                disabled={excluirEscopoLoading}
                onClick={() => void aplicarExclusaoRecorrente("single")}
              >
                {excluirEscopoLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {excluirEscopoLoading ? "Processando…" : "Somente este"}
              </Botao>
              <Botao
                className="w-full !text-negativo"
                disabled={excluirEscopoLoading}
                onClick={() => void aplicarExclusaoRecorrente("series")}
              >
                {excluirEscopoLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {excluirEscopoLoading ? "Processando…" : "Este e os próximos"}
              </Botao>
              <Botao
                variante="fantasma"
                className="w-full"
                disabled={excluirEscopoLoading}
                onClick={() => setExcluirEscopoRecorrencia(null)}
              >
                Cancelar
              </Botao>
            </div>
          }
        >
          <p className="text-sm leading-relaxed text-texto-2">
            <span className="text-texto">{excluirEscopoRecorrencia.descricao}</span> faz parte de
            uma série recorrente. Excluir somente esta data ou esta e todas as próximas a partir
            de {formatDdMmYyyy(excluirEscopoRecorrencia.dataISO)}?
          </p>
        </ExtratoFolha>
      ) : null}
    </div>
  );
}
