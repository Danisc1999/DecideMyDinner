-- Permite que un usuario anónimo (invitado, sin cuenta) se una a un hogar como
-- "guest" (solo lectura) usando el enlace de invitado. No permite que se una con
-- otro rol (owner/admin) por esta vía.
create policy "guest_self_join" on household_members
  for insert with check (role = 'guest' and user_id = auth.uid());

-- IMPORTANTE: esta protección es del lado del cliente (la app oculta/bloquea los
-- botones de escritura si tu rol es 'guest'), no a nivel de base de datos. Si más
-- adelante quieres blindarlo también en la base de datos (para que ni con la API
-- directa se pueda escribir como invitado), dímelo y añadimos client de "with check
-- role <> 'guest'" a las políticas de escritura de inventory_items, shopping_items,
-- meal_plan_items y activity_log.

-- Además, debes activar el inicio de sesión anónimo en:
-- Supabase Dashboard -> Authentication -> Providers -> Anonymous Sign-Ins -> Enable.
