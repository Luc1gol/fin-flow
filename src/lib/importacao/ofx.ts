/**
 * Leitor de extratos OFX (versão 1.x, SGML), como o exportado pelo C6 Bank.
 *
 * O formato SGML não fecha todas as tags (ex.: `<TRNAMT>-10.0` sem `</TRNAMT>`),
 * então lemos cada campo até o próximo `<`, em vez de usar um parser XML.
 */

export type OfxTransacao = {
  /** Identificador único da transação no banco — usado para não importar duas vezes. */
  fitid: string;
  /** Data local yyyy-mm-dd. */
  data: string;
  /** Valor com sinal: negativo = saída, positivo = entrada. */
  valor: number;
  /** DEBIT, CREDIT, etc. */
  tipoOfx: string;
  memo: string;
};

export type OfxExtrato = {
  bancoNome: string | null;
  /** Código COMPE do banco (ex.: 336 = C6). */
  bancoCodigo: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: string | null;
  /** Saldo informado pelo banco (LEDGERBAL), quando presente. */
  saldo: { valor: number; data: string } | null;
  transacoes: OfxTransacao[];
};

function campo(bloco: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/** `20260930170810[-3:BRT]` → `2026-09-30` (a data já vem no fuso do banco). */
export function dataOfxParaIso(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Aceita `-10.0` e também `-10,00` (alguns bancos usam vírgula). */
function valorOfx(raw: string): number {
  const normalizado = raw.includes(",") && !raw.includes(".")
    ? raw.replace(",", ".")
    : raw;
  return Number.parseFloat(normalizado);
}

/**
 * Decodifica os bytes do arquivo. O C6 declara `CHARSET: 1252` mas grava em UTF-8,
 * então tentamos UTF-8 estrito primeiro e caímos para Windows-1252 se falhar.
 */
export function decodificarArquivoOfx(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseOfx(texto: string): OfxExtrato {
  if (!/<OFX>/i.test(texto)) {
    throw new Error("Arquivo não parece ser um OFX válido.");
  }

  const transacoes: OfxTransacao[] = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  for (const bloco of blocos) {
    const fitid = campo(bloco, "FITID");
    const dtPosted = campo(bloco, "DTPOSTED");
    const trnAmt = campo(bloco, "TRNAMT");
    const data = dtPosted ? dataOfxParaIso(dtPosted) : null;
    const valor = trnAmt ? valorOfx(trnAmt) : Number.NaN;
    if (!fitid || !data || !Number.isFinite(valor)) continue;
    transacoes.push({
      fitid,
      data,
      valor,
      tipoOfx: campo(bloco, "TRNTYPE") ?? "",
      memo: campo(bloco, "MEMO") ?? campo(bloco, "NAME") ?? "",
    });
  }

  const ledger = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(texto)?.[1];
  const saldoValor = ledger ? campo(ledger, "BALAMT") : null;
  const saldoData = ledger ? campo(ledger, "DTASOF") : null;

  return {
    bancoNome: campo(texto, "ORG"),
    bancoCodigo: campo(texto, "BANKID") ?? campo(texto, "FID"),
    agencia: campo(texto, "BRANCHID"),
    conta: campo(texto, "ACCTID"),
    tipoConta: campo(texto, "ACCTTYPE"),
    saldo:
      saldoValor && saldoData
        ? { valor: valorOfx(saldoValor), data: dataOfxParaIso(saldoData) ?? saldoData }
        : null,
    transacoes,
  };
}
