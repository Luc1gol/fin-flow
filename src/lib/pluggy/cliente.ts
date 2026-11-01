/**
 * Cliente mínimo da API da Pluggy (https://docs.pluggy.ai).
 * Uso exclusivo no servidor: depende de PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET.
 */

const BASE_URL = "https://api.pluggy.ai";

export type PluggyConta = {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: string;
  number: string | null;
  name: string;
  marketingName: string | null;
  balance: number;
  itemId: string;
};

export type PluggyParte = { name?: string | null } | null;

export type PluggyTransacao = {
  id: string;
  description: string;
  descriptionRaw: string | null;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  status: "PENDING" | "POSTED";
  operationType?: string | null;
  paymentData?: {
    payer?: PluggyParte;
    receiver?: PluggyParte;
    paymentMethod?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
  } | null;
};

export function pluggyConfigurado(): boolean {
  return Boolean(
    process.env.PLUGGY_CLIENT_ID &&
      process.env.PLUGGY_CLIENT_SECRET &&
      process.env.PLUGGY_ITEM_IDS,
  );
}

/** Itens do Meu Pluggy (um por banco conectado), separados por vírgula. */
export function pluggyItemIds(): string[] {
  return (process.env.PLUGGY_ITEM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function chamar<T>(caminho: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${caminho}`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Pluggy ${caminho}: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function autenticar(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pluggy /auth: HTTP ${res.status}`);
  const { apiKey } = (await res.json()) as { apiKey: string };
  return apiKey;
}

export type PluggyItem = {
  id: string;
  status: string;
  lastUpdatedAt: string | null;
  nextAutoSyncAt: string | null;
  consentExpiresAt: string | null;
};

/** Quando o banco (Meu Pluggy) atualizou os dados pela última vez e quando atualiza de novo. */
export async function obterItem(apiKey: string, itemId: string): Promise<PluggyItem> {
  return chamar<PluggyItem>(`/items/${encodeURIComponent(itemId)}`, apiKey);
}

/**
 * Pede à Pluggy para buscar dados novos no banco agora (PATCH /items/{id}).
 * Pela documentação, conexões do Meu Pluggy podem recusar; quem chama trata o erro.
 */
export async function pedirAtualizacao(apiKey: string, itemId: string): Promise<PluggyItem> {
  const res = await fetch(`${BASE_URL}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pluggy PATCH /items: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as PluggyItem;
}

export async function listarContasDoItem(
  apiKey: string,
  itemId: string,
): Promise<PluggyConta[]> {
  const { results } = await chamar<{ results: PluggyConta[] }>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    apiKey,
  );
  return results;
}

/** Todas as transações da conta a partir de `desde` (yyyy-mm-dd), seguindo a paginação. */
export async function listarTransacoes(
  apiKey: string,
  accountId: string,
  desde: string,
): Promise<PluggyTransacao[]> {
  const todas: PluggyTransacao[] = [];
  let caminho: string | null =
    `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${desde}`;
  while (caminho) {
    const pagina: { results: PluggyTransacao[]; next: string | null } =
      await chamar(caminho, apiKey);
    todas.push(...pagina.results);
    caminho = pagina.next ? `/v2/transactions${pagina.next}` : null;
  }
  return todas;
}
