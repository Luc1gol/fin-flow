/**
 * Agregações puras da tela Análise. Recebem lançamentos já normalizados
 * (só receita/despesa, valor positivo) e o "agora" (`ref`) da busca.
 */
import { normalizarTexto } from "@/lib/importacao/classificar";
import type {
  ContaCartaoAnalise,
  FaturaAnalise,
  FatiaGasto,
  LancamentoRelatorioRow,
  MeioAnalise,
  PontoFluxo,
  VisaoComposicao,
  MovimentoInvestimento,
  ResumoInvestimentos,
} from "@/types/relatorios";
import {
  DIAS_SEMANA,
  DIAS_SEMANA_LONGOS,
  chaveMesDeslocado,
  dataDoIso,
  diasNoIntervalo,
  isoDaData,
  mesCurtoDaChave,
  somarTotais,
  variacaoPct,
  type Intervalo,
} from "@/components/relatorios/dados";

type L = LancamentoRelatorioRow;

export const SEM_CATEGORIA = "Sem categoria";
export const SEM_BANCO = "Lançados à mão";

/** Paleta das fatias (9 posições: 8 grupos + "Outros" cinza). */
export const PALETA = [
  "#4f8cff", "#a78bfa", "#f97316", "#f472b6", "#facc15",
  "#22d3ee", "#a3e635", "#e879f9", "#71717a",
] as const;
const COR_OUTROS = "#71717a";

export const CORES_MEIO: Record<MeioAnalise, string> = {
  Crédito: "#4f8cff",
  Débito: "#a78bfa",
  Pix: "#22d3ee",
  Dinheiro: "#facc15",
  Outros: "#71717a",
};

const SUFIXO_PARCELA = /\s*\((\d{1,3})\s*\/\s*(\d{1,3})\)\s*$/;

/* ------------------------------------------------------------------ */
/* Classificação                                                       */
/* ------------------------------------------------------------------ */

export const ehDespesa = (r: L) => r.tipo === "despesa";
export const ehReceita = (r: L) => r.tipo === "receita";

/** Compra no crédito: meio "Crédito" ou origem "Cartão …". */
export function ehCredito(r: L): boolean {
  const meio = normalizarTexto(r.meio_pagamento ?? "");
  if (meio === "credito") return true;
  return (r.conta_cartao ?? "").startsWith("Cartão ");
}

export function meioDoLancamento(r: L): MeioAnalise {
  if (ehCredito(r)) return "Crédito";
  const meio = normalizarTexto(r.meio_pagamento ?? "");
  if (meio === "debito") return "Débito";
  if (meio === "pix") return "Pix";
  if (meio === "dinheiro") return "Dinheiro";
  return "Outros";
}

/** "Loja (3/10)" → { base: "Loja", n: 3, total: 10 }. */
export function parcelaDe(descricao: string | null): { base: string; n: number; total: number } | null {
  const d = (descricao ?? "").trim();
  const m = SUFIXO_PARCELA.exec(d);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (!(n >= 1 && total >= 2 && n <= total)) return null;
  return { base: d.replace(SUFIXO_PARCELA, "").trim() || "Compra parcelada", n, total };
}

/** Descrição sem o sufixo de parcela. */
export function nomeBase(descricao: string | null): string {
  return (descricao ?? "").trim().replace(SUFIXO_PARCELA, "").trim();
}

function chaveNome(descricao: string | null): string {
  return normalizarTexto(nomeBase(descricao));
}

