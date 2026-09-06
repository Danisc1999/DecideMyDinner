// Supabase Edge Function: send-expiry-pushes
// Revisa el inventario de cada hogar, y para los productos que caducan en <=3 días
// envía una notificación push real (llega aunque la app esté cerrada) a los miembros
// del hogar que hayan activado notificaciones.
//
// Requiere las variables de entorno (secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu-correo@ejemplo.com)
//
// Despliegue:
//   supabase functions deploy send-expiry-pushes
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tucorreo@ejemplo.com
//
// Después, en el Dashboard de Supabase -> Edge Functions -> send-expiry-pushes -> Cron,
// añade un trigger diario (p.ej. "0 9 * * *" para las 9:00 todos los días) para que se
// ejecute sola sin que tengas que hacer nada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:sin-configurar@example.com';

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
    let body: any = {};
    try { body = await req.json(); } catch (e) {}

    if (body.test && body.user_id) {
      const { data: subs, error: subsErr } = await supabase.from('push_subscriptions').select('*').eq('user_id', body.user_id);
      if (subsErr) throw subsErr;
      let sent = 0;
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'Decide My Dinner', body: 'Esto es un aviso de prueba. Si lo ves, las notificaciones funcionan 🎉' }));
          sent++;
        } catch (e) { /* ignore individual failures in test mode */ }
      }
      return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { data: items, error: itemsErr } = await supabase
      .from('inventory_items')
      .select('household_id, name, expiry_date')
      .not('expiry_date', 'is', null);
    if (itemsErr) throw itemsErr;

    const now = Date.now();
    const byHouseholdAllItems: Record<string, { name: string; daysLeft: number }[]> = {};
    for (const it of items || []) {
      const daysLeft = Math.ceil((new Date(it.expiry_date).getTime() - now) / 86400000);
      (byHouseholdAllItems[it.household_id] ||= []).push({ name: it.name, daysLeft });
    }
    const householdIds = Object.keys(byHouseholdAllItems);
    if (!householdIds.length) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nada caduca pronto' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('household_id', householdIds);
    if (subsErr) throw subsErr;

    let sent = 0, failed = 0;
    for (const sub of subs || []) {
      const leadDays = sub.lead_days ?? 3;
      const names = (byHouseholdAllItems[sub.household_id] || []).filter(i => i.daysLeft <= leadDays).map(i => i.name);
      if (!names.length) continue;
      const payload = JSON.stringify({
        title: 'Decide My Dinner',
        body: `${names.length} producto${names.length === 1 ? '' : 's'} caduca${names.length === 1 ? '' : 'n'} pronto: ${names.slice(0, 3).join(', ')}`,
      });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (e) {
        failed++;
        // Suscripción caducada o inválida: la borramos para no reintentar en vano.
        if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
