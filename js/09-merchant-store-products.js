// ---------- MERCHANT DASHBOARD SUB-TABS ----------
// Same idea as the admin dashboard: split the merchant panel into sections
// (store / orders / products / appearance / earnings / charts) instead of one long
// page. currentMerchantDashTab persists the open section across re-renders (the panel
// gets rebuilt often — after actions, and every 5s by the live-refresh poll).
let currentMerchantDashTab = 'store';
function showMerchantDashTab(id) {
  currentMerchantDashTab = id;
  applyMerchantDashTab();
  if (id === 'messages' && loggedInMerchantId) {
    markAnnouncementsRead(loggedInMerchantId).then(() => {
      // Only re-render the badge/list, not the whole panel, so we don't yank the tab away
      const m = data.merchants.find(x => x.id === loggedInMerchantId);
      if (!m) return;
      const box = document.getElementById(`merchant-announcements-${m.id}`);
      if (box) box.innerHTML = renderMerchantAnnouncements(m);
      document.querySelectorAll('#merchant-dash-subnav .toggle[data-mdashtab="messages"]').forEach(btn => {
        btn.innerHTML = `${unreadAnnouncementsBadgeHtml(m)}رسائل الإدارة`;
      });
    });
  }
}

// Returns null for the real merchant (sees everything), or the array of tab ids their
// logged-in employee is allowed to use. An employee's account is never allowed to manage
// other employees — that stays with the real merchant only.
function merchantPanelAllowedTabs() {
  const emp = currentEmployee();
  if (emp && emp.ownerType === 'merchant') return emp.permissions;
  return null;
}
function applyEmployeeGating() {
  const allowed = merchantPanelAllowedTabs();
  const subnav = document.getElementById('merchant-dash-subnav');
  if (!subnav) return;
  subnav.querySelectorAll('.toggle').forEach(btn => {
    const id = btn.dataset.mdashtab;
    // 'employees' stays owner-only. 'messages' (admin announcements inbox) is shown to
    // everyone with access to the merchant panel — it's read-only, so there's nothing an
    // employee could misuse there, and the merchant would want their team to see it too.
    const visible = id === 'employees' ? allowed === null : (id === 'messages' ? true : (allowed === null || allowed.includes(id)));
    btn.style.display = visible ? '' : 'none';
  });
  // If the tab that would open by default isn't one this viewer is allowed to see
  // (permissions changed, or this is the employee's first visit), fall back to the first
  // tab they do have access to.
  if (allowed !== null && !allowed.includes(currentMerchantDashTab)) {
    currentMerchantDashTab = allowed[0] || 'store';
  }
  // Employees never see the merchant's own account credentials.
  const credCard = document.getElementById('own-credentials-card-' + (loggedInMerchantId || ''));
  if (credCard) credCard.style.display = allowed === null ? '' : 'none';
}
function applyMerchantDashTab() {
  if (!document.getElementById('merchant-dash-subnav')) return;
  document.querySelectorAll('#merchant-dash-subnav .toggle').forEach(b => b.classList.toggle('selected', b.dataset.mdashtab === currentMerchantDashTab));
  document.querySelectorAll('#merchant-panel .dash-tab').forEach(el => el.classList.toggle('active', el.dataset.mdashtabContent === currentMerchantDashTab));
  // Chart.js can't size a canvas that was hidden (display:none) when it was drawn,
  // so re-render the charts now that their tab is actually visible.
  if (currentMerchantDashTab === 'charts') {
    const m = data.merchants.find(x => x.id === loggedInMerchantId);
    if (m) renderMerchantCharts(m);
  }
}

// ---------- MERCHANT DASHBOARD COLOR (own admin panel look, admin unaffected) ----------
// Lightens (positive percent) or darkens (negative percent) a hex color, used to derive
// dark/light/soft accent shades from the single color a merchant picks.
function shadeColor(hex, percent) {
  hex = (hex || '#10B981').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00FF) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000FF) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// Applies (or resets) the merchant-chosen dashboard color. Pass null to restore the
// platform's default gold accent (used for admin / logged-out screens).
function applyMerchantDashboardColor(m) {
  const root = document.documentElement;
  if (m && m.dashboardColor) {
    root.style.setProperty('--accent', m.dashboardColor);
    root.style.setProperty('--accent-dark', shadeColor(m.dashboardColor, -20));
    root.style.setProperty('--accent-light', shadeColor(m.dashboardColor, 20));
    root.style.setProperty('--accent-soft', shadeColor(m.dashboardColor, 85));
  } else {
    root.style.setProperty('--accent', '#10B981');
    root.style.setProperty('--accent-dark', '#059669');
    root.style.setProperty('--accent-light', '#34D399');
    root.style.setProperty('--accent-soft', '#D1FAE5');
  }
}

function setDashboardColor(id, color) {
  const m = data.merchants.find(x => x.id === id);
  m.dashboardColor = color;
  saveData();
  applyMerchantDashboardColor(m);
}

// ---------- MERCHANT THEME (color / logo / banner) ----------
function setThemeColor(id, color) {
  const m = data.merchants.find(x => x.id === id);
  ensureMerchantTheme(m).theme.primaryColor = color;
  saveData();
  renderMerchantPanel();
}

async function setThemeLogo(id, inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file, 300, 0.85);
    const m = data.merchants.find(x => x.id === id);
    ensureMerchantTheme(m).theme.logo = dataUrl;
    saveData();
    renderMerchantPanel();
    showToast('تم حفظ الشعار');
  } catch (e) {
    showToast('صار خطأ بمعالجة الصورة');
  }
}

