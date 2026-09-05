// ---------- STOREFRONT ----------
function renderStoreSelect() {
  const sel = document.getElementById('store-select');
  if (!sel) return;
  const active = data.merchants.filter(m => m.status === 'active');
  if (active.length === 0) { sel.innerHTML = '<option>ما فيه متاجر متاحة</option>'; document.getElementById('storefront-content').innerHTML = ''; return; }
  sel.innerHTML = active.map(m => `<option value="${m.id}">${esc(m.shop)}</option>`).join('');
  renderStorefront();
}

function renderStorefront() {
  const sel = document.getElementById('store-select');
  const id = parseInt(sel.value);
  renderStorefrontInto(id, document.getElementById('storefront-content'));
}

// Shared renderer used by both the admin preview tool (view-store) and the
// public, no-login customer storefront reached via a merchant's unique link.
// Renders one product card exactly as before — pulled out into its own function so the
// grouped-by-section view below and the old flat view (when a merchant has no sections)
// can both build the same markup.
// Which size / which color / which photo is currently picked for each product on the
// storefront (box UI replaces the old plain <select>) — keyed by product id, read by
// addToCart() below.
let selectedProductSize = {};
let selectedProductColor = {};
let selectedProductImage = {}; // productId -> index into p.images

// Picks the first box that still has stock (or the first box at all if none declare a stock
// number), so a depleted size/color is never silently pre-selected as the default.
function firstAvailableVariant(list) {
  if (!list || !list.length) return null;
  const available = list.find(v => !(typeof v.stock === 'number' && v.stock <= 0));
  return available || list[0];
}

function pickStoreSize(productId, el, sizeVal) {
  if (el.classList.contains('disabled')) return;
  selectedProductSize[productId] = sizeVal;
  const row = document.getElementById(`size-chip-row-${productId}`);
  if (!row) return;
  Array.from(row.children).forEach(chip => chip.classList.toggle('selected', chip === el));
}
function pickStoreColor(productId, el, colorName) {
  if (el.classList.contains('disabled')) return;
  selectedProductColor[productId] = colorName;
  const row = document.getElementById(`color-chip-row-${productId}`);
  if (row) Array.from(row.children).forEach(chip => chip.classList.toggle('selected', chip === el));
  const label = document.getElementById(`color-selected-label-${productId}`);
  if (label) label.textContent = colorName ? `اللون المختار: ${colorName}` : '';
}
function pickStoreImage(merchantId, productId, index) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p || !p.images || !p.images[index]) return;
  selectedProductImage[productId] = index;
  const img = document.getElementById(`store-img-${productId}`);
  if (img) img.src = p.images[index];
  const strip = document.getElementById(`store-strip-${productId}`);
  if (strip) Array.from(strip.children).forEach((el, i) => el.classList.toggle('selected', i === index));
}

// Compact grid card shown in the store listing — just a thumbnail, name, and price, like a
// normal e-commerce catalog. Tapping it opens the full product detail modal (images, sizes,
// colors, description, add-to-cart) instead of cramming all of that into the grid itself.
function renderStoreProductCard(p, color, m) {
  ensureProductImages(p);
  ensureProductVariants(p);
  const outOfStock = productOutOfStock(p);
  const img = p.images[0];
  const avg = productAvgRating(p);
  return `
    <div class="store-product-card" onclick="openProductDetail(${m.id}, ${p.id})">
      <div class="store-product-card-img">
        ${img ? `<img src="${img}">` : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#94A3B8" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.5" fill="#94A3B8"/><path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 19" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
        ${outOfStock ? `<span class="badge rejected">نفدت الكمية</span>` : ''}
      </div>
      <div class="store-product-card-info">
        <div class="store-product-card-name">${esc(p.name)}</div>
        <div class="store-product-card-price">${p.price.toLocaleString()} د</div>
        ${avg !== null ? `<div class="store-product-card-rating"><span class="stars-row">${starsHtml(avg)}</span> ${avg} (${p.reviews.length})</div>` : ''}
      </div>
    </div>
  `;
}

