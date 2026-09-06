// Supabase Edge Function: send-mealplan-pushes
// Cada noche, avisa a cada hogar de qué receta toca al día siguiente según su plan
// semanal (si hay una asignada). Pensado para ejecutarse una vez al día por la tarde
// (p.ej. a las 19:00), no en cada request.
//
// Requiere las mismas variables de entorno que send-expiry-pushes (ya configuradas si
// la desplegaste primero): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
//
// Despliegue:
//   supabase functions deploy send-mealplan-pushes
// Y en el Dashboard -> Edge Functions -> send-mealplan-pushes -> Cron, añade un
// trigger diario, por ejemplo "0 19 * * *" (19:00 todos los días, hora del servidor
// en UTC — ajusta según tu zona horaria).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:sin-configurar@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowKey = DAY_NAMES[tomorrow.getDay()];

    const { data: planItems, error: planErr } = await supabase.from('meal_plan_items').select('household_id, recipe_title').eq('day', tomorrowKey);
    if (planErr) throw planErr;
    if (!planItems || !planItems.length) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nada planeado para mañana' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const householdIds = planItems.map(p => p.household_id);
    const { data: subs, error: subsErr } = await supabase.from('push_subscriptions').select('*').in('household_id', householdIds);
    if (subsErr) throw subsErr;

    const titleByHousehold: Record<string, string> = {};
    for (const p of planItems) titleByHousehold[p.household_id] = p.recipe_title || 'una receta';

    let sent = 0, failed = 0;
    for (const sub of subs || []) {
      const title = titleByHousehold[sub.household_id];
      if (!title) continue;
      const payload = JSON.stringify({ title: 'Decide My Dinner', body: `Mañana toca: ${title} 🍽️` });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (e) {
        failed++;
        if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
