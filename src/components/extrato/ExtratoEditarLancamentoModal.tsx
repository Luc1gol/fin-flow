"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { TagsExtrasField } from "@/components/form/TagsExtrasField";
import { ChevronDown, Landmark, Loader2, X } from "lucide-react";
import type { LancamentoExtrato } from "@/data/extrato-mock";
import { mapLancamentoRowFromDb } from "@/lib/map-lancamento-extrato";
import {
  MAX_AMOUNT_DIGITS_LANCAMENTO,
  formatMaskedValorDisplay,
  parseAmountDigitsToReais,
  reaisToAmountDigits,
} from "@/lib/currency-input-mask";
import {
  descricaoTemParcela,
  extrairFracParcelaFim,
  extrairNomeBaseParcela,
} from "@/lib/parcela-descricao";
import { supabase } from "@/lib/supabase";
import {
  mergePendingTagInputIntoSeleccionadas,
  tagsExtrasPayloadForDb,
} from "@/lib/tags-extras-coalesce";
import { fetchDistinctTagsExtrasHistoricoForUser } from "@/lib/tags-extras-historico";
import {
  CONTA_CORRENTE_LABEL,
  type CartaoUsuarioOrigem,
  contaCartaoDbParaSelectValue,
  contaCartaoParaColunaDb,
  valorSelectCartaoId,
} from "@/lib/conta-cartao-lancamento";

const DATALIST_CATEGORIAS_ID = "lista-categorias-editar";

type Props = {
  item: LancamentoExtrato;
  cartoesUsuario: CartaoUsuarioOrigem[];
  categoriasSalvas: string[];
  onClose: () => void;
  onSaved: (updated: LancamentoExtrato) => void;
  onRefreshList: () => void | Promise<void>;
};

function noopSubscribe(): () => void {
  return () => {};
}

const ringFocus =
  "focus-visible:ring-2 focus-visible:ring-[#10B981]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]";
const inputGlass =
  "rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white outline-none backdrop-blur-sm transition-colors [color-scheme:dark]";

