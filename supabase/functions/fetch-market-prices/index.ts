// Supabase Edge Function: fetch-market-prices
// La tienda online de Mercadona no tiene buscador por texto en su API interna.
// Así que recorremos el árbol de categorías (categorías -> subcategorías -> productos)
// y buscamos coincidencias por nombre contra el catálogo local (334 productos).
// Si Mercadona cambia la forma de esta API, esta función puede romperse.
//
// Despliegue:
//   supabase functions deploy fetch-market-prices --project-ref <tu-project-ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// término de búsqueda (nombre de nuestro catálogo local) -> se compara contra el nombre del producto de Mercadona
const TRACKED_PRODUCTS = [
  'Patatas', 'Cebollas', 'Cabeza de ajos', 'Tomates', 'Tomates cherry', 'Pimiento rojo', 'Pimiento verde', 'Calabacín', 'Berenjena', 'Zanahorias', 'Lechuga romana', 'Espinacas frescas', 'Champiñones', 'Brócoli', 'Coliflor', 'Calabaza', 'Aguacates', 'Limones', 'Limas', 'Puerros', 'Pepino', 'Cebolletas', 'Plátanos', 'Manzanas', 'Jengibre fresco', 'Perejil', 'Cilantro', 'Albahaca', 'Pechuga de pollo', 'Muslos de pollo', 'Carne picada mixta', 'Filetes de ternera', 'Solomillo de cerdo', 'Panceta o bacon', 'Jamón serrano', 'Chorizo', 'Lomos de salmón', 'Merluza', 'Bacalao', 'Atún fresco', 'Gambas peladas', 'Mejillones', 'Huevos', 'Leche', 'Nata para cocinar', 'Mantequilla', 'Queso rallado', 'Mozzarella', 'Parmesano', 'Queso en lonchas', 'Yogur natural', 'Queso crema', 'Tofu firme', 'Pasta corta', 'Espaguetis', 'Arroz redondo', 'Arroz basmati', 'Quinoa', 'Fideos de arroz', 'Lentejas', 'Garbanzos cocidos', 'Alubias cocidas', 'Tomate triturado', 'Tomate frito', 'Atún en lata', 'Maíz dulce', 'Aceitunas', 'Aceite de oliva virgen extra', 'Salsa de soja', 'Leche de coco', 'Curry en polvo', 'Pimentón dulce', 'Comino molido', 'Orégano', 'Harina de trigo', 'Pan rallado', 'Pesto', 'Caldo de pollo o verduras', 'Tortillas de trigo', 'Nachos de maíz', 'Guisantes congelados', 'Verduras para wok congeladas', 'Croquetas', 'Gyozas / dumplings', 'Gambas congeladas', 'Espinacas congeladas', 'Bases de pizza', 'Patatas prefritas', 'Pan rústico', 'Pan de molde', 'Panes de hamburguesa', 'Pan de masa madre', 'Naranjas', 'Mandarinas', 'Peras', 'Uvas', 'Fresas', 'Arándanos', 'Frambuesas', 'Kiwi', 'Piña', 'Mango', 'Melón', 'Sandía', 'Melocotón', 'Nectarinas', 'Ciruelas', 'Cerezas', 'Granada', 'Pomelo', 'Batata', 'Boniato', 'Apio', 'Acelgas', 'Rúcula', 'Canónigos', 'Endivias', 'Repollo', 'Col lombarda', 'Pak choi', 'Judías verdes', 'Espárragos verdes', 'Alcachofas', 'Remolacha', 'Rábanos', 'Nabo', 'Hinojo', 'Cebolla morada', 'Cebolla dulce', 'Tomate pera', 'Tomate raf', 'Tomate kumato', 'Pimiento amarillo', 'Pimiento padrón', 'Setas variadas', 'Shiitake', 'Portobello', 'Maíz en mazorca', 'Ajo tierno', 'Brotes de soja', 'Hierbabuena', 'Menta fresca', 'Eneldo', 'Romero fresco', 'Tomillo fresco', 'Contramuslos de pollo', 'Alitas de pollo', 'Pollo entero', 'Pavo fileteado', 'Carne picada de ternera', 'Carne picada de pollo', 'Hamburguesas de ternera', 'Hamburguesas de pollo', 'Entrecot de ternera', 'Lomo de cerdo', 'Costillas de cerdo', 'Chuletas de cerdo', 'Secreto ibérico', 'Carrilleras de cerdo', 'Conejo troceado', 'Cordero troceado', 'Pechuga de pavo', 'Salchichas frescas', 'Longaniza', 'Jamón cocido', 'Pavo en lonchas', 'Mortadela', 'Dorada', 'Lubina', 'Sardinas', 'Boquerones', 'Caballa', 'Trucha', 'Lenguado', 'Rodaballo', 'Sepia', 'Calamares', 'Pulpo cocido', 'Vieiras', 'Almejas', 'Berberechos', 'Langostinos', 'Gambón', 'Anillas de calamar', 'Palitos de cangrejo', 'Salmón ahumado', 'Atún en tacos', 'Leche semidesnatada', 'Leche desnatada', 'Bebida de avena', 'Bebida de almendra', 'Bebida de soja', 'Kéfir', 'Yogur griego', 'Yogur vegetal', 'Requesón', 'Ricotta', 'Queso feta', 'Queso de cabra', 'Queso manchego', 'Queso cheddar', 'Queso emmental', 'Queso azul', 'Burrata', 'Mascarpone', 'Nata para montar', 'Crème fraîche', 'Huevos camperos', 'Claras de huevo', 'Margarina', 'Cuscús', 'Bulgur', 'Arroz integral', 'Arroz jazmín', 'Arroz arborio', 'Arroz salvaje', 'Fideos ramen', 'Noodles de trigo', 'Sémola', 'Polenta', 'Avena en copos', 'Granola', 'Cereales de desayuno', 'Lentejas cocidas', 'Alubias negras', 'Alubias rojas', 'Judías pintas', 'Garbanzos secos', 'Soja texturizada', 'Tempeh', 'Tahini', 'Crema de cacahuete', 'Miel', 'Sirope de arce', 'Azúcar blanco', 'Azúcar moreno', 'Cacao en polvo', 'Chocolate negro', 'Chocolate con leche', 'Levadura química', 'Levadura de panadero', 'Maicena', 'Harina integral', 'Harina de maíz', 'Harina de garbanzo', 'Pan rallado panko', 'Vinagre de vino', 'Vinagre de manzana', 'Vinagre de arroz', 'Vinagre balsámico', 'Aceite de girasol', 'Aceite de sésamo', 'Salsa teriyaki', 'Salsa de ostras', 'Salsa de pescado', 'Salsa Worcestershire', 'Salsa picante', 'Mostaza Dijon', 'Mostaza antigua', 'Mayonesa', 'Ketchup', 'Salsa barbacoa', 'Salsa de tomate', 'Pasta de tomate', 'Pasta de curry rojo', 'Pasta de curry verde', 'Pasta de miso', 'Caldo de pescado', 'Caldo de carne', 'Caldo de verduras', 'Coco rallado', 'Cacahuetes', 'Almendras', 'Nueces', 'Avellanas', 'Pistachos', 'Anacardos', 'Piñones', 'Pasas', 'Dátiles', 'Orejas de albaricoque seco', 'Semillas de chía', 'Semillas de lino', 'Semillas de sésamo', 'Pipas de girasol', 'Alcaparras', 'Pepinillos', 'Jalapeños en conserva', 'Tomates secos', 'Pimientos del piquillo', 'Espárragos en conserva', 'Champiñones en conserva', 'Palmitos', 'Alga nori', 'Wasabi', 'Tortillas de maíz', 'Pan pita', 'Wraps integrales', 'Galletas saladas', 'Tostadas crujientes', 'Brócoli congelado', 'Coliflor congelada', 'Judías verdes congeladas', 'Frutos rojos congelados', 'Mango congelado', 'Salmón congelado', 'Merluza congelada', 'Bacalao congelado', 'Calamares congelados', 'Langostinos congelados', 'Hamburguesas congeladas', 'Albóndigas congeladas', 'Lasaña congelada', 'Canelones congelados', 'Pizza congelada', 'Empanadillas congeladas', 'Helado de vainilla', 'Helado de chocolate', 'Cubitos de hielo', 'Baguette', 'Chapata', 'Pan integral', 'Pan multicereal', 'Pan de centeno', 'Pan sin gluten', 'Tortas de aceite', 'Croissants', 'Bollos de leche', 'Picos de pan', 'Colines', 'Panecillos', 'Molletes', 'Focaccia', 'Brioche',
];

