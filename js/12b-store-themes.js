// ---------- STORE THEMES (ثيمات المتجر) ----------
// The merchant picks a ready-made look for their public store. A theme only changes the
// *style* (background, cards, corners, shadows, font, header treatment) — the merchant's own
// primaryColor, logo, banners and products are untouched. The chosen id is saved on
// m.theme.themeId; stores without it (or with 'classic') render exactly as before.
//
// Each theme's real CSS lives in styles.css under `.store-themed.st-<id>`; the metadata here
// is only used for the picker cards and for the optional "suggested color".

// مجموعات الثيمات (تبويبات الاختيار). كل ثيم له group، والتاجر يشوف أول شي المجموعة اللي تناسب نشاطه.
const STORE_THEME_GROUPS = [
  { id: 'general',   name: 'عام',               icon: '✨' },
  { id: 'food',      name: 'مطاعم وكافيهات',    icon: '🍽️' },
  { id: 'fashion',   name: 'ملابس وأزياء',      icon: '👗' },
  { id: 'beauty',    name: 'كوزمتك وعناية',     icon: '💄' },
  { id: 'perfume',   name: 'عطور وإكسسوارات',   icon: '💎' },
  { id: 'tech',      name: 'إلكترونيات',        icon: '📱' },
  { id: 'kids',      name: 'أطفال وألعاب',      icon: '🧸' },
  { id: 'home',      name: 'منزل وبقالة',       icon: '🏠' }
];

// أي مجموعة نعرضها أول شي حسب نوع المتجر (مطعم/ماركت) وتصنيفه (STORE_CATEGORIES)
const STORE_THEME_GROUP_BY_CATEGORY = {
  'ملابس وأزياء': 'fashion', 'أحذية': 'fashion', 'إكسسوارات': 'perfume',
  'إلكترونيات وموبايلات': 'tech', 'مواد منزلية': 'home',
  'مستحضرات تجميل': 'beauty', 'ألعاب أطفال': 'kids'
};

// Google Fonts ترجع خطأ 400 إذا طلبنا وزن غير موجود بالخط — لهذا لكل خط أوزانه الحقيقية.
const STORE_FONT_WEIGHTS = {
  'Tajawal': '400;500;700;800', 'Almarai': '400;700;800', 'Amiri': '400;700',
  'El Messiri': '400;500;600;700', 'Changa': '400;600;700;800', 'Reem Kufi': '400;500;600;700',
  'Readex Pro': '400;500;600;700', 'IBM Plex Sans Arabic': '400;500;600;700',
  'Baloo Bhaijaan 2': '400;500;600;700;800', 'Lemonada': '400;500;600;700',
  'Aref Ruqaa': '400;700', 'Markazi Text': '400;500;600;700', 'Lalezar': '400'
};

