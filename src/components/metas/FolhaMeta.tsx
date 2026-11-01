"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { Botao, campoClasse } from "@/components/ui/base";
import { formatBRL } from "@/lib/format-currency";
import type { DadosMeta, InvestimentoMeta, Meta } from "@/lib/dados/metas";

/** Estado inicial da folha (valores como texto, como o usuário digita). */
export type EdicaoMeta = {
  meta: Meta | null;
  nome: string;
  valorAlvo: string;
  dataAlvo: string;
  valorManual: string;
  investimentoIds: string[];
};

/** Aceita "1.200,50", "1200.5" ou "1200". Vazio → null. */
function parseValor(raw: string): number | null {
  const t = raw.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number.parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

export function FolhaMeta({
  edicao,
  investimentos,
  outrasMetas,
  salvando,
  onFechar,
  onSalvar,
  onConcluir,
  onExcluir,
}: {
  edicao: EdicaoMeta;
  investimentos: InvestimentoMeta[];
  /** Metas abertas (exceto esta), para avisar se um investimento já está vinculado a outra. */
  outrasMetas: Meta[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (dados: DadosMeta) => void;
  onConcluir?: (concluir: boolean) => void;
  onExcluir?: () => void;
}) {
  const [nome, setNome] = useState(edicao.nome);
  const [valorAlvo, setValorAlvo] = useState(edicao.valorAlvo);
  const [dataAlvo, setDataAlvo] = useState(edicao.dataAlvo);
  const [valorManual, setValorManual] = useState(edicao.valorManual);
  const [selecionados, setSelecionados] = useState<string[]>(edicao.investimentoIds);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const editando = edicao.meta != null;
  const concluida = edicao.meta?.concluidaEm != null;

  const saldoSelecionado = investimentos
    .filter((i) => selecionados.includes(i.id))
    .reduce((s, i) => s + i.saldo, 0);

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function salvar() {
    const alvo = parseValor(valorAlvo);
    const manual = parseValor(valorManual) ?? 0;
    if (!nome.trim()) return setAviso("Dê um nome para a meta.");
    if (alvo == null || alvo <= 0) return setAviso("Informe um valor alvo maior que zero.");
    if (manual < 0) return setAviso("O valor guardado não pode ser negativo.");
    if (dataAlvo && !/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) return setAviso("Data inválida.");
    onSalvar({
      nome: nome.trim(),
      valorAlvo: alvo,
      dataAlvo: dataAlvo || null,
      valorManual: manual,
      // Ignora vínculos de investimentos que não existem mais.
      investimentoIds: selecionados.filter((id) => investimentos.some((i) => i.id === id)),
    });
  }

  const titulo = editando ? "Editar meta" : "Nova meta";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 lg:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="vidro flex max-h-[92dvh] w-full max-w-[430px] flex-col rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-texto">{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-3 hover:text-texto">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="-mx-1 flex flex-col gap-3 overflow-y-auto px-1">
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Nome
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setAviso(null);
              }}
              placeholder="Ex.: Viagem, reserva de emergência"
              className={`${campoClasse} h-10`}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-texto-2">
              Valor alvo (R$)
              <input
                value={valorAlvo}
                onChange={(e) => {
                  setValorAlvo(e.target.value);
                  setAviso(null);
                }}
                inputMode="decimal"
                placeholder="10.000"
                className={`${campoClasse} h-10`}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-texto-2">
              <span>
                Data alvo <span className="text-texto-3">(opcional)</span>
              </span>
              <input
                type="date"
                value={dataAlvo}
                onChange={(e) => {
                  setDataAlvo(e.target.value);
                  setAviso(null);
                }}
                className={`${campoClasse} h-10`}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Quanto já tem guardado (R$)
            <input
              value={valorManual}
              onChange={(e) => {
                setValorManual(e.target.value);
                setAviso(null);
              }}
              inputMode="decimal"
              placeholder="0"
              className={`${campoClasse} h-10`}
            />
            <span className="text-[11px] text-texto-3">
              Dinheiro fora dos investimentos abaixo (poupança, outro banco, em espécie…).
            </span>
          </label>

          {investimentos.length > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-xs text-texto-2">Investimentos que contam para esta meta</legend>
              <div className="flex flex-col divide-y divide-borda rounded-xl border border-borda">
                {investimentos.map((inv) => {
                  const marcado = selecionados.includes(inv.id);
                  const emOutra = outrasMetas.find((m) => m.investimentoIds.includes(inv.id));
                  return (
                    <label key={inv.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(inv.id)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-marca/60 ${
                          marcado ? "border-marca bg-marca text-white" : "border-borda-forte"
                        }`}
                      >
                        {marcado ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-texto">{inv.nome}</span>
                        <span className="block truncate text-[11px] text-texto-3">
                          {[inv.instituicao, inv.tipo].filter(Boolean).join(" · ")}
                          {emOutra ? ` · também em “${emOutra.nome}”` : ""}
                        </span>
                      </span>
                      <span className="valor shrink-0 text-sm text-texto-2">{formatBRL(inv.saldo)}</span>
                    </label>
                  );
                })}
              </div>
              <span className="text-[11px] text-texto-3">
                {selecionados.length > 0
                  ? `${formatBRL(saldoSelecionado)} selecionados · o saldo é atualizado todo dia pelo banco.`
                  : "O saldo dos investimentos marcados é atualizado todo dia pelo banco."}
              </span>
            </fieldset>
          ) : null}

          {aviso ? <p className="text-xs text-negativo">{aviso}</p> : null}

          <div className="mt-1 flex flex-wrap gap-2">
            {onExcluir ? (
              <Botao
                variante="fantasma"
                className={confirmarExclusao ? "bg-negativo/10 text-negativo" : "text-negativo"}
                disabled={salvando}
                onClick={() => (confirmarExclusao ? onExcluir() : setConfirmarExclusao(true))}
                onBlur={() => setConfirmarExclusao(false)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {confirmarExclusao ? "Confirmar exclusão" : "Excluir"}
              </Botao>
            ) : null}
            {onConcluir ? (
              <Botao variante="fantasma" disabled={salvando} onClick={() => onConcluir(!concluida)}>
                {concluida ? (
                  <>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Reabrir
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" aria-hidden /> Concluir
                  </>
                )}
              </Botao>
            ) : null}
            <Botao variante="primario" className="min-w-[7rem] flex-1" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Salvar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
