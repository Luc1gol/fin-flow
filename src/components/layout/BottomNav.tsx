"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Home, PlusCircle, ScrollText, type LucideIcon } from "lucide-react";

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

/** Conteúdo do item: acende assim que é tocado, antes mesmo da página carregar. */
function ItemConteudo({ label, Icon, active }: { label: string; Icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  const aceso = active || pending;
  return (
    <>
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ${
          aceso ? "bg-[#10B981]/15" : ""
        } ${pending ? "animate-pulse" : ""}`}
      >
        <Icon className="h-6 w-6 shrink-0 stroke-[1.75]" aria-hidden />
      </span>
      <span className="truncate text-[11px] font-medium">{label}</span>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#121212]/95 backdrop-blur-xl"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-[430px] items-stretch justify-around px-1 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // touch-manipulation: o toque vale na hora, sem esperar por duplo toque/zoom do iOS.
              className={`flex min-h-[3.75rem] min-w-0 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-transform active:scale-95 [-webkit-tap-highlight-color:transparent] ${
                active ? "text-[#10B981]" : "text-zinc-400"
              }`}
            >
              <ItemConteudo label={label} Icon={Icon} active={active} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
