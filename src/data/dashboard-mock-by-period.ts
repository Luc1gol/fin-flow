import type { DashboardPeriod } from "@/types/dashboard-period";

export type CategoryDatum = {
  name: string;
  value: number;
  fill: string;
};

export type DashboardSnapshot = {
  balanceBRL: number;
  incomeBRL: number;
  expenseTotalBRL: number;
  categories: CategoryDatum[];
};

export type MonthOverMonthSummary = {
  /** Variação % dos gastos vs mês anterior (+ = gastou mais). */
  gastosDeltaPct: number;
  /** Variação % dos recebimentos vs mês anterior (+ = recebeu mais). */
  receitasDeltaPct: number;
};

export type RecentMovementKind =
  | "food"
  | "transport"
  | "leisure"
  | "housing"
  | "payroll";

export type RecentMovement = {
  id: string;
  title: string;
  when: string;
  amountBRL: number;
  kind: "expense" | "income";
  category: RecentMovementKind;
};

function pseudo(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function periodSeed(period: DashboardPeriod) {
  return Number(period.year) * 47 + Number(period.monthIndex) * 19 + 1000;
}

export function getDashboardSnapshot(
  period: DashboardPeriod,
): DashboardSnapshot {
  const seed = periodSeed(period);

  const housing = Math.round(1180 + pseudo(seed, 1) * 520);
  const food = Math.round(620 + pseudo(seed, 2) * 380);
  const leisure = Math.round(180 + pseudo(seed, 3) * 240);
  const expenseTotal = housing + food + leisure;
  const income = Math.round(4400 + pseudo(seed, 4) * 1400);

  const balance = Math.round(
    6900 + pseudo(seed, 5) * 4200 + income * 0.35 - expenseTotal * 0.55,
  );

  return {
    balanceBRL: balance,
    incomeBRL: income,
    expenseTotalBRL: expenseTotal,
    categories: [
      { name: "Moradia", value: housing, fill: "#3B82F6" },
      { name: "Alimentação", value: food, fill: "#EF4444" },
      { name: "Lazer", value: leisure, fill: "#71717A" },
    ],
  };
}

export function getMonthOverMonthSummary(
  period: DashboardPeriod,
): MonthOverMonthSummary {
  const seed = periodSeed(period);
  const gastosDeltaPct = Math.round((pseudo(seed, 10) - 0.5) * 22);
  const receitasDeltaPct = Math.round((pseudo(seed, 11) - 0.5) * 18);
  return { gastosDeltaPct, receitasDeltaPct };
}

export function getRecentMovementsMock(
  period: DashboardPeriod,
): RecentMovement[] {
  const seed = periodSeed(period);
  const pick = (i: number) => pseudo(seed, 20 + i);

  const base: RecentMovement[] = [
    {
      id: "m1",
      title: "iFood",
      when: "Hoje, 12:30",
      amountBRL: Math.round(47 + pick(0) * 35),
      kind: "expense",
      category: "food",
    },
    {
      id: "m2",
      title: "Uber",
      when: "Ontem, 18:45",
      amountBRL: Math.round(22 + pick(1) * 18),
      kind: "expense",
      category: "transport",
    },
    {
      id: "m3",
      title: "Netflix",
      when: "Seg, 09:00",
      amountBRL: 55.9,
      kind: "expense",
      category: "leisure",
    },
    {
      id: "m4",
      title: "Salário CLT",
      when: "01 deste mês",
      amountBRL: Math.round(5200 + pick(2) * 400),
      kind: "income",
      category: "payroll",
    },
  ];

  return base;
}

