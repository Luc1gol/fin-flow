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
import { BancoLogo } from "@/components/cartoes/BancoLogo";
import { Botao, campoClasse } from "@/components/ui/base";

function noopSubscribe(): () => void {
  return () => {};
}

const inputClass = campoClasse;

const rotuloClasse = "block text-xs font-medium text-texto-2";

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

  const titulo = cartaoEmEdicao ? "Editar cartão" : "Novo cartão";
  const bancoLabel = bancoId
    ? getBancoById(bancoId).nome
    : "Escolha a instituição";

  if (!isClient || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Fechar formulário"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cartao-titulo"
        className="vidro relative z-[1] mx-auto flex max-h-[min(92dvh,640px)] min-h-0 w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl !bg-superficie/90 lg:max-w-md lg:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-2 lg:pt-4">
          <h2 id="novo-cartao-titulo" className="text-base font-semibold text-texto">
            {titulo}
          </h2>
          <button
            type="button"
            className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-texto-2 hover:bg-white/[0.06] hover:text-texto"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 [-webkit-overflow-scrolling:touch]">
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo"
              >
                {error}
              </p>
            ) : null}

            <div>
              <span className={rotuloClasse}>
                Instituição <span className="text-negativo">*</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPickerAberto(true);
                }}
                className={`${inputClass} mt-1 flex h-11 touch-manipulation items-center gap-2.5 text-left`}
              >
                {bancoId ? <BancoLogo banco={getBancoById(bancoId)} className="h-6 w-6" /> : null}
                <span className={`min-w-0 flex-1 truncate ${bancoId ? "text-texto" : "text-texto-3"}`}>
                  {bancoLabel}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
              </button>
            </div>

            <label className={rotuloClasse}>
              Apelido do cartão <span className="font-normal text-texto-3">(opcional)</span>
              <input
                type="text"
                value={nomeCartao}
                onChange={(e) => {
                  setError(null);
                  setNomeCartao(e.target.value);
                }}
                placeholder="Ex: Crédito Principal, Cartão da Esposa"
                autoComplete="off"
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className={rotuloClasse}>
              Últimos 4 dígitos
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={final4}
                onChange={(e) => {
                  setError(null);
                  setFinal4(e.target.value.replace(/D/g, "").slice(0, 4));
                }}
                placeholder="••••"
                autoComplete="off"
                className={`${inputClass} valor mt-1 font-mono tracking-widest`}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className={rotuloClasse}>
                Dia de fechamento
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={diaFechamento}
                  onChange={(e) => {
                    setError(null);
                    setDiaFechamento(e.target.value.replace(/D/g, "").slice(0, 2));
                  }}
                  placeholder="1–31"
                  autoComplete="off"
                  className={`${inputClass} valor mt-1`}
                />
              </label>
              <label className={rotuloClasse}>
                Dia de vencimento
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={diaVencimento}
                  onChange={(e) => {
                    setError(null);
                    setDiaVencimento(e.target.value.replace(/D/g, "").slice(0, 2));
                  }}
                  placeholder="1–31"
                  autoComplete="off"
                  className={`${inputClass} valor mt-1`}
                />
              </label>
            </div>
          </div>

          <div className="shrink-0 border-t border-borda px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Botao type="submit" variante="primario" className="w-full">
              Salvar cartão
            </Botao>
          </div>
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
