// Supabase Edge Function: send-inactivity-pushes
// Cada día, avisa a los usuarios que no han marcado ninguna receta como cocinada en
// los últimos N días (por defecto 5), para animarles a volver a la app.
//
// Requiere las mismas variables que send-expiry-pushes/send-mealplan-pushes.
// Despliegue:
//   supabase functions deploy send-inactivity-pushes
// Cron diario recomendado: "0 18 * * *" (18:00 UTC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:sin-configurar@example.com';
const INACTIVITY_DAYS = 5;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 86400000).toISOString();

    const { data: subs, error: subsErr } = await supabase.from('push_subscriptions').select('*');
    if (subsErr) throw subsErr;
    if (!subs || !subs.length) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'sin suscripciones' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const userIds = [...new Set(subs.map((s: any) => s.user_id).filter(Boolean))];
    const { data: recentCooks, error: cooksErr } = await supabase.from('personal_history').select('user_id, last_cooked_at').in('user_id', userIds);
    if (cooksErr) throw cooksErr;

    const lastCookByUser: Record<string, string> = {};
    for (const r of recentCooks || []) {
      if (!r.last_cooked_at) continue;
      if (!lastCookByUser[r.user_id] || r.last_cooked_at > lastCookByUser[r.user_id]) lastCookByUser[r.user_id] = r.last_cooked_at;
    }

    let sent = 0, failed = 0;
    for (const sub of subs) {
      if (!sub.user_id) continue;
      const last = lastCookByUser[sub.user_id];
      if (last && last > cutoff) continue; // ha cocinado hace poco, no molestar
      const payload = JSON.stringify({ title: 'Decide My Dinner', body: '¿Qué tal si decides tu cena de hoy? Llevas unos días sin cocinar nada por aquí 🍳' });
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