// Groups products by the merchant's optional sections (تيشيرتات، أحذية...). Any product with
// no section, or one that got deleted later, falls into a trailing group — with no header at
// all if the merchant never created any sections in the first place, so nothing changes for
// merchants who don't use this. Each section's products render as a 2-column grid of cards.
// ---------- STOREFRONT SEARCH & CATEGORY FILTER ----------
// Kept per-merchant (keyed by merchantId) so browsing store A and then store B never leaks
// one's search text or selected chip into the other, and so it survives an unrelated
// refreshStorefrontView() call (e.g. after adding to cart) without resetting what the
// customer typed.
let storeFilter = {};
function getStoreFilter(merchantId) {
  if (!storeFilter[merchantId]) storeFilter[merchantId] = { query: '', categoryId: 'all' };
  return storeFilter[merchantId];
}

// Only redraws the product grid area (not the search input itself), so the customer's
// typing cursor/focus is never lost on every keystroke.
function onStoreSearchInput(merchantId) {
  const input = document.getElementById(`store-search-${merchantId}`);
  if (!input) return;
  getStoreFilter(merchantId).query = input.value;
  updateStoreProductsArea(merchantId);
}
function setStoreFilterCategory(merchantId, catId) {
  getStoreFilter(merchantId).categoryId = catId;
  const m = data.merchants.find(x => x.id === merchantId);
  const chipsEl = document.getElementById(`store-filter-chips-${merchantId}`);
  if (m && chipsEl) chipsEl.innerHTML = renderStoreFilterChips(m);
  updateStoreProductsArea(merchantId);
}
function updateStoreProductsArea(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  const color = (m.theme && m.theme.primaryColor) || '#C77B4A';
  const area = document.getElementById(`store-products-area-${merchantId}`);
  if (area) area.innerHTML = renderStoreProducts(m, color);
}
function renderStoreFilterChips(m) {
  if (!m.categories || m.categories.length === 0) return '';
  const f = getStoreFilter(m.id);
  const chip = (id, label) => `<span class="store-filter-chip${String(f.categoryId) === String(id) ? ' selected' : ''}" onclick="setStoreFilterCategory(${m.id}, ${typeof id === 'number' ? id : `'${id}'`})">${esc(label)}</span>`;
  return `<div class="store-filter-chips-row">${chip('all', 'الكل')}${m.categories.map(c => chip(c.id, c.name)).join('')}</div>`;
}
function renderStoreSearchBar(m) {
  const f = getStoreFilter(m.id);
  return `
    <div class="store-search-bar">
      <input id="store-search-${m.id}" type="text" placeholder="دور عن منتج بالاسم..." value="${esc(f.query)}" oninput="onStoreSearchInput(${m.id})">
    </div>
    <div id="store-filter-chips-${m.id}">${renderStoreFilterChips(m)}</div>
  `;
}

function renderStoreProducts(m, color) {
  if (m.products.length === 0) return '<div class="empty">ما فيه منتجات معروضة</div>';
  const grid = (items) => `<div class="store-products-grid">${items.map(p => renderStoreProductCard(p, color, m)).join('')}</div>`;

  const f = getStoreFilter(m.id);
  const q = (f.query || '').trim().toLowerCase();
  const catActive = f.categoryId && f.categoryId !== 'all';
  let items = m.products;
  if (q) items = items.filter(p => (p.name || '').toLowerCase().includes(q));
  if (catActive) items = items.filter(p => String(p.categoryId) === String(f.categoryId));

  if (items.length === 0) {
    return `<div class="empty">${q || catActive ? 'ما فيه منتجات مطابقة لبحثك' : 'ما فيه منتجات معروضة'}</div>`;
  }

  // Once a search or category filter is active, show one flat grid (sections stop being
  // useful when you're already narrowing down); otherwise keep the normal grouped-by-section browsing view.
  if (q || catActive || !m.categories || m.categories.length === 0) {
    return grid(items);
  }
  let html = '';
  m.categories.forEach(c => {
    const catItems = items.filter(p => p.categoryId === c.id);
    if (catItems.length === 0) return;
    html += `<div class="store-section-title">${c.name}</div>`;
    html += grid(catItems);
  });
  const catIds = new Set(m.categories.map(c => c.id));
  const uncategorized = items.filter(p => !p.categoryId || !catIds.has(p.categoryId));
  if (uncategorized.length > 0) {
    html += `<div class="store-section-title">منتجات أخرى</div>`;
    html += grid(uncategorized);
  }
  return html;
}

