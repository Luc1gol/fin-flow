"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, HandCoins, Loader2, RotateCcw, Users } from "lucide-react";
import { Botao, Card, Secao, Valor } from "@/components/ui/base";
import { formatBRL } from "@/lib/format-currency";
import {
  agruparPorPessoa,
  carregarAReceber,
  desfazerRecebido,
  hojeIsoLocal,
  marcarRecebidos,
  type ItemDividido,
  type PainelAReceber,
  type PessoaAReceber,
} from "@/lib/dados/divididos";

function dataCurta(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function inicial(nome: string) {
  return nome.trim().charAt(0).toUpperCase() || "?";
}

function CartaoPessoa({
  grupo,
  hoje,
  ocupado,
  onRecebi,
}: {
  grupo: PessoaAReceber;
  hoje: string;
  /** ids sendo salvos agora. */
  ocupado: Set<string>;
  onRecebi: (ids: string[]) => void;
}) {
  const [confirmarTudo, setConfirmarTudo] = useState(false);
  const idsAtuais = grupo.itens.filter((i) => i.data <= hoje).map((i) => i.id);
  const salvandoAlgum = grupo.itens.some((i) => ocupado.has(i.id));

  return (
    <Card className="px-3 pb-1 pt-3">
      <div className="flex items-center gap-3">
        <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {inicial(grupo.pessoa)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-texto">{grupo.pessoa}</span>
          <span className="block text-xs text-texto-3">
            {grupo.totalAtual > 0 ? (
              <>
                te deve <Valor valor={grupo.totalAtual} className="font-semibold text-positivo" />
              </>
            ) : (
              "nada vencido ainda"
            )}
            {grupo.totalFuturo > 0 ? ` · + ${formatBRL(grupo.totalFuturo)} a vencer` : ""}
          </span>
        </span>
        {idsAtuais.length > 1 ? (
          <Botao
            tamanho="sm"
            variante={confirmarTudo ? "primario" : "secundario"}
            disabled={salvandoAlgum}
            onClick={() => {
              if (!confirmarTudo) return setConfirmarTudo(true);
              setConfirmarTudo(false);
              onRecebi(idsAtuais);
            }}
            onBlur={() => setConfirmarTudo(false)}
          >
            {confirmarTudo ? `Confirmar ${formatBRL(grupo.totalAtual)}` : "Recebi tudo"}
          </Botao>
        ) : null}
      </div>
      <ul className="mt-2 divide-y divide-borda border-t border-borda">
        {grupo.itens.map((item) => {
          const futuro = item.data > hoje;
          const salvando = ocupado.has(item.id);
          return (
            <li key={item.id} className={`flex items-center gap-3 py-2.5 ${futuro ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-texto">{item.descricao}</span>
                <span className="block truncate text-xs text-texto-3">
                  {futuro ? `vence ${dataCurta(item.data)}` : dataCurta(item.data)} · despesa de {formatBRL(item.valor)}
                </span>
              </span>
              <Valor valor={item.valorAReceber} className="shrink-0 text-sm text-texto" />
              <Botao
                tamanho="sm"
                variante="fantasma"
                className="shrink-0 !px-2 text-positivo"
                disabled={salvando}
                onClick={() => onRecebi([item.id])}
                aria-label={`Marcar ${item.descricao} como recebido`}
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Recebi
              </Botao>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function AReceberScreen() {
  const [painel, setPainel] = useState<PainelAReceber | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Set<string>>(() => new Set());
  const [mostrarRecebidos, setMostrarRecebidos] = useState(false);
  const [hoje] = useState(() => hojeIsoLocal());

  useEffect(() => {
    let cancelado = false;
    carregarAReceber()
      .then((p) => {
        if (!cancelado) {
          setPainel(p);
          setErro(null);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setErro("Não foi possível carregar o que você tem a receber.");
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const carregando = painel == null && erro == null;

  const { grupos, totalAtual, totalFuturo } = useMemo(() => {
    const grupos = agruparPorPessoa(painel?.pendentes ?? [], hoje);
    return {
      grupos,
      totalAtual: grupos.reduce((s, g) => s + g.totalAtual, 0),
      totalFuturo: grupos.reduce((s, g) => s + g.totalFuturo, 0),
    };
  }, [painel, hoje]);

  async function executar(ids: string[], acao: () => Promise<void>) {
    setOcupado((atual) => new Set([...atual, ...ids]));
    setErro(null);
    try {
      await acao();
      setVersao((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setOcupado((atual) => {
        const novo = new Set(atual);
        for (const id of ids) novo.delete(id);
        return novo;
      });
    }
  }

  const recebidos = painel?.recebidos ?? [];

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-center gap-2">
        <Link
          href="/inicio"
          aria-label="Voltar"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-texto">A receber</h1>
          <p className="text-xs text-texto-2">Gastos que você dividiu com alguém</p>
        </div>
      </header>

      {erro ? <p className="rounded-xl bg-negativo/10 px-3 py-2.5 text-sm text-negativo">{erro}</p> : null}

      {carregando ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : painel ? (
        <>
          {grupos.length > 0 ? (
            <Card className="p-4">
              <p className="text-xs text-texto-3">Te devem hoje</p>
              <p className="mt-1 text-[22px] font-semibold text-texto">
                <Valor valor={totalAtual} />
              </p>
              <p className="mt-1 text-xs text-texto-2">
                {grupos.length} {grupos.length === 1 ? "pessoa" : "pessoas"}
                {totalFuturo > 0 ? ` · + ${formatBRL(totalFuturo)} em parcelas que ainda vão vencer` : ""}
              </p>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="vidro-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <HandCoins className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-texto">Ninguém te deve nada</p>
                  <p className="mt-0.5 text-xs text-texto-2">
                    Pagou algo por alguém ou dividiu uma conta? Ao lançar a despesa, preencha “Dividir com” e ela aparece
                    aqui até a pessoa te pagar.
                  </p>
                  <Link
                    href="/lancar"
                    className="vidro-marca mt-3 inline-flex h-8 items-center rounded-xl px-3 text-xs font-semibold transition hover:brightness-110 active:scale-[0.98]"
                  >
                    Lançar despesa
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {grupos.length > 0 ? (
            <Secao titulo="Por pessoa">
              <div className="flex flex-col gap-3">
                {grupos.map((g) => (
                  <CartaoPessoa
                    key={g.pessoa}
                    grupo={g}
                    hoje={hoje}
                    ocupado={ocupado}
                    onRecebi={(ids) => void executar(ids, () => marcarRecebidos(ids, hoje))}
                  />
                ))}
              </div>
            </Secao>
          ) : null}

          {recebidos.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => setMostrarRecebidos((v) => !v)}
                aria-expanded={mostrarRecebidos}
                className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-texto"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-texto-3" aria-hidden />
                  Recebidos
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-texto-3 transition-transform ${mostrarRecebidos ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {mostrarRecebidos ? (
                <Card className="divide-y divide-borda px-3">
                  {recebidos.map((item: ItemDividido) => (
                    <div key={item.id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-texto">{item.descricao}</span>
                        <span className="block truncate text-xs text-texto-3">
                          {item.pessoa} · recebido em {dataCurta(item.recebidoEm!)}
                        </span>
                      </span>
                      <Valor valor={item.valorAReceber} className="shrink-0 text-sm text-texto-2" />
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        className="shrink-0 !px-2"
                        disabled={ocupado.has(item.id)}
                        onClick={() => void executar([item.id], () => desfazerRecebido(item.id))}
                        aria-label={`Desfazer recebimento de ${item.descricao}`}
                        title="Voltar para pendente"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      </Botao>
                    </div>
                  ))}
                </Card>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
