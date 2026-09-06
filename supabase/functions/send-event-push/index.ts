// Supabase Edge Function: send-event-push
// Push genérico para eventos del hogar en tiempo real: alguien añade algo a la lista
// de la compra, o cocina una receta. Se envía a todos los miembros del hogar EXCEPTO
// a quien disparó la acción.
//
// Requiere las mismas variables de entorno que send-expiry-pushes (ya configuradas si
// desplegaste esa función primero): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
//
// Despliegue:
//   supabase functions deploy send-event-push

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
    const { household_id, exclude_user_id, title, body } = await req.json();
    if (!household_id || !title || !body) return new Response(JSON.stringify({ error: 'household_id, title y body son obligatorios' }), { status: 400, headers: CORS_HEADERS });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase.from('push_subscriptions').select('*').eq('household_id', household_id).neq('user_id', exclude_user_id || '');
    if (error) throw error;

    let sent = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body }));
        sent++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
