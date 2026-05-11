import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { PublicLoginGate } from "@/components/auth/PublicLoginGate";

export const metadata: Metadata = {
  title: "Entrar — Fin-Flow",
  description: "Acesse sua conta Fin-Flow.",
};

export default function LoginPage() {
  return (
    <PublicLoginGate>
      <LoginScreen />
    </PublicLoginGate>
  );
}
