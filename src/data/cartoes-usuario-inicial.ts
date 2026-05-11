import type { CartaoCreditoUsuario } from "@/types/cartoes";

/** Mock inicial — substituído por persistência / store no futuro. */
export const CARTOES_USUARIO_INICIAL: CartaoCreditoUsuario[] = [
  {
    id: "cart-nubank-mock",
    bancoId: "nubank",
    nomeCartao: "",
    final4: "3456",
    diaFechamento: 10,
    diaVencimento: 17,
    valorFatura: 890,
  },
  {
    id: "cart-itau-mock",
    bancoId: "itau",
    nomeCartao: "",
    final4: "9876",
    diaFechamento: 5,
    diaVencimento: 12,
    valorFatura: 2450.75,
  },
];
