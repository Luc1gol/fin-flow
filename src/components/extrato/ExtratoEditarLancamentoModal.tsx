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
import { ChevronDown, Loader2, Repeat, Trash2 } from "lucide-react";
import { TagsExtrasField } from "@/components/form/TagsExtrasField";
import { Botao, campoClasse } from "@/components/ui/base";
import { IconeCategoria } from "@/components/ui/IconeCategoria";
import { SeletorCategoria } from "@/components/ui/SeletorCategoria";
import { ajustarInvestimento } from "@/lib/investimentos";
import { ExtratoFolha } from "@/components/extrato/ExtratoFolha";
import type { LancamentoExtrato } from "@/types/lancamento";
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
  listarPessoasDivididas,
  metadeEmCentavos,
  validarDivisao,
} from "@/lib/dados/divididos";
import {
  CONTA_CORRENTE_LABEL,
  type CartaoUsuarioOrigem,
  contaCartaoDbParaSelectValue,
  contaCartaoParaColunaDb,
  valorSelectCartaoId,
} from "@/lib/conta-cartao-lancamento";

const DATALIST_PESSOAS_ID = "lista-pessoas-dividir-editar";

/** Campos de divisão gravados no lançamento (vazio = não mexe). */
type CamposDivisao = {
  dividido_com?: string | null;
  valor_a_receber?: number | null;
  recebido_em?: string | null;
};

type Props = {
  item: LancamentoExtrato;
  cartoesUsuario: CartaoUsuarioOrigem[];
  categoriasSalvas: string[];
  onClose: () => void;
  onSaved: (updated: LancamentoExtrato) => void;
  onRefreshList: () => void | Promise<void>;
  /** Exclui o lançamento (o pai trata confirmação e recorrência). */
  onDelete?: (item: LancamentoExtrato) => void;
  /** Quando outra folha está por cima, o modal ignora o Esc. */
  pausado?: boolean;
};

function noopSubscribe(): () => void {
  return () => {};
}

const FORM_ID = "extrato-editar-form";
const rotuloClasse = "block text-xs text-texto-2";

