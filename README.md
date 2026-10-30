# FinFlow

Gestão financeira pessoal (uso individual): lançamentos de receitas e despesas,
cartões de crédito, extrato e relatórios.

## Stack

- Next.js 16 (App Router) + React 19
- Supabase (Auth + Postgres com RLS) — cliente em `src/lib/supabase.ts`
- Tailwind CSS 4, Recharts, lucide-react

## Rodando localmente

Crie `.env.local` com:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Depois:

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## Estrutura

- `src/app/(main)/` — rotas autenticadas (início, lançar, cartões, extrato, relatórios, perfil)
- `src/components/` — telas e componentes por área
- `src/lib/` — regras de negócio e utilitários
- `src/types/` — tipos compartilhados
- `src/data/bancos.ts` — catálogo de instituições financeiras

## Banco de dados

Tabelas: `lancamentos`, `cartoes`, `recorrencias`, `profiles`.
