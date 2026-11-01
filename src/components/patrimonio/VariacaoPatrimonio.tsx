import { Valor } from "@/components/ui/base";
import type { Patrimonio } from "@/lib/dados/patrimonio";

/** "+ R$ 120,00 (3,2%)" em verde/vermelho. */
export function VariacaoPatrimonio({
  variacao,
  oculto = false,
}: {
  variacao: NonNullable<Patrimonio["variacao30"]>;
  oculto?: boolean;
}) {
  const cor = variacao.valor > 0 ? "text-positivo" : variacao.valor < 0 ? "text-negativo" : "text-texto-2";
  const pct =
    variacao.percentual != null && !oculto
      ? ` (${Math.abs(variacao.percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`
      : "";
  return (
    <span className={`font-medium ${cor}`}>
      <Valor valor={variacao.valor} sinal oculto={oculto} />
      {pct}
    </span>
  );
}
