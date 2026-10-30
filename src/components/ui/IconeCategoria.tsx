import { createElement } from "react";
import { ArrowLeftRight } from "lucide-react";
import { iconeDaCategoria } from "@/lib/icone-categoria";

/** Ícone da categoria (ou de transferência). */
export function IconeCategoria({
  categoria,
  transferencia = false,
  className = "h-4 w-4",
}: {
  categoria: string | null | undefined;
  transferencia?: boolean;
  className?: string;
}) {
  return createElement(transferencia ? ArrowLeftRight : iconeDaCategoria(categoria), {
    className,
    "aria-hidden": true,
  });
}