export function ExtratoEditarLancamentoModal({
  item,
  cartoesUsuario,
  categoriasSalvas,
  onClose,
  onSaved,
  onRefreshList,
  onDelete,
  pausado = false,
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
  const [observacao, setObservacao] = useState(() => item.observacao ?? "");
  const [tagsSelecionadas, setTagsSelecionadas] = useState(
    () => item.tags_extras ?? [],
  );
  const [tagInput, setTagInput] = useState("");
  const [tagsHistorico, setTagsHistorico] = useState<string[]>([]);
  const [divididoCom, setDivididoCom] = useState(() => item.divididoCom ?? "");
  /** Dígitos (centavos) do valor a receber; null = metade do valor (padrão). */
  const [receberDigits, setReceberDigits] = useState<string | null>(() =>
    item.valorAReceber != null ? reaisToAmountDigits(item.valorAReceber) : null,
  );
  const [pessoasDivididas, setPessoasDivididas] = useState<string[]>([]);
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
    camposDivisao: CamposDivisao;
  } | null>(null);
  const salvarExtratoLockRef = useRef(false);
  const scopeApplyLockRef = useRef(false);

  const valorMasked = formatMaskedValorDisplay(amountDigits);
  const receberDigitsEfetivo =
    receberDigits ??
    reaisToAmountDigits(metadeEmCentavos(parseAmountDigitsToReais(amountDigits)));

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
    if (item.tipo !== "despesa") return;
    let cancelled = false;
    listarPessoasDivididas()
      .then((nomes) => {
        if (!cancelled) setPessoasDivididas(nomes);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [item.id, item.tipo]);

  useEffect(() => {
    // Outra folha (ex.: exclusão em série) por cima trata o Esc.
    if (pausado) return;
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
  }, [onClose, recurrencePickerOpen, scopeLoading, pausado]);

  // O estado é reiniciado por `key={item.id}` no pai (o modal remonta a cada lançamento).

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /**
   * Valor (e tipo) a gravar: transferência mantém o sentido (saída negativa); receita/despesa
   * com categoria "Investimentos" vira aplicação/resgate (transferência).
   */
  const valorETipo = useCallback(
    (novoValor: number, tagDb: string | null) =>
      item.tipo === "transferencia"
        ? { valor: item.transferenciaSaida ? -Math.abs(novoValor) : Math.abs(novoValor) }
        : ajustarInvestimento(item.tipo, novoValor, tagDb),
    [item.tipo, item.transferenciaSaida],
  );

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
              ...valorETipo(p.novoValor, p.tagDb),
              tag: p.tagDb,
              conta_cartao: p.contaDb,
              data: p.novaData,
              observacao: observacao.trim() || null,
              tags_extras: p.tagsExtrasDb,
              meio_pagamento: p.meioPagamentoDb,
              ...p.camposDivisao,
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
    [item, observacao, onClose, onSaved, onRefreshList, valorETipo],
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

        // "Dividido com" só vale para despesas; nome vazio limpa a divisão.
        let camposDivisao: CamposDivisao = {};
        if (item.tipo === "despesa") {
          const divisao = validarDivisao(
            divididoCom,
            parseAmountDigitsToReais(receberDigitsEfetivo),
            novoValor,
          );
          if (!divisao.ok) {
            setErrorMsg(divisao.erro);
            return;
          }
          camposDivisao = divisao.divididoCom
            ? { dividido_com: divisao.divididoCom, valor_a_receber: divisao.valorAReceber }
            : { dividido_com: null, valor_a_receber: null, recebido_em: null };
        }

        if (item.recorrencia_id?.trim()) {
          pendingEditRef.current = {
            novaDesc,
            novoValor,
            novaData,
            tagDb,
            contaDb,
            tagsExtrasDb,
            meioPagamentoDb,
            camposDivisao,
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

          // A divisão vale só para esta parcela (as demais não mudam).
          if (Object.keys(camposDivisao).length > 0) {
            const { error: divErr } = await supabase
              .from("lancamentos")
              .update(camposDivisao)
              .eq("id", item.id)
              .eq("user_id", user.id);
            if (divErr) {
              console.error(divErr);
              setErrorMsg(divErr.message ?? "Não foi possível salvar a divisão.");
              return;
            }
          }

          await onRefreshList();
          onClose();
          return;
        }

        const { data, error } = await supabase
          .from("lancamentos")
          .update({
            descricao: novaDesc,
            ...valorETipo(novoValor, tagDb),
            tag: tagDb,
            conta_cartao: contaDb,
            data: novaData,
            observacao: observacao.trim() || null,
            tags_extras: tagsExtrasDb,
            meio_pagamento: meioPagamentoDb,
            ...camposDivisao,
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
      valorETipo,
      descricao,
      observacao,
      divididoCom,
      receberDigitsEfetivo,
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


  const fecharOuVoltar = () => {
    if (saving || scopeLoading) return;
    if (recurrencePickerOpen) {
      setRecurrencePickerOpen(false);
      pendingEditRef.current = null;
      return;
    }
    onClose();
  };

  if (!isClient) return null;

  const transferencia = item.tipo === "transferencia";
  const rotuloTipo = transferencia
    ? item.transferenciaSaida
      ? "Transferência enviada"
      : "Transferência recebida"
    : item.tipo === "receita"
      ? "Receita"
      : "Despesa";
  const corTipo = transferencia
    ? "text-texto-3"
    : item.tipo === "receita"
      ? "text-positivo"
      : "text-negativo";

  return (
    <>
      <ExtratoFolha
        titulo="Editar lançamento"
        tituloId="extrato-edit-titulo"
        subtitulo={
          <span className="inline-flex items-center gap-1">
            <IconeCategoria
              categoria={item.tag ?? item.categoriaNome}
              transferencia={transferencia}
              className={`h-3 w-3 ${corTipo}`}
            />
            <span className={corTipo}>{rotuloTipo}</span>
            {item.recorrencia_id?.trim() ? (
              <>
                <span>·</span>
                <Repeat className="h-3 w-3" aria-hidden />
                <span>Recorrente</span>
              </>
            ) : null}
          </span>
        }
        rotuloFundo="Fechar edição"
        camada="z-[120]"
        fecharDesabilitado={recurrencePickerOpen || scopeLoading}
        onClose={fecharOuVoltar}
        rodape={
          <div className="flex items-center gap-2">
            {onDelete ? (
              <Botao
                variante="fantasma"
                className="!px-2.5 !text-negativo hover:!bg-negativo/10"
                disabled={saving || scopeLoading}
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Excluir
              </Botao>
            ) : null}
            <div className="flex-1" />
            <Botao variante="fantasma" disabled={saving || scopeLoading} onClick={fecharOuVoltar}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              form={FORM_ID}
              variante="primario"
              disabled={saving || scopeLoading || recurrencePickerOpen}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {saving ? "Salvando…" : "Salvar"}
            </Botao>
          </div>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-3">
          {errorMsg ? (
            <p role="alert" className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">
              {errorMsg}
            </p>
          ) : null}

          <div>
            <label htmlFor="ext-edit-valor" className={rotuloClasse}>
              Valor
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-3">
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
                className={`${campoClasse} valor h-11 pl-10 text-lg font-semibold`}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="ext-edit-desc" className={rotuloClasse}>
              Descrição
            </label>
            <input
              id="ext-edit-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={`${campoClasse} mt-1`}
              placeholder="Ex.: Mercado, salário"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor="ext-edit-data" className={rotuloClasse}>
                Data
              </label>
              <input
                id="ext-edit-data"
                type="date"
                value={dataISO}
                onChange={(e) => setDataISO(e.target.value)}
                className={`${campoClasse} mt-1`}
                required
              />
            </div>
            <div className="min-w-0">
              <span className={rotuloClasse}>Categoria</span>
              <SeletorCategoria
                valor={categoria}
                onChange={setCategoria}
                categorias={categoriasLista}
                className="mt-1 h-11"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ext-edit-conta" className={rotuloClasse}>
              Conta / Cartão
            </label>
            <div className="relative mt-1">
              <select
                id="ext-edit-conta"
                value={contaState}
                onChange={(e) => setContaState(e.target.value)}
                className={`${campoClasse} cursor-pointer appearance-none pr-9 [&>option]:bg-superficie [&>option]:text-texto`}
              >
                {opcoesConta.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
                aria-hidden
              />
            </div>
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
            ringFocus=""
          />

          {item.tipo === "despesa" ? (
            <div>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label htmlFor="ext-edit-dividido" className={rotuloClasse}>
                    Dividido com
                  </label>
                  <input
                    id="ext-edit-dividido"
                    list={DATALIST_PESSOAS_ID}
                    value={divididoCom}
                    onChange={(e) => {
                      setDivididoCom(e.target.value);
                      setErrorMsg(null);
                    }}
                    className={`${campoClasse} mt-1`}
                    placeholder="Ninguém"
                    autoComplete="off"
                  />
                  <datalist id={DATALIST_PESSOAS_ID}>
                    {pessoasDivididas.map((nome) => (
                      <option key={nome} value={nome} />
                    ))}
                  </datalist>
                </div>
                {divididoCom.trim() ? (
                  <div className="min-w-0">
                    <label htmlFor="ext-edit-receber" className={rotuloClasse}>
                      Te deve
                    </label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-3">
                        R$
                      </span>
                      <input
                        id="ext-edit-receber"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={formatMaskedValorDisplay(receberDigitsEfetivo)}
                        onChange={(e) => {
                          const only = e.target.value.replace(/\D/g, "");
                          setReceberDigits(only.slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO));
                          setErrorMsg(null);
                        }}
                        className={`${campoClasse} valor pl-10`}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              {divididoCom.trim() ? (
                <p className="mt-1 text-[11px] text-texto-3">
                  {item.recebidoEm && item.divididoCom
                    ? `Recebido em ${item.recebidoEm.split("-").reverse().join("/")}.`
                    : receberDigits == null
                      ? "Metade do valor. Aparece em A receber até a pessoa pagar."
                      : "Aparece em A receber até a pessoa pagar."}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Observações
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Ex.: dividido com a Ellen"
              className={`${campoClasse} h-auto min-h-16 resize-none py-2`}
            />
          </label>
        </form>
      </ExtratoFolha>

      {recurrencePickerOpen ? (
        <ExtratoFolha
          titulo="Recorrência"
          tituloId="extrato-rec-scope-titulo"
          rotuloFundo="Fechar opções de recorrência"
          camada="z-[130]"
          fecharDesabilitado={scopeLoading}
          onClose={() => {
            setRecurrencePickerOpen(false);
            pendingEditRef.current = null;
          }}
          rodape={
            <div className="flex flex-col gap-2">
              <Botao
                variante="primario"
                className="w-full"
                disabled={scopeLoading}
                onClick={() => void applyRecurrenceEdit("single")}
              >
                {scopeLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {scopeLoading ? "Salvando…" : "Somente este"}
              </Botao>
              <Botao
                className="w-full"
                disabled={scopeLoading}
                onClick={() => void applyRecurrenceEdit("series")}
              >
                {scopeLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {scopeLoading ? "Salvando…" : "Este e os próximos"}
              </Botao>
              <Botao
                variante="fantasma"
                className="w-full"
                disabled={scopeLoading}
                onClick={() => {
                  setRecurrencePickerOpen(false);
                  pendingEditRef.current = null;
                }}
              >
                Cancelar
              </Botao>
            </div>
          }
        >
          <p className="text-sm leading-relaxed text-texto-2">
            Este lançamento faz parte de uma série recorrente. Aplicar as alterações só nesta
            data ou nesta e nas próximas da série?
          </p>
        </ExtratoFolha>
      ) : null}
    </>
  );
}
