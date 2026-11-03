"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Smartphone } from "lucide-react";
import { Botao, Card } from "@/components/ui/base";
import { supabase } from "@/lib/supabase";

/** Chave aleatória (base64url) que o atalho do iPhone manda para /api/atalho. */
function novaChave(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(texto: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        });
      }}
      className="flex w-full items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-left ring-1 ring-inset ring-white/[0.08]"
    >
      <span className="min-w-0 flex-1 break-all font-mono text-xs text-texto">{texto}</span>
      {copiado ? (
        <Check className="h-4 w-4 shrink-0 text-positivo" aria-label="Copiado" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-texto-3" aria-label="Copiar" />
      )}
    </button>
  );
}

/**
 * Compras com Apple Pay entram em Revisar na hora, pela automação "Transação" do app
 * Atalhos. A chave aparece uma vez só; no banco fica só o hash dela.
 */
export function ConfigAtalhoApplePay() {
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const endereco = typeof window === "undefined" ? "" : `${window.location.origin}/api/atalho`;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("atalho_chave_hash")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!cancelado) setConfigurado(Boolean(data?.atalho_chave_hash));
    })().catch(() => {
      if (!cancelado) setConfigurado(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function gerar() {
    setOcupado(true);
    setErro(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Entre de novo para continuar.");
      const nova = novaChave();
      const { error } = await supabase
        .from("profiles")
        .update({ atalho_chave_hash: await sha256(nova) })
        .eq("id", auth.user.id);
      if (error) throw error;
      setChave(nova);
      setConfigurado(true);
    } catch (e) {
      console.error(e);
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a chave.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-texto-2 ring-1 ring-inset ring-white/[0.08]">
          <Smartphone className={`h-4 w-4 ${configurado ? "text-marca" : ""}`} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-texto">Compras com Apple Pay na hora</p>
          <p className="text-xs text-texto-3">
            {erro ??
              (configurado == null
                ? "Verificando…"
                : configurado
                  ? "Atalho configurado. Gerar outra chave desliga a anterior."
                  : "Pagou com o iPhone ou o relógio, a compra aparece em Revisar em segundos.")}
          </p>
        </div>
        <Botao
          tamanho="sm"
          variante={configurado ? "fantasma" : "primario"}
          disabled={ocupado || configurado == null}
          onClick={() => void gerar()}
        >
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {configurado ? "Nova chave" : "Configurar"}
        </Botao>
      </div>

      {chave ? (
        <div className="space-y-3 border-t border-borda pt-3 text-sm text-texto-2">
          <p className="text-xs text-negativo">
            Copie a chave agora: ela não aparece de novo. Não compartilhe com ninguém.
          </p>
          <div className="space-y-1">
            <p className="text-xs text-texto-3">Endereço</p>
            <Copiar texto={endereco} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-texto-3">Chave (vai no cabeçalho como “Bearer” + espaço + chave)</p>
            <Copiar texto={`Bearer ${chave}`} />
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed">
            <li>
              Abra o app <b>Atalhos</b> → aba <b>Automação</b> → <b>+</b> → <b>Transação</b>.
            </li>
            <li>
              Marque seus cartões do Wallet, escolha <b>Executar Imediatamente</b> e toque em <b>Seguinte</b> →{" "}
              <b>Nova Automação em Branco</b>.
            </li>
            <li>
              Adicione a ação <b>Obter Conteúdo do URL</b> e cole o <b>Endereço</b>. Toque na seta para abrir as
              opções: <b>Método</b> = POST.
            </li>
            <li>
              Em <b>Cabeçalhos</b>, adicione: chave <b>Authorization</b>, valor = a <b>Chave</b> copiada acima.
            </li>
            <li>
              Em <b>Corpo da Requisição</b> = JSON, adicione três campos do tipo Texto: <b>valor</b> = variável{" "}
              <i>Quantia</i>, <b>loja</b> = <i>Comerciante</i>, <b>cartao</b> = <i>Cartão ou Passe</i>.
            </li>
            <li>
              Opcional: adicione <b>Mostrar Notificação</b> com o <i>Conteúdo do URL</i> para ver a confirmação.
            </li>
          </ol>
          <p className="text-xs text-texto-3">
            Cartão com “débito” no nome vai para a conta corrente; os outros, para o cartão de crédito do mesmo
            banco. Quando o banco mandar a mesma compra, ela não entra de novo.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
