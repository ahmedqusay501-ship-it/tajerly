// ---------- STORE THEMES (ثيمات المتجر) ----------
// The merchant picks a ready-made look for their public store. A theme only changes the
// *style* (background, cards, corners, shadows, font, header treatment) — the merchant's own
// primaryColor, logo, banners and products are untouched. The chosen id is saved on
// m.theme.themeId; stores without it (or with 'classic') render exactly as before.
//
// Each theme's real CSS lives in styles.css under `.store-themed.st-<id>`; the metadata here
// is only used for the picker cards and for the optional "suggested color".

const STORE_THEMES = [
  {
    id: 'classic', name: 'الكلاسيكي', desc: 'الشكل الأصلي الحالي لمتجرك',
    suggestedColor: null, font: null,
    preview: { bg: '#F4F6F9', surface: '#FFFFFF', ink: '#0F172A', border: '#E2E8F0', radius: 10, shadow: '0 2px 6px rgba(15,23,42,.08)' }
  },
  {
    id: 'modern', name: 'عصري', desc: 'نظيف وواسع، زوايا مدوّرة وظلال ناعمة',
    suggestedColor: '#2563EB', font: 'Tajawal',
    preview: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#0F172A', border: '#EEF2F7', radius: 16, shadow: '0 6px 16px rgba(15,23,42,.10)' }
  },
  {
    id: 'dark', name: 'الليلي', desc: 'خلفية داكنة أنيقة، تبرّز الصور والألوان',
    suggestedColor: '#F59E0B', font: 'Tajawal',
    preview: { bg: '#0B1220', surface: '#162033', ink: '#F1F5F9', border: '#243049', radius: 14, shadow: '0 6px 16px rgba(0,0,0,.45)' }
  },
  {
    id: 'soft', name: 'الناعم', desc: 'ألوان باستيل دافئة وزوايا دائرية كبيرة',
    suggestedColor: '#D9778F', font: 'Almarai',
    preview: { bg: '#FFF6F1', surface: '#FFFFFF', ink: '#4A2C2A', border: '#F6DDD2', radius: 22, shadow: '0 6px 14px rgba(217,119,143,.16)' }
  },
  {
    id: 'luxury', name: 'الفخم', desc: 'أسود وذهبي، زوايا حادة وخط أنيق — للعطور والمجوهرات',
    suggestedColor: '#B8924A', font: 'Amiri',
    preview: { bg: '#0E0E0E', surface: '#171717', ink: '#F3E9D2', border: '#3A3220', radius: 3, shadow: '0 0 0 1px #3A3220' }
  },
  {
    id: 'fresh', name: 'المنعش', desc: 'أخضر هادئ وأزرار بيضوية — للأكل والخضار والعناية',
    suggestedColor: '#10B981', font: 'Almarai',
    preview: { bg: '#F0FDF7', surface: '#FFFFFF', ink: '#064E3B', border: '#CFF1E1', radius: 20, shadow: '0 4px 12px rgba(16,185,129,.14)' }
  },
  {
    id: 'bold', name: 'الجريء', desc: 'حدود سميكة وظلال حادة، شكل شبابي لافت',
    suggestedColor: '#7C3AED', font: 'Tajawal',
    preview: { bg: '#FFE95C', surface: '#FFFFFF', ink: '#111111', border: '#111111', radius: 8, shadow: '3px 3px 0 #111111' }
  },
  {
    id: 'minimal', name: 'البسيط', desc: 'أبيض صافي وخطوط رفيعة بدون ظلال',
    suggestedColor: '#111827', font: 'Tajawal',
    preview: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#111827', border: '#E5E7EB', radius: 2, shadow: 'none' }
  }
];

function getStoreTheme(m) {
  const id = m && m.theme && m.theme.themeId;
  return STORE_THEMES.find(t => t.id === id) || STORE_THEMES[0];
}

// Google Fonts are only fetched when a theme that needs one is actually used, so classic
// stores (and everyone else on the platform) don't pay any extra download.
const _loadedStoreFonts = {};
function ensureStoreFont(family) {
  if (!family || _loadedStoreFonts[family]) return;
  _loadedStoreFonts[family] = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':wght@400;600;700;800&display=swap';
  document.head.appendChild(link);
}

