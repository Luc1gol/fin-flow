import { Suspense } from "react";
import { ResumoScreen } from "@/components/resumo/ResumoScreen";

function Carregando() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-10 w-40 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

/** `useSearchParams` (em ResumoScreen) exige um limite de Suspense na página. */
export default function ResumoPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <ResumoScreen />
    </Suspense>
  );
}