const STORE_THEMES = [
  {
    id: 'classic', group: 'general', name: 'الكلاسيكي', desc: 'الشكل الأصلي الحالي لمتجرك',
    suggestedColor: null, font: null,
    preview: { bg: '#F4F6F9', surface: '#FFFFFF', ink: '#0F172A', border: '#E2E8F0', radius: 10, shadow: '0 2px 6px rgba(15,23,42,.08)' }
  },
  {
    id: 'modern', group: 'general', name: 'عصري', desc: 'نظيف وواسع، زوايا مدوّرة وظلال ناعمة',
    suggestedColor: '#2563EB', font: 'Tajawal',
    preview: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#0F172A', border: '#EEF2F7', radius: 16, shadow: '0 6px 16px rgba(15,23,42,.10)' }
  },
  {
    id: 'dark', group: 'general', dark: true, name: 'الليلي', desc: 'خلفية داكنة أنيقة، تبرّز الصور والألوان',
    suggestedColor: '#F59E0B', font: 'Tajawal',
    preview: { bg: '#0B1220', surface: '#162033', ink: '#F1F5F9', border: '#243049', radius: 14, shadow: '0 6px 16px rgba(0,0,0,.45)' }
  },
  {
    id: 'soft', group: 'general', name: 'الناعم', desc: 'ألوان باستيل دافئة وزوايا دائرية كبيرة',
    suggestedColor: '#D9778F', font: 'Almarai',
    preview: { bg: '#FFF6F1', surface: '#FFFFFF', ink: '#4A2C2A', border: '#F6DDD2', radius: 22, shadow: '0 6px 14px rgba(217,119,143,.16)' }
  },
  {
    id: 'luxury', group: 'general', dark: true, name: 'الفخم', desc: 'أسود وذهبي، زوايا حادة وخط أنيق — للعطور والمجوهرات',
    suggestedColor: '#B8924A', font: 'Amiri',
    preview: { bg: '#0E0E0E', surface: '#171717', ink: '#F3E9D2', border: '#3A3220', radius: 3, shadow: '0 0 0 1px #3A3220' }
  },
  {
    id: 'fresh', group: 'general', name: 'المنعش', desc: 'أخضر هادئ وأزرار بيضوية — للأكل والخضار والعناية',
    suggestedColor: '#10B981', font: 'Almarai',
    preview: { bg: '#F0FDF7', surface: '#FFFFFF', ink: '#064E3B', border: '#CFF1E1', radius: 20, shadow: '0 4px 12px rgba(16,185,129,.14)' }
  },
  {
    id: 'bold', group: 'general', name: 'الجريء', desc: 'حدود سميكة وظلال حادة، شكل شبابي لافت',
    suggestedColor: '#7C3AED', font: 'Tajawal',
    preview: { bg: '#FFE95C', surface: '#FFFFFF', ink: '#111111', border: '#111111', radius: 8, shadow: '3px 3px 0 #111111' }
  },
  {
    id: 'minimal', group: 'general', name: 'البسيط', desc: 'أبيض صافي وخطوط رفيعة بدون ظلال',
    suggestedColor: '#111827', font: 'Tajawal',
    preview: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#111827', border: '#E5E7EB', radius: 2, shadow: 'none' }
  },
  {
    id: 'grill', group: 'food', name: 'المشويات', desc: 'فحمي دافئ بلمعة جمر — للمشاوي والبرغر',
    suggestedColor: '#E8590C', font: 'Changa', dark: true,
    preview: { bg: '#130F0D', surface: '#1E1815', ink: '#F6E9DC', border: '#3A2B22', radius: 10, shadow: '0 10px 24px rgba(0,0,0,.5)' }
  },
  {
    id: 'cafe', group: 'food', name: 'الكافيه', desc: 'ورقي كريمي ولون قهوة — للكافيهات والمخابز',
    suggestedColor: '#7B4B2A', font: 'Almarai', headFont: 'El Messiri',
    preview: { bg: '#F7F0E6', surface: '#FFFBF5', ink: '#3B2A20', border: '#E6D8C5', radius: 14, shadow: '0 6px 14px rgba(91,60,33,.10)' }
  },
  {
    id: 'fastfood', group: 'food', name: 'الوجبات السريعة', desc: 'ألوان صارخة وأزرار منفوخة — للبرغر والبيتزا',
    suggestedColor: '#E11D2E', font: 'Baloo Bhaijaan 2',
    preview: { bg: '#FFF4CC', surface: '#FFFFFF', ink: '#2B1408', border: '#FFD43B', radius: 18, shadow: '0 4px 0 #F2B705' }
  },
  {
    id: 'sweets', group: 'food', name: 'الحلويات', desc: 'وردي وكريمي بخلفية متدرجة — للكيك والآيس كريم',
    suggestedColor: '#E8508A', font: 'Almarai', headFont: 'Lemonada',
    preview: { bg: '#FFF0F5', surface: '#FFFFFF', ink: '#5B2340', border: '#FAD4E3', radius: 24, shadow: '0 8px 18px rgba(232,80,138,.16)' }
  },
  {
    id: 'heritage', group: 'food', name: 'التراثي', desc: 'رمالي وطيني بإطار مزدوج وخط ديواني — للأكل الشعبي',
    suggestedColor: '#B4532A', font: 'Almarai', headFont: 'Aref Ruqaa',
    preview: { bg: '#F3E8D4', surface: '#FBF4E6', ink: '#4A2A18', border: '#D6BE95', radius: 4, shadow: 'none' }
  },
  {
    id: 'editorial', group: 'fashion', name: 'المجلة', desc: 'أبيض وأسود بتباعد أنيق وعناوين كبيرة — للأزياء الراقية',
    suggestedColor: '#111111', font: 'Tajawal', headFont: 'Reem Kufi',
    preview: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#0A0A0A', border: '#E5E5E5', radius: 0, shadow: 'none' }
  },
  {
    id: 'street', group: 'fashion', name: 'ستريت', desc: 'داكن بلمسة نيون وزوايا حادة — للأحذية والملابس الشبابية',
    suggestedColor: '#C6FF00', font: 'Changa', dark: true,
    preview: { bg: '#0C0C0D', surface: '#151517', ink: '#F4F4F5', border: '#2A2A2E', radius: 0, shadow: 'none' }
  },
  {
    id: 'boutique', group: 'fashion', name: 'البوتيك', desc: 'بيج دافئ وصور بقوس أنيق — للأزياء النسائية والعبايات',
    suggestedColor: '#A47551', font: 'Almarai', headFont: 'El Messiri',
    preview: { bg: '#F6EEE6', surface: '#FFFCF9', ink: '#3A2E27', border: '#E8DACB', radius: 16, shadow: '0 8px 20px rgba(120,84,52,.10)' }
  },
  {
    id: 'denim', group: 'fashion', name: 'الدنيم', desc: 'أزرق جينز وحدود بخياطة منقّطة — للأزياء الكاجوال',
    suggestedColor: '#1E40AF', font: 'Readex Pro',
    preview: { bg: '#E8EEF7', surface: '#FFFFFF', ink: '#12213F', border: '#B9C7E2', radius: 12, shadow: '0 4px 12px rgba(30,64,175,.12)' }
  },
  {
    id: 'glam', group: 'beauty', name: 'جلام', desc: 'بنفسجي غامق ولمعة وردية — للمكياج والعناية الراقية',
    suggestedColor: '#E0457B', font: 'Tajawal', dark: true,
    preview: { bg: '#170C17', surface: '#231223', ink: '#FBEAF3', border: '#43224A', radius: 18, shadow: '0 10px 26px rgba(0,0,0,.5)' }
  },
  {
    id: 'glow', group: 'beauty', name: 'الإشراقة', desc: 'زجاجي شفاف بخلفية لافندر وخوخي — للعناية والبشرة',
    suggestedColor: '#A855F7', font: 'Almarai',
    preview: { bg: 'linear-gradient(160deg,#F3E8FF,#FFE9E1)', surface: 'rgba(255,255,255,.62)', ink: '#3B1F52', border: 'rgba(255,255,255,.8)', radius: 22, shadow: '0 10px 30px rgba(168,85,247,.16)' }
  },
  {
    id: 'spa', group: 'beauty', name: 'السبا', desc: 'أخضر مريمي هادئ وعناوين وسطية — للصابون والعناية الطبيعية',
    suggestedColor: '#6B8F71', font: 'Almarai',
    preview: { bg: '#F1F4EE', surface: '#FBFCF9', ink: '#2F3E34', border: '#DCE5D8', radius: 24, shadow: '0 6px 18px rgba(75,105,82,.10)' }
  },
  {
    id: 'oud', group: 'perfume', name: 'العود', desc: 'عنابي عميق وذهب عتيق بإطار مزخرف — للعطور والبخور',
    suggestedColor: '#C9A24B', font: 'Amiri', dark: true,
    preview: { bg: '#170A0D', surface: '#220F13', ink: '#F4E6CC', border: '#4A2A25', radius: 4, shadow: 'none' }
  },
  {
    id: 'pearl', group: 'perfume', name: 'اللؤلؤ', desc: 'عاجي وشامبانيا بلمعة ناعمة — للمجوهرات والإكسسوارات',
    suggestedColor: '#B08D6B', font: 'Almarai', headFont: 'Markazi Text',
    preview: { bg: '#FAF7F2', surface: '#FFFFFF', ink: '#3C3329', border: '#EAE1D3', radius: 12, shadow: '0 6px 20px rgba(120,100,70,.08)' }
  },
  {
    id: 'tech', group: 'tech', name: 'التقني', desc: 'رمادي مزرق نظيف وخط علوي لكل بطاقة — للموبايلات والأجهزة',
    suggestedColor: '#2563EB', font: 'IBM Plex Sans Arabic',
    preview: { bg: '#F1F4F9', surface: '#FFFFFF', ink: '#0B1B33', border: '#DDE4EE', radius: 10, shadow: '0 2px 6px rgba(11,27,51,.06)' }
  },
  {
    id: 'neon', group: 'tech', name: 'النيون', desc: 'داكن بتوهج نيون — للألعاب والإكسسوارات التقنية',
    suggestedColor: '#22D3EE', font: 'Readex Pro', dark: true,
    preview: { bg: '#060610', surface: '#0E0E1F', ink: '#E8EDFF', border: '#23244A', radius: 12, shadow: '0 0 0 1px #23244A' }
  },
  {
    id: 'kids', group: 'kids', name: 'المرح', desc: 'ألوان مبهجة وأزرار منفوخة — لألعاب وملابس الأطفال',
    suggestedColor: '#FF6B6B', font: 'Baloo Bhaijaan 2',
    preview: { bg: '#EAF6FF', surface: '#FFFFFF', ink: '#2B3A67', border: '#BFE3FF', radius: 24, shadow: '0 6px 0 #BFE3FF' }
  },
  {
    id: 'grocery', group: 'home', name: 'البقالة', desc: 'مرتّب وسريع بأسعار بارزة — للمواد الغذائية والمنزلية',
    suggestedColor: '#16A34A', font: null,
    preview: { bg: '#F4F7F2', surface: '#FFFFFF', ink: '#14301F', border: '#DDE8DA', radius: 12, shadow: '0 2px 8px rgba(20,48,31,.07)' }
  },
  {
    id: 'decor', group: 'home', name: 'الديكور', desc: 'ترابي دافئ وزوايا بشكل ورقة نبات — للأثاث والديكور',
    suggestedColor: '#B5653A', font: 'Tajawal', headFont: 'El Messiri',
    preview: { bg: '#F2EBE0', surface: '#FBF7F0', ink: '#3B3128', border: '#DFD3BF', radius: 10, shadow: '0 6px 16px rgba(80,60,35,.09)' }
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
  const weights = STORE_FONT_WEIGHTS[family] || '400;700';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':wght@' + weights + '&display=swap';
  document.head.appendChild(link);
}

// أبيض أو داكن — أيهما أوضح فوق لون التاجر (للأزرار والشرائح المختارة داخل الثيمات الجديدة)
function _readableOn(hex) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#FFFFFF';
}