/** Grupos de um lançamento numa visão (tag pode ter vários). */
export function gruposDe(r: L, visao: VisaoComposicao): string[] {
  if (visao === "categoria") return [r.tag?.trim() || SEM_CATEGORIA];
  if (visao === "meio") return [meioDoLancamento(r)];
  if (visao === "banco") return [r.banco ?? SEM_BANCO];
  return [...new Set(r.tags_extras.map((t) => String(t ?? "").trim()).filter(Boolean))];
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

function maisFrequente(valores: string[]): string {
  const cont = new Map<string, number>();
  for (const v of valores) cont.set(v, (cont.get(v) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */

export type ResumoGeral = {
  entradas: number;
  saidas: number;
  resultado: number;
  varEntradas: number | null;
  varSaidas: number | null;
  /** Variação do resultado em R$ (atual − anterior). */
  difResultado: number;
  resultadoAnterior: number;
  /** resultado / entradas (0–1); null sem entradas. */
  taxaPoupanca: number | null;
  taxaPoupancaAnterior: number | null;
  mediaDiaria: number;
  varMediaDiaria: number | null;
  qtdDespesas: number;
  semFluxo: boolean;
};

export function resumoGeral(atuais: L[], anteriores: L[], atual: Intervalo, anterior: Intervalo): ResumoGeral {
  const t = somarTotais(atuais);
  const a = somarTotais(anteriores);
  const resultado = t.entradas - t.saidas;
  const resultadoAnterior = a.entradas - a.saidas;
  const mediaDiaria = t.saidas / diasNoIntervalo(atual);
  const mediaAnt = a.saidas / diasNoIntervalo(anterior);
  return {
    entradas: t.entradas,
    saidas: t.saidas,
    resultado,
    varEntradas: variacaoPct(t.entradas, a.entradas),
    varSaidas: variacaoPct(t.saidas, a.saidas),
    difResultado: resultado - resultadoAnterior,
    resultadoAnterior,
    taxaPoupanca: t.entradas > 0 ? resultado / t.entradas : null,
    taxaPoupancaAnterior: a.entradas > 0 ? resultadoAnterior / a.entradas : null,
    mediaDiaria,
    varMediaDiaria: variacaoPct(mediaDiaria, mediaAnt),
    qtdDespesas: atuais.filter(ehDespesa).length,
    semFluxo: atuais.length === 0,
  };
}

/** Entradas vs saídas dos últimos 6 meses (o atual é parcial, só até hoje). */
export function ultimosSeisMeses(lancs: L[], ref: Date): PontoFluxo[] {
  const hoje = isoDaData(ref);
  const chaves = [-5, -4, -3, -2, -1, 0].map((d) => chaveMesDeslocado(ref, d));
  const idx = new Map(chaves.map((c, i) => [c, i]));
  const pontos: PontoFluxo[] = chaves.map((c, i) => ({
    label: mesCurtoDaChave(c),
    entradas: 0,
    saidas: 0,
    parcial: i === chaves.length - 1,
  }));
  for (const r of lancs) {
    if (r.data > hoje) continue;
    const i = idx.get(r.data.slice(0, 7));
    if (i == null) continue;
    if (ehReceita(r)) pontos[i]!.entradas += r.valor;
    else if (ehDespesa(r)) pontos[i]!.saidas += r.valor;
  }
  return pontos;
}

/* ------------------------------------------------------------------ */
/* Para onde vai                                                       */
/* ------------------------------------------------------------------ */

function somaPorGrupo(rows: L[], visao: VisaoComposicao) {
  const soma = new Map<string, { valor: number; qtd: number }>();
  for (const r of rows) {
    if (!ehDespesa(r)) continue;
    for (const g of gruposDe(r, visao)) {
      const atual = soma.get(g) ?? { valor: 0, qtd: 0 };
      atual.valor += r.valor;
      atual.qtd += 1;
      soma.set(g, atual);
    }
  }
  return soma;
}

/**
 * Gastos agrupados com %, cor e variação vs período anterior. Mantém os `max`
 * maiores e junta o resto em "Outros". Base do %: total de despesas (em tags, a soma das tags).
 */
export function composicao(
  atuais: L[],
  anteriores: L[],
  visao: VisaoComposicao,
  max = 8,
): { fatias: FatiaGasto[]; total: number } {
  const soma = somaPorGrupo(atuais, visao);
  const somaAnt = somaPorGrupo(anteriores, visao);
  const grupos = [...soma.entries()]
    .map(([nome, s]) => ({ nome, ...s }))
    .sort((a, b) => b.valor - a.valor);
  const total = grupos.reduce((acc, g) => acc + g.valor, 0);
  if (total <= 0) return { fatias: [], total: 0 };

  const principais = grupos.slice(0, max);
  const resto = grupos.slice(max);
  const fatias: FatiaGasto[] = principais.map((g, i) => ({
    nome: g.nome,
    valor: g.valor,
    qtd: g.qtd,
    pct: (g.valor / total) * 100,
    cor: visao === "meio" ? CORES_MEIO[g.nome as MeioAnalise] ?? COR_OUTROS : PALETA[i] ?? COR_OUTROS,
    variacao: variacaoPct(g.valor, somaAnt.get(g.nome)?.valor ?? 0),
    membros: [g.nome],
  }));
  if (resto.length) {
    const valor = resto.reduce((acc, g) => acc + g.valor, 0);
    const anterior = resto.reduce((acc, g) => acc + (somaAnt.get(g.nome)?.valor ?? 0), 0);
    fatias.push({
      nome: "Outros",
      valor,
      qtd: resto.reduce((acc, g) => acc + g.qtd, 0),
      pct: (valor / total) * 100,
      cor: COR_OUTROS,
      variacao: variacaoPct(valor, anterior),
      membros: resto.map((g) => g.nome),
    });
  }
  return { fatias, total };
}

function pertence(r: L, visao: VisaoComposicao, membros: Set<string>): boolean {
  return gruposDe(r, visao).some((g) => membros.has(g));
}

/** Despesas de um grupo no período, mais recentes primeiro. */
export function lancamentosDoGrupo(atuais: L[], visao: VisaoComposicao, membros: string[]): L[] {
  const set = new Set(membros);
  return atuais
    .filter((r) => ehDespesa(r) && pertence(r, visao, set))
    .sort((a, b) => (a.data === b.data ? b.valor - a.valor : a.data < b.data ? 1 : -1));
}

/** Gasto mensal de um grupo nos últimos 6 meses (o atual até hoje). */
export function tendenciaDoGrupo(
  lancs: L[],
  ref: Date,
  visao: VisaoComposicao,
  membros: string[],
): { label: string; valor: number; parcial: boolean }[] {
  const set = new Set(membros);
  const hoje = isoDaData(ref);
  const chaves = [-5, -4, -3, -2, -1, 0].map((d) => chaveMesDeslocado(ref, d));
  const idx = new Map(chaves.map((c, i) => [c, i]));
  const pontos = chaves.map((c, i) => ({ label: mesCurtoDaChave(c), valor: 0, parcial: i === 5 }));
  for (const r of lancs) {
    if (!ehDespesa(r) || r.data > hoje) continue;
    const i = idx.get(r.data.slice(0, 7));
    if (i == null || !pertence(r, visao, set)) continue;
    pontos[i]!.valor += r.valor;
  }
  return pontos;
}

/* ------------------------------------------------------------------ */
/* Cartão                                                              */
/* ------------------------------------------------------------------ */

export type FaturaMes = {
  chave: string;
  label: string;
  total: number;
  pago: number;
  /** Vence hoje ou depois. */
  aberta: boolean;
};

/** Faturas somadas por mês de vencimento (todas as contas), as últimas 12. */
export function faturasPorMes(faturas: FaturaAnalise[], ref: Date): FaturaMes[] {
  const hoje = isoDaData(ref);
  const mapa = new Map<string, FaturaMes>();
  for (const f of faturas) {
    if (!f.vencimento) continue;
    const chave = f.vencimento.slice(0, 7);
    const m = mapa.get(chave) ?? {
      chave,
      label: mesCurtoDaChave(chave),
      total: 0,
      pago: 0,
      aberta: false,
    };
    m.total += f.valorTotal;
    m.pago += f.valorPago;
    if (f.vencimento >= hoje) m.aberta = true;
    mapa.set(chave, m);
  }
  return [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave)).slice(-12);
}

export type ResumoCartoes = {
  /** Soma do que se deve hoje nos cartões (saldo do banco). */
  devido: number;
  limite: number;
  disponivel: number;
  temLimite: boolean;
  proximoVencimento: string | null;
};

export function resumoCartoes(contas: ContaCartaoAnalise[], ref: Date): ResumoCartoes {
  const hoje = isoDaData(ref);
  let devido = 0;
  let limite = 0;
  let disponivel = 0;
  let proximo: string | null = null;
  for (const c of contas) {
    devido += Math.max(0, c.saldo ?? 0);
    if (c.limite != null && c.limite > 0) {
      limite += c.limite;
      disponivel += c.limiteDisponivel ?? Math.max(0, c.limite - Math.max(0, c.saldo ?? 0));
    }
    if (c.faturaVencimento && c.faturaVencimento >= hoje && (!proximo || c.faturaVencimento < proximo)) {
      proximo = c.faturaVencimento;
    }
  }
  return { devido, limite, disponivel, temLimite: limite > 0, proximoVencimento: proximo };
}

export type Parcelamento = {
  chave: string;
  nome: string;
  contaCartao: string | null;
  categoria: string | null;
  /** Parcelas já lançadas até hoje. */
  pagas: number;
  total: number;
  valorParcela: number;
  /** Quanto ainda falta pagar (parcelas restantes × valor). */
  falta: number;
  proximaData: string | null;
};

type ParcelaLinha = { r: L; n: number; total: number; base: string };

function gruposDeParcelas(lancs: L[]): ParcelaLinha[][] {
  const grupos = new Map<string, ParcelaLinha[]>();
  for (const r of lancs) {
    if (!ehDespesa(r) || !ehCredito(r)) continue;
    const p = parcelaDe(r.descricao);
    if (!p) continue;
    const k = `${normalizarTexto(p.base)}|${p.total}|${r.conta_cartao ?? ""}`;
    const lista = grupos.get(k) ?? [];
    lista.push({ r, ...p });
    grupos.set(k, lista);
  }
  // Mesma loja e mesmo nº de parcelas com parcelas repetidas = compras diferentes: separa pelo valor.
  const saida: ParcelaLinha[][] = [];
  for (const lista of grupos.values()) {
    const ns = new Set(lista.map((x) => x.n));
    if (ns.size === lista.length) {
      saida.push(lista);
      continue;
    }
    const porValor = new Map<number, ParcelaLinha[]>();
    for (const x of lista) {
      const k = Math.round(x.r.valor);
      porValor.set(k, [...(porValor.get(k) ?? []), x]);
    }
    saida.push(...porValor.values());
  }
  return saida;
}

function diasAtras(ref: Date, dias: number): string {
  return isoDaData(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dias, 12));
}

function mesDaData(iso: string, delta: number): string {
  const d = dataDoIso(iso);
  return isoDaData(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12)).slice(0, 7);
}

/**
 * Compras parceladas ainda em andamento. Usa as parcelas lançadas (inclusive futuras)
 * e projeta as que faltam a partir da última conhecida.
 */
export function parcelamentosAtivos(lancs: L[], ref: Date): Parcelamento[] {
  const hoje = isoDaData(ref);
  const limiteVelho = diasAtras(ref, 45);
  const out: Parcelamento[] = [];
  for (const grupo of gruposDeParcelas(lancs)) {
    const ordenado = [...grupo].sort((a, b) => a.n - b.n);
    const ultimo = ordenado[ordenado.length - 1]!;
    const total = ultimo.total;
    const passadas = ordenado.filter((x) => x.r.data <= hoje);
    const futuras = ordenado.filter((x) => x.r.data > hoje);
    const pagas = passadas.length ? Math.max(...passadas.map((x) => x.n)) : Math.max(0, ordenado[0]!.n - 1);
    const restantes = total - pagas;
    if (restantes <= 0) continue;
    // Sem parcela futura e a última é antiga: provavelmente já terminou (ou parou de sincronizar).
    if (!futuras.length && (passadas[passadas.length - 1]?.r.data ?? "") < limiteVelho) continue;
    const valorParcela = mediana(ordenado.map((x) => x.r.valor));
    out.push({
      chave: `${normalizarTexto(ultimo.base)}|${total}|${ultimo.r.conta_cartao ?? ""}|${ordenado[0]!.r.id}`,
      nome: ultimo.base,
      contaCartao: ultimo.r.conta_cartao,
      categoria: ultimo.r.tag,
      pagas,
      total,
      valorParcela,
      falta: restantes * valorParcela,
      proximaData: futuras[0]?.r.data ?? null,
    });
  }
  return out.sort((a, b) => b.falta - a.falta);
}

export type CompromissoMes = {
  chave: string;
  label: string;
  /** Parcelas e compras já lançadas para o mês. */
  lancado: number;
  /** Parcelas que ainda não aparecem nos lançamentos, projetadas. */
  previsto: number;
  /** Mês em andamento (só o que vem depois de hoje). */
  atual: boolean;
};

/**
 * Compras no crédito já comprometidas para os próximos 6 meses (incluindo o atual):
 * despesas no crédito com data depois de hoje + parcelas que faltam e ainda não foram lançadas.
 */
export function compromissoFuturo(lancs: L[], ref: Date): CompromissoMes[] {
  const hoje = isoDaData(ref);
  const limiteVelho = diasAtras(ref, 45);
  const chaves = [0, 1, 2, 3, 4, 5].map((d) => chaveMesDeslocado(ref, d));
  const idx = new Map(chaves.map((c, i) => [c, i]));
  const meses: CompromissoMes[] = chaves.map((c, i) => ({
    chave: c,
    label: mesCurtoDaChave(c),
    lancado: 0,
    previsto: 0,
    atual: i === 0,
  }));
  for (const r of lancs) {
    if (!ehDespesa(r) || !ehCredito(r) || r.data <= hoje) continue;
    const i = idx.get(r.data.slice(0, 7));
    if (i != null) meses[i]!.lancado += r.valor;
  }
  // Projeta as parcelas que ainda não existem como lançamento.
  for (const grupo of gruposDeParcelas(lancs)) {
    const ordenado = [...grupo].sort((a, b) => a.n - b.n);
    const ultimo = ordenado[ordenado.length - 1]!;
    if (ultimo.n >= ultimo.total) continue;
    // Última parcela antiga e nada no futuro: provavelmente terminou ou parou de sincronizar.
    if (ultimo.r.data <= hoje && ultimo.r.data < limiteVelho) continue;
    const valor = mediana(ordenado.map((x) => x.r.valor));
    for (let n = ultimo.n + 1; n <= ultimo.total; n++) {
      const i = idx.get(mesDaData(ultimo.r.data, n - ultimo.n));
      if (i != null) meses[i]!.previsto += valor;
    }
  }
  return meses;
}

/** Média mensal de entradas nos 3 meses completos anteriores. */
export function rendaMediaMensal(lancs: L[], ref: Date): number {
  const chaves = new Set([-3, -2, -1].map((d) => chaveMesDeslocado(ref, d)));
  let soma = 0;
  for (const r of lancs) if (ehReceita(r) && chaves.has(r.data.slice(0, 7))) soma += r.valor;
  return soma / 3;
}

/* ------------------------------------------------------------------ */
/* Hábitos                                                             */
/* ------------------------------------------------------------------ */

export type DiaSemana = { label: string; nome: string; total: number; media: number; qtd: number };

/** Gasto por dia da semana (de segunda a domingo), com média por ocorrência do dia. */
export function porDiaDaSemana(atuais: L[], intervalo: Intervalo): DiaSemana[] {
  const ocorrencias = new Array<number>(7).fill(0);
  const ini = dataDoIso(intervalo.desde);
  const n = diasNoIntervalo(intervalo);
  for (let i = 0; i < n; i++) {
    ocorrencias[new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i, 12).getDay()]! += 1;
  }
  const total = new Array<number>(7).fill(0);
  const qtd = new Array<number>(7).fill(0);
  for (const r of atuais) {
    if (!ehDespesa(r)) continue;
    const d = dataDoIso(r.data).getDay();
    total[d]! += r.valor;
    qtd[d]! += 1;
  }
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    label: DIAS_SEMANA[d]!,
    nome: DIAS_SEMANA_LONGOS[d]!,
    total: total[d]!,
    qtd: qtd[d]!,
    media: ocorrencias[d]! ? total[d]! / ocorrencias[d]! : 0,
  }));
}

