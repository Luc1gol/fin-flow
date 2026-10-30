import {
  Baby,
  Briefcase,
  Car,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Film,
  Fuel,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  ParkingCircle,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tv,
  Users,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { normalizarTexto } from "@/lib/importacao/classificar";

/** Palavra-chave no nome da categoria → ícone. A primeira que bater vence. */
const MAPA: [RegExp, LucideIcon][] = [
  [/mercado|supermerc|feira/, ShoppingCart],
  [/restaurante|bar|fast ?food|lanche|alimenta|doce/, UtensilsCrossed],
  [/cafe/, Coffee],
  [/gasolina|combust/, Fuel],
  [/estacionamento/, ParkingCircle],
  [/transporte|uber|deslocamento|carro/, Car],
  [/farmacia|remedio/, Pill],
  [/saude|academia|medic/, HeartPulse],
  [/academia/, Dumbbell],
  [/pet/, Dog],
  [/beleza|cuidado|cosmetic|cabel/, Scissors],
  [/roupa|vestuario|calcado|acess/, Shirt],
  [/compra|shopping|amazon|presente/, ShoppingBag],
  [/streaming|netflix|spotify|web app/, Tv],
  [/internet|telefone|celular/, Wifi],
  [/casa|moradia|apartamento|aluguel|decora|limpeza/, Home],
  [/educa|curso|escola/, GraduationCap],
  [/crianca|filho/, Baby],
  [/famil/, Users],
  [/viagem/, Plane],
  [/lazer|divers|poker|cinema|show/, Film],
  [/imposto|das|tributo|taxa/, Receipt],
  [/salario|trabalho|e-it|extra/, Briefcase],
  [/investimento/, Landmark],
  [/emprestimo|dinheiro/, CircleDollarSign],
  [/fatura|cartao/, CreditCard],
];

export function iconeDaCategoria(categoria: string | null | undefined): LucideIcon {
  const n = normalizarTexto(categoria ?? "");
  if (!n) return Sparkles;
  return MAPA.find(([re]) => re.test(n))?.[1] ?? Sparkles;
}

/** Paleta para categorias em gráficos (ordem fixa, legível no fundo escuro). */
export const CORES_CATEGORIA = ["#10b981", "#60a5fa", "#f97316", "#a78bfa", "#f472b6", "#71717a"] as const;
