/** Opção fixa no seletor de origem — valor da coluna `conta_cartao`. */
export const CONTA_CORRENTE_LABEL = "Conta Corrente";

export type CartaoUsuarioOrigem = { id: string; nome: string; banco: string };

/** Valor técnico no `<select>` — persiste como `Cartão {nome}` no banco. */
export function valorSelectCartaoId(id: string): string {
  return `cartao:${id}`;
}

/** Texto gravado na coluna `conta_cartao` quando o lançamento usa este cartão (apelido cadastrado). */
export function labelContaCartaoPersistido(nomeApelido: string): string {
  const nome = (nomeApelido ?? "").trim() || "Cartão";
  return `Cartão ${nome}`;
}

/** Converte estado do formulário para o texto salvo em `conta_cartao`. */
export function contaCartaoParaColunaDb(
  state: string,
  cartoes: CartaoUsuarioOrigem[],
): string {
  const c = /^cartao:/.test(state)
    ? cartoes.find((x) => x.id === state.slice("cartao:".length))
    : undefined;
  if (c) {
    return labelContaCartaoPersistido(c.nome);
  }
  return state;
}

/** Reconstrói o `value` do `<select>` a partir do texto salvo no banco. */
export function contaCartaoDbParaSelectValue(
  contaCartaoSalva: string | null | undefined,
  cartoes: CartaoUsuarioOrigem[],
): string {
  const t = String(contaCartaoSalva ?? "").trim();
  if (!t || t === CONTA_CORRENTE_LABEL) return CONTA_CORRENTE_LABEL;
  const pref = "Cartão ";
  if (t.startsWith(pref)) {
    const apelido = t.slice(pref.length).trim().toLowerCase();
    const match = cartoes.find(
      (c) => (c.nome ?? "").trim().toLowerCase() === apelido,
    );
    if (match) return valorSelectCartaoId(match.id);
  }
  return CONTA_CORRENTE_LABEL;
}