// ---- Product detail modal: opened when a customer taps a card in the grid. Shows the big
// image gallery, full description, size/color pickers, and the real "أضف للسلة" button. ----
let openProductDetailId = null; // { merchantId, productId } of whichever detail view is open, so re-renders (after picking a size/color, or a live data refresh) can redraw the same one.

function renderProductDetailContent(p, color, m) {
  ensureProductImages(p);
  ensureProductVariants(p);
  const outOfStock = productOutOfStock(p);
  const shownIndex = selectedProductImage[p.id] || 0;
  const mainImg = p.images[shownIndex] || p.images[0];
  const defaultSize = firstAvailableVariant(p.sizes);
  const defaultColor = firstAvailableVariant(p.colors);
  if (defaultSize && selectedProductSize[p.id] === undefined) selectedProductSize[p.id] = defaultSize.value;
  if (defaultColor && selectedProductColor[p.id] === undefined) selectedProductColor[p.id] = defaultColor.name;
  const curSize = selectedProductSize[p.id];
  const curColor = selectedProductColor[p.id];
  return `
    <div class="product-detail-main-img-wrap">
      ${mainImg ? `<img id="store-img-${p.id}" src="${mainImg}">` : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#94A3B8" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.5" fill="#94A3B8"/><path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 19" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
    </div>
    ${p.images.length > 1 ? `
      <div class="store-photo-strip" id="store-strip-${p.id}">
        ${p.images.map((img, i) => `<img src="${img}" class="${i === shownIndex ? 'selected' : ''}" onclick="pickStoreImage(${m.id}, ${p.id}, ${i})">`).join('')}
      </div>
    ` : ''}
    <div class="product-detail-name">${esc(p.name)}</div>
    <div class="product-detail-price">${p.price.toLocaleString()} د ${outOfStock ? '<span class="badge rejected">نفدت الكمية</span>' : ''}</div>
    ${(() => { const avg = productAvgRating(p); return avg !== null ? `<div class="store-product-card-rating"><span class="stars-row">${starsHtml(avg)}</span> ${avg} من 5 (${p.reviews.length} تقييم)</div>` : `<div class="store-product-card-rating">لا يوجد تقييمات بعد — كن أول من يقيّم</div>`; })()}
    ${p.description ? `<div class="product-desc">${esc(p.description)}</div>` : ''}
    ${p.sizes.length ? `
      <div>
        <div class="product-sizes-label">اختر المقاس</div>
        <div class="size-chip-row" id="size-chip-row-${p.id}">
          ${p.sizes.map(s => {
            const depleted = typeof s.stock === 'number' && s.stock <= 0;
            return `<span class="size-chip-box${s.value === curSize ? ' selected' : ''}${depleted ? ' disabled' : ''}" style="${depleted ? 'opacity:.4; cursor:not-allowed;' : ''}" onclick="pickStoreSize(${p.id}, this, '${esc(s.value).replace(/'/g, "\\'")}')">${esc(s.value)}${depleted ? ' (نفدت)' : ''}</span>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
    ${p.colors.length ? `
      <div>
        <div class="product-sizes-label">اختر اللون</div>
        <div class="store-color-row" id="color-chip-row-${p.id}">
          ${p.colors.map(c => {
            const depleted = typeof c.stock === 'number' && c.stock <= 0;
            return `<span class="store-color-box${c.name === curColor ? ' selected' : ''}${depleted ? ' disabled' : ''}" style="background:${esc(c.hex)};" title="${esc(c.name)}${depleted ? ' — نفدت' : ''}" onclick="pickStoreColor(${p.id}, this, '${esc(c.name).replace(/'/g, "\\'")}')"></span>`;
          }).join('')}
        </div>
        <div class="store-color-label" id="color-selected-label-${p.id}">${curColor ? `اللون المختار: ${esc(curColor)}` : ''}</div>
      </div>
    ` : ''}
    <div style="margin-top:12px;">
      ${outOfStock
        ? `<button class="btn secondary" disabled style="width:100%;">غير متوفر</button>`
        : `<button class="btn" style="background:${color}; width:100%;" onclick="addToCart(${m.id}, ${p.id})">أضف للسلة</button>`}
    </div>
    ${renderRelatedProducts(p, m, color)}
    ${renderProductReviewsSection(p, m)}
  `;
}

// ---------- RELATED / SUGGESTED PRODUCTS ----------
// Shown at the bottom of a product's detail view to keep the customer browsing instead of
// leaving right after they decide on (or against) one piece. Prefers other products from the
// same section/category first (most relevant), then tops up with anything else from the same
// merchant so it still shows something useful for merchants who don't use categories at all.
function renderRelatedProducts(p, m, color) {
  const others = m.products.filter(x => x.id !== p.id);
  if (others.length === 0) return '';
  let related = p.categoryId ? others.filter(x => x.categoryId === p.categoryId) : [];
  if (related.length < 4) {
    const rest = others.filter(x => !related.includes(x));
    related = related.concat(rest.slice(0, 4 - related.length));
  }
  related = related.slice(0, 4);
  if (related.length === 0) return '';
  return `
    <div class="card-title" style="margin-top:18px;">منتجات مقترحة من نفس المتجر</div>
    <div class="store-products-grid">${related.map(rp => renderStoreProductCard(rp, color, m)).join('')}</div>
  `;
}

// ---------- RATINGS & REVIEWS ----------
let reviewStarsDraft = {}; // productId -> stars currently picked in the "write a review" form (default 5)

function reviewStarsInputHtml(productId) {
  const cur = reviewStarsDraft[productId] || 5;
  let html = '';
  for (let i = 1; i <= 5; i++) html += `<span class="${i <= cur ? 'on' : ''}" onclick="pickReviewStars(${productId}, ${i})">★</span>`;
  return html;
}
// Redraws only the star widget (not the whole product detail modal), so picking a star
// doesn't wipe out a name/comment the customer already started typing.
function pickReviewStars(productId, stars) {
  reviewStarsDraft[productId] = stars;
  const el = document.getElementById(`review-stars-${productId}`);
  if (el) el.innerHTML = reviewStarsInputHtml(productId);
}

function renderProductReviewsSection(p, m) {
  const list = (p.reviews || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  return `
    <div class="card-title" style="margin-top:16px;">التقييمات والمراجعات (${list.length})</div>
    <div id="reviews-list-${p.id}">
      ${list.length === 0 ? '<div class="empty">ما فيه تقييمات بعد — كن أول من يقيّم هذي القطعة</div>' :
        list.map(r => `
          <div class="review-item">
            <div><b>${esc(r.name)}</b> <span class="stars-row">${starsHtml(r.stars)}</span></div>
            ${r.comment ? `<div style="font-size:13px; color:var(--text-mute); margin-top:2px;">${esc(r.comment)}</div>` : ''}
            <div style="font-size:11px; color:var(--text-mute); margin-top:2px;">${orderDateTimeLabel(r.date)}</div>
          </div>
        `).join('')}
    </div>
    <div style="margin-top:12px;">
      <div class="card-title" style="font-size:13px;">أضف تقييمك</div>
      <div class="review-stars-input" id="review-stars-${p.id}">${reviewStarsInputHtml(p.id)}</div>
      <input id="review-name-${p.id}" placeholder="اسمك">
      <textarea id="review-comment-${p.id}" placeholder="رأيك بالمنتج (اختياري)"></textarea>
      <button class="btn secondary small" onclick="submitReview(${m.id}, ${p.id})">إرسال التقييم</button>
    </div>
  `;
}

function submitReview(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p) return;
  ensureProductVariants(p);
  const nameInput = document.getElementById(`review-name-${productId}`);
  const commentInput = document.getElementById(`review-comment-${productId}`);
  const name = nameInput.value.trim();
  const comment = commentInput.value.trim();
  const stars = reviewStarsDraft[productId] || 5;
  if (!name) { showToast('اكتب اسمك قبل إرسال التقييم'); return; }
  p.reviews.push({ id: genId(), name, stars, comment, date: new Date().toISOString() });
  reviewStarsDraft[productId] = 5;
  saveData();
  refreshOpenProductDetail();
  updateStoreProductsArea(merchantId); // keep the card's average rating in sync too
  showToast('تم إرسال تقييمك، شكراً! ');
}

function openProductDetail(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!m || !p) return;
  openProductDetailId = { merchantId, productId };
  const color = (m.theme && m.theme.primaryColor) || '#C77B4A';
  const content = document.getElementById('product-detail-content');
  if (content) content.innerHTML = renderProductDetailContent(p, color, m);
  document.getElementById('product-detail-modal').classList.add('show');
}
function closeProductDetail() {
  openProductDetailId = null;
  document.getElementById('product-detail-modal').classList.remove('show');
}
// Redraws whichever product detail view is currently open — called after picking a
// size/color box's live-refresh redraw, and after adding to cart, so stock/labels stay accurate.
function refreshOpenProductDetail() {
  if (!openProductDetailId) return;
  const { merchantId, productId } = openProductDetailId;
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!m || !p) { closeProductDetail(); return; }
  const color = (m.theme && m.theme.primaryColor) || '#C77B4A';
  const content = document.getElementById('product-detail-content');
  if (content) content.innerHTML = renderProductDetailContent(p, color, m);
}

function renderStorefrontInto(merchantId, content, opts) {
  const { ignoreDisabled = false } = opts || {};
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) { content.innerHTML = ''; return; }
  ensureMerchantTheme(m);

  // ignoreDisabled is used by the merchant's own "لens" preview: the merchant should always
  // be able to see their real store/products, even while the admin has it disabled (e.g. before
  // launch). Real customers (public link) and the admin's store-browser still get blocked as before.
  if (m.status === 'disabled' && !ignoreDisabled) {
    content.innerHTML = `<div class="card"><div class="empty">المتجر غير متاح حالياً</div></div>`;
    return;
  }

  const color = m.theme.primaryColor || '#C77B4A';
  const visibleSocials = SOCIAL_PLATFORMS.filter(p => m.theme.social[p.key].visible && m.theme.social[p.key].url);

  content.innerHTML = `
    <div class="card">
      ${ignoreDisabled && m.status === 'disabled' ? `
        <div class="subtitle" style="background:#FFF4E5; border:1px solid #F0C879; border-radius:8px; padding:8px 10px; margin-bottom:10px; color:#8A5A00;">
          هذي معاينة بس — متجرك حالياً معطّل من الأدمن وما يشوفه الزبون لين يتفعّل.
        </div>` : ''}
      ${m.theme.banner ? `<img class="store-banner" src="${m.theme.banner}">` : `
        <div class="store-banner store-banner-default" style="background:linear-gradient(120deg, ${color}, ${color}CC), url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%221.6%22 fill=%22white%22 fill-opacity=%220.35%22/%3E%3Ccircle cx=%2270%22 cy=%2250%22 r=%221.6%22 fill=%22white%22 fill-opacity=%220.35%22/%3E%3Ccircle cx=%22100%22 cy=%2290%22 r=%221.6%22 fill=%22white%22 fill-opacity=%220.35%22/%3E%3Ccircle cx=%2240%22 cy=%22100%22 r=%221.6%22 fill=%22white%22 fill-opacity=%220.35%22/%3E%3C/svg%3E');">
          <svg class="store-banner-default-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9l1-5h14l1 5" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/><path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" stroke="white" stroke-width="1.4" opacity=".85"/><path d="M9.5 19v-4a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v4" stroke="white" stroke-width="1.4" opacity=".85"/></svg>
        </div>`}
      <div class="store-header">
        ${m.theme.logo ? `<img class="store-logo" src="${m.theme.logo}">` : `<div class="store-logo store-logo-default" style="background:${color};">${(m.shop||'م').trim().charAt(0)}</div>`}
        <div class="card-title" style="color:${color};">${m.shop}</div>
      </div>
      ${m.bio ? `<div class="store-bio">${m.bio}</div>` : ''}
      ${visibleSocials.length > 0 ? `
        <div class="store-social-row">
          ${visibleSocials.map(p => `<a class="store-social-btn" href="${m.theme.social[p.key].url}" target="_blank" rel="noopener">${p.label}</a>`).join('')}
        </div>
      ` : ''}
      ${m.welcomeMessage ? `<div class="store-welcome">${m.welcomeMessage}</div>` : ''}
      <div class="store-trust-row">
        <div class="store-trust-item"><svg viewBox="0 0 24 24" fill="none"><path d="M3 7h11v9H3z" stroke="currentColor" stroke-width="1.6"/><path d="M14 10h4l3 3v3h-7z" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="18" r="1.8" stroke="currentColor" stroke-width="1.6"/><circle cx="17.5" cy="18" r="1.8" stroke="currentColor" stroke-width="1.6"/></svg><span>توصيل لكل المحافظات</span></div>
        <div class="store-trust-item"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>دفع عند الاستلام</span></div>
        <div class="store-trust-item"><svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 1 1-4-7.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M21 4v5h-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>استبدال سهل</span></div>
      </div>
      ${m.theme.customTerms && m.theme.customTerms.visible && m.theme.customTerms.text ? `
        <div style="margin-top:6px;"><a onclick="openMerchantTermsModal(${m.id})" style="font-size:11.5px; text-decoration:underline; cursor:pointer; color:var(--text-mute);">شروط وأحكام المتجر</a></div>
      ` : ''}
      ${cart.length && cart[0].merchantId === m.id ? `
        <div class="cart-bar" onclick="openCartModal()">
          <span>السلة (${cartCount()} قطعة)</span>
          <span>${cartSubtotal().toLocaleString()} د — إتمام الشراء ›</span>
        </div>
      ` : ''}
      ${m.products.length > 0 ? renderStoreSearchBar(m) : ''}
      <div id="store-products-area-${m.id}">${renderStoreProducts(m, color)}</div>
    </div>
  `;
}

