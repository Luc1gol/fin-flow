/**
 * Luzes coloridas e desfocadas atrás do conteúdo. É o que dá vida ao efeito
 * de vidro: sem algo atrás, o desfoque não aparece.
 */
export function FundoAmbiente() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-marca/25 blur-[110px]" />
      <div className="absolute -right-40 top-1/3 h-[26rem] w-[26rem] rounded-full bg-violet-500/15 blur-[120px]" />
      <div className="absolute -bottom-40 left-1/4 h-[22rem] w-[22rem] rounded-full bg-cyan-400/10 blur-[110px]" />
    </div>
  );
}
