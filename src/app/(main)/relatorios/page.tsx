import { Suspense } from "react";
import { RelatoriosScreen } from "@/components/relatorios/RelatoriosScreen";

function Carregando() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-32 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="h-11 animate-pulse rounded-full bg-white/[0.04]" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

/** `useSearchParams` (aba e período na URL) exige um limite de Suspense na página. */
export default function RelatoriosPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <RelatoriosScreen />
    </Suspense>
  );
}