async function setThemeBanner(id, inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file, 900, 0.75);
    const m = data.merchants.find(x => x.id === id);
    ensureMerchantTheme(m).theme.banner = dataUrl;
    saveData();
    renderMerchantPanel();
    showToast('تم حفظ صورة الغلاف');
  } catch (e) {
    showToast('صار خطأ بمعالجة الصورة');
  }
}

function removeThemeImage(id, which) {
  const m = data.merchants.find(x => x.id === id);
  ensureMerchantTheme(m).theme[which] = null;
  saveData();
  renderMerchantPanel();
}

// ---------- AI SMART DESIGN (analyzes the merchant's logo colors and suggests a theme) ----------
// Purely additive feature: it only ever proposes a suggestion (aiDesignSuggestion) that the
// merchant must explicitly apply — it never touches theme.primaryColor/banner on its own,
// and never runs automatically, so nothing existing changes unless the merchant approves it.
let aiDesignSuggestion = null;

function hexToRgbAI(hex) {
  hex = (hex || '#10B981').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function pickReadableTextColor(hex) {
  const { r, g, b } = hexToRgbAI(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 150 ? '#1E293B' : '#FFFFFF';
}

// Samples the logo's pixels and finds the most prominent saturated color (skipping
// near-white/near-black/near-gray pixels, which are usually just background/outline).
function extractDominantColorAI(imgDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 60;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const px = ctx.getImageData(0, 0, size, size).data;
        const buckets = {};
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
          if (a < 100) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const lightness = (max + min) / 2;
          if (lightness > 235 || lightness < 20) continue;
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 255));
          if (sat < 0.15) continue;
          const key = [Math.round(r / 24) * 24, Math.round(g / 24) * 24, Math.round(b / 24) * 24].join(',');
          if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0, satSum: 0 };
          buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
          buckets[key].count++; buckets[key].satSum += sat;
        }
        let best = null, bestScore = -1;
        for (const k in buckets) {
          const bucket = buckets[k];
          const score = bucket.count * (bucket.satSum / bucket.count);
          if (score > bestScore) { bestScore = score; best = bucket; }
        }
        if (!best) { resolve('#C77B4A'); return; }
        const r = Math.round(best.r / best.count), g = Math.round(best.g / best.count), b = Math.round(best.b / best.count);
        resolve('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('logo load failed'));
    img.src = imgDataUrl;
  });
}

