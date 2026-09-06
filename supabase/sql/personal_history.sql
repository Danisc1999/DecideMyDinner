create table if not exists personal_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null,
  cooked_count int default 1,
  last_cooked_at timestamptz default now(),
  note text default '',
  favorite boolean default false,
  user_rating int,
  photo_url text,
  updated_at timestamptz default now(),
  primary key (user_id, recipe_id)
);

alter table personal_history enable row level security;

create policy "own_personal_history" on personal_history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