function _clearStoreThemeFrom(content) {
  content.className = content.className.split(/\s+/).filter(c => c && c !== 'store-themed' && !/^st-/.test(c)).join(' ');
  ['--accent', '--accent-light', '--accent-dark', '--accent-soft', '--st-font', '--st-font-head', '--on-accent'].forEach(v => content.style.removeProperty(v));
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
  // الثيمات الجديدة (كل ما عدا مجموعة "عام") تاخذ st-x حتى تتفعّل عليها قواعد الصقل المشتركة
  if (t.group && t.group !== 'general') content.classList.add('st-x');
  // Drive the platform's accent variables from the merchant's own color so chips, prices,
  // buttons and the category ring all match their brand inside a themed store.
  const c = (m.theme && /^#[0-9a-f]{6}$/i.test(m.theme.primaryColor)) ? m.theme.primaryColor : '#C77B4A';
  const dark = !!t.dark;
  content.style.setProperty('--accent', c);
  content.style.setProperty('--accent-light', shadeColor(c, 14));
  content.style.setProperty('--accent-dark', dark ? shadeColor(c, 12) : shadeColor(c, -16));
  content.style.setProperty('--accent-soft', c + (dark ? '2B' : '22'));
  content.style.setProperty('--on-accent', _readableOn(c));
  if (t.font) {
    ensureStoreFont(t.font);
    content.style.setProperty('--st-font', `'${t.font}', 'Cairo', 'Segoe UI', Tahoma, sans-serif`);
  }
  if (t.headFont) {
    ensureStoreFont(t.headFont);
    content.style.setProperty('--st-font-head', `'${t.headFont}', '${t.font || 'Cairo'}', 'Cairo', 'Segoe UI', Tahoma, sans-serif`);
  }
  // Let the whole public page (behind the store card) take the theme background too.
  const screen = content.closest('#public-store-screen');
  if (screen) screen.classList.add('st-screen', 'st-screen-' + t.id);
}

// ---------- Merchant dashboard: picker ----------
// آخر تبويب اختاره التاجر بالجلسة (ما نحفظه بالداتا — مجرد راحة تصفّح)
let _themePickerGroup = null;

function _defaultThemeGroup(m) {
  const cur = getStoreTheme(m);
  if (cur && cur.id !== 'classic' && cur.group) return cur.group;           // نفتح على مجموعة ثيمه الحالي
  if (m.type === 'restaurant') return 'food';
  return STORE_THEME_GROUP_BY_CATEGORY[m.category] || 'general';
}

function _themeCardHtml(m, t, cur) {
  const p = t.preview;
  const sel = t.id === cur;
  return `
      <div class="theme-pick${sel ? ' selected' : ''}" onclick="setStoreTheme(${m.id}, '${t.id}')">
        <div class="theme-pick-prev" style="background:${p.bg}; border-color:${p.border};">
          <div class="theme-pick-bar" style="background:${safeColor(m.theme.primaryColor)};"></div>
          <div class="theme-pick-cards">
            <span style="background:${p.surface}; border:1px solid ${p.border}; border-radius:${p.radius}px; box-shadow:${p.shadow};"></span>
            <span style="background:${p.surface}; border:1px solid ${p.border}; border-radius:${p.radius}px; box-shadow:${p.shadow};"></span>
          </div>
          <div class="theme-pick-line" style="background:${p.ink};"></div>
        </div>
        <div class="theme-pick-name">${t.name}${sel ? ' ✓' : ''}</div>
        <div class="theme-pick-desc">${t.desc}</div>
      </div>`;
}

function _renderThemePickerInner(m) {
  const cur = getStoreTheme(m).id;
  const group = _themePickerGroup || _defaultThemeGroup(m);
  const recommended = m.type === 'restaurant' ? 'food' : STORE_THEME_GROUP_BY_CATEGORY[m.category];
  const tabs = [{ id: 'all', name: 'الكل', icon: '🎨' }].concat(STORE_THEME_GROUPS).map(g => {
    const n = g.id === 'all' ? STORE_THEMES.length : STORE_THEMES.filter(t => t.group === g.id).length;
    return `<div class="theme-group-tab${g.id === group ? ' on' : ''}" onclick="setThemePickerGroup(${m.id}, '${g.id}')">${g.icon} ${g.name}<small>${n}</small>${g.id === recommended ? '<em title="مناسب لنشاطك">★</em>' : ''}</div>`;
  }).join('');
  const list = STORE_THEMES.filter(t => group === 'all' || t.group === group);
  const cards = list.map(t => _themeCardHtml(m, t, cur)).join('');
  const t = getStoreTheme(m);
  const suggest = t.suggestedColor && t.suggestedColor.toLowerCase() !== (m.theme.primaryColor || '').toLowerCase()
    ? `<div class="theme-suggest">
         <span class="theme-suggest-dot" style="background:${safeColor(t.suggestedColor)};"></span>
         <span>لون يناسب ثيم «${t.name}»</span>
         <button type="button" class="btn secondary small" style="margin:0;" onclick="applyThemeSuggestedColor(${m.id})">جرّبه</button>
       </div>` : '';
  return `
    <div class="theme-group-tabs">${tabs}</div>
    <div class="theme-pick-grid">${cards}</div>
    ${suggest}
    <div class="subtitle" style="margin-top:8px;">الثيم يغيّر الشكل العام فقط — لونك وشعارك ومنتجاتك تبقى مثل ما هي.</div>`;
}

function renderStoreThemePicker(m) {
  ensureMerchantTheme(m);
  return `<div id="theme-picker-${m.id}">${_renderThemePickerInner(m)}</div>`;
}

// تبديل التبويب بدون إعادة رسم كل لوحة التاجر (حتى ما ينقفز السكرول)
function setThemePickerGroup(id, groupId) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  _themePickerGroup = groupId;
  const box = document.getElementById('theme-picker-' + id);
  if (box) box.innerHTML = _renderThemePickerInner(m);
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
