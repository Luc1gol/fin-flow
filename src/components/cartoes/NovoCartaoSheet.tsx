"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import type { CartaoCreditoUsuario } from "@/types/cartoes";
import { getBancoById } from "@/data/bancos";
import { InstituicaoPickerSheet } from "@/components/cartoes/InstituicaoPickerSheet";

function noopSubscribe(): () => void {
  return () => {};
}

const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white outline-none backdrop-blur-sm transition-colors placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#10B981]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212] [color-scheme:dark]";

type NovoCartaoSheetProps = {
  open: boolean;
  cartaoEmEdicao: CartaoCreditoUsuario | null;
  onClose: () => void;
  onPersist: (
    payload: Omit<CartaoCreditoUsuario, "id">,
    editingId: string | null,
  ) => void;
};

function parseDay(value: string): number | null {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

export function NovoCartaoSheet({
  open,
  cartaoEmEdicao,
  onClose,
  onPersist,
}: NovoCartaoSheetProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [bancoId, setBancoId] = useState("");
  const [nomeCartao, setNomeCartao] = useState("");
  const [final4, setFinal4] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickerAberto, setPickerAberto] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !pickerAberto) onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose, pickerAberto]);

  useEffect(() => {
    if (!open) return;
    const tick = requestAnimationFrame(() => {
      if (cartaoEmEdicao) {
        setBancoId(cartaoEmEdicao.bancoId);
        setNomeCartao(cartaoEmEdicao.nomeCartao);
        setFinal4(cartaoEmEdicao.final4);
        setDiaFechamento(String(cartaoEmEdicao.diaFechamento));
        setDiaVencimento(String(cartaoEmEdicao.diaVencimento));
      } else {
        setBancoId("");
        setNomeCartao("");
        setFinal4("");
        setDiaFechamento("");
        setDiaVencimento("");
      }
      setError(null);
      setPickerAberto(false);
    });
    return () => cancelAnimationFrame(tick);
  }, [open, cartaoEmEdicao]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const only4 = final4.replace(/\D/g, "").slice(0, 4);

    if (!bancoId) {
      setError("Selecione a instituição.");
      return;
    }
    if (only4.length !== 4) {
      setError("Os últimos 4 dígitos devem ter exatamente 4 números.");
      return;
    }
    const fech = parseDay(diaFechamento.trim());
    const ven = parseDay(diaVencimento.trim());
    if (fech === null) {
      setError("Dia de fechamento deve ser entre 1 e 31.");
      return;
    }
    if (ven === null) {
      setError("Dia de vencimento deve ser entre 1 e 31.");
      return;
    }

    onPersist(
      {
        bancoId,
        nomeCartao: nomeCartao.trim(),
        final4: only4,
        diaFechamento: fech,
        diaVencimento: ven,
        valorFatura: cartaoEmEdicao ? cartaoEmEdicao.valorFatura : 0,
      },
      cartaoEmEdicao?.id ?? null,
    );
  }

  const titulo = cartaoEmEdicao ? "Editar Cartão" : "Novo Cartão";
  const bancoLabel = bancoId
    ? getBancoById(bancoId).nome
    : "Escolha a instituição";

  if (!isClient || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px] transition-opacity duration-300"
        aria-label="Fechar formulário"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cartao-titulo"
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1] mx-auto flex max-h-[min(92dvh,640px)] w-full max-w-[430px] flex-col rounded-t-[28px] border border-white/12 bg-[#121212]/96 shadow-[0_-14px_56px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="novo-cartao-titulo" className="text-base font-semibold text-white">
            {titulo}
          </h2>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:bg-white/[0.09] hover:text-white"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-5"
        >
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-2xl border border-red-500/35 bg-red-500/12 px-4 py-3 text-sm font-medium text-[#FECACA]"
            >
              {error}
            </p>
          ) : null}

          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Instituição
            <span className="ml-1 text-[#EF4444]">*</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPickerAberto(true);
            }}
            className={`${inputClass} mt-2 flex w-full cursor-pointer items-center justify-between gap-2 text-left`}
          >
            <span className={bancoId ? "text-white" : "text-zinc-500"}>
              {bancoLabel}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          </button>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Apelido do cartão
            <span className="ml-1.5 text-[11px] font-normal normal-case tracking-normal text-zinc-600">
              (opcional)
            </span>
            <input
              type="text"
              value={nomeCartao}
              onChange={(e) => {
                setError(null);
                setNomeCartao(e.target.value);
              }}
              placeholder="Ex: Crédito Principal, Cartão da Esposa"
              autoComplete="off"
              className={inputClass}
            />
          </label>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Últimos 4 dígitos
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={final4}
              onChange={(e) => {
                setError(null);
                setFinal4(e.target.value.replace(/\D/g, "").slice(0, 4));
              }}
              placeholder="••••"
              autoComplete="off"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </label>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Dia fechamento
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={diaFechamento}
                onChange={(e) => {
                  setError(null);
                  setDiaFechamento(
                    e.target.value.replace(/\D/g, "").slice(0, 2),
                  );
                }}
                placeholder="1–31"
                autoComplete="off"
                className={`${inputClass} tabular-nums`}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Dia vencimento
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={diaVencimento}
                onChange={(e) => {
                  setError(null);
                  setDiaVencimento(
                    e.target.value.replace(/\D/g, "").slice(0, 2),
                  );
                }}
                placeholder="1–31"
                autoComplete="off"
                className={`${inputClass} tabular-nums`}
              />
            </label>
          </div>

          <button
            type="submit"
            className="mt-8 w-full shrink-0 rounded-2xl bg-[#10B981] py-4 text-base font-bold text-white shadow-lg shadow-[#10B981]/25 transition hover:bg-[#0ea271] active:opacity-95"
          >
            Salvar cartão
          </button>
        </form>

        <InstituicaoPickerSheet
          open={pickerAberto}
          selectedId={bancoId}
          onClose={() => setPickerAberto(false)}
          onSelect={(id) => {
            setBancoId(id);
            setError(null);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
