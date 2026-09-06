# Precios reales de Mercadona — puesta en marcha

## 1. Crea la tabla (SQL Editor de Supabase)

```sql
create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  postal_code text not null,
  store text not null default 'Mercadona',
  product_name text not null,
  search_term text not null,
  price numeric not null,
  unit text,
  updated_at timestamptz not null default now(),
  unique(postal_code, store, search_term)
);
alter table public.market_prices enable row level security;
create policy "market prices public read" on public.market_prices for select to authenticated, anon using (true);
grant select on public.market_prices to authenticated, anon;
```

## 2. Despliega la función (necesita Supabase CLI)

```bash
npm install -g supabase
supabase login
supabase link --project-ref nrbxqwrhawcqqtmvjhrt
supabase functions deploy fetch-market-prices
```

No necesitas configurar `SUPABASE_SERVICE_ROLE_KEY` a mano: Supabase la inyecta sola en las Edge Functions del mismo proyecto.

## 3. Pruébalo

Desde la app: Compra → pon tu código postal → "Actualizar precios". La primera vez tarda unos segundos (consulta producto a producto). Si falla, revisa los logs de la función en el panel de Supabase (Edge Functions → fetch-market-prices → Logs) — la API de Mercadona no es oficial y puede haber cambiado de forma.

## Limitaciones honestas

- Solo Mercadona: es la única cadena con acceso público real que encontré. Carrefour/Dia/Alcampo/Lidl/Eroski siguen con precios de ejemplo.
- Es una API no documentada de su tienda online: puede cambiar sin aviso.
- Cubre ~20 productos de ejemplo (los más comunes de recetas), no el catálogo entero.
