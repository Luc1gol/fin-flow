"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  Calendar,
  Car,
  CreditCard,
  Download,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  Repeat,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import type { LancamentoExtrato } from "@/data/extrato-mock";
import { getBancoById, logoIconHorseUrl } from "@/data/bancos";
import { CATEGORIAS_PADRAO, mergeCategoriasPadraoComBanco } from "@/lib/categorias-padrao";
import { fetchDistinctTagsForUser } from "@/lib/categorias-tags";
import { formatBRL } from "@/lib/format-currency";
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
import { GlassPanel } from "@/components/ui/glass-panel";
import { ExtratoEditarLancamentoModal } from "@/components/extrato/ExtratoEditarLancamentoModal";
import {
  type CartaoUsuarioOrigem,
  labelContaCartaoPersistido,
} from "@/lib/conta-cartao-lancamento";
import type { User } from "@supabase/supabase-js";

const CATEGORIA_ICONE: Record<string, LucideIcon> = {
  Alimentação: UtensilsCrossed,
  Transporte: Car,
  Moradia: Home,
  Saúde: Heart,
  Educação: GraduationCap,
  Lazer: Sparkles,
  Salário: Landmark,
  "Trabalho extra": Briefcase,
};

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDdMmYyyy(iso: string): string {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const CSV_SEP_EXTRATO = ";";

function csvEscaparExtrato(valor: string): string {
  if (
    valor.includes(CSV_SEP_EXTRATO) ||
    valor.includes('"') ||
    /\r|\n/.test(valor)
  ) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** yyyy-mm-dd no fuso local. */
function formatISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function primeiraDataInclusivePreset(preset: PeriodoPresetId): string | null {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (preset === "7d") {
    const start = new Date(now.getTime());
    start.setDate(start.getDate() - 6);
    return formatISODateLocal(start);
  }
  if (preset === "mes_atual") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  if (preset === "mes_anterior") {
    return formatISODateLocal(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
    );
  }
  if (preset === "personalizado") return null;
  return null;
}

function ultimaDataInclusivePreset(preset: PeriodoPresetId): string | null {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (preset === "7d") return formatISODateLocal(now);
  if (preset === "mes_atual") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }
  if (preset === "mes_anterior") {
    return formatISODateLocal(new Date(now.getFullYear(), now.getMonth(), 0));
  }
  if (preset === "personalizado") return null;
  return null;
}

function isoNoIntervalo(
  iso: string,
  min: string | null,
  max: string | null,
): boolean {
  const s = iso.slice(0, 10);
  if (min !== null && s < min) return false;
  if (max !== null && s > max) return false;
  return true;
}

function tituloGrupoData(iso: string): string {
  const ref = parseLocalDate(iso);
  ref.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (ref.getTime() === hoje.getTime()) return "Hoje";
  if (ref.getTime() === ontem.getTime()) return "Ontem";
  const raw = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(ref);
  const sep = " de ";
  const idx = raw.lastIndexOf(sep);
  if (idx === -1) return raw;
  const dia = raw.slice(0, idx);
  const mes = raw.slice(idx + sep.length);
  return `${dia} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
}

/** Valores aceitos por `filtroAberto` — alinhados aos chips. */
export type FiltroExtratoId =
  | "periodo"
  | "categorias"
  | "tags"
  | "cartao"
  | "meio";

const FILTER_CHIPS: {
  id: FiltroExtratoId;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "periodo", label: "Período", Icon: Calendar },
  { id: "categorias", label: "Categorias", Icon: LayoutGrid },
  { id: "tags", label: "Tags", Icon: Tag },
  { id: "cartao", label: "Cartão", Icon: CreditCard },
  { id: "meio", label: "Meio de Pagamento", Icon: Wallet },
];

/** Estado persistido ao tocar em “Aplicar Filtro” por tipo de chip. */
export type FiltrosAplicadosState = {
  periodo: boolean;
  categorias: boolean;
  tags: boolean;
  cartoes: boolean;
  meioPagamento: boolean;
};

const FILTROS_APLICADOS_INICIAL: FiltrosAplicadosState = {
  periodo: false,
  categorias: false,
  tags: false,
  cartoes: false,
  meioPagamento: false,
};

/** Mapeia o id do chip / sheet → chave em `filtrosAplicados`. */
const FILTRO_ABERTO_PARA_CHAVE: Record<
  FiltroExtratoId,
  keyof FiltrosAplicadosState
> = {
  periodo: "periodo",
  categorias: "categorias",
  tags: "tags",
  cartao: "cartoes",
  meio: "meioPagamento",
};

function noopSubscribe(): () => void {
  return () => {};
}

/** Recarrega a lista do extrato (refresh pós-edição) sem alterar `isLoading`. */
async function buscarLancamentosExtratoParaUsuario(
  userId: string,
): Promise<LancamentoExtrato[]> {
  const bundle = await supabase
    .from("lancamentos")
    .select("*")
    .eq("user_id", userId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  let data = bundle.data;
  if (bundle.error) {
    const retry = await supabase
      .from("lancamentos")
      .select("*")
      .eq("user_id", userId)
      .order("data", { ascending: false });
    if (retry.error) {
      console.error(bundle.error, retry.error);
      throw retry.error;
    }
    data = retry.data;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map(mapLancamentoRowFromDb);
}

export type PeriodoPresetId = "7d" | "mes_atual" | "mes_anterior" | "personalizado";

export const PERIODO_PADRAO_EXTRATO: PeriodoPresetId = "mes_atual";

const OPCOES_PERIODO: { id: PeriodoPresetId; label: string; iconeCalendario?: boolean }[] =
  [
    { id: "7d", label: "Últimos 7 dias" },
    { id: "mes_atual", label: "Mês atual" },
    { id: "mes_anterior", label: "Mês anterior" },
    { id: "personalizado", label: "Personalizado", iconeCalendario: true },
  ];

function labelPresetPeriodo(id: PeriodoPresetId): string {
  const op = OPCOES_PERIODO.find((x) => x.id === id);
  return op?.label ?? String(id);
}

function classeSelFiltro(ativo: boolean) {
  return ativo
    ? "border-[#10B981]/50 bg-[#10B981]/14 text-emerald-200 ring-1 ring-[#10B981]/35"
    : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.07]";
}

type ExtratoFiltroPainelProps = {
  filtro: FiltroExtratoId;
  periodoSelecionado: PeriodoPresetId;
  onPeriodoChange: (id: PeriodoPresetId) => void;
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
  categoriasSel: Set<string>;
  onToggleCategoria: (nome: string) => void;
};

function ExtratoFiltroPainel({
  filtro,
  periodoSelecionado,
  onPeriodoChange,
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  categoriasSel,
  onToggleCategoria,
}: ExtratoFiltroPainelProps) {
  switch (filtro) {
    case "periodo":
      return (
        <div className="space-y-4">
          <h3
            id="extrato-filtro-titulo"
            className="text-lg font-semibold text-white"
          >
            Filtrar por Período
          </h3>
          <div
            className="space-y-2"
            role="radiogroup"
            aria-labelledby="extrato-filtro-titulo"
          >
            {OPCOES_PERIODO.map((op) => {
              const sel = periodoSelecionado === op.id;
              return (
                <div key={op.id} className="space-y-0">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => onPeriodoChange(op.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 ${classeSelFiltro(sel)}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        sel
                          ? "border-[#10B981] bg-[#10B981]/25"
                          : "border-zinc-500"
                      }`}
                      aria-hidden
                    >
                      {sel ? (
                        <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                      ) : null}
                    </span>
                    <span className="flex-1">{op.label}</span>
                    {op.iconeCalendario ? (
                      <Calendar
                        className="h-4 w-4 shrink-0 opacity-80"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  {op.id === "personalizado" &&
                  periodoSelecionado === "personalizado" ? (
                    <div
                      className="my-4 rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-3 shadow-inner shadow-black/20"
                      role="group"
                      aria-label="Intervalo de datas personalizado"
                    >
                      <div className="flex flex-row gap-4">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor="extrato-periodo-de"
                            className="mb-1 block text-xs text-zinc-400"
                          >
                            De
                          </label>
                          <input
                            id="extrato-periodo-de"
                            type="date"
                            value={dataInicio}
                            max={
                              dataFim.trim() !== ""
                                ? dataFim.trim().slice(0, 10)
                                : undefined
                            }
                            onChange={(e) =>
                              onDataInicioChange(e.target.value)
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white outline-none [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-transparent"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor="extrato-periodo-ate"
                            className="mb-1 block text-xs text-zinc-400"
                          >
                            Até
                          </label>
                          <input
                            id="extrato-periodo-ate"
                            type="date"
                            value={dataFim}
                            min={
                              dataInicio.trim() !== ""
                                ? dataInicio.trim().slice(0, 10)
                                : undefined
                            }
                            onChange={(e) => onDataFimChange(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white outline-none [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      );

    case "categorias":
      return (
        <div className="space-y-4">
          <h3
            id="extrato-filtro-titulo"
            className="text-lg font-semibold text-white"
          >
            Filtrar por Categoria
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIAS_PADRAO.map((nome) => {
              const sel = categoriasSel.has(nome);
              return (
                <button
                  key={nome}
                  type="button"
                  onClick={() => onToggleCategoria(nome)}
                  className={`rounded-xl border px-2.5 py-2.5 text-center text-xs font-semibold leading-tight transition-all duration-200 sm:text-[13px] ${classeSelFiltro(sel)}`}
                >
                  {nome}
                </button>
              );
            })}
          </div>
        </div>
      );

    case "tags":
      return null;

    case "cartao":
      return null;

    case "meio":
      return null;

    default:
      return null;
  }
}

type ExtratoFiltroSheetProps = {
  filtro: FiltroExtratoId;
  onClose: () => void;
  onAplicar: () => void;
  aplicarDisabled?: boolean;
  children: ReactNode;
};

function ExtratoFiltroSheet({
  filtro,
  onClose,
  onAplicar,
  aplicarDisabled = false,
  children,
}: ExtratoFiltroSheetProps) {
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    let idA = 0;
    let idB = 0;
    let cancelled = false;
    idA = requestAnimationFrame(() => {
      if (cancelled) return;
      setEntrada(false);
      idB = requestAnimationFrame(() => {
        if (!cancelled) setEntrada(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(idA);
      cancelAnimationFrame(idB);
    };
  }, [filtro]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          entrada ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fechar filtro"
        onClick={onClose}
      />
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-[1] mx-auto flex max-h-[min(92dvh,640px)] w-full max-w-[430px] flex-col rounded-t-[28px] border border-white/12 bg-[#121212] shadow-[0_-14px_56px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          entrada ? "translate-y-0" : "translate-y-full"
        }`}
        aria-labelledby="extrato-filtro-titulo"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-2 py-2">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:bg-white/[0.09] hover:text-white"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-5">
          {children}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#121212] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={onAplicar}
            disabled={aplicarDisabled}
            className={`w-full rounded-2xl bg-[#10B981] py-4 text-base font-bold text-white shadow-lg shadow-[#10B981]/25 transition hover:bg-[#0ea271] active:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#10B981]`}
          >
            Aplicar Filtro
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtratoCategoriaFiltroSheet({
  onClose,
  onAplicar,
  ariaLabelledBy = "extrato-categoria-filtro-titulo",
  backdropAriaLabel = "Fechar filtro de categorias",
  children,
}: {
  onClose: () => void;
  onAplicar: () => void;
  ariaLabelledBy?: string;
  backdropAriaLabel?: string;
  children: ReactNode;
}) {
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    let idA = 0;
    let idB = 0;
    let cancelled = false;
    idA = requestAnimationFrame(() => {
      if (cancelled) return;
      setEntrada(false);
      idB = requestAnimationFrame(() => {
        if (!cancelled) setEntrada(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(idA);
      cancelAnimationFrame(idB);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[75]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          entrada ? "opacity-100" : "opacity-0"
        }`}
        aria-label={backdropAriaLabel}
        onClick={onClose}
      />
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-[1] mx-auto flex max-h-[min(88dvh,560px)] w-full max-w-[430px] flex-col rounded-t-[28px] border border-white/12 bg-[#121212] shadow-[0_-14px_56px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          entrada ? "translate-y-0" : "translate-y-full"
        }`}
        aria-labelledby={ariaLabelledBy}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-2 py-2">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:bg-white/[0.09] hover:text-white"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#121212] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onAplicar}
            className="w-full rounded-2xl bg-[#10B981] py-4 text-base font-bold text-white shadow-lg shadow-[#10B981]/25 transition hover:bg-[#0ea271] active:opacity-95"
          >
            Aplicar Filtro
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniLogoBanco({ bancoId }: { bancoId: string }) {
  const [erro, setErro] = useState(false);
  const banco = getBancoById(bancoId);
  if (erro) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-800 text-zinc-400">
        <CreditCard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.08]">
      <img
        src={logoIconHorseUrl(banco.domain)}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setErro(true)}
      />
    </div>
  );
}

function CategoriaGlyph({
  nome,
}: {
  nome: string;
}) {
  const Icon = CATEGORIA_ICONE[nome] ?? LayoutGrid;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-zinc-300">
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

type LinhaExtratoProps = {
  item: LancamentoExtrato;
  onDelete: (item: LancamentoExtrato) => void;
  onSelect: (item: LancamentoExtrato) => void;
};

function LinhaExtrato({ item, onDelete, onSelect }: LinhaExtratoProps) {
  const positivo = item.tipo === "receita";
  const valorStr = positivo
    ? `+ ${formatBRL(item.valor)}`
    : `− ${formatBRL(item.valor)}`;
  const ehRecorrente = Boolean(item.recorrencia_id?.trim());

  return (
    <div className="flex items-stretch gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.04] shadow-inner shadow-black/20 backdrop-blur-md transition hover:bg-white/[0.06]">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#10B981]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
      >
        {item.bancoId ? (
          <MiniLogoBanco bancoId={item.bancoId} />
        ) : (
          <CategoriaGlyph nome={item.categoriaNome} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug text-white">
            <span className="min-w-0 truncate">{item.descricao}</span>
            {ehRecorrente ? (
              <span
                className="inline-flex shrink-0"
                title="Lançamento recorrente"
                aria-label="Lançamento recorrente"
              >
                <Repeat
                  className={`h-3.5 w-3.5 ${
                    positivo ? "text-emerald-500/50" : "text-zinc-500"
                  }`}
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-500">
              <time dateTime={item.dataISO}>{formatDdMmYyyy(item.dataISO)}</time>
              <span className="text-zinc-600"> · </span>
              {item.meioPagamentoTipo ? (
                <>
                  {item.meioPagamentoTipo}
                  {item.meioPagamento !== "—" ? (
                    <>
                      <span className="text-zinc-600"> · </span>
                      {item.meioPagamento}
                    </>
                  ) : null}
                </>
              ) : (
                item.meioPagamento
              )}
            </span>
            {item.tag ? (
              <span className="rounded-full border border-[#10B981]/25 bg-[#10B981]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/95">
                {item.tag}
              </span>
            ) : null}
          </div>
        </div>
        <p
          className={`shrink-0 self-center tabular-nums text-sm font-semibold ${
            positivo ? "text-[#10B981]" : "text-[#EF4444]"
          }`}
        >
          {valorStr}
        </p>
      </button>
      <div className="flex shrink-0 flex-col justify-center pr-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(item);
          }}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:text-red-500"
          aria-label="Excluir lançamento"
        >
          <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ExtratoScreen() {
  const [busca, setBusca] = useState("");
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<
    string[]
  >([]);
  const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false);
  const [lancamentos, setLancamentos] = useState<LancamentoExtrato[]>([]);
  const [lancamentoEmEdicao, setLancamentoEmEdicao] =
    useState<LancamentoExtrato | null>(null);
  const [cartoesUsuario, setCartoesUsuario] = useState<CartaoUsuarioOrigem[]>(
    [],
  );
  const [categoriasSalvas, setCategoriasSalvas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAplicadosState>(
    () => ({ ...FILTROS_APLICADOS_INICIAL }),
  );
  const [filtroAberto, setFiltroAberto] = useState<FiltroExtratoId | null>(
    null,
  );
  const [periodoSelecionado, setPeriodoSelecionado] =
    useState<PeriodoPresetId>(PERIODO_PADRAO_EXTRATO);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cartoesSelecionados, setCartoesSelecionados] = useState<string[]>(
    [],
  );
  const [categoriasSel, setCategoriasSel] = useState<Set<string>>(
    () => new Set(),
  );
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isCartoesModalOpen, setIsCartoesModalOpen] = useState(false);
  const [isMeiosPagamentoModalOpen, setIsMeiosPagamentoModalOpen] =
    useState(false);
  const [meiosPagamentoSelecionados, setMeiosPagamentoSelecionados] = useState<
    string[]
  >([]);
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

  const aplicarFiltro = useCallback(() => {
    const aberto = filtroAberto;
    if (aberto === null) return;
    const chave = FILTRO_ABERTO_PARA_CHAVE[aberto];
    setFiltrosAplicados((prev) => ({ ...prev, [chave]: true }));
    setFiltroAberto(null);
  }, [filtroAberto]);

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

  const fecharCategoriaModal = useCallback(() => {
    setIsCategoriaModalOpen(false);
  }, []);

  const aplicarCategoriaModal = useCallback(() => {
    setIsCategoriaModalOpen(false);
  }, []);

  const toggleCartaoSelecionado = useCallback((contaCartaoValor: string) => {
    setCartoesSelecionados((prev) =>
      prev.includes(contaCartaoValor)
        ? prev.filter((x) => x !== contaCartaoValor)
        : [...prev, contaCartaoValor],
    );
  }, []);

  const toggleCategoria = useCallback((nome: string) => {
    setCategoriasSel((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome);
      else n.add(nome);
      return n;
    });
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

  const aplicarPersonalizadoIncomplete = useMemo(
    () =>
      filtroAberto === "periodo" &&
      periodoSelecionado === "personalizado" &&
      (dataInicio.trim() === "" || dataFim.trim() === ""),
    [filtroAberto, periodoSelecionado, dataInicio, dataFim],
  );

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

  const handleDelete = useCallback(
    async (item: LancamentoExtrato) => {
      if (item.recorrencia_id?.trim()) {
        setExcluirEscopoRecorrencia(item);
        return;
      }
      if (
        !window.confirm("Tem certeza que deseja excluir este lançamento?")
      ) {
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
    },
    [],
  );

  useEffect(() => {
    if (
      filtroAberto === null &&
      !isCategoriaModalOpen &&
      !isTagsModalOpen &&
      !isCartoesModalOpen &&
      !isMeiosPagamentoModalOpen &&
      excluirEscopoRecorrencia === null
    )
      return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [
    filtroAberto,
    isCategoriaModalOpen,
    isTagsModalOpen,
    isCartoesModalOpen,
    isMeiosPagamentoModalOpen,
    excluirEscopoRecorrencia,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (excluirEscopoRecorrencia !== null && !excluirEscopoLoading) {
        setExcluirEscopoRecorrencia(null);
        return;
      }
      if (filtroAberto !== null) setFiltroAberto(null);
      if (isCategoriaModalOpen) setIsCategoriaModalOpen(false);
      if (isTagsModalOpen) setIsTagsModalOpen(false);
      if (isCartoesModalOpen) setIsCartoesModalOpen(false);
      if (isMeiosPagamentoModalOpen) setIsMeiosPagamentoModalOpen(false);
    }
    if (
      filtroAberto === null &&
      !isCategoriaModalOpen &&
      !isTagsModalOpen &&
      !isCartoesModalOpen &&
      !isMeiosPagamentoModalOpen &&
      excluirEscopoRecorrencia === null
    )
      return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    filtroAberto,
    isCategoriaModalOpen,
    isTagsModalOpen,
    isCartoesModalOpen,
    isMeiosPagamentoModalOpen,
    excluirEscopoRecorrencia,
    excluirEscopoLoading,
  ]);

  useEffect(() => {
    if (authUser === undefined) return;

    if (authUser === null) {
      setLancamentos([]);
      setIsLoading(false);
      return;
    }

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

  const aplicarItemEditadoNoExtrato = useCallback(
    (updated: LancamentoExtrato) => {
      setLancamentos((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
      setLancamentoEmEdicao(null);
    },
    [],
  );

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
            console.error(
              "Não foi possível marcar recorrência como cancelada:",
              recErr,
            );
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
    const flat = lancamentos.flatMap((l) =>
      coalesceTagsExtrasFromUnknown(l.tags_extras),
    );
    return sanitizeTagsExtrasList(flat);
  }, [lancamentos]);

  const lancamentosNoPeriodo = useMemo(() => {
    if (periodoSelecionado === "personalizado") {
      const min =
        dataInicio.trim() !== ""
          ? dataInicio.trim().slice(0, 10)
          : null;
      const max =
        dataFim.trim() !== ""
          ? dataFim.trim().slice(0, 10)
          : null;
      if (min !== null && max !== null && min > max) {
        return lancamentos.filter((l) =>
          isoNoIntervalo(l.dataISO, max, min),
        );
      }
      return lancamentos.filter((l) => isoNoIntervalo(l.dataISO, min, max));
    }
    const min = primeiraDataInclusivePreset(periodoSelecionado);
    const max = ultimaDataInclusivePreset(periodoSelecionado);
    if (min === null && max === null) return lancamentos;
    return lancamentos.filter((l) => isoNoIntervalo(l.dataISO, min, max));
  }, [lancamentos, periodoSelecionado, dataInicio, dataFim]);

  const lancamentosFiltrados = useMemo(() => {
    let list = lancamentosNoPeriodo;
    const q = busca.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter((l) => l.descricao.toLowerCase().includes(q));
    }
    if (categoriasSelecionadas.length > 0) {
      list = list.filter((l) => {
        const t =
          l.tag != null && String(l.tag).trim()
            ? String(l.tag).trim()
            : "";
        return categoriasSelecionadas.includes(t);
      });
    }
    if (tagsSelecionadas.length > 0) {
      const setSel = new Set(tagsSelecionadas);
      list = list.filter((l) =>
        coalesceTagsExtrasFromUnknown(l.tags_extras).some((t) =>
          setSel.has(t),
        ),
      );
    }
    if (cartoesSelecionados.length > 0) {
      const setCart = new Set(
        cartoesSelecionados.map((x) => x.trim()),
      );
      list = list.filter((l) =>
        setCart.has(String(l.meioPagamento ?? "").trim()),
      );
    }
    if (meiosPagamentoSelecionados.length > 0) {
      const setMeios = new Set(
        meiosPagamentoSelecionados.map((m) => comparableMeioPagamento(m)),
      );
      list = list.filter((l) => {
        const tipo =
          typeof l.meioPagamentoTipo === "string"
            ? l.meioPagamentoTipo
            : "";
        return (
          tipo.length > 0 &&
          setMeios.has(comparableMeioPagamento(tipo))
        );
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
    const header = [
      "Data",
      "Descrição",
      "Valor",
      "Tipo",
      "Categoria",
      "Cartão/Conta",
    ].join(CSV_SEP_EXTRATO);
    const linhas = lancamentosFiltrados.map((l) => {
      const categoria =
        l.tag != null && String(l.tag).trim()
          ? String(l.tag).trim()
          : l.categoriaNome;
      const partes = [
        csvEscaparExtrato(formatDdMmYyyy(l.dataISO)),
        csvEscaparExtrato(l.descricao),
        csvEscaparExtrato(
          Number.isFinite(l.valor)
            ? l.valor.toFixed(2).replace(".", ",")
            : String(l.valor),
        ),
        csvEscaparExtrato(l.tipo),
        csvEscaparExtrato(categoria),
        csvEscaparExtrato(String(l.meioPagamento ?? "").trim()),
      ];
      return partes.join(CSV_SEP_EXTRATO);
    });
    const conteudo = `\ufeff${header}\r\n${linhas.join("\r\n")}`;
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

  const totaisFiltrados = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentosFiltrados) {
      if (l.tipo === "receita") entradas += l.valor;
      else saidas += l.valor;
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

  const isFiltroAtivo =
    busca.trim() !== "" ||
    categoriasSelecionadas.length > 0 ||
    periodoSelecionado !== PERIODO_PADRAO_EXTRATO ||
    filtrosAplicados.periodo ||
    tagsSelecionadas.length > 0 ||
    cartoesSelecionados.length > 0 ||
    meiosPagamentoSelecionados.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
      <div className="shrink-0">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-white">Extrato</h1>
        </header>

        <GlassPanel className="mb-5 p-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lançamentos..."
              className="w-full rounded-[1.15rem] border border-white/10 bg-[#121212] py-3 pl-10 pr-4 text-sm font-medium text-white outline-none ring-1 ring-transparent transition placeholder:text-zinc-500 focus-visible:border-white/15 focus-visible:ring-[#10B981]/35 [color-scheme:dark]"
            />
          </div>
        </GlassPanel>

        <div
          className="-mx-1 mb-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="toolbar"
          aria-label="Filtros do extrato"
        >
        <div className="flex w-max min-w-full items-center gap-2 px-1">
          {FILTER_CHIPS.map(({ id, label, Icon }) => {
            if (id === "categorias") {
              const n = categoriasSelecionadas.length;
              const catAtiva = n > 0;
              const textoChip =
                n === 0
                  ? label
                  : n === 1
                    ? (categoriasSelecionadas[0] ?? label)
                    : `${n} categorias`;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setIsCategoriaModalOpen(true);
                  }}
                  aria-label={
                    catAtiva
                      ? `Categorias selecionadas: ${categoriasSelecionadas.join(", ")}`
                      : "Filtrar por categorias"
                  }
                  aria-haspopup="dialog"
                  aria-expanded={isCategoriaModalOpen}
                  className={`inline-flex max-w-[min(14rem,calc(100vw-8rem))] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    catAtiva
                      ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-500/30 hover:border-emerald-500/60"
                      : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]"
                  }`}
                >
                  <LayoutGrid
                    className="h-4 w-4 shrink-0 opacity-85"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{textoChip}</span>
                </button>
              );
            }

            if (id === "tags") {
              const n = tagsSelecionadas.length;
              const tagsAtivas = n > 0;
              const textoChip =
                n === 0
                  ? label
                  : n === 1
                    ? (tagsSelecionadas[0] ?? label)
                    : `${n} tags`;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIsTagsModalOpen(true)}
                  aria-label={
                    tagsAtivas
                      ? `Tags selecionadas: ${tagsSelecionadas.join(", ")}`
                      : "Filtrar por tags"
                  }
                  aria-haspopup="dialog"
                  aria-expanded={isTagsModalOpen}
                  className={`inline-flex max-w-[min(14rem,calc(100vw-8rem))] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    tagsAtivas
                      ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-500/30 hover:border-emerald-500/60"
                      : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]"
                  }`}
                >
                  <Tag
                    className="h-4 w-4 shrink-0 opacity-85"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{textoChip}</span>
                </button>
              );
            }

            if (id === "cartao") {
              const n = cartoesSelecionados.length;
              const cartaoFiltroAtivo = n > 0;
              const textoChip =
                n === 0
                  ? label
                  : n === 1
                    ? (cartoesSelecionados[0]?.replace(/^Cartão\s+/i, "") ??
                      label)
                    : `${n} cartões`;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIsCartoesModalOpen(true)}
                  aria-label={
                    cartaoFiltroAtivo
                      ? `Cartões selecionados: ${cartoesSelecionados.join(", ")}`
                      : "Filtrar por cartão"
                  }
                  aria-haspopup="dialog"
                  aria-expanded={isCartoesModalOpen}
                  className={`inline-flex max-w-[min(14rem,calc(100vw-8rem))] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    cartaoFiltroAtivo
                      ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-500/30 hover:border-emerald-500/60"
                      : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]"
                  }`}
                >
                  <CreditCard
                    className="h-4 w-4 shrink-0 opacity-85"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{textoChip}</span>
                </button>
              );
            }

            if (id === "meio") {
              const n = meiosPagamentoSelecionados.length;
              const meioFiltroAtivo = n > 0;
              const textoChip =
                n === 0
                  ? label
                  : n === 1
                    ? (LABELS_MEIO_PAGAMENTO_EXTRATO.find(
                        (lbl) =>
                          comparableMeioPagamento(lbl) ===
                          comparableMeioPagamento(
                            meiosPagamentoSelecionados[0] ?? "",
                          ),
                      ) ??
                      meiosPagamentoSelecionados[0] ??
                      label)
                    : `${n} meios`;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIsMeiosPagamentoModalOpen(true)}
                  aria-label={
                    meioFiltroAtivo
                      ? `Meios de pagamento: ${meiosPagamentoSelecionados.join(", ")}`
                      : "Filtrar por meio de pagamento"
                  }
                  aria-haspopup="dialog"
                  aria-expanded={isMeiosPagamentoModalOpen}
                  className={`inline-flex max-w-[min(14rem,calc(100vw-8rem))] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    meioFiltroAtivo
                      ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-500/30 hover:border-emerald-500/60"
                      : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]"
                  }`}
                >
                  <Wallet
                    className="h-4 w-4 shrink-0 opacity-85"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{textoChip}</span>
                </button>
              );
            }

            const ativo = filtroAberto === id;
            const chaveChip = FILTRO_ABERTO_PARA_CHAVE[id];
            const filtroDesteChipAplicado = filtrosAplicados[chaveChip];
            const periodoForaDoPadrao =
              id === "periodo" &&
              (periodoSelecionado !== PERIODO_PADRAO_EXTRATO ||
                filtrosAplicados.periodo);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFiltroAberto(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  ativo
                    ? "border-[#10B981]/40 bg-[#10B981]/14 text-emerald-200 ring-1 ring-[#10B981]/30"
                    : periodoForaDoPadrao
                      ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-500/30 hover:border-emerald-500/60"
                      : filtroDesteChipAplicado
                        ? "border-emerald-500/50 bg-white/[0.06] text-emerald-400 hover:border-emerald-500/60"
                        : "border-white/12 bg-white/[0.05] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]"
                }`}
              >
                <Icon
                  className="h-4 w-4 opacity-85"
                  strokeWidth={2}
                  aria-hidden
                />
                {label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleExportCSV}
            aria-label="Exportar lançamentos filtrados como CSV"
            className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]"
          >
            <Download
              size={16}
              className="mr-2 shrink-0 opacity-85"
              strokeWidth={2}
              aria-hidden
            />
            Exportar CSV
          </button>
        </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pb-32">
        {!isLoading && isFiltroAtivo ? (
          <div className="space-y-2.5 px-1">
            <div
              className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-emerald-500/[0.07] via-white/[0.04] to-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              aria-label="Resumo filtrado"
            >
              <p className="text-xs font-semibold tracking-wide text-zinc-400">
                RESUMO DO PERÍODO
              </p>
              <p className="mt-1 text-[11px] font-medium text-zinc-500">
                {labelPresetPeriodo(periodoSelecionado)}
              </p>
              <div className="mt-3 flex justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-400">Entradas</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
                    + {formatBRL(totaisFiltrados.entradas)}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-xs font-medium text-zinc-400">Saídas</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-red-400">
                    − {formatBRL(totaisFiltrados.saidas)}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLimparFiltros}
              className="w-full cursor-pointer text-center text-sm text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-4 px-1">
            <p className="text-center text-sm text-zinc-500">
              Carregando extrato…
            </p>
            <ul className="space-y-2.5" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={`sk-${String(i)}`}
                  className="flex animate-pulse items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-5"
                >
                  <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-[70%] max-w-[14rem] rounded bg-white/10" />
                    <span className="block h-2.5 w-24 rounded bg-white/[0.06]" />
                  </div>
                  <span className="h-3 w-20 shrink-0 rounded bg-white/10" />
                </li>
              ))}
            </ul>
          </div>
        ) : lancamentos.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum lançamento encontrado neste período.
          </p>
        ) : lancamentosNoPeriodo.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum lançamento no período selecionado (
            {labelPresetPeriodo(periodoSelecionado)}).
          </p>
        ) : gruposPorData.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum lançamento encontrado para estes filtros.
          </p>
        ) : (
          <div className="flex flex-col gap-8 px-1">
            {gruposPorData.map((grupo) => (
              <section key={grupo.dataISO} aria-labelledby={`grp-${grupo.dataISO}`}>
                <h2
                  id={`grp-${grupo.dataISO}`}
                  className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
                >
                  {grupo.titulo}
                </h2>
                <ul className="space-y-2.5">
                  {grupo.itens.map((item) => (
                    <li key={item.id}>
                      <LinhaExtrato
                        item={item}
                        onDelete={handleDelete}
                        onSelect={setLancamentoEmEdicao}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {isClient &&
        filtroAberto !== null &&
        createPortal(
          <ExtratoFiltroSheet
            filtro={filtroAberto}
            onClose={fecharFiltro}
            onAplicar={aplicarFiltro}
            aplicarDisabled={aplicarPersonalizadoIncomplete}
          >
            <ExtratoFiltroPainel
              filtro={filtroAberto}
              periodoSelecionado={periodoSelecionado}
              onPeriodoChange={setPeriodoSelecionado}
              dataInicio={dataInicio}
              dataFim={dataFim}
              onDataInicioChange={handleDataPersonalizadoInicioChange}
              onDataFimChange={setDataFim}
              categoriasSel={categoriasSel}
              onToggleCategoria={toggleCategoria}
            />
          </ExtratoFiltroSheet>,
          document.body,
        )}

      {isClient &&
        isCategoriaModalOpen &&
        createPortal(
          <ExtratoCategoriaFiltroSheet
            onClose={fecharCategoriaModal}
            onAplicar={aplicarCategoriaModal}
          >
            <div className="space-y-4">
              <h3
                id="extrato-categoria-filtro-titulo"
                className="text-lg font-semibold text-white"
              >
                Filtrar por Categoria
              </h3>
              <div
                className="flex flex-wrap gap-2"
                role="listbox"
                aria-multiselectable
                aria-labelledby="extrato-categoria-filtro-titulo"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={categoriasSelecionadas.length === 0}
                  onClick={() => setCategoriasSelecionadas([])}
                  className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${classeSelFiltro(
                    categoriasSelecionadas.length === 0,
                  )}`}
                >
                  Todas as categorias
                </button>
                {categoriasSalvas.map((nome) => {
                  const sel = categoriasSelecionadas.includes(nome);
                  return (
                    <button
                      key={nome}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => toggleCategoriaListaSelecionada(nome)}
                      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${classeSelFiltro(
                        sel,
                      )}`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </ExtratoCategoriaFiltroSheet>,
          document.body,
        )}

      {isClient &&
        isTagsModalOpen &&
        createPortal(
          <ExtratoCategoriaFiltroSheet
            ariaLabelledBy="extrato-tags-filtro-titulo"
            backdropAriaLabel="Fechar filtro de tags"
            onClose={() => setIsTagsModalOpen(false)}
            onAplicar={() => setIsTagsModalOpen(false)}
          >
            <div className="space-y-4">
              <h3
                id="extrato-tags-filtro-titulo"
                className="text-lg font-semibold text-white"
              >
                Filtrar por Tags
              </h3>
              {tagsDisponiveis.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma tag nos lançamentos carregados.
                </p>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  role="listbox"
                  aria-labelledby="extrato-tags-filtro-titulo"
                  aria-multiselectable
                >
                  {tagsDisponiveis.map((tag) => {
                    const sel = tagsSelecionadas.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        role="option"
                        aria-selected={sel}
                        onClick={() => toggleTagSelecionada(tag)}
                        className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${classeSelFiltro(sel)}`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </ExtratoCategoriaFiltroSheet>,
          document.body,
        )}

      {isClient &&
        isCartoesModalOpen &&
        createPortal(
          <ExtratoCategoriaFiltroSheet
            ariaLabelledBy="extrato-cartoes-filtro-titulo"
            backdropAriaLabel="Fechar filtro de cartões"
            onClose={() => setIsCartoesModalOpen(false)}
            onAplicar={() => setIsCartoesModalOpen(false)}
          >
            <div className="space-y-4">
              <h3
                id="extrato-cartoes-filtro-titulo"
                className="text-lg font-semibold text-white"
              >
                Filtrar por Cartão
              </h3>
              <p className="text-[12px] leading-snug text-zinc-500">
                Selecione um ou mais cartões. Toque novamente para remover.
              </p>
              {cartoesUsuario.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhum cartão cadastrado.
                </p>
              ) : (
                <ul
                  className="space-y-2"
                  role="listbox"
                  aria-labelledby="extrato-cartoes-filtro-titulo"
                  aria-multiselectable
                >
                  {cartoesUsuario.map((c) => {
                    const bancoInst = getBancoById((c.banco ?? "").trim());
                    const contaDbLabel = labelContaCartaoPersistido(c.nome);
                    const sel = cartoesSelecionados.includes(contaDbLabel);
                    const apelido = c.nome.trim();
                    const titulo = apelido
                      ? `${bancoInst.nome} — ${apelido}`
                      : bancoInst.nome;
                    const bancoIconId = (c.banco ?? "").trim() || "outros";
                    return (
                      <li key={c.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={sel}
                          onClick={() => toggleCartaoSelecionado(contaDbLabel)}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${classeSelFiltro(sel)}`}
                        >
                          <MiniLogoBanco bancoId={bancoIconId} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {titulo}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-zinc-500">
                              •••• ****
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </ExtratoCategoriaFiltroSheet>,
          document.body,
        )}

      {isClient &&
        isMeiosPagamentoModalOpen &&
        createPortal(
          <ExtratoCategoriaFiltroSheet
            ariaLabelledBy="extrato-meios-pagamento-filtro-titulo"
            backdropAriaLabel="Fechar filtro de meio de pagamento"
            onClose={() => setIsMeiosPagamentoModalOpen(false)}
            onAplicar={() => setIsMeiosPagamentoModalOpen(false)}
          >
            <div className="space-y-4">
              <h3
                id="extrato-meios-pagamento-filtro-titulo"
                className="text-lg font-semibold text-white"
              >
                Filtrar por Meio de Pagamento
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {LABELS_MEIO_PAGAMENTO_EXTRATO.map((meio) => {
                  const sel = meiosPagamentoSelecionados.some(
                    (m) =>
                      comparableMeioPagamento(m) ===
                      comparableMeioPagamento(meio),
                  );
                  return (
                    <button
                      key={meio}
                      type="button"
                      onClick={() =>
                        toggleMeioPagamentoSeleccionado(meio)
                      }
                      className={`rounded-xl border px-3 py-3 text-center text-sm font-semibold transition-all duration-200 ${classeSelFiltro(sel)}`}
                    >
                      {meio}
                    </button>
                  );
                })}
              </div>
            </div>
          </ExtratoCategoriaFiltroSheet>,
          document.body,
        )}

      {isClient && lancamentoEmEdicao ? (
        <ExtratoEditarLancamentoModal
          key={lancamentoEmEdicao.id}
          item={lancamentoEmEdicao}
          cartoesUsuario={cartoesUsuario}
          categoriasSalvas={categoriasSalvas}
          onClose={fecharModalEdicaoExtrato}
          onSaved={aplicarItemEditadoNoExtrato}
          onRefreshList={handleRefreshAfterEdit}
        />
      ) : null}

      {isClient &&
        excluirEscopoRecorrencia !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex flex-col justify-end sm:justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extrato-del-rec-titulo"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              aria-label="Fechar exclusão em série"
              disabled={excluirEscopoLoading}
              onClick={() => {
                if (excluirEscopoLoading) return;
                setExcluirEscopoRecorrencia(null);
              }}
            />
            <div className="relative z-[1] mx-auto mb-0 w-full max-w-[430px] rounded-t-[1.65rem] border border-white/12 bg-[#161616]/98 px-5 py-5 shadow-2xl backdrop-blur-xl sm:mb-auto sm:rounded-3xl">
              <h3
                id="extrato-del-rec-titulo"
                className="text-base font-semibold text-white"
              >
                Excluir recorrência
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Este lançamento faz parte de uma série recorrente. Deseja
                excluir somente esta data ou esta e todas as parcelas a partir
                desta data?
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={excluirEscopoLoading}
                  onClick={() => void aplicarExclusaoRecorrente("single")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#EF4444] py-3.5 text-sm font-bold text-white shadow-inner shadow-black/25 transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {excluirEscopoLoading ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                  {excluirEscopoLoading ? "Processando…" : "Somente este"}
                </button>
                <button
                  type="button"
                  disabled={excluirEscopoLoading}
                  onClick={() => void aplicarExclusaoRecorrente("series")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/35 bg-red-500/10 py-3.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {excluirEscopoLoading ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                  {excluirEscopoLoading ? "Processando…" : "Este e os próximos"}
                </button>
                <button
                  type="button"
                  disabled={excluirEscopoLoading}
                  onClick={() => setExcluirEscopoRecorrencia(null)}
                  className="w-full rounded-2xl border border-white/10 py-3.5 text-sm font-semibold text-zinc-400 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
