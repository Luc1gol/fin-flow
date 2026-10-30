"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CartaoCreditoUsuario } from "@/types/cartoes";
import { getBancoById } from "@/data/bancos";
import { getInvoiceStatus } from "@/lib/fatura-cycle-badge";
import { Valor } from "@/components/ui/base";
import { BancoLogo, corBrilhoBanco } from "@/components/cartoes/BancoLogo";

type CartaoUsuarioCardProps = {
  cartao: CartaoCreditoUsuario;
  onEdit: () => void;
  onDelete: () => void;
};

export function CartaoUsuarioCard({
  cartao,
  onEdit,
  onDelete,
}: CartaoUsuarioCardProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const banco = useMemo(() => getBancoById(cartao.bancoId), [cartao.bancoId]);

  const status = useMemo(
    () => getInvoiceStatus(cartao.diaFechamento, cartao.diaVencimento),
    [cartao.diaFechamento, cartao.diaVencimento],
  );

  const valorFatura = useMemo(() => {
    const n = Number(cartao.valorFatura);
    return Number.isFinite(n) ? n : 0;
  }, [cartao.valorFatura]);

  useEffect(() => {
    if (!menuAberto) return;
    function fecharAoClicarFora(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", fecharAoClicarFora);
    return () => document.removeEventListener("mousedown", fecharAoClicarFora);
  }, [menuAberto]);

  function handleEditar() {
    setMenuAberto(false);
    onEdit();
  }

  function handleExcluir() {
    setMenuAberto(false);
    onDelete();
  }

  const apelido = cartao.nomeCartao.trim();
  const fechada = status === "Fatura Fechada";

  return (
    <article className="vidro-suave relative rounded-2xl p-3.5">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        style={{
          background: `radial-gradient(110% 80% at 0% 0%, ${corBrilhoBanco(banco, 0.35)} 0%, transparent 60%)`,
        }}
        aria-hidden
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <BancoLogo banco={banco} className="h-8 w-8" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-texto">
                {apelido || banco.nome}
              </h2>
              <p className="truncate text-xs text-texto-3">
                {apelido ? `${banco.nome} · ` : ""}
                <span className="valor">•••• {cartao.final4}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                fechada ? "bg-alerta/12 text-alerta" : "bg-marca/12 text-marca"
              }`}
            >
              {status}
            </span>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                aria-label="Opções do cartão"
                onClick={() => setMenuAberto((v) => !v)}
                className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-texto-2 transition hover:bg-white/[0.06] hover:text-texto"
              >
                <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden />
              </button>
              {menuAberto ? (
                <div
                  role="menu"
                  className="vidro absolute right-0 z-40 mt-1 min-w-[10rem] overflow-hidden rounded-xl !bg-superficie/90 py-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-texto transition hover:bg-white/[0.06]"
                    onClick={handleEditar}
                  >
                    <Pencil className="h-3.5 w-3.5 text-texto-2" aria-hidden />
                    Editar cartão
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-negativo transition hover:bg-negativo/10"
                    onClick={handleExcluir}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Excluir cartão
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs text-texto-3">Valor da fatura</p>
          <p className="mt-0.5 text-[22px] font-semibold leading-tight text-texto">
            <Valor valor={valorFatura} />
          </p>
        </div>

        <div className="mt-3 flex gap-4 border-t border-borda pt-2.5 text-xs">
          <p className="text-texto-3">
            Fecha <span className="valor font-medium text-texto">dia {cartao.diaFechamento}</span>
          </p>
          <p className="text-texto-3">
            Vence <span className="valor font-medium text-texto">dia {cartao.diaVencimento}</span>
          </p>
        </div>
      </div>
    </article>
  );
}
