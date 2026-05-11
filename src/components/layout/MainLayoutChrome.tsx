"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";

export function MainLayoutChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideBottomNav =
    pathname === "/lancar" ||
    pathname === "/perfil" ||
    pathname.startsWith("/perfil/");

  const perfilRota =
    pathname === "/perfil" || pathname.startsWith("/perfil/");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div
        className={`relative z-0 mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-x-hidden overscroll-y-contain pt-[max(1rem,env(safe-area-inset-top))] ${
          perfilRota
            ? "overflow-hidden px-0"
            : "overflow-y-auto scroll-smooth px-4"
        } ${hideBottomNav ? "pb-4" : "pb-[max(6rem,calc(env(safe-area-inset-bottom)+5.75rem))]"}`}
      >
        {children}
      </div>
      {!hideBottomNav ? <BottomNav /> : null}
    </div>
  );
}
