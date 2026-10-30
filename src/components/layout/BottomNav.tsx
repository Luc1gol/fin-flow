"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartPie,
  CreditCard,
  Home,
  Inbox,
  List,
  Plus,
  Repeat,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

type ItemNav = { href: string; label: string; Icon: LucideIcon };

export const ITENS_NAV: ItemNav[] = [
  { href: "/inicio", label: "Início", Icon: Home },
  { href: "/extrato", label: "Extrato", Icon: List },
  { href: "/cartoes", label: "Cartões", Icon: CreditCard },
  { href: "/relatorios", label: "Análise", Icon: ChartPie },
];

/** Só no menu lateral (desktop); no celular ficam no Início e no perfil. */
export const ITENS_NAV_EXTRAS: ItemNav[] = [
  { href: "/orcamentos", label: "Orçamentos", Icon: Target },
  { href: "/recorrencias", label: "Contas fixas", Icon: Repeat },
  { href: "/importar", label: "Revisar", Icon: Inbox },
  { href: "/perfil", label: "Perfil", Icon: Settings },
];

export function rotaAtiva(pathname: string, href: string) {
  if (href === "/inicio") return pathname === "/inicio" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Ícone + rótulo; acende assim que é tocado, antes da página carregar. */
function ConteudoItem({ item, ativo }: { item: ItemNav; ativo: boolean }) {
  const { pending } = useLinkStatus();
  const { Icon, label } = item;
  return (
    <>
      <Icon
        className={`h-[22px] w-[22px] ${pending ? "animate-pulse" : ""}`}
        strokeWidth={ativo || pending ? 2.2 : 1.8}
        aria-hidden
      />
      <span className="text-[10px] font-medium">{label}</span>
    </>
  );
}

function ItemBarra({ item, pathname }: { item: ItemNav; pathname: string }) {
  const ativo = rotaAtiva(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={`flex h-14 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-1 transition-transform active:scale-90 [-webkit-tap-highlight-color:transparent] ${
        ativo ? "text-marca" : "text-texto-3"
      }`}
    >
      <ConteudoItem item={item} ativo={ativo} />
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [a, b, c, d] = ITENS_NAV;

  return (
    <nav
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 px-4 lg:hidden"
      aria-label="Navegação principal"
    >
      {/* Barra flutuante de vidro, no estilo das abas do iOS. */}
      <div className="vidro mx-auto flex h-16 max-w-[398px] items-center rounded-[28px] px-1.5">
        <ItemBarra item={a!} pathname={pathname} />
        <ItemBarra item={b!} pathname={pathname} />
        <div className="flex flex-1 justify-center">
          <Link
            href="/lancar"
            aria-label="Novo lançamento"
            className="vidro-marca flex h-12 w-12 touch-manipulation items-center justify-center rounded-full transition-transform active:scale-90 [-webkit-tap-highlight-color:transparent]"
          >
            <Plus className="h-6 w-6" strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
        <ItemBarra item={c!} pathname={pathname} />
        <ItemBarra item={d!} pathname={pathname} />
      </div>
    </nav>
  );
}