export type Lugar = { chave: string; nome: string; vezes: number; total: number; categoria: string | null };

/** Despesas agrupadas pela descrição (sem sufixo de parcela). */
export function lugares(atuais: L[]): Lugar[] {
  const mapa = new Map<string, { nomes: string[]; vezes: number; total: number; cats: string[] }>();
  for (const r of atuais) {
    if (!ehDespesa(r)) continue;
    const chave = chaveNome(r.descricao);
    if (!chave) continue;
    const g = mapa.get(chave) ?? { nomes: [], vezes: 0, total: 0, cats: [] };
    g.nomes.push(nomeBase(r.descricao));
    g.vezes += 1;
    g.total += r.valor;
    if (r.tag) g.cats.push(r.tag);
    mapa.set(chave, g);
  }
  return [...mapa.entries()].map(([chave, g]) => ({
    chave,
    nome: maisFrequente(g.nomes),
    vezes: g.vezes,
    total: g.total,
    categoria: maisFrequente(g.cats) || null,
  }));
}

export type Recorrente = {
  chave: string;
  nome: string;
  valorMensal: number;
  meses: number;
  categoria: string | null;
  /** Já é uma conta fixa cadastrada (lançamento ligado a uma recorrência). */
  cadastrada: boolean;
};

/**
 * Gastos com cara de assinatura/conta fixa: mesma descrição em ≥3 dos últimos
 * 6 meses completos, com valor estável (±30% da mediana). Parcelas ficam de fora.
 */
