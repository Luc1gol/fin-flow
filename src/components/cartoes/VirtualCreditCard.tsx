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
    <article className="vidro-suave overflow-hidden rounded-2xl">
      <div
        className="relative flex aspect-[1.586] flex-col justify-between p-4 text-white"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            {productName}
          </span>
          <Wifi className="h-5 w-5 rotate-90 text-white/85" strokeWidth={1.5} aria-hidden />
        </div>

        <p className="valor font-mono text-base tracking-[0.12em] text-white">{maskedNumber}</p>

        <div className="flex items-end justify-between gap-4">
          <span className="max-w-[60%] truncate text-xs font-medium uppercase tracking-wide text-white/90">
            {holder}
          </span>
          <CardBrandIcon
            className="h-7 w-9 shrink-0 drop-shadow-md"
            style={{ color: accentHex }}
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
      </div>

      <footer className="flex items-center justify-between px-3.5 py-2.5 text-xs">
        <span className="text-texto-3">Fechamento da fatura</span>
        <span className="font-medium text-texto">{closingLabel}</span>
      </footer>
    </article>
  );
}
