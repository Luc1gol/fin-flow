"use client";

import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useDashboardPeriod } from "@/components/layout/dashboard-period-context";

const MONTHS_FULL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const YEARS = [2024, 2025, 2026, 2027] as const;

type ModalViewMode = "meses" | "anos";

type AppTopBarProps = {
  /** Ex.: "Luciano" → "Olá, Luciano" ao lado do perfil. */
  greetingName?: string;
  /** Enquanto o nome carrega, mostra "Olá," com um traço sutil. */
  greetingLoading?: boolean;
};

export function AppTopBar({ greetingName, greetingLoading }: AppTopBarProps) {
  const { period, setPeriod } = useDashboardPeriod();
  const labelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ModalViewMode>("meses");
  const [modalYear, setModalYear] = useState(period.year);

  const open = useCallback(() => {
    setModalYear(period.year);
    setViewMode("meses");
    setIsOpen(true);
  }, [period.year]);

  const close = useCallback(() => {
    setIsOpen(false);
    setViewMode("meses");
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const title = `${MONTHS_FULL[period.monthIndex]} ${period.year}`;

  function selectMonth(monthIndex: number) {
    setPeriod({ year: modalYear, monthIndex });
    close();
  }

  function selectYear(year: number) {
    setModalYear(year);
    setViewMode("meses");
  }

  const selectedInGrid =
    modalYear === period.year ? period.monthIndex : null;

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={open}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-left shadow-inner shadow-black/20 backdrop-blur-md transition-colors hover:border-[#10B981]/35 hover:bg-white/[0.09]"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? "finflow-date-sheet" : undefined}
        >
          <Calendar
            className="h-4 w-4 shrink-0 text-[#10B981]"
            strokeWidth={2}
            aria-hidden
          />
          <span className="truncate text-sm font-semibold text-white">
            {title}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-500"
            aria-hidden
          />
        </button>

        <div className="flex shrink-0 items-center gap-2.5">
          {greetingLoading ? (
            <span className="flex min-w-0 max-w-[11rem] items-center gap-1.5 text-right text-[13px] font-medium leading-snug text-zinc-200">
              <span className="shrink-0">Olá,</span>
              <span
                className="inline-block h-3.5 min-w-[4.5rem] flex-1 animate-pulse rounded-md bg-white/15"
                aria-hidden
              />
            </span>
          ) : greetingName ? (
            <span
              className="min-w-0 max-w-[7.5rem] truncate text-right text-[13px] font-medium leading-snug text-zinc-200 sm:max-w-[11rem]"
              title={`Olá, ${greetingName}`}
            >
              Olá, {greetingName}
            </span>
          ) : null}
          <Link
            href="/perfil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-[#10B981]"
            aria-label="Abrir perfil e configurações"
          >
            <User className="h-5 w-5 stroke-[1.75]" aria-hidden />
          </Link>
        </div>
      </header>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/75 backdrop-blur-md"
            aria-label="Fechar seleção de período"
            onClick={close}
          />

          <div
            id="finflow-date-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
            className="relative z-10 mx-auto flex max-h-[80vh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h2 id={labelId} className="text-base font-semibold text-white">
                {viewMode === "meses" ? "Escolha o mês" : "Escolha o ano"}
              </h2>
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]"
            >
              {viewMode === "meses" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setViewMode("anos")}
                    className="mb-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] py-3 text-lg font-bold text-white transition hover:border-[#10B981]/35 hover:text-[#10B981]"
                    aria-label="Trocar ano. Ano focado no seletor de meses"
                  >
                    {modalYear}
                    <ChevronDown
                      className="h-5 w-5 text-zinc-400"
                      aria-hidden
                    />
                  </button>

                  <div className="grid grid-cols-3 gap-2 pb-2">
                    {MONTHS_FULL.map((name, idx) => {
                      const selected = selectedInGrid === idx;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => selectMonth(idx)}
                          className={`rounded-2xl border px-2 py-3 text-center text-sm font-semibold transition ${
                            selected
                              ? "border-[#10B981]/45 bg-[#10B981]/18 text-[#10B981] shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                              : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setViewMode("meses")}
                    className="mb-4 flex w-full shrink-0 items-center gap-2 rounded-2xl border border-transparent px-2 py-2 text-sm font-medium text-zinc-400 transition hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Voltar aos meses
                  </button>

                  <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
                    {YEARS.map((y) => {
                      const selected = y === modalYear;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => selectYear(y)}
                          className={`rounded-2xl border px-3 py-3 text-center text-base font-bold tabular-nums transition ${
                            selected
                              ? "border-[#10B981]/45 bg-[#10B981]/18 text-[#10B981]"
                              : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {y}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