const MAX_LEAVES = 400; // límite de subcategorías a recorrer, para no tardar ni martillear la API

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function getSession(postalCode: string): Promise<{ wh: string; cookie: string } | null> {
  const res = await fetch('https://tienda.mercadona.es/api/postal-codes/actions/change-pc/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ new_postal_code: postalCode }),
  });
  if (!res.ok) return null;
  const wh = res.headers.get('x-customer-wh');
  if (!wh) return null;
  return { wh, cookie: res.headers.get('set-cookie') || '' };
}

function authHeaders(session: { wh: string; cookie: string }) {
  const h: Record<string, string> = { 'Accept': 'application/json' };
  if (session.cookie) h['Cookie'] = session.cookie;
  return h;
}

async function getLeafCategories(session: { wh: string; cookie: string }): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`https://tienda.mercadona.es/api/categories/?lang=es&wh=${session.wh}`, { headers: authHeaders(session) });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const tops = json?.results ?? [];
  const leaves: { id: number; name: string }[] = [];
  for (const top of tops) {
    for (const sub of top?.categories ?? []) {
      if (sub?.id != null) leaves.push({ id: sub.id, name: sub.name ?? '' });
    }
  }
  return leaves;
}

async function getCategoryProducts(id: number, session: { wh: string; cookie: string }) {
  const res = await fetch(`https://tienda.mercadona.es/api/categories/${id}/?lang=es&wh=${session.wh}`, { headers: authHeaders(session) });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const cats = json?.categories ?? [];
  const products: any[] = [];
  for (const c of cats) products.push(...(c?.products ?? []));
  return products;
}

