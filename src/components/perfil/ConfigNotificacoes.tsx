"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Botao, Card } from "@/components/ui/base";
import { supabase } from "@/lib/supabase";

type Estado = "carregando" | "sem-suporte" | "instalar" | "bloqueado" | "desligado" | "ligado";

/** Chave pública VAPID (base64url) → bytes, como o pushManager.subscribe espera. */
function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function appInstalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function estadoAtual(): Promise<Estado> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // No iPhone, notificações só existem com o app instalado na tela de início.
    return ehIos() && !appInstalado() ? "instalar" : "sem-suporte";
  }
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao ? "ligado" : "desligado";
}

/** Liga/desliga avisos no aparelho atual (revisar, orçamento, fatura, contas fixas). */
export function ConfigNotificacoes() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    estadoAtual()
      .then((e) => {
        if (!cancelado) setEstado(e);
      })
      .catch(() => {
        if (!cancelado) setEstado("sem-suporte");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function ligar() {
    setOcupado(true);
    setErro(null);
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) throw new Error("Notificações ainda não configuradas no servidor.");
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const inscricao =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) }));
      const json = inscricao.toJSON();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("push_inscricoes").upsert(
        {
          user_id: auth.user?.id,
          endpoint: inscricao.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setEstado("ligado");
    } catch (e) {
      console.error(e);
      setErro(e instanceof Error ? e.message : "Não foi possível ativar as notificações.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await supabase.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível desativar.");
    } finally {
      setOcupado(false);
    }
  }

  const textos: Record<Estado, string> = {
    carregando: "Verificando…",
    "sem-suporte": "Este navegador não recebe notificações.",
    instalar: "No iPhone, instale o app primeiro: Safari → Compartilhar → Adicionar à Tela de Início, e abra por lá.",
    bloqueado: "As notificações foram bloqueadas. Libere em Ajustes → Notificações → FinFlow.",
    desligado: "Avisos de transações para revisar, orçamento, fatura e contas fixas.",
    ligado: "Ativadas neste aparelho.",
  };

  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
        {estado === "ligado" ? <Bell className="h-4 w-4 text-marca" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-texto">Notificações</p>
        <p className="text-xs text-texto-3">{erro ?? textos[estado]}</p>
      </div>
      {estado === "desligado" || estado === "ligado" ? (
        <Botao
          tamanho="sm"
          variante={estado === "ligado" ? "fantasma" : "primario"}
          disabled={ocupado}
          onClick={() => void (estado === "ligado" ? desligar() : ligar())}
        >
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {estado === "ligado" ? "Desativar" : "Ativar"}
        </Botao>
      ) : null}
    </Card>
  );
}
