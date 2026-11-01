"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@/types/finflow";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  FileUp,
  Loader2,
  Landmark,
  PenLine,
  Receipt,
  Repeat,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { TagsExtrasField } from "@/components/form/TagsExtrasField";
import { Botao, Card, campoClasse } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { carregarCategoriasPorUso } from "@/lib/categorias-tags";
import { SeletorCategoria } from "@/components/ui/SeletorCategoria";
import { fetchDistinctTagsExtrasHistoricoForUser } from "@/lib/tags-extras-historico";
import {
  MAX_AMOUNT_DIGITS_LANCAMENTO,
  formatMaskedValorDisplay,
  parseAmountDigitsToReais,
  reaisToAmountDigits,
} from "@/lib/currency-input-mask";
import {
  dividirAReceberEmParcelas,
  listarPessoasDivididas,
  metadeEmCentavos,
  validarDivisao,
} from "@/lib/dados/divididos";
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

const DATALIST_PESSOAS_LANCAR_ID = "lista-pessoas-dividir-lancar";

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
  observacao: string | null;
  recorrencia_id?: string;
  dividido_com?: string;
  valor_a_receber?: number;
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
  observacao: string | null;
  recorrenciaId?: string;
  divididoCom?: string | null;
  valorAReceber?: number | null;
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
    observacao: args.observacao,
  };
  if (args.recorrenciaId) {
    row.recorrencia_id = args.recorrenciaId;
  }
  if (args.divididoCom && args.valorAReceber != null && args.valorAReceber > 0) {
    row.dividido_com = args.divididoCom;
    row.valor_a_receber = args.valorAReceber;
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
  /** "Dividir com": nome de quem deve parte da despesa. */
  const [divididoCom, setDivididoCom] = useState("");
  /** Dígitos (centavos) de quanto a pessoa deve; null = metade do valor (padrão). */
  const [receberDigits, setReceberDigits] = useState<string | null>(null);
  const [pessoasDivididas, setPessoasDivididas] = useState<string[]>([]);

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
        carregarCategoriasPorUso(),
        fetchDistinctTagsExtrasHistoricoForUser(user.id),
        supabase.from("cartoes").select("id, nome, banco").eq("user_id", user.id),
      ]);
      if (cancelled) return;

      setCategoriasSalvas(categoriasBanco);
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

  useEffect(() => {
    let cancelled = false;
    listarPessoasDivididas()
      .then((nomes) => {
        if (!cancelled) setPessoasDivididas(nomes);
      })
      .catch((e) => console.error(e));
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

  // Se o cartão escolhido sumiu da lista, volta para a conta corrente.
  const contaEfetiva = opcoesOrigemContaCartao.some((o) => o.value === contaState)
    ? contaState
    : CONTA_CORRENTE_LABEL;

  const accentValue = tipo === "despesa" ? "text-negativo" : "text-positivo";

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

  // Mantém as mais usadas no topo; uma categoria recém-criada entra logo no início.
  const opcoesCategoria = useMemo(() => {
    const catTrim = category.trim();
    return catTrim && !categoriasSalvas.includes(catTrim) ? [catTrim, ...categoriasSalvas] : categoriasSalvas;
  }, [categoriasSalvas, category]);

  const isCredito = tipo === "despesa" && paymentMethod === "credito";

  /** Prévia do valor de cada parcela (apenas exibição; o cálculo real ocorre ao salvar). */
  const previaParcela = useMemo(() => {
    if (parcelas <= 1 || parsedAmount <= 0) return null;
    const valores = splitTotalReaisEmParcelas(parsedAmount, parcelas);
    return valores[0] ?? null;
  }, [parcelas, parsedAmount]);

  const receberDigitsEfetivo =
    receberDigits ?? reaisToAmountDigits(metadeEmCentavos(parsedAmount));
  const valorAReceber = parseAmountDigitsToReais(receberDigitsEfetivo);

  const semCartaoParaMeio =
    tipo === "despesa" && showCardPicker && cartoesUsuario.length === 0;

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
    setDivididoCom("");
    setReceberDigits(null);
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
          'Preencha a descrição do lançamento (campo "Descrição").',
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
          contaEfetiva === CONTA_CORRENTE_LABEL ||
          !/^cartao:/.test(contaEfetiva)
        ) {
          setSubmitError(
            "Selecione o cartão na origem do dinheiro (Conta/Cartão).",
          );
          return;
        }
      }

      const divisao =
        tipo === "despesa"
          ? validarDivisao(divididoCom, valorAReceber, parsedAmount)
          : ({ ok: true, divididoCom: null, valorAReceber: null } as const);
      if (!divisao.ok) {
        setSubmitError(divisao.erro);
        return;
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
              contaEfetiva.trim(),
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
              observacao: description.trim() || null,
              recorrenciaId: recId,
              // Recorrente: a pessoa deve a mesma parte todo mês.
              divididoCom: divisao.divididoCom,
              valorAReceber: divisao.valorAReceber,
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
              observacao: description.trim() || null,
            divididoCom: divisao.divididoCom,
            valorAReceber: divisao.valorAReceber,
          }),
        ]);
        if (insErr) throw insErr;
      } else {
        const valorPorParcela = splitTotalReaisEmParcelas(
          parsedAmount,
          nParcelas,
        );
        const descBase = tituloOuLocal.trim();
        // Parcelado: o valor a receber é dividido nas parcelas, como a despesa.
        const receberPorParcela =
          divisao.valorAReceber != null
            ? dividirAReceberEmParcelas(divisao.valorAReceber, nParcelas)
            : [];
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
              observacao: description.trim() || null,
              divididoCom: divisao.divididoCom,
              valorAReceber: receberPorParcela[i] ?? null,
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
    } finally {
      confirmarLancamentoLockRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Link
          href="/inicio"
          aria-label="Voltar para o início"
          className="vidro-suave flex h-9 w-9 touch-manipulation items-center justify-center justify-self-start rounded-full text-texto-2 transition hover:text-texto active:scale-95"
        >
          <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold text-texto">Novo lançamento</h1>
        <Link
          href="/importar"
          className="vidro inline-flex h-8 touch-manipulation items-center gap-1.5 justify-self-end rounded-full px-3 text-xs font-medium text-texto-2 transition hover:text-texto active:scale-95"
        >
          <FileUp className="h-3.5 w-3.5" aria-hidden />
          Importar
        </Link>
      </header>

      <div
        role="radiogroup"
        aria-label="Tipo de lançamento"
        className="vidro mx-auto mt-5 grid w-full max-w-[16rem] shrink-0 grid-cols-2 gap-1 rounded-full p-1"
      >
        {(
          [
            { id: "despesa", label: "Despesa", ativo: "bg-negativo/15 text-negativo ring-negativo/30" },
            { id: "receita", label: "Receita", ativo: "bg-positivo/15 text-positivo ring-positivo/30" },
          ] as const
        ).map((opt) => {
          const selected = tipo === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTipo(opt.id)}
              className={`h-9 touch-manipulation rounded-full text-sm font-semibold transition ${
                selected
                  ? `${opt.ativo} ring-1 ring-inset`
                  : "text-texto-3 hover:text-texto-2"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <section className="shrink-0 py-6 text-center" aria-labelledby="valor-lbl">
        <label
          id="valor-lbl"
          htmlFor="lanc-valor-input"
          className="text-xs font-medium text-texto-3"
        >
          {tipo === "despesa" ? "Valor da despesa" : "Valor da receita"}
        </label>
        <div
          className={`mt-1 flex items-baseline justify-center gap-1.5 ${accentValue}`}
        >
          <span className="text-xl font-semibold leading-none" aria-hidden>
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
            style={{ width: `${Math.max(4, valorFormatadoInput.length) + 0.5}ch` }}
            className={`valor min-w-0 max-w-full border-none bg-transparent p-0 text-left text-[40px] font-semibold leading-none tracking-tight outline-none caret-marca focus:ring-0 ${
              parsedAmount <= 0 ? "opacity-50" : ""
            }`}
          />
        </div>
        <p id="valor-previa" className="sr-only">
          Valor atual: {displayValue}
        </p>
      </section>

      <div className="flex flex-col gap-3 pb-36 lg:pb-4">
        <Card className="divide-y divide-borda">
          <Linha icone={<Store className="h-4 w-4" aria-hidden />} rotulo="Descrição" htmlFor="lanc-titulo-local">
            <input
              id="lanc-titulo-local"
              type="text"
              required
              aria-required="true"
              value={tituloOuLocal}
              onChange={(e) => {
                setTituloOuLocal(e.target.value);
                setSubmitError(null);
              }}
              placeholder="Ex.: Mercado, Uber"
              autoComplete="off"
              enterKeyHint="next"
              className={controleLinha}
            />
          </Linha>

          <Linha
            icone={<IconeCategoria categoria={category} className="h-4 w-4" />}
            rotulo="Categoria"
            htmlFor="lanc-categoria-input"
          >
            <SeletorCategoria
              valor={category}
              onChange={(c) => {
                setCategory(c);
                setSubmitError(null);
              }}
              categorias={opcoesCategoria}
              variante="linha"
            />
          </Linha>

          <Linha icone={<Calendar className="h-4 w-4" aria-hidden />} rotulo="Data" htmlFor="lanc-date">
            <input
              id="lanc-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className={`${controleLinha} [&::-webkit-date-and-time-value]:text-right`}
            />
          </Linha>
        </Card>

        {tipo === "despesa" ? (
          <Card className="divide-y divide-borda">
            <div className="px-3 py-2.5">
              <p id="lanc-meio-lbl" className="flex items-center gap-2 text-xs font-medium text-texto-2">
                <Wallet className="h-3.5 w-3.5 text-texto-3" aria-hidden />
                Meio de pagamento
              </p>
              <div
                role="radiogroup"
                aria-labelledby="lanc-meio-lbl"
                className="mt-2 grid grid-cols-4 gap-1.5"
              >
                {PAYMENT_OPTIONS.map((opt) => {
                  const selected = paymentMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onPaymentPick(opt.id)}
                      className={`h-9 touch-manipulation rounded-lg text-xs font-semibold transition active:scale-[0.97] ${
                        selected
                          ? "vidro text-marca"
                          : "border border-borda-forte text-texto-2 hover:text-texto"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Linha
              icone={<Landmark className="h-4 w-4" aria-hidden />}
              rotulo={showCardPicker ? "Cartão" : "Conta"}
              htmlFor="lanc-conta-cartao"
              obrigatorio={showCardPicker}
              dica={
                semCartaoParaMeio ? (
                  <>
                    Nenhum cartão cadastrado.{" "}
                    <Link href="/cartoes" className="font-medium text-marca">
                      Cadastrar cartão
                    </Link>
                  </>
                ) : showCardPicker && contaEfetiva === CONTA_CORRENTE_LABEL ? (
                  "Selecione o cartão usado na compra."
                ) : null
              }
            >
              <SelectLinha
                id="lanc-conta-cartao"
                value={contaEfetiva}
                onChange={(v) => {
                  setContaState(v);
                  setSubmitError(null);
                }}
                opcoes={opcoesOrigemContaCartao}
              />
            </Linha>

            {isCredito ? (
              <>
                <Linha
                  icone={<Receipt className="h-4 w-4" aria-hidden />}
                  rotulo="Parcelas"
                  htmlFor="lanc-parcelas"
                  dica={
                    previaParcela != null
                      ? `${parcelas}x de ${formatBRL(previaParcela)} · mensais a partir da data`
                      : null
                  }
                >
                  <SelectLinha
                    id="lanc-parcelas"
                    value={String(parcelas)}
                    onChange={(v) => {
                      setParcelas(Number.parseInt(v, 10) || 1);
                      setSubmitError(null);
                    }}
                    opcoes={parcelasOpcoes.map((o) => ({
                      value: String(o.value),
                      label: o.value === 1 ? "À vista" : o.label,
                    }))}
                  />
                </Linha>

                <Linha
                  icone={<Repeat className="h-4 w-4" aria-hidden />}
                  rotulo="Recorrente"
                  htmlFor="lanc-recorrente"
                  dica={lancamentoRecorrente ? "Repete o valor todo mês por 12 meses." : null}
                >
                  <div className="flex flex-1 justify-end">
                    <button
                      id="lanc-recorrente"
                      type="button"
                      role="switch"
                      aria-checked={lancamentoRecorrente}
                      disabled={isLoading}
                      aria-label="Lançamento fixo ou recorrente"
                      onClick={() => setLancamentoRecorrente((prev) => !prev)}
                      className={`relative inline-flex h-7 w-12 shrink-0 touch-manipulation rounded-full transition-colors duration-200 disabled:opacity-40 ${
                        lancamentoRecorrente ? "bg-marca" : "bg-white/[0.12]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                          lancamentoRecorrente ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </Linha>
              </>
            ) : null}
          </Card>
        ) : null}

        {tipo === "despesa" ? (
          <Card className="divide-y divide-borda">
            <Linha
              icone={<Users className="h-4 w-4" aria-hidden />}
              rotulo="Dividir com"
              htmlFor="lanc-dividir-com"
              dica={
                divididoCom.trim()
                  ? null
                  : "Opcional. Quem te deve parte dessa despesa aparece em A receber."
              }
            >
              <input
                id="lanc-dividir-com"
                list={DATALIST_PESSOAS_LANCAR_ID}
                type="text"
                value={divididoCom}
                onChange={(e) => {
                  setDivididoCom(e.target.value);
                  setSubmitError(null);
                }}
                placeholder="Ninguém"
                autoComplete="off"
                className={controleLinha}
              />
              <datalist id={DATALIST_PESSOAS_LANCAR_ID}>
                {pessoasDivididas.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
            </Linha>
            {divididoCom.trim() ? (
              <Linha
                icone={<span className="text-[11px] font-semibold">R$</span>}
                rotulo="Te deve"
                htmlFor="lanc-valor-receber"
                dica={
                  isCredito && lancamentoRecorrente
                    ? "Esse valor fica a receber em cada um dos 12 meses."
                    : isCredito && parcelas > 1 && valorAReceber > 0
                      ? `Dividido nas ${parcelas} parcelas: ${formatBRL(dividirAReceberEmParcelas(valorAReceber, parcelas)[0] ?? 0)} por mês.`
                      : receberDigits == null
                        ? "Metade do valor. Toque para mudar."
                        : null
                }
              >
                <input
                  id="lanc-valor-receber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatMaskedValorDisplay(receberDigitsEfetivo)}
                  onChange={(e) => {
                    const only = e.target.value.replace(/\D/g, "");
                    setReceberDigits(only.slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO));
                    setSubmitError(null);
                  }}
                  className={`${controleLinha} valor`}
                />
              </Linha>
            ) : null}
          </Card>
        ) : null}

        <Card className="p-3">
          <TagsExtrasField
            variant="lancar"
            inputId="lanc-tags-extras"
            label="Tags extras"
            description="Enter ou vírgula para adicionar. Aparecem no extrato e nos filtros."
            tagsSelecionadas={tagsSelecionadas}
            onTagsSelecionadasChange={setTagsSelecionadas}
            tagInput={tagInput}
            onTagInputChange={setTagInput}
            tagsHistorico={tagsHistorico}
            ringFocus=""
          />
        </Card>

        <Card className="p-3">
          <label htmlFor="lanc-notes" className="flex items-center gap-2 text-xs font-medium text-texto-2">
            <PenLine className="h-3.5 w-3.5 text-texto-3" aria-hidden />
            Observações
            <span className="font-normal text-texto-3">(opcional)</span>
          </label>
          <textarea
            id="lanc-notes"
            placeholder="Anotações sobre o lançamento"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${campoClasse} mt-1.5 h-auto min-h-[4rem] resize-none py-2 leading-relaxed`}
          />
        </Card>
      </div>

      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-fundo via-fundo/85 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 lg:sticky lg:mt-auto lg:px-0 lg:pb-2 lg:pt-6">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[398px] flex-col gap-2 lg:max-w-none">
          {submitSuccess ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl bg-positivo/10 px-3 py-2.5 text-sm text-positivo"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              {submitSuccess}
            </p>
          ) : null}
          {submitError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {submitError}
            </p>
          ) : null}
          <Botao
            variante="primario"
            onClick={() => void handleConfirmarLancamento()}
            disabled={isLoading}
            aria-busy={isLoading}
            className="h-11 w-full text-[15px]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            )}
            {isLoading
              ? "Salvando…"
              : tipo === "despesa"
                ? "Salvar despesa"
                : "Salvar receita"}
          </Botao>
        </div>
      </footer>
    </div>
  );
}

/** Controle sem borda dentro de uma linha da lista agrupada. */
const controleLinha =
  "h-11 min-w-0 flex-1 bg-transparent text-right text-sm text-texto outline-none [color-scheme:dark] placeholder:text-texto-3";

/** Linha da lista agrupada (estilo Ajustes do iOS): ícone, rótulo e controle à direita. */
function Linha({
  icone,
  rotulo,
  htmlFor,
  obrigatorio = false,
  dica,
  children,
}: {
  icone: ReactNode;
  rotulo: string;
  htmlFor: string;
  obrigatorio?: boolean;
  dica?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-3 focus-within:bg-white/[0.02]">
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
          {icone}
        </span>
        <label htmlFor={htmlFor} className="shrink-0 text-sm text-texto">
          {rotulo}
          {obrigatorio ? (
            <span className="ml-0.5 text-texto-3" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {children}
      </div>
      {dica ? <p className="-mt-1 pb-2.5 pl-10 text-[11px] leading-snug text-texto-3">{dica}</p> : null}
    </div>
  );
}

/** Select nativo alinhado à direita, com seta. */
function SelectLinha({
  id,
  value,
  onChange,
  opcoes,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  opcoes: { value: string; label: string }[];
}) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center justify-end">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 max-w-full cursor-pointer touch-manipulation appearance-none truncate bg-transparent pr-6 text-right text-sm text-texto-2 outline-none [color-scheme:dark] [text-align-last:right] [&>option]:bg-superficie-2 [&>option]:text-texto"
      >
        {opcoes.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
        aria-hidden
      />
    </div>
  );
}
