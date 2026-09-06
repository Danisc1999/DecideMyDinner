create table if not exists meal_plan_dates (
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  recipe_id text not null,
  recipe_title text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  primary key (household_id, date)
);

alter table meal_plan_dates enable row level security;

create policy "household_meal_plan_dates_select" on meal_plan_dates
  for select using (household_id in (select household_id from household_members where user_id = auth.uid()));
create policy "household_meal_plan_dates_write" on meal_plan_dates
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
