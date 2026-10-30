/**
 * Transforma uma transação bruta do extrato em sugestão de lançamento.
 * O resultado é só uma sugestão: tudo passa pela tela "A revisar" antes de salvar.
 */

export type TipoMovimento = "receita" | "despesa" | "transferencia";

export type MeioMovimento = "pix" | "debito" | "credito" | "boleto" | "outro";

export type SugestaoLancamento = {
  tipo: TipoMovimento;
  meio: MeioMovimento;
  /** Descrição legível (ex.: "Pizzaria Rm", "Pix de Thiago Heringer..."). */
  descricao: string;
  /** Categoria sugerida, quando alguma regra reconhece o padrão. */
  categoria: string | null;
  /** Valor sempre positivo. */
  valor: number;
  /** Quando true, a transação não traz informação suficiente (ex.: Pix enviado sem destinatário). */
  precisaRevisao: boolean;
};

/** Regra aprendida: quando a chave da transação bate, usa estes valores. */
export type RegraUsuario = {
  padrao: string;
  tipo: TipoMovimento | null;
  categoria: string | null;
  descricao: string | null;
};

export type OpcoesClassificacao = {
  /** Nomes do próprio titular — Pix de/para esses nomes vira transferência entre contas. */
  nomesTitular: string[];
  /** Regras salvas pelo usuário, indexadas por `padrao` (ver `chaveTransacao`). */
  regras?: ReadonlyMap<string, RegraUsuario>;
  /** A transação é de uma conta de cartão de crédito (compras viram despesa no crédito). */
  cartaoCredito?: boolean;
};

/** Sufixo de parcela que acrescentamos à descrição, ex.: "Loja X (2/10)". */
const SUFIXO_PARCELA = /\s*\(\d{1,2}\/\d{1,2}\)$/;

/** Textos genéricos que não identificam a contraparte — não geram regra. */
const MEMOS_GENERICOS = /^(transf enviada pix|pix enviado|pagamento de fatura|fatura de cartao|pgto fat|debito de cartao|compra (no |com cartao )?debito)/;

