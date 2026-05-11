import { Wifi, CreditCard as CardBrandIcon } from "lucide-react";

type VirtualCreditCardProps = {
  productName: string;
  maskedNumber: string;
  holder: string;
  closingDay: number;
  accentHex: string;
  gradientFrom: string;
  gradientTo: string;
};

export function VirtualCreditCard({
  productName,
  maskedNumber,
  holder,
  closingDay,
  accentHex,
  gradientFrom,
  gradientTo,
}: VirtualCreditCardProps) {
  const closingLabel =
    closingDay === 1
      ? "Todo dia 01"
      : `Todo dia ${String(closingDay).padStart(2, "0")}`;

  return (
    <article
      className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-xl shadow-black/40"
      style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
          {productName}
        </span>
        <Wifi
          className="h-6 w-6 rotate-90 text-white/90 stroke-[1.5]"
          aria-hidden
        />
      </div>

      <p className="mt-8 font-mono text-lg tracking-[0.12em] text-white">
        {maskedNumber}
      </p>

      <div className="mt-6 flex items-end justify-between gap-4">
        <span className="max-w-[60%] text-sm font-medium uppercase tracking-wide text-white/90">
          {holder}
        </span>
        <CardBrandIcon
          className="h-8 w-11 shrink-0 text-white drop-shadow-md"
          style={{ color: accentHex }}
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      <footer className="mt-5 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Data de fechamento da fatura
        </p>
        <p className="mt-1 text-sm font-semibold text-[#10B981]">
          {closingLabel}
        </p>
      </footer>
    </article>
  );
}