export function ExtratoEditarLancamentoModal({
  item,
  cartoesUsuario,
  categoriasSalvas,
  onClose,
  onSaved,
  onRefreshList,
}: Props) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [descricao, setDescricao] = useState(() => item.descricao);
  const [amountDigits, setAmountDigits] = useState(() =>
    reaisToAmountDigits(Number(item.valor)),
  );
  const valorInputRef = useRef<HTMLInputElement>(null);
  const [dataISO, setDataISO] = useState(() => item.dataISO);
  const [contaState, setContaState] = useState(() =>
    contaCartaoDbParaSelectValue(item.meioPagamento, cartoesUsuario),
  );
  const [categoria, setCategoria] = useState(() => item.tag ?? "");
  const [tagsSelecionadas, setTagsSelecionadas] = useState(
    () => item.tags_extras ?? [],
  );
  const [tagInput, setTagInput] = useState("");
  const [tagsHistorico, setTagsHistorico] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const pendingEditRef = useRef<{
    novaDesc: string;
    novoValor: number;
    novaData: string;
    tagDb: string | null;
    contaDb: string | null;
    tagsExtrasDb: unknown;
    meioPagamentoDb: string | null;
  } | null>(null);
  const salvarExtratoLockRef = useRef(false);
  const scopeApplyLockRef = useRef(false);

  const valorMasked = formatMaskedValorDisplay(amountDigits);

  useLayoutEffect(() => {
    const el = valorInputRef.current;
    if (!el || document.activeElement !== el) return;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [valorMasked]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistorico() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) return;
      const hist = await fetchDistinctTagsExtrasHistoricoForUser(user.id);
      if (!cancelled) setTagsHistorico(hist);
    }
    void loadHistorico();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (recurrencePickerOpen && !scopeLoading) {
        setRecurrencePickerOpen(false);
        pendingEditRef.current = null;
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, recurrencePickerOpen, scopeLoading]);

  useEffect(() => {
    setRecurrencePickerOpen(false);
    pendingEditRef.current = null;
    salvarExtratoLockRef.current = false;
    scopeApplyLockRef.current = false;
  }, [item.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const categoriasLista = useMemo(() => {
    const uniq = new Set<string>(categoriasSalvas);
    const trimmed = categoria.trim();
    if (trimmed) uniq.add(trimmed);
    return [...uniq].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [categoriasSalvas, categoria]);

  const handleValorChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const only = e.target.value.replace(/\D/g, "");
    setAmountDigits(only.slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO));
    setErrorMsg(null);
  }, []);

  const opcoesConta = useMemo(() => {
    const fixa = [{ value: CONTA_CORRENTE_LABEL, label: CONTA_CORRENTE_LABEL }];
    const dosCartoes = cartoesUsuario.map((c, i) => {
      const apelido = c.nome || `cartão ${i + 1}`;
      const lbl = `Cartão ${apelido}`;
      return { value: valorSelectCartaoId(c.id), label: lbl };
    });
    return [...fixa, ...dosCartoes];
  }, [cartoesUsuario]);

  const applyRecurrenceEdit = useCallback(
    async (scope: "single" | "series") => {
      if (scopeApplyLockRef.current) return;
      scopeApplyLockRef.current = true;
      setScopeLoading(true);
      setErrorMsg(null);
      try {
        const rid = item.recorrencia_id?.trim();
        const p = pendingEditRef.current;
        if (!rid || !p) return;

        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr || !user) {
          setErrorMsg("Sessão inválida. Entre novamente.");
          return;
        }

        if (scope === "single") {
          const { data, error } = await supabase
            .from("lancamentos")
            .update({
              descricao: p.novaDesc,
              valor: p.novoValor,
              tag: p.tagDb,
              conta_cartao: p.contaDb,
              data: p.novaData,
              tags_extras: p.tagsExtrasDb,
              meio_pagamento: p.meioPagamentoDb,
            })
            .eq("id", item.id)
            .eq("user_id", user.id)
            .select("*")
            .single();

          if (error) {
            console.error("Erro no Supabase:", error);
            setErrorMsg(error.message ?? "Não foi possível salvar.");
            window.alert("Erro ao salvar o lançamento.");
            return;
          }
          window.alert("Lançamento atualizado");
          setRecurrencePickerOpen(false);
          pendingEditRef.current = null;
          if (data) {
            onSaved(mapLancamentoRowFromDb(data as Record<string, unknown>));
          }
          onClose();
          return;
        }

        const { error: bulkErr } = await supabase
          .from("lancamentos")
          .update({
            descricao: p.novaDesc,
            valor: p.novoValor,
            tag: p.tagDb,
            conta_cartao: p.contaDb,
            tags_extras: p.tagsExtrasDb,
            meio_pagamento: p.meioPagamentoDb,
          })
          .eq("user_id", user.id)
          .eq("recorrencia_id", rid)
          .gte("data", item.dataISO);

        if (bulkErr) {
          console.error("Erro no Supabase:", bulkErr);
          setErrorMsg(bulkErr.message ?? "Não foi possível salvar a série.");
          window.alert("Erro ao salvar o lançamento.");
          return;
        }

        const { error: recErr } = await supabase
          .from("recorrencias")
          .update({
            descricao: p.novaDesc,
            valor: p.novoValor,
            tipo: item.tipo,
          })
          .eq("id", rid)
          .eq("user_id", user.id);

        if (recErr) {
          console.error("Erro ao atualizar recorrência:", recErr);
        }

        window.alert("Série de lançamentos atualizada com sucesso");
        setRecurrencePickerOpen(false);
        pendingEditRef.current = null;
        await onRefreshList();
        onClose();
      } catch (err) {
        console.error("Erro no Supabase:", err);
        setErrorMsg("Erro inesperado ao salvar.");
        window.alert("Erro ao salvar o lançamento.");
      } finally {
        scopeApplyLockRef.current = false;
        setScopeLoading(false);
      }
    },
    [item, onClose, onSaved, onRefreshList],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (salvarExtratoLockRef.current || scopeApplyLockRef.current) return;
      salvarExtratoLockRef.current = true;
      setSaving(true);
      setErrorMsg(null);
      try {
        const novaDesc = descricao.trim();
        const novoValor = parseAmountDigitsToReais(amountDigits);
        const novaCategoria = categoria.trim();
        const novaData = dataISO.trim().slice(0, 10);
        const novaConta = contaCartaoParaColunaDb(contaState, cartoesUsuario);

        if (!novaDesc) {
          setErrorMsg("Preencha a descrição.");
          return;
        }
        if (!Number.isFinite(novoValor) || novoValor <= 0) {
          setErrorMsg("Informe um valor maior que zero.");
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
          setErrorMsg("Data inválida.");
          return;
        }

        const tagDb = novaCategoria ? novaCategoria : null;
        const contaDb = novaConta ? novaConta : null;
        const arrayFinalDeTags = mergePendingTagInputIntoSeleccionadas(
          tagsSelecionadas,
          tagInput,
        );
        const tagsExtrasDb = tagsExtrasPayloadForDb(arrayFinalDeTags);

        const meioPagamentoDb =
          typeof item.meioPagamentoTipo === "string" &&
          item.meioPagamentoTipo.trim().length > 0
            ? item.meioPagamentoTipo.trim()
            : null;

        if (item.recorrencia_id?.trim()) {
          pendingEditRef.current = {
            novaDesc,
            novoValor,
            novaData,
            tagDb,
            contaDb,
            tagsExtrasDb,
            meioPagamentoDb,
          };
          setRecurrencePickerOpen(true);
          return;
        }

        const descOriginal = item.descricao;
        const ehParcela = descricaoTemParcela(descOriginal);
        const nomeBaseParcela = extrairNomeBaseParcela(descOriginal);
        const fracRef = extrairFracParcelaFim(descOriginal);
        const podeParceladoEmLote =
          ehParcela && nomeBaseParcela != null && fracRef !== null;

        let aplicarFuturas = false;
        if (podeParceladoEmLote) {
          aplicarFuturas = window.confirm(
            "Este lançamento é uma parcela. Deseja aplicar as alterações de Valor, Categoria, Cartão e Tags (extras) para ESTA e TODAS as parcelas futuras desta compra?",
          );
        }

        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr || !user) {
          setErrorMsg("Sessão inválida. Entre novamente.");
          return;
        }

        if (podeParceladoEmLote && aplicarFuturas) {
          const { data: candidatos, error: selErr } = await supabase
            .from("lancamentos")
            .select("id,descricao")
            .eq("user_id", user.id)
            .eq("tipo", item.tipo)
            .gte("data", item.dataISO);

          if (selErr) {
            console.error(selErr);
            setErrorMsg(selErr.message ?? "Não foi possível localizar parcelas.");
            return;
          }

          const idsAtualizar = (candidatos ?? [])
            .filter((row) => {
              const raw = row as { id?: unknown; descricao?: unknown };
              const d = String(raw.descricao ?? "");
              const base = extrairNomeBaseParcela(d);
              const fr = extrairFracParcelaFim(d);
              return (
                base === nomeBaseParcela && fr?.n === fracRef.n
              );
            })
            .map((row) => String((row as { id: unknown }).id));

          if (idsAtualizar.length === 0) {
            setErrorMsg("Nenhuma parcela correspondente encontrada.");
            return;
          }

          const { error: bulkErr } = await supabase
            .from("lancamentos")
            .update({
              valor: novoValor,
              tag: tagDb,
              conta_cartao: contaDb,
              tags_extras: tagsExtrasDb,
              meio_pagamento: meioPagamentoDb,
            })
            .in("id", idsAtualizar);

          if (bulkErr) {
            console.error(bulkErr);
            setErrorMsg(bulkErr.message ?? "Não foi possível salvar.");
            return;
          }

          await onRefreshList();
          onClose();
          return;
        }

        const { data, error } = await supabase
          .from("lancamentos")
          .update({
            descricao: novaDesc,
            valor: novoValor,
            tag: tagDb,
            conta_cartao: contaDb,
            data: novaData,
            tags_extras: tagsExtrasDb,
            meio_pagamento: meioPagamentoDb,
          })
          .eq("id", item.id)
          .eq("user_id", user.id)
          .select("*")
          .single();

        if (error) {
          console.error(error);
          setErrorMsg(error.message ?? "Não foi possível salvar.");
          return;
        }
        if (data) {
          onSaved(mapLancamentoRowFromDb(data as Record<string, unknown>));
        }
      } catch (err) {
        console.error("Erro no Supabase:", err);
        setErrorMsg("Erro inesperado ao salvar.");
        window.alert("Erro ao salvar o lançamento.");
      } finally {
        salvarExtratoLockRef.current = false;
        setSaving(false);
      }
    },
    [
      descricao,
      amountDigits,
      dataISO,
      contaState,
      categoria,
      cartoesUsuario,
      item,
      tagInput,
      tagsSelecionadas,
      onSaved,
      onRefreshList,
      onClose,
    ],
  );

  if (!isClient) return null;

  return createPortal(
    <>
    <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        aria-label="Fechar edição"
        onClick={() => {
          if (recurrencePickerOpen || scopeLoading) return;
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extrato-edit-titulo"
        className="relative z-[1] mx-auto mb-0 w-full max-w-[430px] rounded-t-[1.65rem] border border-white/12 bg-[#121212]/98 shadow-[0_-16px_64px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:mb-auto sm:rounded-3xl sm:shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2
            id="extrato-edit-titulo"
            className="text-lg font-semibold text-white"
          >
            Editar lançamento
          </h2>
          <button
            type="button"
            onClick={() => {
              if (scopeLoading) return;
              if (recurrencePickerOpen) {
                setRecurrencePickerOpen(false);
                pendingEditRef.current = null;
                return;
              }
              onClose();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:bg-white/[0.09] hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex max-h-[min(88dvh,560px)] flex-col"
        >
          <div className="max-h-[min(62dvh,420px)] space-y-4 overflow-y-auto px-5 py-5">
            {errorMsg ? (
              <div
                role="alert"
                className="rounded-2xl border border-red-500/40 bg-red-500/12 px-4 py-3 text-sm text-[#FECACA]"
              >
                {errorMsg}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="ext-edit-desc"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                Descrição
              </label>
              <input
                id="ext-edit-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className={`${inputGlass} mt-2 w-full placeholder:text-zinc-600 ${ringFocus}`}
                placeholder="Ex.: Mercado, salário"
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label
                htmlFor="ext-edit-valor"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                Valor
              </label>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold tabular-nums text-zinc-400">
                  R$
                </span>
                <input
                  ref={valorInputRef}
                  id="ext-edit-valor"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={valorMasked}
                  onChange={handleValorChange}
                  className={`${inputGlass} min-w-0 flex-1 tabular-nums placeholder:text-zinc-600 ${ringFocus}`}
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="ext-edit-data"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                Data
              </label>
              <input
                id="ext-edit-data"
                type="date"
                value={dataISO}
                onChange={(e) => setDataISO(e.target.value)}
                className={`${inputGlass} mt-2 w-full font-semibold ${ringFocus}`}
                required
              />
            </div>

            <div>
              <label
                htmlFor="ext-edit-conta"
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                <Landmark className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                Conta / Cartão
              </label>
              <div className="relative mt-2">
                <select
                  id="ext-edit-conta"
                  value={contaState}
                  onChange={(e) => setContaState(e.target.value)}
                  className={`${inputGlass} block w-full min-w-0 cursor-pointer appearance-none bg-[#181818]/90 py-3.5 pr-11 [&>option]:bg-[#171717] [&>option]:text-zinc-100 ${ringFocus}`}
                >
                  {opcoesConta.map((opt) => (
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

            <div>
              <label
                htmlFor="ext-edit-cat"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                Categoria
              </label>
              <input
                id="ext-edit-cat"
                list={DATALIST_CATEGORIAS_ID}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className={`${inputGlass} mt-2 w-full placeholder:text-zinc-600 ${ringFocus}`}
                placeholder="Ex.: Alimentação, Transporte"
                autoComplete="off"
              />
              <datalist id={DATALIST_CATEGORIAS_ID}>
                {categoriasLista.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <TagsExtrasField
              variant="extrato-edit"
              inputId="ext-edit-tags-extras"
              label="Tags"
              tagsSelecionadas={tagsSelecionadas}
              onTagsSelecionadasChange={setTagsSelecionadas}
              tagInput={tagInput}
              onTagInputChange={setTagInput}
              tagsHistorico={tagsHistorico}
              ringFocus={ringFocus}
            />
          </div>

          <div className="flex gap-3 border-t border-white/10 px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                if (saving || scopeLoading) return;
                if (recurrencePickerOpen) {
                  setRecurrencePickerOpen(false);
                  pendingEditRef.current = null;
                  return;
                }
                onClose();
              }}
              disabled={saving || scopeLoading}
              className="flex-1 rounded-2xl border border-white/15 bg-transparent py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || scopeLoading || recurrencePickerOpen}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#10B981] py-3.5 text-sm font-bold text-white shadow-inner shadow-black/25 transition hover:bg-[#0ea271] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
              ) : null}
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>

    {recurrencePickerOpen ? (
      <div
        className="fixed inset-0 z-[130] flex flex-col justify-end sm:justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extrato-rec-scope-titulo"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          aria-label="Fechar opções de recorrência"
          disabled={scopeLoading}
          onClick={() => {
            if (scopeLoading) return;
            setRecurrencePickerOpen(false);
            pendingEditRef.current = null;
          }}
        />
        <div className="relative z-[1] mx-auto mb-0 w-full max-w-[430px] rounded-t-[1.65rem] border border-white/12 bg-[#161616]/98 px-5 py-5 shadow-2xl backdrop-blur-xl sm:mb-auto sm:rounded-3xl">
          <h3
            id="extrato-rec-scope-titulo"
            className="text-base font-semibold text-white"
          >
            Recorrência
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Este lançamento faz parte de uma série recorrente. Deseja aplicar as
            alterações só nesta data ou nesta e nas próximas parcelas da série?
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={scopeLoading}
              onClick={() => void applyRecurrenceEdit("single")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#10B981] py-3.5 text-sm font-bold text-white shadow-inner shadow-black/25 transition hover:bg-[#0ea271] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scopeLoading ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
              ) : null}
              {scopeLoading ? "Salvando…" : "Somente este"}
            </button>
            <button
              type="button"
              disabled={scopeLoading}
              onClick={() => void applyRecurrenceEdit("series")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scopeLoading ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
              ) : null}
              {scopeLoading ? "Salvando…" : "Este e os próximos"}
            </button>
            <button
              type="button"
              disabled={scopeLoading}
              onClick={() => {
                setRecurrencePickerOpen(false);
                pendingEditRef.current = null;
              }}
              className="w-full rounded-2xl border border-white/10 py-3.5 text-sm font-semibold text-zinc-400 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>,
    document.body,
  );
}
