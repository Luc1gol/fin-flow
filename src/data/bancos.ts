export type BancoInstituicao = {
  id: string;
  nome: string;
  /** Domínio para ícone (Icon Horse / favicon). */
  domain: string;
  /** Borda superior (Tailwind literal; incluir espessura e cor). */
  colorClass: string;
  radialGlow: string;
};

/** Instituições pré-cadastradas — ordem alfabética por nome no seletor. */
export const BANCOS: readonly BancoInstituicao[] = [
  {
    id: "american-express",
    nome: "American Express",
    domain: "americanexpress.com",
    colorClass: "border-t-2 border-t-blue-600",
    radialGlow: "rgba(37, 99, 235, 0.088)",
  },
  {
    id: "avenue",
    nome: "Avenue",
    domain: "avenue.us",
    colorClass: "border-t-2 border-t-blue-800",
    radialGlow: "rgba(30, 64, 175, 0.09)",
  },
  {
    id: "banco-inter",
    nome: "Banco Inter",
    domain: "inter.co",
    colorClass: "border-t-2 border-t-orange-500",
    radialGlow: "rgba(249, 115, 22, 0.085)",
  },
  {
    id: "banco-pan",
    nome: "Banco Pan",
    domain: "pan.com.br",
    colorClass: "border-t-2 border-t-sky-400",
    radialGlow: "rgba(56, 189, 248, 0.09)",
  },
  {
    id: "banrisul",
    nome: "Banrisul",
    domain: "banrisul.com.br",
    colorClass: "border-t-2 border-t-blue-700",
    radialGlow: "rgba(29, 78, 216, 0.09)",
  },
  {
    id: "bb",
    nome: "Banco do Brasil",
    domain: "bb.com.br",
    colorClass: "border-t-2 border-t-yellow-500",
    radialGlow: "rgba(234, 179, 8, 0.08)",
  },
  {
    id: "bradesco",
    nome: "Bradesco",
    domain: "bradesco.com.br",
    colorClass: "border-t-2 border-t-red-600",
    radialGlow: "rgba(220, 38, 38, 0.085)",
  },
  {
    id: "btg",
    nome: "BTG Pactual",
    domain: "btgpactual.com",
    colorClass: "border-t-2 border-t-blue-700",
    radialGlow: "rgba(29, 78, 216, 0.09)",
  },
  {
    id: "c6",
    nome: "C6 Bank",
    domain: "c6bank.com.br",
    colorClass: "border-t-2 border-t-zinc-500",
    radialGlow: "rgba(113, 113, 122, 0.095)",
  },
  {
    id: "caixa",
    nome: "Caixa Econômica Federal",
    domain: "caixa.gov.br",
    colorClass: "border-t-2 border-t-blue-700",
    radialGlow: "rgba(29, 78, 216, 0.09)",
  },
  {
    id: "hsbc",
    nome: "HSBC",
    domain: "hsbc.com.br",
    colorClass: "border-t-2 border-t-red-700",
    radialGlow: "rgba(185, 28, 28, 0.085)",
  },
  {
    id: "itau",
    nome: "Itaú",
    domain: "itau.com.br",
    colorClass: "border-t-2 border-t-orange-500",
    radialGlow: "rgba(249, 115, 22, 0.085)",
  },
  {
    id: "mastercard",
    nome: "Mastercard",
    domain: "mastercard.com",
    colorClass: "border-t-2 border-t-orange-600",
    radialGlow: "rgba(234, 88, 12, 0.085)",
  },
  {
    id: "mercado-pago",
    nome: "Mercado Pago",
    domain: "mercadopago.com.br",
    colorClass: "border-t-2 border-t-sky-400",
    radialGlow: "rgba(56, 189, 248, 0.09)",
  },
  {
    id: "modalmais",
    nome: "Modalmais",
    domain: "modalmais.com.br",
    colorClass: "border-t-2 border-t-zinc-500",
    radialGlow: "rgba(113, 113, 122, 0.095)",
  },
  {
    id: "neon",
    nome: "Neon",
    domain: "neon.com.br",
    colorClass: "border-t-2 border-t-cyan-400",
    radialGlow: "rgba(34, 211, 238, 0.085)",
  },
  {
    id: "next",
    nome: "Next (Bradesco)",
    domain: "next.me",
    colorClass: "border-t-2 border-t-green-500",
    radialGlow: "rgba(34, 197, 94, 0.085)",
  },
  {
    id: "nubank",
    nome: "Nubank",
    domain: "nubank.com.br",
    colorClass: "border-t-2 border-t-purple-500",
    radialGlow: "rgba(168, 85, 247, 0.088)",
  },
  {
    id: "original",
    nome: "Banco Original",
    domain: "original.com.br",
    colorClass: "border-t-2 border-t-green-600",
    radialGlow: "rgba(22, 163, 74, 0.085)",
  },
  {
    id: "pagbank",
    nome: "PagBank",
    domain: "pagbank.com.br",
    colorClass: "border-t-2 border-t-teal-400",
    radialGlow: "rgba(45, 212, 191, 0.085)",
  },
  {
    id: "picpay",
    nome: "PicPay",
    domain: "picpay.com",
    colorClass: "border-t-2 border-t-green-500",
    radialGlow: "rgba(34, 197, 94, 0.085)",
  },
  {
    id: "porto-seguro",
    nome: "Porto Seguro",
    domain: "portoseguro.com.br",
    colorClass: "border-t-2 border-t-blue-700",
    radialGlow: "rgba(29, 78, 216, 0.09)",
  },
  {
    id: "safra",
    nome: "Safra",
    domain: "safra.com.br",
    colorClass: "border-t-2 border-t-amber-400",
    radialGlow: "rgba(251, 191, 36, 0.08)",
  },
  {
    id: "santander",
    nome: "Santander",
    domain: "santander.com.br",
    colorClass: "border-t-2 border-t-red-600",
    radialGlow: "rgba(220, 38, 38, 0.085)",
  },
  {
    id: "sicoob",
    nome: "Sicoob",
    domain: "sicoob.com.br",
    colorClass: "border-t-2 border-t-green-500",
    radialGlow: "rgba(34, 197, 94, 0.085)",
  },
  {
    id: "sicredi",
    nome: "Sicredi",
    domain: "sicredi.com.br",
    colorClass: "border-t-2 border-t-green-600",
    radialGlow: "rgba(22, 163, 74, 0.085)",
  },
  {
    id: "stone",
    nome: "Stone",
    domain: "stone.co",
    colorClass: "border-t-2 border-t-lime-500",
    radialGlow: "rgba(132, 204, 22, 0.08)",
  },
  {
    id: "visa",
    nome: "Visa",
    domain: "visa.com.br",
    colorClass: "border-t-2 border-t-indigo-600",
    radialGlow: "rgba(79, 70, 229, 0.085)",
  },
  {
    id: "willbank",
    nome: "Will Bank",
    domain: "willbank.com.br",
    colorClass: "border-t-2 border-t-amber-400",
    radialGlow: "rgba(251, 191, 36, 0.08)",
  },
  {
    id: "xp",
    nome: "XP Investimentos",
    domain: "xpinc.com",
    colorClass: "border-t-2 border-t-yellow-500",
    radialGlow: "rgba(234, 179, 8, 0.08)",
  },
  {
    id: "outros",
    nome: "Outra instituição",
    domain: "bank.com",
    colorClass: "border-t-2 border-t-emerald-500",
    radialGlow: "rgba(16, 185, 129, 0.085)",
  },
];

const mapaPorId = new Map(BANCOS.map((b) => [b.id, b]));

export function getBancoById(id: string): BancoInstituicao {
  return mapaPorId.get(id) ?? mapaPorId.get("outros")!;
}

export function bancosOrdenados(): BancoInstituicao[] {
  return [...BANCOS].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
}

export function logoIconHorseUrl(domain: string): string {
  return `https://icon.horse/icon/${encodeURIComponent(domain)}`;
}

export function logoGoogleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/** Iniciais para fallback (ex.: "Banco Pan" → "BP"). */
export function iniciaisInstituicao(nome: string): string {
  const partes = nome
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(do|da|de|dos|das)$/i.test(p))
    .slice(0, 2);
  if (partes.length === 0) return "?";
  const s = partes.map((w) => w[0]?.toUpperCase() ?? "").join("");
  return s.slice(0, 2) || nome.slice(0, 2).toUpperCase();
}
