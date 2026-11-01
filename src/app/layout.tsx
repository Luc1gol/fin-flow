import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinFlow — Gestão financeira",
  description:
    "Controle receitas, despesas, cartões e metas com uma experiência mobile premium.",
  applicationName: "FinFlow",
  appleWebApp: {
    capable: true,
    title: "FinFlow",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Impede o zoom automático do Safari ao tocar em um campo. O gesto de pinça continua
  // funcionando no iPhone (o iOS ignora o limite para isso, por acessibilidade).
  maximumScale: 1,
  // Ocupa a tela toda no iPhone; as áreas seguras são tratadas com env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#0e0e10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh bg-fundo font-sans text-texto">
        {children}
      </body>
    </html>
  );
}
