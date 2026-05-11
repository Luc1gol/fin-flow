"use client";

import { AlertTriangle, RefreshCw, Zap, type LucideIcon } from "lucide-react";

export type DashboardAvisoIconKey = "RefreshCw" | "Zap" | "AlertTriangle";

export type DashboardAvisoColor = "blue" | "emerald" | "orange";

export type DashboardAviso = {
  id: string;
  titulo: string;
  subtitulo: string;
  icon: DashboardAvisoIconKey;
  color: DashboardAvisoColor;
};

const ICON_BY_KEY: Record<DashboardAvisoIconKey, LucideIcon> = {
  RefreshCw,
  Zap,
  AlertTriangle,
};

const COR_ESTILO: Record<
  DashboardAvisoColor,
  { shell: string; icon: string; titulo: string; subtitulo: string }
> = {
  blue: {
    shell: "border-sky-600/35 bg-sky-950/35",
    icon: "text-sky-400",
    titulo: "text-sky-50/95",
    subtitulo: "text-sky-200/70",
  },
  emerald: {
    shell: "border-emerald-700/35 bg-emerald-950/30",
    icon: "text-emerald-400",
    titulo: "text-emerald-50/95",
    subtitulo: "text-emerald-200/65",
  },
  orange: {
    shell: "border-orange-950/65 bg-orange-950/25",
    icon: "text-amber-500/95",
    titulo: "text-amber-50/96",
    subtitulo: "text-zinc-500",
  },
};

function AvisoCard({ aviso }: { aviso: DashboardAviso }) {
  const Icon = ICON_BY_KEY[aviso.icon];
  const st = COR_ESTILO[aviso.color];

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-3xl border px-4 py-3.5 shadow-lg shadow-black/25 backdrop-blur-md ${st.shell}`}
    >
      <Icon
        className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${st.icon}`}
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium leading-snug ${st.titulo}`}>
          {aviso.titulo}
        </p>
        <p className={`mt-1 text-[11px] ${st.subtitulo}`}>{aviso.subtitulo}</p>
      </div>
    </div>
  );
}

export function ImportantNoticesHub({ avisos }: { avisos: DashboardAviso[] }) {
  if (avisos.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="hub-avisos-titulo"
      className="-mt-1 flex flex-col gap-2"
    >
      <h2
        id="hub-avisos-titulo"
        className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500"
      >
        Central de avisos importantes
      </h2>

      <ul className="flex flex-col gap-2">
        {avisos.map((aviso) => (
          <li key={aviso.id}>
            <AvisoCard aviso={aviso} />
          </li>
        ))}
      </ul>
    </section>
  );
}
