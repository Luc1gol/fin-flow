/** Dados fictícios para pré-visualização das telas. */

export const MOCK_INCOME_BRL = 5000;
export const MOCK_EXPENSE_TOTAL_BRL = 2600;
export const MOCK_BALANCE_BRL = 9840;

export const MOCK_CATEGORY_SPENDING = [
  { name: "Moradia", value: 1500, fill: "#3B82F6" },
  { name: "Alimentação", value: 800, fill: "#EF4444" },
  { name: "Lazer", value: 300, fill: "#71717A" },
] as const;

export const MOCK_CARDS = [
  {
    id: "1",
    productName: "PLATINUM BLACK",
    maskedNumber: "**** **** **** 4201",
    holder: "MARIA SILVA",
    closingDay: 1,
    accent: "#10B981" as const,
    gradientFrom: "#1e1e22",
    gradientTo: "#2d2d35",
  },
  {
    id: "2",
    productName: "TRAVEL SILVER",
    maskedNumber: "**** **** **** 8812",
    holder: "MARIA SILVA",
    closingDay: 10,
    accent: "#F87171" as const,
    gradientFrom: "#3f3f46",
    gradientTo: "#52525b",
  },
] as const;

export const MOCK_CREDIT_USAGE = {
  percentUsed: 65,
  availableBRL: 4500,
  totalLimitBRL: 15000,
} as const;

export const MOCK_EVENT_TAGS_FOR_FILTER = [
  "#ViagemNatal",
  "#Reforma",
  "#Aniversário",
] as const;

export const MOCK_TAG_SPENDING_BRL: Record<string, number> = {
  "#ViagemNatal": 1840.5,
  "#Reforma": 3220.0,
  "#Aniversário": 680.25,
};
