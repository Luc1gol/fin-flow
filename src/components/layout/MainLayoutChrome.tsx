"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { SidebarNav } from "@/components/layout/SidebarNav";

/** Formulários: no computador ficam numa coluna média (campos esticados demais cansam a leitura). */
const ROTAS_FORMULARIO = ["/lancar", "/perfil"];

export function MainLayoutChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideBottomNav =
    pathname === "/lancar" ||
    pathname === "/perfil" ||
    pathname.startsWith("/perfil/");

  const perfilRota =
    pathname === "/perfil" || pathname.startsWith("/perfil/");
  const formulario = ROTAS_FORMULARIO.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
      <SidebarNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={`relative z-0 mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-x-hidden overscroll-y-contain pt-[max(1rem,env(safe-area-inset-top))] lg:pt-8 ${
            formulario ? "lg:max-w-3xl lg:px-8" : "lg:max-w-6xl lg:px-8"
          } ${
            perfilRota
              ? "overflow-hidden px-0"
              : "overflow-y-auto scroll-smooth px-4"
          } ${hideBottomNav ? "pb-4" : "pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+6.5rem)] lg:pb-10"}`}
        >
          {children}
        </div>
        {!hideBottomNav ? <BottomNav /> : null}
      </div>
    </div>
  );
}
