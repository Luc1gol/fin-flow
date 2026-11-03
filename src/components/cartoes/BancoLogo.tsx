"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import {
  type BancoInstituicao,
  iniciaisInstituicao,
  logoGoogleFaviconUrl,
  logoIconHorseUrl,
} from "@/data/bancos";

type Tier = "horse" | "google" | "fallback";

function LogoComFallback({
  banco,
  className,
}: {
  banco: BancoInstituicao;
  className: string;
}) {
  // Icon Horse → favicon do Google → iniciais. A troca acontece no onError (evento),
  // e o componente pai recria este aqui quando o domínio muda (via `key`).
  const [tier, setTier] = useState<Tier>(banco.logoGoogle ? "google" : "horse");

  if (tier === "fallback") {
    const ini = iniciaisInstituicao(banco.nome);
    const ok = ini.length >= 1 && ini !== "?";
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-superficie-2 text-[10px] font-bold text-texto ring-1 ring-inset ring-white/10 ${className}`}
      >
        {ok ? ini : <Landmark className="h-3.5 w-3.5 text-texto-2" strokeWidth={2} aria-hidden />}
      </span>
    );
  }

  const src = tier === "horse" ? logoIconHorseUrl(banco.domain) : logoGoogleFaviconUrl(banco.domain);

  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- logos externos com fallback em cascata */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setTier((t) => (t === "horse" ? "google" : "fallback"))}
      />
    </span>
  );
}

/** Logo redondo da instituição (Icon Horse → Google → iniciais). */
export function BancoLogo({
  banco,
  className = "h-9 w-9",
}: {
  banco: BancoInstituicao;
  className?: string;
}) {
  return <LogoComFallback key={banco.domain} banco={banco} className={className} />;
}

/** Aumenta a opacidade do `radialGlow` do banco para usar como brilho no cartão. */
export function corBrilhoBanco(banco: BancoInstituicao, alpha = 0.5): string {
  return banco.radialGlow.replace(/,\s*[\d.]+\s*\)$/, `, ${alpha})`);
}
