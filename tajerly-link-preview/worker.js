// Cloudflare Worker — معاينة رابط خاصة بكل متجر (Telegram / WhatsApp / Facebook ...)
// يعمل أمام tajerly.shop: لو الرابط فيه ?s=CODE يجيب بيانات التاجر من Firestore (قراءة عامة)
// ويبدّل وسوم العنوان والوصف والصورة داخل HTML قبل ما يوصل للزاحف. باقي الصفحات تمر بدون تغيير.

const PROJECT_ID = 'billionaire-e8b22';
const SITE_NAME = 'تاجرلي';
const SIGNATURE = 'تاجرلي: منصة عراقية لبناء المتاجر الإلكترونية مجاناً بدون اشتراك شهري، مع إدارة الطلبات والشحن والحسابات';

const FS_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

// ---- Firestore REST helpers ----
function fsVal(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
  if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
  return undefined;
}
function fsFields(f) { const o = {}; for (const k in f) o[k] = fsVal(f[k]); return o; }

async function getMerchantBySlug(slug) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'merchants' }],
      where: { fieldFilter: { field: { fieldPath: 'linkSlug' }, op: 'EQUAL', value: { stringValue: slug } } },
      limit: 1
    }
  };
  const r = await fetch(FS_QUERY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) return null;
  const rows = await r.json();
  const doc = rows && rows[0] && rows[0].document;
  return doc ? fsFields(doc.fields || {}) : null;
}

// ---- بناء العنوان والوصف ----
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trim() + '…');

export function buildPreview(m) {
  const shop = clean(m.shop) || 'متجر';
  const isRestaurant = m.type === 'restaurant';
  const category = clean(m.category);
  const own = clean(m.description);
  const gov = clean(m.governorate);
  const products = (Array.isArray(m.products) ? m.products : []).map(p => clean(p && p.name)).filter(Boolean);
  const sample = [...new Set(products)].slice(0, 3).join('، ');

  // الجملة الأولى: شنو يبيع
  let what;
  if (own) what = cut(own.replace(/[.\u061F!]+$/, ''), 110);
  else if (isRestaurant) what = `مطعم${category && category !== 'أخرى' ? ' ' + category : ''}${sample ? ` — من أطباقنا: ${sample}` : ''}`;
  else if (category && category !== 'أخرى') what = `متجر مختص ببيع ${category}${sample ? ` — منها: ${sample}` : ''}`;
  else what = sample ? `نبيع: ${sample}` : 'متجر إلكتروني';

  const where = gov && !own ? ` في ${gov}` : '';
  const description = `${cut(what + where, 150)}\n\n${SIGNATURE}`;
  const title = `${shop} | ${SITE_NAME}`;

  let image = null;
  const logo = m.theme && (m.theme.logo || m.theme.banner);
  if (typeof logo === 'string' && /^https:\/\//.test(logo)) image = logo; // base64 ما يصلح لـ og:image
  return { title, description, image };
}

// ---- HTMLRewriter ----
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const slug = url.searchParams.get('s');
    const res = await fetch(request);
    if (!slug || !/^[A-Za-z0-9_-]{3,40}$/.test(slug)) return res;
    if (!(res.headers.get('content-type') || '').includes('text/html')) return res;

    let m = null;
    try { m = await getMerchantBySlug(slug); } catch (e) { /* نرجع الصفحة العادية */ }
    if (!m || m.status !== 'active') return res;

    const { title, description, image } = buildPreview(m);
    const setContent = v => ({ element(el) { el.setAttribute('content', v); } });
    let rw = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(title); } })
      .on('meta[name="description"]', setContent(description))
      .on('meta[property="og:title"]', setContent(title))
      .on('meta[property="og:description"]', setContent(description))
      .on('meta[property="og:url"]', setContent(url.origin + '/?s=' + encodeURIComponent(slug)))
      .on('meta[name="twitter:title"]', setContent(title))
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', url.origin + '/?s=' + encodeURIComponent(slug)); } });
    if (image) {
      rw = rw.on('head', { element(el) {
        el.append(`<meta property="og:image" content="${esc(image)}"><meta name="twitter:image" content="${esc(image)}">`, { html: true });
      } });
    }
    const out = new Response(rw.transform(res).body, res);
    out.headers.set('Cache-Control', 'public, max-age=300');
    return out;
  }
};