export function recorrentes(lancs: L[], ref: Date): Recorrente[] {
  const chavesMes = new Set([-6, -5, -4, -3, -2, -1].map((d) => chaveMesDeslocado(ref, d)));
  const mapa = new Map<
    string,
    { porMes: Map<string, number>; nomes: string[]; cats: string[]; cadastrada: boolean }
  >();
  for (const r of lancs) {
    if (!ehDespesa(r) || parcelaDe(r.descricao)) continue;
    const mes = r.data.slice(0, 7);
    if (!chavesMes.has(mes)) continue;
    const chave = chaveNome(r.descricao);
    if (chave.length < 3) continue;
    const g = mapa.get(chave) ?? {
      porMes: new Map<string, number>(),
      nomes: [] as string[],
      cats: [] as string[],
      cadastrada: false,
    };
    g.porMes.set(mes, (g.porMes.get(mes) ?? 0) + r.valor);
    g.nomes.push(nomeBase(r.descricao));
    if (r.tag) g.cats.push(r.tag);
    if (r.recorrencia_id) g.cadastrada = true;
    mapa.set(chave, g);
  }
  const out: Recorrente[] = [];
  for (const [chave, g] of mapa) {
    if (g.porMes.size < 3) continue;
    const valores = [...g.porMes.values()];
    const med = mediana(valores);
    const estaveis = valores.filter((v) => Math.abs(v - med) <= med * 0.3).length;
    if (estaveis < 3 || med <= 0) continue;
    out.push({
      chave,
      nome: maisFrequente(g.nomes),
      valorMensal: med,
      meses: g.porMes.size,
      categoria: maisFrequente(g.cats) || null,
      cadastrada: g.cadastrada,
    });
  }
  return out.sort((a, b) => b.valorMensal - a.valorMensal);
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export type Insight = { id: string; texto: string; tom: "bom" | "ruim" | "neutro"; categoria?: string };

const brl0 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Frases curtas sobre o período, das mais relevantes para as menos. */
export function gerarInsights(args: {
  atuais: L[];
  anteriores: L[];
  comparacaoNo: string;
  dias: DiaSemana[];
  lugaresTop: Lugar[];
  recorrentes: Recorrente[];
  intervalo: Intervalo;
}): Insight[] {
  const { atuais, anteriores, comparacaoNo } = args;
  const out: Insight[] = [];

  // Categorias que mais subiram / caíram vs o mesmo pedaço do período anterior.
  const soma = somaPorGrupo(atuais, "categoria");
  const somaAnt = somaPorGrupo(anteriores, "categoria");
  const variacoes = [...soma.entries()]
    .map(([nome, s]) => {
      const ant = somaAnt.get(nome)?.valor ?? 0;
      return { nome, atual: s.valor, ant, dif: s.valor - ant, pct: variacaoPct(s.valor, ant) };
    })
    .filter((v) => v.nome !== SEM_CATEGORIA && v.pct != null && v.ant >= 30);
  const subiu = variacoes
    .filter((v) => (v.pct ?? 0) >= 15 && v.dif >= 50)
    .sort((a, b) => b.dif - a.dif)[0];
  if (subiu) {
    out.push({
      id: "subiu",
      tom: "ruim",
      categoria: subiu.nome,
      texto: `Você gastou ${subiu.pct}% mais em ${subiu.nome} que ${comparacaoNo} (+${brl0.format(subiu.dif)}).`,
    });
  }
  const caiu = [...somaAnt.entries()]
    .map(([nome, s]) => {
      const atual = soma.get(nome)?.valor ?? 0;
      return { nome, atual, ant: s.valor, dif: s.valor - atual, pct: variacaoPct(atual, s.valor) };
    })
    .filter((v) => v.nome !== SEM_CATEGORIA && v.ant >= 50 && (v.pct ?? 0) <= -15 && v.dif >= 50)
    .sort((a, b) => b.dif - a.dif)[0];
  if (caiu) {
    out.push({
      id: "caiu",
      tom: "bom",
      categoria: caiu.nome,
      texto: `Boa: ${Math.abs(caiu.pct ?? 0)}% a menos em ${caiu.nome} que ${comparacaoNo} (−${brl0.format(caiu.dif)}).`,
    });
  }

  // Dia da semana que concentra os gastos (só faz sentido com pelo menos 2 semanas).
  const totalDias = args.dias.reduce((a, d) => a + d.total, 0);
  if (diasNoIntervalo(args.intervalo) >= 14 && totalDias > 0) {
    const maior = [...args.dias].sort((a, b) => b.media - a.media)[0]!;
    const pct = Math.round((maior.total / totalDias) * 100);
    if (pct >= 20) {
      const fds = maior.nome === "sábado" || maior.nome === "domingo";
      out.push({
        id: "dia",
        tom: "neutro",
        texto: `${fds ? "O" : "A"} ${maior.nome} é o dia em que você mais gasta: ${pct}% do total, ${brl0.format(maior.media)} em média.`,
      });
    }
  }

  // Lugar mais frequente.
  const top = args.lugaresTop[0];
  if (top && top.vezes >= 3) {
    out.push({
      id: "lugar",
      tom: "neutro",
      texto: `Seu lugar mais frequente é ${top.nome}: ${top.vezes} vezes, ${brl0.format(top.total)} no período.`,
    });
  }

  // Peso do crédito.
  const despesas = atuais.filter(ehDespesa);
  const total = despesas.reduce((a, r) => a + r.valor, 0);
  const credito = despesas.filter(ehCredito).reduce((a, r) => a + r.valor, 0);
  if (total > 0 && credito / total >= 0.5) {
    out.push({
      id: "credito",
      tom: "neutro",
      texto: `${Math.round((credito / total) * 100)}% dos seus gastos foram no cartão de crédito.`,
    });
  }

  // Assinaturas e contas fixas.
  const fixo = args.recorrentes.reduce((a, r) => a + r.valorMensal, 0);
  if (args.recorrentes.length >= 2 && fixo > 0) {
    out.push({
      id: "fixos",
      tom: "neutro",
      texto: `Gastos que se repetem todo mês somam cerca de ${brl0.format(fixo)} por mês (${args.recorrentes.length} itens).`,
    });
  }
  return out;
}


/** Aplicado, resgatado e o que ficou investido (aplicado − resgatado) num conjunto de movimentos. */
export function resumirInvestimentos(movs: MovimentoInvestimento[]): ResumoInvestimentos {
  let aplicado = 0;
  let resgatado = 0;
  for (const m of movs) {
    if (m.valor < 0) aplicado += -m.valor;
    else resgatado += m.valor;
  }
  return { aplicado, resgatado, liquido: aplicado - resgatado };
}
