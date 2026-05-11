"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@/types/finflow";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Hash,
  Landmark,
  LayoutGrid,
  PenLine,
  Receipt,
  Repeat,
  Store,
  Wallet,
} from "lucide-react";
import { TagsExtrasField } from "@/components/form/TagsExtrasField";
import { GlassPanel } from "@/components/ui/glass-panel";
import { mergeCategoriasPadraoComBanco } from "@/lib/categorias-padrao";
import { fetchDistinctTagsForUser } from "@/lib/categorias-tags";
import { fetchDistinctTagsExtrasHistoricoForUser } from "@/lib/tags-extras-historico";
import {
  MAX_AMOUNT_DIGITS_LANCAMENTO,
  formatMaskedValorDisplay,
  parseAmountDigitsToReais,
} from "@/lib/currency-input-mask";
import { formatBRL } from "@/lib/format-currency";
import {
  mergePendingTagInputIntoSeleccionadas,
  tagsExtrasPayloadForDb,
} from "@/lib/tags-extras-coalesce";
import { paymentMethodParaColunaMeio } from "@/lib/meio-pagamento-extrato";
import { supabase } from "@/lib/supabase";
import {
  CONTA_CORRENTE_LABEL,
  type CartaoUsuarioOrigem,
  contaCartaoParaColunaDb,
  valorSelectCartaoId,
} from "@/lib/conta-cartao-lancamento";

type TipoLancamento = "despesa" | "receita";

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
  { id: "pix", label: "PIX" },
  { id: "dinheiro", label: "Dinheiro" },
];

