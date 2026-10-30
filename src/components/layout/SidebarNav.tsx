"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { ITENS_NAV, ITENS_NAV_EXTRAS, rotaAtiva } from "@/components/layout/BottomNav";

/** Menu lateral fixo, só no computador (lg+). */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-borda bg-fundo px-3 py-5 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca text-sm font-bold text-white">
          F
        </span>
        <span className="text-base font-semibold text-texto">FinFlow</span>
      </div>

      <Link
        href="/lancar"
        className="mb-5 flex h-10 items-center justify-center gap-2 rounded-xl bg-marca text-sm font-semibold text-white transition hover:bg-marca-forte"
      >
        <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
        Novo lançamento
      </Link>

      <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
        {[...ITENS_NAV, ...ITENS_NAV_EXTRAS].map(({ href, label, Icon }) => {
          const ativo = rotaAtiva(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                ativo
                  ? "bg-superficie-2 font-semibold text-texto"
                  : "text-texto-2 hover:bg-superficie hover:text-texto"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${ativo ? "text-marca" : ""}`} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
