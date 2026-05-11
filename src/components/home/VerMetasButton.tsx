"use client";

type VerMetasButtonProps = {
  className?: string;
};

export function VerMetasButton({ className }: VerMetasButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        alert("Acompanhamento de metas estará disponível em breve!")
      }
    >
      Ver metas
    </button>
  );
}
