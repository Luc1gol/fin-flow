export function AuthLoadingShell() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-[#121212] px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-9 w-9 rounded-full border-2 border-white/10 border-t-[#10B981] animate-spin"
        aria-hidden
      />
      <p className="mt-4 text-xs text-zinc-500">Carregando…</p>
    </div>
  );
}