const DATALIST_CATEGORIAS_LANCAR_ID = "lista-categorias-lancar";

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoToLocalNoon(iso: string): Date {
  const parts = iso.split("-").map((v) => Number.parseInt(v, 10));
  const [y, m, d] = parts;
  if (
    parts.length !== 3 ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    return new Date(NaN);
  }
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function formatLocalDateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Incrementa meses no calendário local; corrige dias inexistentes (ex.: 31 → fev). */
function addMonthsToIsoLocal(iso: string, monthsToAdd: number): string {
  const base = parseIsoToLocalNoon(iso);
  if (Number.isNaN(base.getTime())) return iso;
  const dayOrig = base.getDate();
  const next = new Date(base.getTime());
  next.setMonth(next.getMonth() + monthsToAdd);
  if (next.getDate() !== dayOrig) {
    next.setDate(0);
  }
  return formatLocalDateToIso(next);
}

/** Divide valor total em reais em N parcelas com soma exata em centavos. */
function splitTotalReaisEmParcelas(totalReais: number, n: number): number[] {
  if (n <= 0) return [];
  const totalCents = Math.round(totalReais * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const valores: number[] = [];
  for (let i = 0; i < n; i++) {
    const cents = base + (i < remainder ? 1 : 0);
    valores.push(cents / 100);
  }
  return valores;
}

type LancamentoInsertRow = {
  user_id: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  data: string;
  tag: string | null;
  conta_cartao: string | null;
  tags_extras: unknown;
  meio_pagamento: string;
  recorrencia_id?: string;
};

function buildLancamentoInsertRow(args: {
  userId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  dataIso: string;
  tag: string | null;
  contaCartao: string | null;
  tagsExtras: unknown;
  meioPagamento: string;
  recorrenciaId?: string;
}): LancamentoInsertRow {
  const row: LancamentoInsertRow = {
    user_id: args.userId,
    descricao: args.descricao,
    valor: args.valor,
    tipo: args.tipo,
    data: args.dataIso,
    tag: args.tag,
    conta_cartao: args.contaCartao,
    tags_extras: args.tagsExtras,
    meio_pagamento: args.meioPagamento,
  };
  if (args.recorrenciaId) {
    row.recorrencia_id = args.recorrenciaId;
  }
  return row;
}

function errorMessageFromSupabase(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  if (error instanceof Error) return error.message;
  return "Erro ao salvar o lançamento.";
}

export function LancarScreen() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoLancamento>("despesa");
  const [categoriasSalvas, setCategoriasSalvas] = useState<string[]>([]);
  /** Apenas dígitos — interpretados como centavos da direita (ex.: "1050" → R$ 10,50). */
  const [amountDigits, setAmountDigits] = useState("");
  const valorInputRef = useRef<HTMLInputElement>(null);
  const [lancamentoRecorrente, setLancamentoRecorrente] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const confirmarLancamentoLockRef = useRef(false);
  const [transactionDate, setTransactionDate] = useState(() => todayIsoLocal());
  const [tituloOuLocal, setTituloOuLocal] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("debito");
  const [category, setCategory] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagsHistorico, setTagsHistorico] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [cartoesUsuario, setCartoesUsuario] = useState<CartaoUsuarioOrigem[]>(
    [],
  );
  const [contaState, setContaState] = useState(CONTA_CORRENTE_LABEL);

  const showCardPicker =
    paymentMethod === "credito" || paymentMethod === "debito";

  useEffect(() => {
    let cancelled = false;
    async function loadCartoesETags() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) return;

      const [categoriasBanco, tagsExtrasHist, cartRes] = await Promise.all([
        fetchDistinctTagsForUser(user.id),
        fetchDistinctTagsExtrasHistoricoForUser(user.id),
        supabase.from("cartoes").select("id, nome, banco").eq("user_id", user.id),
      ]);
      if (cancelled) return;

      setCategoriasSalvas(mergeCategoriasPadraoComBanco(categoriasBanco));
      setTagsHistorico(tagsExtrasHist);

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
    loadCartoesETags();
    return () => {
      cancelled = true;
    };
  }, []);

  const opcoesOrigemContaCartao = useMemo(() => {
    const fixa = [{ value: CONTA_CORRENTE_LABEL, label: CONTA_CORRENTE_LABEL }];
    const dosCartoes = cartoesUsuario.map((c, i) => {
      const apelido = c.nome || `cartão ${i + 1}`;
      const lbl = `Cartão ${apelido}`;
      return { value: valorSelectCartaoId(c.id), label: lbl };
    });
    return [...fixa, ...dosCartoes];
  }, [cartoesUsuario]);

  useEffect(() => {
    if (
      opcoesOrigemContaCartao.some((o) => o.value === contaState)
    ) {
      return;
    }
    setContaState(CONTA_CORRENTE_LABEL);
  }, [opcoesOrigemContaCartao, contaState]);

  const ringFocus =
    tipo === "despesa"
      ? "focus-visible:ring-2 focus-visible:ring-[#EF4444]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
      : "focus-visible:ring-2 focus-visible:ring-[#10B981]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]";

  const accentValue =
    tipo === "despesa" ? "text-[#EF4444]" : "text-[#10B981]";
  const accentMuted =
    tipo === "despesa"
      ? "border-red-500/35 bg-red-500/14 text-red-200"
      : "border-[#10B981]/40 bg-[#10B981]/12 text-emerald-200";

  const inputGlass =
    "rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white outline-none backdrop-blur-sm transition-colors [color-scheme:dark]";

  const parsedAmount = useMemo(
    () => parseAmountDigitsToReais(amountDigits),
    [amountDigits],
  );

  const valorFormatadoInput = formatMaskedValorDisplay(amountDigits);
  const displayValue = formatBRL(parsedAmount);

  useLayoutEffect(() => {
    const el = valorInputRef.current;
    if (!el || document.activeElement !== el) return;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [valorFormatadoInput]);

  const parcelasOpcoes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: `${i + 1}x`,
      })),
    [],
  );

  const opcoesCategoriaDatalist = useMemo(() => {
    const uniq = new Set<string>(categoriasSalvas);
    const catTrim = category.trim();
    if (catTrim) uniq.add(catTrim);
    return [...uniq].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [categoriasSalvas, category]);

  const submitBg =
    tipo === "despesa"
      ? "bg-[#EF4444] shadow-lg shadow-[#EF4444]/25 hover:bg-red-600"
      : "bg-[#10B981] shadow-lg shadow-[#10B981]/25 hover:bg-[#0ea271]";

  function onPaymentPick(id: PaymentMethod) {
    setPaymentMethod(id);
    if (id !== "credito" && id !== "debito") {
      setContaState(CONTA_CORRENTE_LABEL);
    }
    if (id !== "credito") {
      setParcelas(1);
      setLancamentoRecorrente(false);
    }
  }

  function handleValorInputChange(e: ChangeEvent<HTMLInputElement>) {
    const only = e.target.value.replace(/\D/g, "");
    setAmountDigits(only.slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO));
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  function resetLancamentoFields() {
    setAmountDigits("");
    setTituloOuLocal("");
    setTransactionDate(todayIsoLocal());
    setPaymentMethod("debito");
    setContaState(CONTA_CORRENTE_LABEL);
    setParcelas(1);
    setCategory("");
    setTagsSelecionadas([]);
    setTagInput("");
    setDescription("");
    setLancamentoRecorrente(false);
    setTipo("despesa");
  }

  async function handleConfirmarLancamento() {
    if (confirmarLancamentoLockRef.current) return;
    confirmarLancamentoLockRef.current = true;
    setIsLoading(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      if (parsedAmount <= 0) {
        setSubmitError("Informe um valor maior que zero.");
        return;
      }
      if (!tituloOuLocal.trim()) {
        setSubmitError(
          'Preencha a descrição do lançamento (campo "Descrição / Local").',
        );
        return;
      }
      if (tipo === "despesa" && showCardPicker) {
        if (cartoesUsuario.length === 0) {
          setSubmitError(
            "Cadastre ao menos um cartão em Cartões para usar crédito ou débito.",
          );
          return;
        }
        if (
          contaState === CONTA_CORRENTE_LABEL ||
          !/^cartao:/.test(contaState)
        ) {
          setSubmitError(
            "Selecione o cartão na origem do dinheiro (Conta/Cartão).",
          );
          return;
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw userError ?? new Error("Sua sessão expirou. Entre novamente.");
      }

      const categoriaTrim = category.trim();
      const tagParaDb = categoriaTrim ? categoriaTrim : null;
      const arrayFinalDeTags = mergePendingTagInputIntoSeleccionadas(
        tagsSelecionadas,
        tagInput,
      );
      const tagsExtrasDb = tagsExtrasPayloadForDb(arrayFinalDeTags);
      const contaCartaoSalvar =
        tipo === "receita"
          ? CONTA_CORRENTE_LABEL
          : contaCartaoParaColunaDb(
              contaState.trim(),
              cartoesUsuario,
            ).trim() || CONTA_CORRENTE_LABEL;

      const meioPagamentoDb =
        tipo === "receita"
          ? paymentMethodParaColunaMeio("pix")
          : paymentMethodParaColunaMeio(paymentMethod);

      const nParcelas =
        tipo === "despesa" && paymentMethod === "credito"
          ? Math.min(12, Math.max(1, Math.round(parcelas)))
          : 1;

      const isRecorrente =
        lancamentoRecorrente &&
        tipo === "despesa" &&
        paymentMethod === "credito";

      if (isRecorrente) {
        const { data: recCriada, error: recErr } = await supabase
          .from("recorrencias")
          .insert({
            user_id: user.id,
            descricao: tituloOuLocal.trim(),
            valor: parsedAmount,
            tipo,
            data_inicio: transactionDate,
          })
          .select("id")
          .single();

        if (recErr) throw recErr;
        const recIdRaw = (recCriada as { id?: unknown } | null)?.id;
        if (recIdRaw == null || String(recIdRaw).trim() === "") {
          throw new Error("Recorrência criada sem ID.");
        }
        const recId = String(recIdRaw);

        const novosLancamentos: LancamentoInsertRow[] = [];
        for (let i = 0; i < 12; i++) {
          novosLancamentos.push(
            buildLancamentoInsertRow({
              userId: user.id,
              descricao: tituloOuLocal.trim(),
              valor: parsedAmount,
              tipo,
              dataIso: addMonthsToIsoLocal(transactionDate, i),
              tag: tagParaDb,
              contaCartao: contaCartaoSalvar ? contaCartaoSalvar : null,
              tagsExtras: tagsExtrasDb,
              meioPagamento: meioPagamentoDb,
              recorrenciaId: recId,
            }),
          );
        }

        const { error: insErr } = await supabase
          .from("lancamentos")
          .insert(novosLancamentos);

        if (insErr) {
          const { error: delErr } = await supabase
            .from("recorrencias")
            .delete()
            .eq("id", recId);
          if (delErr) console.error("Erro ao reverter recorrência:", delErr);
          throw insErr;
        }
      } else if (nParcelas <= 1) {
        const { error: insErr } = await supabase.from("lancamentos").insert([
          buildLancamentoInsertRow({
            userId: user.id,
            descricao: tituloOuLocal.trim(),
            valor: parsedAmount,
            tipo,
            dataIso: transactionDate,
            tag: tagParaDb,
            contaCartao: contaCartaoSalvar ? contaCartaoSalvar : null,
            tagsExtras: tagsExtrasDb,
            meioPagamento: meioPagamentoDb,
          }),
        ]);
        if (insErr) throw insErr;
      } else {
        const valorPorParcela = splitTotalReaisEmParcelas(
          parsedAmount,
          nParcelas,
        );
        const descBase = tituloOuLocal.trim();
        const lancamentosParcelados: LancamentoInsertRow[] = [];
        for (let i = 0; i < nParcelas; i++) {
          lancamentosParcelados.push(
            buildLancamentoInsertRow({
              userId: user.id,
              descricao: `${descBase} (${i + 1}/${nParcelas})`,
              valor: valorPorParcela[i]!,
              tipo,
              dataIso: addMonthsToIsoLocal(transactionDate, i),
              tag: tagParaDb,
              contaCartao: contaCartaoSalvar ? contaCartaoSalvar : null,
              tagsExtras: tagsExtrasDb,
              meioPagamento: meioPagamentoDb,
            }),
          );
        }
        const { error: insErr } = await supabase
          .from("lancamentos")
          .insert(lancamentosParcelados);
        if (insErr) throw insErr;
      }

      resetLancamentoFields();
      setSubmitSuccess(
        isRecorrente
          ? "Recorrência configurada!"
          : nParcelas > 1
            ? `${nParcelas} parcelas registradas com sucesso.`
            : "Lançamento salvo!",
      );
      window.setTimeout(() => {
        setSubmitSuccess(null);
        router.push("/inicio");
      }, 900);
    } catch (error) {
      console.error("Erro no Supabase:", error);
      setSubmitError(errorMessageFromSupabase(error));
      window.alert("Erro ao salvar o lançamento.");
    } finally {
      confirmarLancamentoLockRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative mb-6 flex h-11 shrink-0 items-center justify-center">
        <Link
          href="/inicio"
          className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Voltar para o início"
        >
          <ArrowLeft className="h-5 w-5 stroke-[2]" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold text-white">
          Novo Lançamento
        </h1>
      </header>

      <div className="mb-6 shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setTipo("despesa")}
            className={`rounded-xl py-3 text-sm font-semibold transition ${
              tipo === "despesa"
                ? "bg-[#EF4444]/22 text-[#FECACA] shadow-inner shadow-black/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Despesa
          </button>
          <button
            type="button"
            onClick={() => setTipo("receita")}
            className={`rounded-xl py-3 text-sm font-semibold transition ${
              tipo === "receita"
                ? "bg-[#10B981]/22 text-emerald-200 shadow-inner shadow-black/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Receita
          </button>
        </div>
      </div>

      <section
        className="mb-8 shrink-0 px-1 text-center"
        aria-labelledby="valor-lbl"
      >
        <label
          id="valor-lbl"
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
          htmlFor="lanc-valor-input"
        >
          Valor
        </label>
        <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          <span
            className={`inline-block text-2xl font-bold tabular-nums leading-none md:text-3xl ${accentValue}`}
            aria-hidden
          >
            R$
          </span>
          <input
            ref={valorInputRef}
            id="lanc-valor-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="valor-previa"
            enterKeyHint="done"
            value={valorFormatadoInput}
            onChange={handleValorInputChange}
            className={`inline-block max-w-[min(100vw-4rem,16rem)] min-w-[8ch] border-none bg-transparent text-center text-5xl font-bold leading-none tracking-tight outline-none caret-white placeholder:text-zinc-700 focus:ring-0 sm:text-6xl md:max-w-[18rem] tabular-nums ${accentValue}`}
          />
        </div>
        <p id="valor-previa" className="sr-only">
          Valor atual: {displayValue}
        </p>
      </section>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-[calc(18.5rem+env(safe-area-inset-bottom))]">
          <GlassPanel className="p-4 transition-all duration-300">
            <div className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                <Calendar className="h-6 w-6" aria-hidden strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="lanc-date"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Data
                </label>
                <input
                  id="lanc-date"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className={`${inputGlass} mt-2 w-full font-semibold placeholder:text-zinc-600 ${ringFocus}`}
                />
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-4 transition-all duration-300">
            <div className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                <Store className="h-6 w-6" aria-hidden strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="lanc-titulo-local"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Descrição / Local
                  <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-[#EF4444]">
                    *
                  </span>
                </label>
                <input
                  id="lanc-titulo-local"
                  type="text"
                  required
                  value={tituloOuLocal}
                  onChange={(e) => {
                    setTituloOuLocal(e.target.value);
                    setSubmitError(null);
                  }}
                  placeholder="Ex: Mercearia do Seu Zé, Uber"
                  autoComplete="off"
                  className={`${inputGlass} mt-2 w-full placeholder:text-zinc-500 ${ringFocus}`}
                />
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="relative z-30 overflow-visible p-4 transition-all duration-300">
            <div className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                <LayoutGrid className="h-6 w-6" aria-hidden strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="lanc-categoria-input"
                  id="lanc-category-lbl"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Categoria
                </label>
                <input
                  id="lanc-categoria-input"
                  list={DATALIST_CATEGORIAS_LANCAR_ID}
                  type="text"
                  aria-labelledby="lanc-category-lbl"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubmitError(null);
                  }}
                  placeholder="Digite ou escolha nas sugestões"
                  autoComplete="off"
                  className={`${inputGlass} mt-2 w-full placeholder:text-zinc-500 ${ringFocus}`}
                />
                <datalist id={DATALIST_CATEGORIAS_LANCAR_ID}>
                  {opcoesCategoriaDatalist.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
          </GlassPanel>

          {tipo === "despesa" ? (
            <>
              <GlassPanel className="p-4 transition-all duration-300">
                <div className="flex gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                    <Wallet className="h-6 w-6" aria-hidden strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Meio de pagamento
                    </p>
                    <div
                      className="-mx-2 mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      role="toolbar"
                      aria-label="Seleção do meio de pagamento"
                    >
                      {PAYMENT_OPTIONS.map((opt) => {
                        const selected = paymentMethod === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                              selected
                                ? `${accentMuted}`
                                : "border-white/15 bg-white/[0.03] text-zinc-300 hover:border-white/25"
                            }`}
                            onClick={() => onPaymentPick(opt.id)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="relative z-[25] overflow-visible p-4 transition-all duration-300">
                <div className="flex gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                    <Landmark className="h-6 w-6" aria-hidden strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="lanc-conta-cartao"
                      className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                    >
                      Conta / Cartão
                      <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-[#EF4444]">
                        *
                      </span>
                    </label>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-600">
                      {showCardPicker
                        ? "Para crédito ou débito, selecione o cartão utilizado."
                        : "PIX e dinheiro saem da conta corrente (ou ajuste se preferir)."}
                    </p>
                    <div className="relative mt-2">
                      <select
                        id="lanc-conta-cartao"
                        value={contaState}
                        onChange={(e) => {
                          setContaState(e.target.value);
                          setSubmitError(null);
                        }}
                        className={`${inputGlass} block w-full min-w-0 cursor-pointer appearance-none bg-[#181818]/90 py-3.5 pr-11 [&>option]:bg-[#171717] [&>option]:text-zinc-100 ${ringFocus}`}
                      >
                        {opcoesOrigemContaCartao.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                        aria-hidden
                      />
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </>
          ) : null}

          {tipo === "despesa" && paymentMethod === "credito" ? (
            <GlassPanel className="relative z-[25] overflow-visible p-4 transition-all duration-300">
              <div className="flex gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                  <Receipt
                    className="h-6 w-6"
                    aria-hidden
                    strokeWidth={1.75}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="lanc-parcelas"
                    className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                  >
                    Parcelas
                  </label>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-600">
                    Divide o valor em vários lançamentos mensais a partir da
                    data acima.
                  </p>
                  <div className="relative mt-2">
                    <select
                      id="lanc-parcelas"
                      value={parcelas}
                      onChange={(e) => {
                        setParcelas(
                          Number.parseInt(e.target.value, 10) || 1,
                        );
                        setSubmitError(null);
                      }}
                      className={`${inputGlass} block w-full min-w-0 cursor-pointer appearance-none bg-[#181818]/90 py-3.5 pr-11 [&>option]:bg-[#171717] [&>option]:text-zinc-100 ${ringFocus}`}
                    >
                      {parcelasOpcoes.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            </GlassPanel>
          ) : null}

          <GlassPanel className="border-[#10B981]/35 bg-[#10B981]/08 p-4 shadow-[0_0_0_1px_rgba(16,185,129,0.12)] backdrop-blur-md transition-all duration-300">
            <div className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#10B981]/30 bg-black/35 text-[#10B981]">
                <Hash className="h-6 w-6" aria-hidden strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <TagsExtrasField
                  variant="lancar"
                  inputId="lanc-tags-extras"
                  label="Tags"
                  description="Use Enter ou vírgula para adicionar. Aparecem no extrato e nos filtros."
                  tagsSelecionadas={tagsSelecionadas}
                  onTagsSelecionadasChange={setTagsSelecionadas}
                  tagInput={tagInput}
                  onTagInputChange={setTagInput}
                  tagsHistorico={tagsHistorico}
                  ringFocus={ringFocus}
                />
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-4 transition-all duration-300">
            <div className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-300">
                <PenLine className="h-6 w-6" aria-hidden strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="lanc-notes"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Observações{" "}
                  <span className="font-normal text-zinc-600">(opcional)</span>
                </label>
                <textarea
                  id="lanc-notes"
                  placeholder="Anotações adicionais sobre o lançamento"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputGlass} mt-2 min-h-[5.5rem] w-full resize-none leading-relaxed placeholder:text-zinc-600 ${ringFocus}`}
                />
              </div>
            </div>
          </GlassPanel>
        </div>

        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] bg-gradient-to-t from-[#121212] from-40% via-[#121212]/95 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
          <div className="pointer-events-auto mx-auto w-full max-w-[430px] space-y-3">
            {submitSuccess ? (
              <div
                role="status"
                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/12 px-4 py-3 text-sm font-medium leading-snug text-emerald-100 shadow-lg shadow-black/20 backdrop-blur-md"
              >
                {submitSuccess}
              </div>
            ) : null}
            {submitError ? (
              <div
                role="alert"
                className="rounded-2xl border border-red-500/40 bg-red-500/12 px-4 py-3 text-sm font-medium leading-snug text-[#FECACA] shadow-lg shadow-black/20 backdrop-blur-md"
              >
                {submitError}
              </div>
            ) : null}
            {tipo === "despesa" && paymentMethod === "credito" ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5 shadow-inner shadow-black/15 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Repeat
                    className="h-4 w-4 shrink-0 text-zinc-500 opacity-80"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="text-[13px] font-medium leading-snug text-zinc-200">
                    Lançamento fixo / recorrente
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={lancamentoRecorrente}
                  disabled={isLoading}
                  aria-label="Alternar lançamento fixo ou recorrente"
                  onClick={() =>
                    setLancamentoRecorrente((prev) => !prev)
                  }
                  className={`relative inline-flex h-8 w-[3.25rem] shrink-0 rounded-full border border-white/10 shadow-inner transition-colors duration-300 ${
                    lancamentoRecorrente
                      ? tipo === "despesa"
                        ? "bg-[#EF4444]"
                        : "bg-[#10B981]"
                      : "bg-zinc-700"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute left-0.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white shadow-md transition-transform duration-300 ease-out ${
                      lancamentoRecorrente
                        ? "translate-x-[1.375rem]"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void handleConfirmarLancamento()}
              disabled={isLoading}
              className={`flex h-14 w-full items-center justify-center gap-2 rounded-3xl px-6 text-base font-bold text-white transition active:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 ${submitBg}`}
            >
              {isLoading ? (
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
              ) : (
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              )}
              {isLoading ? "Processando…" : "Confirmar Lançamento"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