// "العدسة": يفتح للتاجر معاينة حية لمتجره بالضبط متل ما يشوفه الزبون — الشعار، الألوان،
// البنر، والمنتجات بأسعارها — حتى لو المتجر لسا قيد المراجعة وما انفعّل من الأدمن بعد.
// الوحيد اللي يوقف المعاينة هو إذا الأدمن عطّل المتجر (status === 'disabled')، متل حال الزبون تماماً.
function openMerchantPreview(merchantId) {
  const content = document.getElementById('merchant-preview-content');
  renderStorefrontInto(merchantId, content, { ignoreDisabled: true });
  document.getElementById('merchant-preview-modal').classList.add('show');
}
function closeMerchantPreview() {
  document.getElementById('merchant-preview-modal').classList.remove('show');
}

function calcFee(m, price, productId) {
  // If a merchant is passed, use that merchant's own fee settings; otherwise fall back to global (for the settings-page preview)
  const s = m || data.settings;
  // Per-merchant exemption: any item priced at or below feeExemptMaxPrice pays no platform
  // fee at all — protects merchants who sell very cheap items where a fixed fee (or even a
  // percentage) would eat an unreasonable chunk of (or more than) the item's own price.
  const exemptMax = (m && m.feeExemptMaxPrice) || 0;
  if (exemptMax > 0 && (price || 0) <= exemptMax) return {customer: 0, merchant: 0, exempt: true};
  // Per-product exemption: a merchant can ask the admin to stop taking any commission on a
  // specific product; once the admin approves that request, this product pays no platform
  // fee (customer side or merchant side) at all, for every future sale — see
  // isProductCommissionExempt() and the commission-request admin/merchant UI below. A
  // rejected or still-pending request has no effect — commission keeps being deducted as usual.
  if (productId != null && isProductCommissionExempt(m, productId)) return {customer: 0, merchant: 0, exempt: true};
  const isPercent = s.feeType === 'percent';
  const toAmount = (v) => isPercent ? Math.round(((price || 0) * v) / 100) : v;
  if (s.feeSource === 'both') return {customer: toAmount(s.feeCustomer), merchant: toAmount(s.feeMerchant), exempt: false};
  if (s.feeSource === 'customer') return {customer: toAmount(s.feeAmount), merchant: 0, exempt: false};
  return {customer: 0, merchant: toAmount(s.feeAmount), exempt: false};
}