// Draws a ready-made storefront banner (gradient inspired by the logo's color + shop name).
async function generateAiBannerAI(primaryColor, shopName) {
  try { if (document.fonts && document.fonts.load) await document.fonts.load("700 64px Cairo"); } catch (e) {}
  const w = 1200, h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const light = shadeColor(primaryColor, 18);
  const dark = shadeColor(primaryColor, -28);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(w * 0.86, h * 0.22, 150, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.1, h * 0.88, 110, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = pickReadableTextColor(primaryColor);
  ctx.font = "700 64px 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.direction = 'rtl'; } catch (e) {}
  ctx.fillText(shopName || '', w / 2, h / 2);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Entry point for the "AI Smart Design" card. If a new logo file is passed it's saved as the
// merchant's logo first (same as the normal logo uploader), then analyzed either way.
async function runAiDesign(id, inputEl) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  ensureMerchantTheme(m);
  try {
    if (inputEl && inputEl.files && inputEl.files[0]) {
      const dataUrl = await resizeImageFile(inputEl.files[0], 300, 0.85);
      m.theme.logo = dataUrl;
      saveData();
    }
    if (!m.theme.logo) { showToast('ارفع شعار المحل أول عشان الذكاء الاصطناعي يحلله'); return; }
    showToast('جاري تحليل الشعار وتصميم الألوان...');
    const primaryColor = await extractDominantColorAI(m.theme.logo);
    const banner = await generateAiBannerAI(primaryColor, m.shop);
    aiDesignSuggestion = { merchantId: id, primaryColor, banner };
    renderMerchantPanel();
  } catch (e) {
    showToast('صار خطأ بتحليل الشعار، جرب صورة ثانية');
  }
}

function applyAiDesign(id) {
  if (!aiDesignSuggestion || aiDesignSuggestion.merchantId !== id) return;
  const m = data.merchants.find(x => x.id === id);
  ensureMerchantTheme(m).theme.primaryColor = aiDesignSuggestion.primaryColor;
  m.theme.banner = aiDesignSuggestion.banner;
  aiDesignSuggestion = null;
  saveData();
  renderMerchantPanel();
  showToast('تم تطبيق التصميم الذكي على متجرك');
}

function dismissAiDesign() {
  aiDesignSuggestion = null;
  renderMerchantPanel();
}

let editingProductId = null;
// Sizes/colors being built for a brand-new product (not saved yet), keyed by merchant id —
// lets the merchant add as many size/color boxes as they want (shoe sizes, clothing sizes,
// any colors) before hitting "إضافة المنتج". Cleared once the product is actually added.
let draftProductSizes = {};
let draftProductColors = {};

// Shared chip renderer for both the "add product" draft list and the "edit product" live
// list — removeFn(i) returns the onclick JS for that chip's ✕ button, editFn(i) (optional)
// returns the onclick JS for editing that chip's stock number.
function sizeChipsHtml(sizes, removeFn, editFn) {
  if (!sizes || sizes.length === 0) return '<span class="subtitle" style="margin:0;">ما ضفت مقاسات بعد</span>';
  return sizes.map((s, i) => {
    const stockLabel = typeof s.stock === 'number' ? `<span class="size-chip-stock">(${s.stock})</span>` : '';
    return `<span class="size-chip-box"${editFn ? ` onclick="${editFn(i)}" style="cursor:pointer;"` : ''}>${esc(s.value)} ${stockLabel}<span class="x" onclick="event.stopPropagation();${removeFn(i)}">✕</span></span>`;
  }).join('');
}

// Same idea as sizeChipsHtml but for color boxes — each one shows its swatch, name, and stock.
function colorChipsHtml(colors, removeFn, editFn) {
  if (!colors || colors.length === 0) return '<span class="subtitle" style="margin:0;">ما ضفت ألوان بعد</span>';
  return colors.map((c, i) => {
    const stockLabel = typeof c.stock === 'number' ? `<span class="size-chip-stock">(${c.stock})</span>` : '';
    return `<span class="color-chip-box"${editFn ? ` onclick="${editFn(i)}" style="cursor:pointer;"` : ''}><span class="swatch" style="background:${esc(c.hex)};"></span>${esc(c.name)} ${stockLabel}<span class="x" onclick="event.stopPropagation();${removeFn(i)}">✕</span></span>`;
  }).join('');
}

function addSizeChipDraft(merchantId) {
  const input = document.getElementById(`p-size-input-${merchantId}`);
  const stockInput = document.getElementById(`p-size-stock-input-${merchantId}`);
  const val = input.value.trim();
  if (!val) return;
  const stockRaw = stockInput ? stockInput.value.trim() : '';
  const stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  if (!draftProductSizes[merchantId]) draftProductSizes[merchantId] = [];
  if (draftProductSizes[merchantId].some(s => s.value === val)) { input.value = ''; return; }
  draftProductSizes[merchantId].push({ value: val, stock });
  input.value = ''; if (stockInput) stockInput.value = '';
  const row = document.getElementById(`p-sizes-chips-${merchantId}`);
  if (row) row.innerHTML = sizeChipsHtml(draftProductSizes[merchantId], (i) => `removeSizeChipDraft(${merchantId}, ${i})`);
  input.focus();
}
function removeSizeChipDraft(merchantId, index) {
  if (!draftProductSizes[merchantId]) return;
  draftProductSizes[merchantId].splice(index, 1);
  const row = document.getElementById(`p-sizes-chips-${merchantId}`);
  if (row) row.innerHTML = sizeChipsHtml(draftProductSizes[merchantId], (i) => `removeSizeChipDraft(${merchantId}, ${i})`);
}

function addColorChipDraft(merchantId) {
  const nameInput = document.getElementById(`p-color-name-${merchantId}`);
  const hexInput = document.getElementById(`p-color-hex-${merchantId}`);
  const stockInput = document.getElementById(`p-color-stock-${merchantId}`);
  const name = nameInput.value.trim();
  if (!name) { showToast('اكتب اسم اللون (مثلاً: أحمر) قبل الإضافة'); return; }
  const hex = hexInput.value || '#10B981';
  const stockRaw = stockInput.value.trim();
  const stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  if (!draftProductColors[merchantId]) draftProductColors[merchantId] = [];
  if (draftProductColors[merchantId].some(c => c.name === name)) { nameInput.value = ''; return; }
  draftProductColors[merchantId].push({ name, hex, stock });
  nameInput.value = ''; stockInput.value = '';
  const row = document.getElementById(`p-colors-chips-${merchantId}`);
  if (row) row.innerHTML = colorChipsHtml(draftProductColors[merchantId], (i) => `removeColorChipDraft(${merchantId}, ${i})`);
  nameInput.focus();
}
function removeColorChipDraft(merchantId, index) {
  if (!draftProductColors[merchantId]) return;
  draftProductColors[merchantId].splice(index, 1);
  const row = document.getElementById(`p-colors-chips-${merchantId}`);
  if (row) row.innerHTML = colorChipsHtml(draftProductColors[merchantId], (i) => `removeColorChipDraft(${merchantId}, ${i})`);
}

// ---- Editing an EXISTING product's sizes/colors/photos: these mutate the product directly
// and save immediately (same pattern as addCategory/deleteCategory elsewhere in this file),
// instead of staging changes for a separate "save" click. ----
function addSizeChipToProduct(merchantId, productId) {
  const input = document.getElementById(`edit-size-input-${productId}`);
  const stockInput = document.getElementById(`edit-size-stock-input-${productId}`);
  const val = input.value.trim();
  if (!val) return;
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p) return;
  if (!Array.isArray(p.sizes)) p.sizes = [];
  if (p.sizes.some(s => s.value === val)) { input.value = ''; return; }
  const stockRaw = stockInput ? stockInput.value.trim() : '';
  const stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  p.sizes.push({ value: val, stock });
  saveData();
  renderMerchantPanel();
}
function removeSizeChipFromProduct(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !Array.isArray(p.sizes)) return;
  p.sizes.splice(index, 1);
  saveData();
  renderMerchantPanel();
}
// Clicking an existing size chip lets the merchant update just its stock number
// (leaves and re-adding it every time would be clunky once a size already has orders against it).
function editSizeStockOnProduct(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !p.sizes || !p.sizes[index]) return;
  const current = p.sizes[index].stock;
  const raw = window.prompt(`الكمية المتوفرة لمقاس "${p.sizes[index].value}" — اتركها فارغة لو غير محدودة`, current === null || current === undefined ? '' : current);
  if (raw === null) return; // cancelled
  const trimmed = raw.trim();
  p.sizes[index].stock = trimmed === '' ? null : (parseInt(trimmed) || 0);
  saveData();
  renderMerchantPanel();
}
function addColorChipToProduct(merchantId, productId) {
  const nameInput = document.getElementById(`edit-color-name-${productId}`);
  const hexInput = document.getElementById(`edit-color-hex-${productId}`);
  const stockInput = document.getElementById(`edit-color-stock-${productId}`);
  const name = nameInput.value.trim();
  if (!name) { showToast('اكتب اسم اللون قبل الإضافة'); return; }
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p) return;
  if (!Array.isArray(p.colors)) p.colors = [];
  if (p.colors.some(c => c.name === name)) { nameInput.value = ''; return; }
  const hex = hexInput.value || '#10B981';
  const stockRaw = stockInput.value.trim();
  const stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  p.colors.push({ name, hex, stock });
  saveData();
  renderMerchantPanel();
}
function removeColorChipFromProduct(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !Array.isArray(p.colors)) return;
  p.colors.splice(index, 1);
  saveData();
  renderMerchantPanel();
}
function editColorStockOnProduct(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !p.colors || !p.colors[index]) return;
  const current = p.colors[index].stock;
  const raw = window.prompt(`الكمية المتوفرة للون "${p.colors[index].name}" — اتركها فارغة لو غير محدودة`, current === null || current === undefined ? '' : current);
  if (raw === null) return;
  const trimmed = raw.trim();
  p.colors[index].stock = trimmed === '' ? null : (parseInt(trimmed) || 0);
  saveData();
  renderMerchantPanel();
}
async function addProductImages(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  const input = document.getElementById(`edit-image-add-${productId}`);
  if (!p || !input || !input.files || !input.files.length) return;
  ensureProductImages(p);
  const room = MAX_PRODUCT_IMAGES - p.images.length;
  if (room <= 0) { showToast(`ما تكدر تضيف أكثر من ${MAX_PRODUCT_IMAGES} صور بالمنتج الوحد`); input.value = ''; return; }
  const files = Array.from(input.files).slice(0, room);
  if (input.files.length > room) showToast(`تم اعتماد ${room} صور بس (وصلت للحد الأقصى ${MAX_PRODUCT_IMAGES})`);
  for (const file of files) {
    try { p.images.push(await resizeImageFile(file, 500, 0.75)); }
    catch (e) { /* skip this one */ }
  }
  p.image = p.images[0] || null;
  input.value = '';
  saveData();
  renderMerchantPanel();
}
function removeProductImage(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !Array.isArray(p.images)) return;
  p.images.splice(index, 1);
  p.image = p.images[0] || null;
  saveData();
  renderMerchantPanel();
}