/** Compra no débito sem nome do estabelecimento (como vem do Open Finance do C6). */
const COMPRA_DEBITO_GENERICA = /^(debito de cartao|compra (no |com cartao )?debito)/;

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "PIZZARIA RM" → "Pizzaria Rm"; mantém siglas curtas (ex.: "LTDA" vira "Ltda"). */
function capitalizar(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Compras no débito do C6 vêm em colunas fixas: estabelecimento (22), cidade (13), país (3).
 * Ex.: "PIZZARIA RM            SAO PAULO     BRA".
 */
function parseMemoCompraCartao(memo: string): { estabelecimento: string; cidade: string } | null {
  const m = /^(.{1,22}?)\s*(.{0,13}?)\s*(BRA|[A-Z]{3})$/.exec(memo.trim());
  if (!m || memo.trim().length < 30) return null;
  const estabelecimento = memo.slice(0, 22).trim();
  const cidade = memo.slice(22, 36).trim();
  if (!estabelecimento) return null;
  return { estabelecimento, cidade };
}

type Regra = { padrao: RegExp; categoria: string };

/** Regras de categoria por palavra-chave; evoluem para regras salvas pelo usuário. */
const REGRAS_CATEGORIA: Regra[] = [
  { padrao: /supermercad|mercear|mercado|atacad|pao de acucar|oxxo|minuto pa|hortifruti|conveniencia/, categoria: "Mercado" },
  { padrao: /pizzaria|restaurante|churrascaria|pastel|cafeteria|lanch|burger|sushi|japanese|sapporo|barraca|ifood|bar /, categoria: "Bares e restaurantes" },
  { padrao: /estacionament|park/, categoria: "Estacionamento" },
  { padrao: /posto|combust/, categoria: "Gasolina" },
  { padrao: /uber|99app|99 tecnologia/, categoria: "Transporte" },
  { padrao: /drogaria|farmacia|droga raia|pague menos/, categoria: "Farmácia" },
  { padrao: /barber|salao|cabeleir/, categoria: "Cuidados pessoais" },
  { padrao: /petz|racao|pet shop|cobasi/, categoria: "PET" },
  { padrao: /ingresso|cinema|show|fest/, categoria: "Lazer" },
  { padrao: /tributo|darf|imposto|iptu|ipva|das /, categoria: "Impostos" },
  { padrao: /telefonica|vivo|claro|tim |internet/, categoria: "Internet" },
  { padrao: /papelaria|printer|armarinho|shopping|amazon|mercadolivre|magalu/, categoria: "Compras" },
];

export function sugerirCategoria(texto: string): string | null {
  const t = normalizarTexto(texto);
  return REGRAS_CATEGORIA.find((r) => r.padrao.test(t))?.categoria ?? null;
}

/**
 * Identifica "quem" é a contraparte da transação, para aprender regras:
 * "pix-recebido:fulano", "pix-enviado:fulano" ou "compra:estabelecimento".
 * Retorna null quando o extrato não traz essa informação (ex.: "TRANSF ENVIADA PIX").
 */
export function chaveTransacao(memo: string, valorComSinal: number): string | null {
  const memoLimpo = memo.replace(/\s+/g, " ").trim();
  const recebido = /^pix recebido de (.+)$/i.exec(memoLimpo);
  if (recebido) return `pix-recebido:${normalizarTexto(recebido[1]!)}`;
  const enviado = /^pix enviado para (.+)$/i.exec(memoLimpo);
  if (enviado) return `pix-enviado:${normalizarTexto(enviado[1]!)}`;
  if (valorComSinal < 0) {
    const compra = parseMemoCompraCartao(memo);
    if (compra) return `compra:${normalizarTexto(compra.estabelecimento)}`;
  }
  const texto = normalizarTexto(memoLimpo.replace(SUFIXO_PARCELA, ""));
  if (!texto || MEMOS_GENERICOS.test(texto)) return null;
  return `desc:${texto}`;
}

export function classificarTransacao(
  memo: string,
  valorComSinal: number,
  opcoes: OpcoesClassificacao,
): SugestaoLancamento {
  const base = classificarSemRegras(memo, valorComSinal, opcoes);
  const chave = chaveTransacao(memo, valorComSinal);
  const regra = chave ? opcoes.regras?.get(chave) : undefined;
  if (!regra) return base;
  return {
    ...base,
    tipo: regra.tipo ?? base.tipo,
    categoria: regra.categoria ?? base.categoria,
    descricao: regra.descricao ?? base.descricao,
    precisaRevisao: false,
  };
}

function classificarSemRegras(
  memo: string,
  valorComSinal: number,
  opcoes: OpcoesClassificacao,
): SugestaoLancamento {
  const valor = Math.abs(valorComSinal);
  const entrada = valorComSinal > 0;
  const memoLimpo = memo.replace(/\s+/g, " ").trim();
  const memoNorm = normalizarTexto(memo);
  const titular = opcoes.nomesTitular.map(normalizarTexto).filter(Boolean);
  const ehTitular = (nome: string) => {
    const n = normalizarTexto(nome);
    return titular.some((t) => n === t || n.startsWith(t) || t.startsWith(n));
  };

  // Pagamento de fatura: o gasto já foi contado nas compras do cartão.
  if (/^fatura de cartao|pgto fat/.test(memoNorm)) {
    return { tipo: "transferencia", meio: "outro", descricao: "Pagamento de fatura do cartão", categoria: null, valor, precisaRevisao: false };
  }

  const pixRecebido = /^pix recebido de (.+)$/i.exec(memoLimpo);
  if (pixRecebido) {
    const nome = pixRecebido[1]!.trim();
    if (ehTitular(nome)) {
      return { tipo: "transferencia", meio: "pix", descricao: "Transferência entre minhas contas", categoria: null, valor, precisaRevisao: false };
    }
    return { tipo: "receita", meio: "pix", descricao: `Pix de ${capitalizar(nome)}`, categoria: null, valor, precisaRevisao: true };
  }

  const pixEnviado = /^pix enviado para (.+)$/i.exec(memoLimpo);
  if (pixEnviado) {
    const nome = pixEnviado[1]!.trim();
    if (ehTitular(nome)) {
      return { tipo: "transferencia", meio: "pix", descricao: "Transferência entre minhas contas", categoria: null, valor, precisaRevisao: false };
    }
    return { tipo: "despesa", meio: "pix", descricao: `Pix para ${capitalizar(nome)}`, categoria: sugerirCategoria(nome), valor, precisaRevisao: true };
  }

  if (opcoes.cartaoCredito) {
    if (/^pagamento de fatura/.test(memoNorm)) {
      return { tipo: "transferencia", meio: "credito", descricao: "Pagamento de fatura do cartão", categoria: null, valor, precisaRevisao: false };
    }
    if (!entrada) {
      const categoria = sugerirCategoria(memoLimpo.replace(SUFIXO_PARCELA, ""));
      return { tipo: "despesa", meio: "credito", descricao: capitalizar(memoLimpo), categoria, valor, precisaRevisao: categoria == null };
    }
    // Crédito na fatura que não é pagamento: estorno, cashback etc.
    return { tipo: "receita", meio: "credito", descricao: capitalizar(memoLimpo), categoria: null, valor, precisaRevisao: true };
  }

  // O OFX do C6 não informa o destinatário de Pix enviados.
  if (/^transf enviada pix/.test(memoNorm)) {
    return { tipo: "despesa", meio: "pix", descricao: "Pix enviado", categoria: null, valor, precisaRevisao: true };
  }

  if (COMPRA_DEBITO_GENERICA.test(memoNorm)) {
    return { tipo: "despesa", meio: "debito", descricao: "Compra no débito", categoria: null, valor, precisaRevisao: true };
  }

  if (/^pagto \d{2}\.\d{4}$/.test(memoNorm)) {
    return { tipo: "receita", meio: "outro", descricao: "Salário", categoria: "Salário", valor, precisaRevisao: false };
  }

  const compra = !entrada ? parseMemoCompraCartao(memo) : null;
  if (compra) {
    const descricao = capitalizar(compra.estabelecimento);
    const categoria = sugerirCategoria(compra.estabelecimento);
    return { tipo: "despesa", meio: "debito", descricao, categoria, valor, precisaRevisao: categoria == null };
  }

  const categoria = sugerirCategoria(memo);
  return {
    tipo: entrada ? "receita" : "despesa",
    meio: "outro",
    descricao: capitalizar(memoLimpo) || (entrada ? "Entrada" : "Saída"),
    categoria,
    valor,
    precisaRevisao: categoria == null,
  };
}
