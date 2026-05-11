import type { ComponentPropsWithoutRef } from "react";

type GlassPanelProps = ComponentPropsWithoutRef<"div">;

export function GlassPanel({ className = "", ...props }: GlassPanelProps) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md shadow-lg shadow-black/25 ${className}`}
      {...props}
    />
  );
}