function photoOf(p: any): string | null {
  return p?.thumbnail ?? p?.photos?.[0]?.regular ?? p?.photos?.[0]?.zoom ?? p?.photos?.[0]?.thumbnail ?? p?.packaging_photo?.regular ?? p?.image ?? null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const { postal_code } = await req.json();
    if (!postal_code) return new Response(JSON.stringify({ error: 'postal_code requerido' }), { status: 400, headers: CORS_HEADERS });

    const session = await getSession(postal_code);
    if (!session) return new Response(JSON.stringify({ error: 'No se pudo resolver el almacén para ese código postal (¿API cambiada?)' }), { status: 502, headers: CORS_HEADERS });

    const leaves = await getLeafCategories(session);
    if (!leaves.length) return new Response(JSON.stringify({ error: 'No se pudo leer el árbol de categorías (¿API cambiada?)' }), { status: 502, headers: CORS_HEADERS });

    function words(s: string): string[] {
      return norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2);
    }
    const terms = TRACKED_PRODUCTS.map(t => ({ term: t, words: words(t) })).filter(t => t.words.length > 0);
    // extraWords guarda, por término, cuántas palabras "de más" tiene el mejor candidato actual —
    // así si aparece un producto más ajustado más adelante en el escaneo, lo sustituye.
    const found = new Map<string, { name: string; price: number; unit: string; photo: string | null; extraWords: number }>();
    let productsSeenTotal = 0;
    const sampleNames: string[] = [];

    for (let i = 0; i < leaves.length && i < MAX_LEAVES; i++) {
      const products = await getCategoryProducts(leaves[i].id, session);
      productsSeenTotal += products.length;
      for (const p of products) {
        const displayName = p?.display_name ?? '';
        if (sampleNames.length < 8 && displayName) sampleNames.push(displayName);
        const nameWords = words(displayName);
        const nameSet = new Set(nameWords);
        for (const t of terms) {
          // exige que TODAS las palabras significativas del término aparezcan en el nombre del producto,
          // Y que la primera palabra del nombre del producto coincida (por prefijo, para tolerar plurales)
          // con la primera palabra del término — esto evita que "mantequilla" empareje con
          // "croissants con mantequilla" (esa coincide en palabras pero no es el producto en sí).
          const allWordsPresent = t.words.every(w => nameSet.has(w));
          if (!allWordsPresent) continue;
          const firstTermWord = t.words[0] || '';
          const firstNameWord = nameWords[0] || '';
          const prefixLen = Math.min(5, firstTermWord.length, firstNameWord.length);
          const headMatches = prefixLen > 0 && firstTermWord.slice(0, prefixLen) === firstNameWord.slice(0, prefixLen);
          if (!headMatches) continue;
          const extraWords = nameWords.length - t.words.length;
          const current = found.get(t.term);
          if (current && current.extraWords <= extraWords) continue; // ya tenemos un candidato igual o más ajustado
          const price = p?.price_instructions?.unit_price ?? p?.price_instructions?.bulk_price ?? null;
          if (price == null) continue;
          found.set(t.term, { name: p.display_name, price: Number(price), unit: p?.price_instructions?.unit_name ?? '', photo: photoOf(p), extraWords });
        }
      }
      await new Promise(r => setTimeout(r, 15)); // no martillear la API
    }

    const rows = Array.from(found.entries()).map(([term, f]) => ({
      postal_code, store: 'Mercadona', product_name: f.name, search_term: term,
      price: f.price, unit: f.unit, photo_url: f.photo, updated_at: new Date().toISOString(),
    }));
    const missingTerms = terms.map(t => t.term).filter(t => !found.has(t));
    const noPhotoTerms = Array.from(found.entries()).filter(([, f]) => !f.photo).map(([term]) => term);

    if (rows.length) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      // Antes de sobrescribir, guardamos el precio actual como "precio anterior" para poder
      // mostrar la tendencia (sube/baja) en la app.
      const { data: prevRows } = await supabase.from('market_prices').select('search_term, price').eq('postal_code', postal_code).eq('store', 'Mercadona');
      const prevByTerm = new Map((prevRows || []).map((r: any) => [r.search_term, r.price]));
      const rowsWithPrev = rows.map(r => ({ ...r, previous_price: prevByTerm.has(r.search_term) && prevByTerm.get(r.search_term) !== r.price ? prevByTerm.get(r.search_term) : null }));
      // upsert en tandas de 200 para no exceder límites de payload
      for (let i = 0; i < rowsWithPrev.length; i += 200) {
        const { error } = await supabase.from('market_prices').upsert(rowsWithPrev.slice(i, i + 200), { onConflict: 'postal_code,store,search_term' });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response(JSON.stringify({
      ok: true, count: rows.length, leavesScanned: Math.min(leaves.length, MAX_LEAVES), totalLeaves: leaves.length,
      productsSeenTotal, sampleNames,
      missingCount: missingTerms.length, missingSample: missingTerms.slice(0, 30),
      noPhotoCount: noPhotoTerms.length, noPhotoSample: noPhotoTerms.slice(0, 30),
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
