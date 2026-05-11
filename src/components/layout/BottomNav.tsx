"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Home, PlusCircle, ScrollText } from "lucide-react";

const items = [
  { href: "/inicio", label: "Início", Icon: Home },
  { href: "/lancar", label: "Lançar", Icon: PlusCircle },
  { href: "/cartoes", label: "Cartões", Icon: CreditCard },
  { href: "/extrato", label: "Extrato", Icon: ScrollText },
  { href: "/relatorios", label: "Relatórios", Icon: BarChart3 },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/inicio") return pathname === "/inicio" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#121212]/90 backdrop-blur-xl supports-[backdrop-filter]:bg-[#121212]/80"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-[430px] items-stretch justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-colors ${
                active ? "text-[#10B981]" : "text-zinc-500"
              }`}
            >
              <Icon
                className="h-6 w-6 shrink-0 stroke-[1.75]"
                aria-hidden
              />
              <span className="truncate text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
