import { BANCOS, type BancoInstituicao } from "@/data/bancos";

const IGNORAR = new Set(["outros", "visa", "mastercard"]);
const PALAVRAS_GENERICAS = new Set(["banco", "bank", "do", "da", "de", "s", "a", "sa", "investimentos"]);

function tokens(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !PALAVRAS_GENERICAS.has(t));
}

/** Palavra que identifica cada banco (ex.: "C6 Bank" → "c6", "Banco Inter" → "inter"). */
const CHAVES: { chave: string; banco: BancoInstituicao }[] = BANCOS.filter((b) => !IGNORAR.has(b.id))
  .map((b) => ({ chave: tokens(b.nome)[0] ?? "", banco: b }))
  .filter((x) => x.chave.length > 1);

/**
 * Tenta reconhecer a instituição a partir de um texto livre do banco
 * (ex.: "BANCO C6 S.A." → C6 Bank). Retorna null se não reconhecer.
 */
export function bancoPorTexto(...textos: (string | null | undefined)[]): BancoInstituicao | null {
  const ts = new Set(textos.flatMap((t) => (t ? tokens(t) : [])));
  for (const { chave, banco } of CHAVES) {
    if (ts.has(chave)) return banco;
  }
  return null;
}
