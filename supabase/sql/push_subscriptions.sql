-- Tabla para guardar las suscripciones push de cada usuario (una por dispositivo/navegador)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

create policy "own_push_subscriptions_all" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Política de borrado que faltaba en activity_log (contador de "veces cocinada" de la familia)
drop policy if exists "own_activity_delete" on activity_log;
create policy "own_activity_delete" on activity_log
  for delete using (auth.uid() = user_id);
