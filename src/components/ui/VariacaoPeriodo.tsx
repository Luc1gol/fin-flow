import { formatBRL } from "@/lib/format-currency";

/**
 * "▲ 12% vs 1–10 de out": compara o total com o mesmo pedaço do período anterior.
 * Verde quando melhorou (mais entradas, menos saídas), vermelho quando piorou. Sem nada no
 * período anterior não dá para calcular porcentagem: mostra a diferença em reais.
 */
export function VariacaoPeriodo({
  atual,
  anterior,
  rotulo,
  subirEhBom,
  oculto = false,
}: {
  atual: number;
  anterior: number;
  rotulo: string;
  subirEhBom: boolean;
  oculto?: boolean;
}) {
  if (!rotulo) return null;
  const diferenca = atual - anterior;
  if (Math.abs(diferenca) < 0.005) {
    return <p className="mt-0.5 text-[11px] text-texto-3">= igual {rotulo}</p>;
  }
  const subiu = diferenca > 0;
  const cor = subiu === subirEhBom ? "text-positivo" : "text-negativo";
  const seta = subiu ? "▲" : "▼";
  let quanto: string;
  if (anterior > 0) {
    const pct = Math.round((Math.abs(diferenca) / anterior) * 100);
    quanto = pct >= 1000 ? "+999%" : `${pct}%`;
  } else {
    quanto = oculto ? "" : `${formatBRL(Math.abs(diferenca))} a mais`;
  }
  return (
    <p className="mt-0.5 text-[11px] text-texto-3">
      <span className={`font-medium ${cor}`}>
        {seta}
        {quanto ? ` ${quanto}` : ""}
      </span>{" "}
      {rotulo}
    </p>
  );
}
