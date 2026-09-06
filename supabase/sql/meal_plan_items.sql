-- Plan semanal compartido por el hogar (una receta por día).
create table if not exists meal_plan_items (
  household_id uuid not null references households(id) on delete cascade,
  day text not null,
  recipe_id text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  primary key (household_id, day)
);

alter table meal_plan_items enable row level security;

create policy "household_meal_plan_select" on meal_plan_items
  for select using (household_id in (select household_id from household_members where user_id = auth.uid()));
create policy "household_meal_plan_write" on meal_plan_items
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