function renderProductList(m) {
  if (m.products.length === 0) return '<div class="empty">ما فيه منتجات بعد</div>';
  return m.products.map(p => {
    if (editingProductId === p.id) {
      ensureProductImages(p);
      ensureProductVariants(p);
      return `
      <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:6px;">
        <label>اسم المنتج</label><input id="edit-name-${p.id}" value="${esc(p.name)}">
        <label>السعر (دينار)</label><input type="number" id="edit-price-${p.id}" value="${p.price}">
        <label>وصف القطعة (اختياري)</label><textarea id="edit-desc-${p.id}">${esc(p.description || '')}</textarea>
        <label>المقاسات المتوفرة — اضغط على أي مقاس لتعديل كميته</label>
        <div class="size-chip-add-row">
          <input id="edit-size-input-${p.id}" placeholder="مثلاً: 42 أو L" onkeydown="if(event.key==='Enter'){event.preventDefault();addSizeChipToProduct(${m.id}, ${p.id});}">
          <input type="number" id="edit-size-stock-input-${p.id}" placeholder="الكمية (اختياري)" style="max-width:120px;">
          <button type="button" class="btn secondary small" onclick="addSizeChipToProduct(${m.id}, ${p.id})">إضافة</button>
        </div>
        <div class="size-chip-row">${sizeChipsHtml(p.sizes, (i) => `removeSizeChipFromProduct(${m.id}, ${p.id}, ${i})`, (i) => `editSizeStockOnProduct(${m.id}, ${p.id}, ${i})`)}</div>
        <label>الألوان المتوفرة — اضغط على أي لون لتعديل كميته</label>
        <div class="color-chip-add-row">
          <input type="color" id="edit-color-hex-${p.id}" value="#10B981">
          <input type="text" id="edit-color-name-${p.id}" placeholder="مثلاً: أحمر" onkeydown="if(event.key==='Enter'){event.preventDefault();addColorChipToProduct(${m.id}, ${p.id});}">
          <input type="number" id="edit-color-stock-${p.id}" placeholder="الكمية (اختياري)">
          <button type="button" class="btn secondary small" onclick="addColorChipToProduct(${m.id}, ${p.id})">إضافة</button>
        </div>
        <div class="color-chip-row">${colorChipsHtml(p.colors, (i) => `removeColorChipFromProduct(${m.id}, ${p.id}, ${i})`, (i) => `editColorStockOnProduct(${m.id}, ${p.id}, ${i})`)}</div>
        <label>الكمية المتوفرة الإجمالية (تُستخدم فقط لو ما فيه مقاسات أو ألوان، اتركها فارغة لو غير محدودة)</label><input type="number" id="edit-stock-${p.id}" value="${p.stock === null || p.stock === undefined ? '' : p.stock}">
        ${m.categories.length > 0 ? `
        <label>القسم (اختياري)</label>
        <select id="edit-category-${p.id}">
          <option value="">بدون قسم</option>
          ${m.categories.map(c => `<option value="${c.id}" ${p.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>` : ''}
        <label>صور المنتج (${p.images.length}/${MAX_PRODUCT_IMAGES})</label>
        <div class="product-photos-row">
          ${p.images.map((img, i) => `
            <div class="product-photo-box">
              <img src="${esc(img)}">
              <span class="x" onclick="removeProductImage(${m.id}, ${p.id}, ${i})">✕</span>
            </div>`).join('')}
        </div>
        ${p.images.length < MAX_PRODUCT_IMAGES ? `
        <input type="file" accept="image/*" multiple id="edit-image-add-${p.id}" onchange="addProductImages(${m.id}, ${p.id})">
        ` : `<span class="subtitle" style="margin:0;">وصلت للحد الأقصى (${MAX_PRODUCT_IMAGES} صور) — احذف وحدة عشان تضيف غيرها</span>`}
        <div>
          <button class="btn small" onclick="saveProductEdit(${m.id}, ${p.id})">حفظ</button>
          <button class="btn secondary small" onclick="cancelProductEdit()">إلغاء</button>
        </div>
      </div>`;
    }
    ensureProductVariants(p);
    const outOfStock = productOutOfStock(p);
    const cat = m.categories.find(c => c.id === p.categoryId);
    const sizesLabel = p.sizes.length ? p.sizes.map(s => esc(s.value) + (typeof s.stock === 'number' ? ` (${s.stock})` : '')).join('، ') : '';
    const colorsHtml = p.colors.length ? p.colors.map(c => `<span class="color-chip-box"><span class="swatch" style="background:${esc(c.hex)};"></span>${esc(c.name)}${typeof c.stock === 'number' ? ` <span class="size-chip-stock">(${c.stock})</span>` : ''}</span>`).join('') : '';
    return `
    <div class="list-item" style="align-items:flex-start;">
      <span style="display:flex; align-items:flex-start; gap:8px;">
        <span class="thumb-wrap">
          ${p.image ? `<img class="thumb" src="${esc(p.image)}">` : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#94A3B8" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.5" fill="#94A3B8"/><path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 19" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
          ${p.images && p.images.length > 1 ? `<span class="thumb-more-badge">+${p.images.length - 1}</span>` : ''}
        </span>
        <span>
          <div>${esc(p.name)} ${outOfStock ? '<span class="badge rejected">نفدت الكمية</span>' : ''}${cat ? ` <span class="badge active">${esc(cat.name)}</span>` : ''}</div>
          ${p.description ? `<div class="product-desc">${esc(p.description)}</div>` : ''}
          ${sizesLabel ? `<div class="product-sizes-label">مقاسات: ${sizesLabel}</div>` : ''}
          ${colorsHtml ? `<div class="color-chip-row" style="margin:4px 0;">${colorsHtml}</div>` : ''}
          ${(!p.sizes.length && !p.colors.length) ? `<div class="product-sizes-label">${typeof p.stock === 'number' ? 'الكمية المتبقية: ' + p.stock : 'كمية غير محدودة'}</div>` : ''}
          <div style="margin-top:4px;">${commissionExemptionRowHtml(m, p)}</div>
        </span>
      </span>
      <span>${p.price.toLocaleString()} د
        <button class="btn secondary small" style="margin-right:6px;" onclick="editProduct(${p.id})">تعديل</button>
        <button class="btn danger small" style="margin-right:6px;" onclick="deleteProduct(${m.id},${p.id})">حذف</button>
      </span>
    </div>`;
  }).join('');
}

// ---------- PER-PRODUCT COMMISSION EXEMPTION (merchant requests, admin approves/rejects) ----------
// A merchant can ask the admin to stop taking platform commission on one specific product.
// The request sits pending until the admin approves or rejects it (see the "طلبات إعفاء
// العمولة" card in the admin's requests view) — approved requests make calcFee() return zero
// fee/item-deduction for that product on every future sale; rejected ones change nothing and
// commission keeps being deducted as before.
//
// A merchant's whole product/category/coupon/commission-request list is stored and saved as
// ONE Firestore document (see saveData()), not one doc per product. That means any function
// here that starts from this session's local copy of m.products/m.commissionRequests and then
// calls saveData() will, on save, overwrite the ENTIRE array with that local copy — including
// whatever it's missing. If the same merchant had another tab/device open, or an employee with
// product access was working at the same time, and THAT session added/edited/removed a
// different product in the few seconds since this session's last poll, this session's local
// copy doesn't have it yet — so deleting one product, or responding to one commission request,
// silently reverted or wiped out that other, unrelated product too. This refetches the
// merchant's current product/category/coupon/commission-request lists right before the
// mutation, so the save always builds on top of the latest state instead of a possibly-stale
// local snapshot.
async function refreshMerchantProductLists(m) {
  if (!m || !m.authUid || !window.authApi) return;
  try {
    const fresh = await window.authApi.getPublicDoc('merchants', m.authUid);
    if (!fresh) return;
    if (Array.isArray(fresh.products)) m.products = fresh.products;
    if (Array.isArray(fresh.categories)) m.categories = fresh.categories;
    if (Array.isArray(fresh.coupons)) m.coupons = fresh.coupons;
    if (Array.isArray(fresh.commissionRequests)) m.commissionRequests = fresh.commissionRequests;
  } catch (e) { /* offline or denied — fall back to whatever's already in memory */ }
}
function findCommissionRequest(m, productId) {
  return (m.commissionRequests || []).find(r => r.productId === productId);
}
function isProductCommissionExempt(m, productId) {
  if (!m) return false;
  const r = findCommissionRequest(m, productId);
  return !!(r && r.status === 'approved');
}
// Small status line + action button shown under each product in the merchant's product list.
function commissionExemptionRowHtml(m, p) {
  const r = findCommissionRequest(m, p.id);
  if (!r || r.status === 'rejected') {
    const rejectedNote = r && r.status === 'rejected' ? '<span class="badge rejected" style="margin-left:6px;">رفض الأدمن الطلب السابق</span> ' : '';
    return `${rejectedNote}<button class="btn secondary small" onclick="requestCommissionExemption(${m.id}, ${p.id})">اطلب إعفاء هذا المنتج من العمولة</button>`;
  }
  if (r.status === 'pending') return '<span class="badge pending">طلب الإعفاء بانتظار موافقة الأدمن</span>';
  return '<span class="badge active">هذا المنتج معفى من عمولة المنصة</span>';
}
async function requestCommissionExemption(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  let p = m && m.products.find(x => x.id === productId);
  if (!m || !p) return;
  await refreshMerchantProductLists(m);
  // Re-look-up after the refresh — the array reference above may have just been replaced.
  p = m.products.find(x => x.id === productId);
  if (!p) return;
  let r = findCommissionRequest(m, productId);
  if (r) {
    // Re-requesting after a previous rejection — reopen the same record instead of piling
    // up duplicate history for the same product.
    r.status = 'pending';
    r.createdAt = new Date().toISOString();
    r.respondedAt = null;
  } else {
    if (!Array.isArray(m.commissionRequests)) m.commissionRequests = [];
    m.commissionRequests.push({
      id: genId(),
      productId,
      productName: p.name,
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null
    });
  }
  saveData();
  renderMerchantPanel();
  showToast('تم إرسال طلب الإعفاء للأدمن ');
}
async function respondToCommissionRequest(merchantId, requestId, approve) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  await refreshMerchantProductLists(m);
  const r = (m.commissionRequests || []).find(x => x.id === requestId);
  if (!r) return;
  r.status = approve ? 'approved' : 'rejected';
  r.respondedAt = new Date().toISOString();
  await saveData();
  logAudit(approve ? 'قبول طلب إعفاء عمولة' : 'رفض طلب إعفاء عمولة', `${m.shop} — ${r.productName || 'منتج #' + r.productId}`);
  renderRequests();
  showToast(approve ? 'تمت الموافقة — هذا المنتج صار معفى من العمولة ' : 'تم رفض الطلب — العمولة مستمرة على هذا المنتج');
}
// All merchants' pending exemption requests, flattened for the admin's queue.
function allPendingCommissionRequests() {
  const out = [];
  data.merchants.forEach(m => {
    (m.commissionRequests || []).forEach(r => {
      if (r.status === 'pending') out.push({ merchant: m, request: r });
    });
  });
  return out.sort((a, b) => new Date(a.request.createdAt) - new Date(b.request.createdAt));
}
function renderCommissionRequests() {
  const box = document.getElementById('commission-requests-list');
  if (!box) return;
  const pending = allPendingCommissionRequests();
  if (!pending.length) { box.innerHTML = '<div class="empty">ما فيه طلبات إعفاء عمولة حالياً</div>'; return; }
  box.innerHTML = pending.map(({ merchant: m, request: r }) => `
    <div class="list-item">
      <span>${esc(m.shop)} — ${esc(r.productName)}</span>
      <span>
        <button class="btn small" onclick="respondToCommissionRequest(${m.id}, ${r.id}, true)">موافقة</button>
        <button class="btn danger small" style="margin-right:6px;" onclick="respondToCommissionRequest(${m.id}, ${r.id}, false)">رفض</button>
      </span>
    </div>`).join('');
}

function editProduct(productId) {
  editingProductId = productId;
  renderMerchantPanel();
}
function cancelProductEdit() {
  editingProductId = null;
  renderMerchantPanel();
}
function saveProductEdit(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m.products.find(x => x.id === productId);
  const name = document.getElementById(`edit-name-${productId}`).value.trim();
  const price = parseFloat(document.getElementById(`edit-price-${productId}`).value);
  const descInput = document.getElementById(`edit-desc-${productId}`);
  const stockRaw = document.getElementById(`edit-stock-${productId}`).value.trim();
  if (!name || !price || price <= 0) { showToast('عبي اسم المنتج والسعر (لازم يكون رقم أكبر من صفر)'); return; }
  p.name = name;
  p.price = price;
  if (descInput) p.description = descInput.value.trim();
  p.stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  const categorySelect = document.getElementById(`edit-category-${productId}`);
  if (categorySelect) p.categoryId = categorySelect.value ? parseInt(categorySelect.value) : null;
  editingProductId = null;
  saveData();
  renderMerchantPanel();
  showToast('تم تحديث المنتج');
}

async function deleteProduct(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  await refreshMerchantProductLists(m);
  m.products = m.products.filter(p => p.id !== productId);
  saveData();
  renderMerchantPanel();
  showToast('تم حذف المنتج');
}

// ---------- STORE SECTIONS (categories) ----------
function addCategory(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  const input = document.getElementById(`new-category-${id}`);
  const name = input.value.trim();
  if (!name) { showToast('اكتب اسم القسم'); return; }
  ensureMerchantTheme(m);
  if (m.categories.some(c => c.name === name)) { showToast('هذا القسم موجود مسبقاً'); return; }
  m.categories.push({ id: genId(), name });
  saveData();
  input.value = '';
  renderMerchantPanel();
  showToast('تمت إضافة القسم');
}

function deleteCategory(id, catId) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  m.categories = m.categories.filter(c => c.id !== catId);
  // Products that were in this section just fall back to "بدون قسم" — nothing about
  // them is deleted, only the section link.
  m.products.forEach(p => { if (p.categoryId === catId) p.categoryId = null; });
  saveData();
  renderMerchantPanel();
  showToast('تم حذف القسم');
}

// ---------- COUPONS (merchant-created discount codes) ----------
function renderCouponsList(m) {
  if (!m.coupons || m.coupons.length === 0) return '<div class="empty">ما ضفت كوبونات بعد</div>';
  const todayStr = new Date().toISOString().slice(0, 10);
  return m.coupons.map(c => {
    const valueLabel = c.type === 'percent' ? `${c.value}%` : `${c.value.toLocaleString()} د`;
    const expired = c.expiryDate && todayStr > c.expiryDate;
    const exhausted = c.maxUses && (c.usedCount || 0) >= c.maxUses;
    let statusBadge;
    if (expired) statusBadge = '<span class="badge disabled">منتهي</span>';
    else if (exhausted) statusBadge = '<span class="badge disabled">اكتمل الاستخدام</span>';
    else statusBadge = `<span class="badge ${c.active ? 'active' : 'disabled'}">${c.active ? 'مفعّل' : 'موقّف'}</span>`;
    const detailBits = [];
    if (c.minOrder) detailBits.push(`لطلب ≥ ${c.minOrder.toLocaleString()} د`);
    if (c.expiryDate) detailBits.push(`ينتهي ${esc(c.expiryDate)}`);
    if (c.maxDiscount) detailBits.push(`أقصى خصم ${c.maxDiscount.toLocaleString()} د`);
    detailBits.push(`استُخدم ${(c.usedCount || 0).toLocaleString()}${c.maxUses ? ' / ' + c.maxUses.toLocaleString() : ' مرة'}`);
    return `<div class="list-item" style="align-items:flex-start;">
      <span><b>${esc(c.code)}</b> — خصم ${valueLabel}
        ${statusBadge}
        <div style="color:var(--text-mute); font-size:11px; margin-top:2px;">${detailBits.join(' — ')}</div>
      </span>
      <span style="display:flex; gap:6px;">
        <button class="btn secondary small" style="margin-top:0;" onclick="toggleCouponActive(${m.id}, ${c.id})">${c.active ? 'إيقاف' : 'تفعيل'}</button>
        <button class="btn secondary small" style="margin-top:0; color:#DC2626;" onclick="deleteCoupon(${m.id}, ${c.id})">حذف</button>
      </span>
    </div>`;
  }).join('');
}

function addCoupon(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  ensureMerchantTheme(m);
  const codeInput = document.getElementById(`coupon-code-${merchantId}`);
  const typeSelect = document.getElementById(`coupon-type-${merchantId}`);
  const valueInput = document.getElementById(`coupon-value-${merchantId}`);
  const minInput = document.getElementById(`coupon-min-${merchantId}`);
  const expiryInput = document.getElementById(`coupon-expiry-${merchantId}`);
  const maxUsesInput = document.getElementById(`coupon-maxuses-${merchantId}`);
  const maxDiscountInput = document.getElementById(`coupon-maxdiscount-${merchantId}`);
  const code = codeInput.value.trim().toUpperCase();
  const type = typeSelect.value;
  const value = parseFloat(valueInput.value);
  const minOrder = minInput.value.trim() === '' ? 0 : (parseFloat(minInput.value) || 0);
  const expiryDate = expiryInput.value ? expiryInput.value : null;
  const maxUses = maxUsesInput.value.trim() === '' ? null : (parseInt(maxUsesInput.value) || null);
  const maxDiscount = maxDiscountInput.value.trim() === '' ? null : (parseFloat(maxDiscountInput.value) || null);
  if (!code) { showToast('اكتب كود الكوبون'); return; }
  if (!value || value <= 0) { showToast('حط قيمة خصم صحيحة'); return; }
  if (type === 'percent' && value > 100) { showToast('نسبة الخصم ما تكدر تتجاوز 100%'); return; }
  if (minOrder < 0) { showToast('الحد الأدنى للطلب ما يكدر يكون سالب'); return; }
  if (maxUses !== null && maxUses <= 0) { showToast('أقصى عدد استخدام لازم يكون رقم أكبر من صفر'); return; }
  if (maxDiscount !== null && maxDiscount <= 0) { showToast('أقصى مبلغ خصم لازم يكون رقم أكبر من صفر'); return; }
  if (expiryDate && expiryDate < new Date().toISOString().slice(0, 10)) { showToast('تاريخ الانتهاء ما يكدر يكون بالماضي'); return; }
  if (m.coupons.some(c => c.code === code)) { showToast('هذا الكود مستخدم مسبقاً — اختر كود ثاني'); return; }
  m.coupons.push({ id: genId(), code, type, value, minOrder, active: true, expiryDate, maxUses, maxDiscount, usedCount: 0 });
  saveData();
  codeInput.value = ''; valueInput.value = ''; minInput.value = ''; expiryInput.value = ''; maxUsesInput.value = ''; maxDiscountInput.value = '';
  renderMerchantPanel();
  showToast('تمت إضافة الكوبون ');
}

function toggleCouponActive(merchantId, couponId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const c = m && m.coupons.find(x => x.id === couponId);
  if (!c) return;
  c.active = !c.active;
  saveData();
  renderMerchantPanel();
}

function deleteCoupon(merchantId, couponId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  m.coupons = m.coupons.filter(c => c.id !== couponId);
  // If the coupon a customer currently has applied in their cart just got deleted, drop it
  // silently — the discount line disappears next time the cart/checkout redraws.
  if (appliedCoupon && appliedCoupon.merchantId === merchantId && appliedCoupon.couponId === couponId) appliedCoupon = null;
  saveData();
  renderMerchantPanel();
  showToast('تم حذف الكوبون');
}

// ---------- WELCOME MESSAGE / BIO ----------
function setWelcomeMessage(id, text) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  m.welcomeMessage = text.trim();
  saveData();
}

function setBio(id, text) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  m.bio = text.trim();
  saveData();
}

// ---------- SOCIAL LINKS ----------
function setSocialLink(id, platform, url) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  ensureMerchantTheme(m);
  m.theme.social[platform].url = url.trim();
  saveData();
}

function toggleSocialVisible(id, platform) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  ensureMerchantTheme(m);
  m.theme.social[platform].visible = !m.theme.social[platform].visible;
  saveData();
  renderMerchantPanel();
}

// ---------- MERCHANT-SPECIFIC TERMS & CONDITIONS ----------
// Free text the merchant writes themselves (return/exchange policy, store-specific rules...),
// shown to customers via a link on the storefront ONLY if visible=true and text isn't empty
// (see renderStorefrontInto / openMerchantTermsModal). Off by default for every merchant.
function setMerchantCustomTerms(id, text) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  ensureMerchantTheme(m);
  m.theme.customTerms.text = text.trim();
  saveData();
}

function toggleMerchantCustomTermsVisible(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  ensureMerchantTheme(m);
  m.theme.customTerms.visible = !m.theme.customTerms.visible;
  saveData();
  renderMerchantPanel();
}

// Shared "اليوم + التاريخ + الوقت" label used everywhere an order/invoice is listed,
// so every order shows consistently which day of the week, date, and time it happened.
function orderDateTimeLabel(dateVal) {
  const d = new Date(dateVal);
  const day = d.toLocaleDateString('ar-IQ', { weekday: 'long' });
  const dateStr = d.toLocaleDateString('ar-IQ');
  const timeStr = d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${dateStr} — ${timeStr}`;
}

function orderStatusLabel(status) {
  if (status === 'accepted') return 'مقبول';
  if (status === 'rejected') return 'مرفوض';
  if (status === 'removed') return 'محذوفة من الفاتورة';
  return 'بانتظار ردك';
}

// The single "final status" for a line item, layering cancellation and delivery on top of
// the base order status — this is what should show in lists and Excel exports, since a
// cancelled order matters more than whatever its earlier status was.
function orderFullStatusLabel(o) {
  if (o.cancelled) return 'ملغي';
  if (o.deliveryStatus === 'delivered') return 'واصل';
  if (o.deliveryStatus === 'returned') return 'مرجّع';
  if (o.deliveryStatus === 'received_by_shipping') return 'مستلم من قبل شركة الشحن';
  if (o.deliveryStatus === 'with_shipping') return 'جاهز للتوصيل';
  if (o.cancelStage === 'merchant_approved') return 'إلغاء بانتظار موافقة الإدارة';
  if (o.cancelStage === 'customer_requested') return 'الزبون طلب الإلغاء — بانتظار تأكيد المحل';
  return orderStatusLabel(o.status);
}
function cancelByLabel(role) {
  if (role === 'admin') return 'الأدمن';
  if (role === 'merchant') return 'التاجر';
  if (role === 'customer') return 'الزبون';
  return '—';
}
// Small reason line shown under a cancelled order/group, wherever it appears.
function cancelReasonLine(o) {
  if (!o.cancelled) return '';
  const when = o.cancelAt ? new Date(o.cancelAt).toLocaleString('ar-IQ') : '';
  return `<div style="font-size:11px; color:#B3261E; margin-top:4px; border-top:1px dashed #EEC9C6; padding-top:4px;">
    ملغي بواسطة ${o.cancelByName ? o.cancelByName + ' (' + cancelByLabel(o.cancelBy) + ')' : cancelByLabel(o.cancelBy)}${when ? ' — ' + when : ''}
    <br>السبب: ${o.cancelReason || '—'}
    ${o.cancelBy === 'customer' && o.merchantCancelNote ? '<br>ملاحظة المحل: ' + esc(o.merchantCancelNote) : ''}
  </div>`;
}

// Small status line shown wherever a cancel REQUEST is still in progress (not finalized
// yet) — customer_requested (waiting on the merchant) or merchant_approved (waiting on
// the admin). Separate from cancelReasonLine above, which only covers a FINAL cancellation.
function cancelRequestStatusLine(o) {
  if (o.cancelled || o.cancelStage === 'none' || !o.cancelStage) return '';
  const when = o.cancelRequestedAt ? new Date(o.cancelRequestedAt).toLocaleString('ar-IQ') : '';
  if (o.cancelStage === 'customer_requested') {
    return `<div style="font-size:11px; color:#92400E; margin-top:4px; border-top:1px dashed #FDE68A; padding-top:4px; background:#FFFBEB; padding:5px 6px; border-radius:6px;">
      الزبون طلب إلغاء الطلب${when ? ' — ' + when : ''}
      <br>سبب الزبون: ${esc(o.cancelRequestReason) || '—'}
    </div>`;
  }
  return `<div style="font-size:11px; color:#92400E; margin-top:4px; border-top:1px dashed #FDE68A; padding-top:4px; background:#FFFBEB; padding:5px 6px; border-radius:6px;">
    تمت المراجعة والموافقة من قبل المحل — بانتظار موافقة الإدارة
    <br>سبب الزبون: ${esc(o.cancelRequestReason) || '—'}
    <br>ملاحظة المحل: ${esc(o.merchantCancelNote) || '—'}
  </div>`;
}

// Whether a customer can still request cancellation of this order themselves. Blocked once
// the merchant already handed it to the shipping team, once it's out for/near delivery, or
// once it's already cancelled/finished/mid-review.
function customerCancelEligibility(o) {
  if (o.cancelled) return { eligible: false, reason: 'هذا الطلب ملغي أصلاً.' };
  if (o.cancelStage && o.cancelStage !== 'none') return { eligible: false, reason: '' }; // has its own status line instead
  if (o.status === 'rejected' || o.status === 'removed') return { eligible: false, reason: '' };
  if (o.deliveryStatus === 'with_shipping' || o.deliveryStatus === 'received_by_shipping') {
    return { eligible: false, reason: 'ما يمكن إلغاء هذا الطلب — المحل سلّمه لشركة الشحن وهو بالطريق إليك.' };
  }
  if (o.deliveryStatus === 'delivered') {
    return { eligible: false, reason: 'ما يمكن إلغاء هذا الطلب — تم توصيله فعلاً.' };
  }
  return { eligible: true, reason: '' };
}

