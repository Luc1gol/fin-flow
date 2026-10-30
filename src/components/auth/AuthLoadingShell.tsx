export function AuthLoadingShell() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-fundo px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="vidro-marca flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold tracking-tight"
        aria-hidden
      >
        F
      </div>
      <div
        className="mt-5 h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-marca"
        aria-hidden
      />
      <p className="mt-3 text-xs text-texto-3">Carregando…</p>
    </div>
  );
}
