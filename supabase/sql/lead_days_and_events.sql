-- Añade la preferencia de "avisar con cuántos días de antelación" por suscripción.
alter table push_subscriptions add column if not exists lead_days integer default 3;

-- Genérica: enviar un push a los miembros de un hogar (excepto quien disparó la acción).
-- La usa el cliente cuando alguien añade algo a la lista o cocina una receta.
-- (No requiere cambios de tabla; reutiliza push_subscriptions.)