function _clearStoreThemeFrom(content) {
  content.className = content.className.split(/\s+/).filter(c => c && c !== 'store-themed' && !/^st-/.test(c)).join(' ');
  ['--accent', '--accent-light', '--accent-dark', '--accent-soft', '--st-font'].forEach(v => content.style.removeProperty(v));
  const screen = content.closest('#public-store-screen');
  if (screen) screen.className = screen.className.split(/\s+/).filter(c => c && !/^st-screen/.test(c)).join(' ');
}

// Called from renderStorefrontInto on every render (public page, merchant preview, admin browser).
function applyStoreTheme(content, m) {
  if (!content || !m) return;
  _clearStoreThemeFrom(content);
  const t = getStoreTheme(m);
  if (t.id === 'classic') return;

  content.classList.add('store-themed', 'st-' + t.id);
  // Drive the platform's accent variables from the merchant's own color so chips, prices,
  // buttons and the category ring all match their brand inside a themed store.
  const c = (m.theme && /^#[0-9a-f]{6}$/i.test(m.theme.primaryColor)) ? m.theme.primaryColor : '#C77B4A';
  const dark = t.id === 'dark' || t.id === 'luxury';
  content.style.setProperty('--accent', c);
  content.style.setProperty('--accent-light', shadeColor(c, 14));
  content.style.setProperty('--accent-dark', dark ? shadeColor(c, 12) : shadeColor(c, -16));
  content.style.setProperty('--accent-soft', c + (dark ? '2B' : '22'));
  if (t.font) {
    ensureStoreFont(t.font);
    content.style.setProperty('--st-font', `'${t.font}', 'Cairo', 'Segoe UI', Tahoma, sans-serif`);
  }
  // Let the whole public page (behind the store card) take the theme background too.
  const screen = content.closest('#public-store-screen');
  if (screen) screen.classList.add('st-screen', 'st-screen-' + t.id);
}

// ---------- Merchant dashboard: picker ----------
function renderStoreThemePicker(m) {
  ensureMerchantTheme(m);
  const cur = getStoreTheme(m).id;
  const cards = STORE_THEMES.map(t => {
    const p = t.preview;
    const sel = t.id === cur;
    return `
      <div class="theme-pick${sel ? ' selected' : ''}" onclick="setStoreTheme(${m.id}, '${t.id}')">
        <div class="theme-pick-prev" style="background:${p.bg}; border-color:${p.border};">
          <div class="theme-pick-bar" style="background:${m.theme.primaryColor};"></div>
          <div class="theme-pick-cards">
            <span style="background:${p.surface}; border:1px solid ${p.border}; border-radius:${p.radius}px; box-shadow:${p.shadow};"></span>
            <span style="background:${p.surface}; border:1px solid ${p.border}; border-radius:${p.radius}px; box-shadow:${p.shadow};"></span>
          </div>
          <div class="theme-pick-line" style="background:${p.ink};"></div>
        </div>
        <div class="theme-pick-name">${t.name}${sel ? ' ✓' : ''}</div>
        <div class="theme-pick-desc">${t.desc}</div>
      </div>`;
  }).join('');
  const t = getStoreTheme(m);
  const suggest = t.suggestedColor && t.suggestedColor.toLowerCase() !== (m.theme.primaryColor || '').toLowerCase()
    ? `<div class="theme-suggest">
         <span class="theme-suggest-dot" style="background:${t.suggestedColor};"></span>
         <span>لون يناسب ثيم «${t.name}»</span>
         <button type="button" class="btn secondary small" style="margin:0;" onclick="applyThemeSuggestedColor(${m.id})">جرّبه</button>
       </div>` : '';
  return `
    <div class="theme-pick-grid">${cards}</div>
    ${suggest}
    <div class="subtitle" style="margin-top:8px;">الثيم يغيّر الشكل العام فقط — لونك وشعارك ومنتجاتك تبقى مثل ما هي.</div>`;
}

function setStoreTheme(id, themeId) {
  const m = data.merchants.find(x => x.id === id);
  if (!m || !STORE_THEMES.some(t => t.id === themeId)) return;
  ensureMerchantTheme(m).theme.themeId = themeId;
  saveData();
  renderMerchantPanel();
  showToast('تم تطبيق الثيم — اضغط على العدسة لمعاينة متجرك');
}

function applyThemeSuggestedColor(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  const t = getStoreTheme(m);
  if (!t.suggestedColor) return;
  ensureMerchantTheme(m).theme.primaryColor = t.suggestedColor;
  saveData();
  renderMerchantPanel();
}
