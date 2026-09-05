// ---------- CART (customer can add multiple products/quantities before checking out) ----------
let cart = [];
// Coupon currently applied to the cart: { merchantId, couponId, code, type, value, minOrder }
let appliedCoupon = null;

function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }
function cartSubtotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

// Computes the discount a coupon gives on a given subtotal — 0 if the subtotal hasn't hit
// the coupon's minimum order yet, so the discount silently switches on once it does.
// For 'percent' coupons, the result is capped at coupon.maxDiscount (if set) so a big order
// can't turn "20% off" into an unbounded discount.
function couponDiscountAmount(coupon, subtotal) {
  if (!coupon) return 0;
  if (coupon.minOrder && subtotal < coupon.minOrder) return 0;
  let discount = coupon.type === 'percent' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return Math.min(discount, subtotal);
}

// Checks whether a coupon can still actually be used right now — active toggle, expiry date,
// and usage limit. Returns { ok, reason } so callers can show a specific message instead of
// a generic "invalid code". Used both when the customer first applies the code and again,
// defensively, right before the order is actually placed (see checkout submit handler) —
// time can pass between the two, or the merchant could deactivate/exhaust it in between.
function couponUsabilityCheck(coupon) {
  if (!coupon || !coupon.active) return { ok: false, reason: 'كود الكوبون غير صحيح أو غير مفعّل' };
  if (coupon.expiryDate) {
    // Compare by calendar date (not exact time) so a coupon stays valid through its whole
    // expiry day — expiryDate is a plain 'YYYY-MM-DD' from a <input type="date">.
    const today = new Date().toISOString().slice(0, 10);
    if (today > coupon.expiryDate) return { ok: false, reason: 'هذا الكوبون منتهي الصلاحية' };
  }
  if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
    return { ok: false, reason: 'هذا الكوبون وصل الحد الأقصى لعدد مرات الاستخدام' };
  }
  return { ok: true, reason: '' };
}

function applyCouponCode(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  ensureMerchantTheme(m);
  const input = document.getElementById('cart-coupon-input');
  const code = (input.value || '').trim().toUpperCase();
  if (!code) { showToast('اكتب كود الكوبون'); return; }
  const coupon = m.coupons.find(c => c.code === code);
  const check = couponUsabilityCheck(coupon);
  if (!check.ok) { showToast(check.reason); return; }
  appliedCoupon = { merchantId, couponId: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, minOrder: coupon.minOrder || 0, maxDiscount: coupon.maxDiscount || null };
  renderCartModal();
  showToast('تم تطبيق الكوبون ');
}
function removeAppliedCoupon() {
  appliedCoupon = null;
  renderCartModal();
}

function addToCart(merchantId, productId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const p = m && m.products.find(x => x.id === productId);
  if (!p) return;
  ensureProductVariants(p);
  const size = p.sizes.length ? (selectedProductSize[productId] || p.sizes[0].value) : null;
  const colorVal = p.colors.length ? (selectedProductColor[productId] || p.colors[0].name) : null;

  // The cart holds items from one store at a time — switching stores starts a fresh cart
  if (cart.length && cart[0].merchantId !== merchantId) { cart = []; appliedCoupon = null; }

  const existing = cart.find(i => i.productId === productId && i.size === size && i.color === colorVal);
  const currentQty = existing ? existing.qty : 0;
  const limit = variantStock(p, size, colorVal);
  if (typeof limit === 'number' && currentQty + 1 > limit) {
    showToast('عذراً، الكمية المتوفرة من هذي القطعة غير كافية');
    return;
  }

  if (existing) existing.qty += 1;
  else cart.push({ merchantId, productId, productName: p.name, price: p.price, size, color: colorVal, qty: 1 });

  showToast('تمت الإضافة للسلة ');
  refreshStorefrontView();
}

function changeCartQty(index, delta) {
  const item = cart[index];
  if (!item) return;
  const m = data.merchants.find(x => x.id === item.merchantId);
  const p = m && m.products.find(x => x.id === item.productId);
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    cart.splice(index, 1);
  } else if (p) {
    const limit = variantStock(p, item.size, item.color);
    if (typeof limit === 'number' && newQty > limit) {
      showToast('ما فيه هذا القدر بالمخزون');
      return;
    }
    item.qty = newQty;
  } else {
    item.qty = newQty;
  }
  renderCartModal();
  refreshStorefrontView();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCartModal();
  refreshStorefrontView();
}

function openCartModal() {
  renderCartModal();
  document.getElementById('cart-modal').classList.add('show');
}

function closeCartModal() {
  document.getElementById('cart-modal').classList.remove('show');
}

function renderCartModal() {
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const couponBox = document.getElementById('cart-coupon-box');
  const totalEl = document.getElementById('cart-total-line');
  const btn = document.getElementById('cart-checkout-btn');
  if (cart.length === 0) {
    itemsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    if (couponBox) couponBox.innerHTML = '';
    totalEl.innerHTML = '';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    return;
  }
  emptyEl.style.display = 'none';
  btn.disabled = false;
  btn.style.opacity = '1';
  itemsEl.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <span class="cart-item-name">${item.productName}${item.size ? ' (مقاس ' + item.size + ')' : ''}${item.color ? ' — ' + item.color : ''}</span>
        <span class="cart-item-price">${item.price.toLocaleString()} د × ${item.qty}</span>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="changeCartQty(${idx}, -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeCartQty(${idx}, 1)">+</button>
        <button class="cart-remove" onclick="removeCartItem(${idx})"></button>
      </div>
    </div>
  `).join('');

  const merchantId = cart[0].merchantId;
  const subtotal = cartSubtotal();
  const couponForThisStore = (appliedCoupon && appliedCoupon.merchantId === merchantId) ? appliedCoupon : null;
  const discount = couponDiscountAmount(couponForThisStore, subtotal);
  const belowMin = couponForThisStore && couponForThisStore.minOrder && subtotal < couponForThisStore.minOrder;

  if (couponBox) {
    couponBox.innerHTML = couponForThisStore ? `
      <div class="coupon-applied-box">
        <span>${esc(couponForThisStore.code)} ${belowMin ? `— يفعّل عند طلب ≥ ${couponForThisStore.minOrder.toLocaleString()} د` : `— خصم ${discount.toLocaleString()} د`}</span>
        <span class="link-chip" style="padding:2px 8px;" onclick="removeAppliedCoupon()">إزالة</span>
      </div>
    ` : `
      <div class="coupon-row">
        <input id="cart-coupon-input" placeholder="عندك كود خصم؟">
        <button class="btn secondary small" style="margin-top:0;" onclick="applyCouponCode(${merchantId})">تطبيق</button>
      </div>
    `;
  }

  totalEl.innerHTML = `
    ${discount > 0 ? `<div class="checkout-line"><span>خصم الكوبون </span><span>-${discount.toLocaleString()} د</span></div>` : ''}
    <div class="checkout-line total"><span>مجموع القطع (${cartCount()})</span><span>${(subtotal - discount).toLocaleString()} د</span></div>
  `;
}

// ---------- CHECKOUT (customer fills their info once, picks governorate + fast/slow shipping,
// and confirms the whole cart together — one combined delivery for every item in it) ----------
let currentCheckout = null;
let checkoutSpeed = 'fast';
// Anti-spam state for the checkout form — see the honeypot field (#co-website) and the
// timing/cooldown checks in the checkout-confirm-btn handler below.
let checkoutModalOpenedAt = null;
const CHECKOUT_MIN_FILL_MS = 2500; // a real person can't read + fill this form faster than this
const CHECKOUT_COOLDOWN_MS = 20000; // minimum gap between two orders from the same browser
function isValidIraqiPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  // Iraqi mobile numbers: 07XXXXXXXXX (11 digits) or with the country code, 9647XXXXXXXXX
  // (12 digits, with or without a leading +). Deliberately lenient about the exact carrier
  // prefix (077/078/079/075...) since new ranges get added over time — just the shape.
  return /^07\d{9}$/.test(digits) || /^9647\d{9}$/.test(digits);
}

// Finds the admin-configured zone for a governorate; falls back to "باقي المحافظات" if that governorate has no specific zone
function findShippingZone(governorateName) {
  const zones = data.settings.shippingZones || [];
  return zones.find(z => z.name === governorateName) || zones.find(z => z.name === 'باقي المحافظات') || null;
}

function openCheckoutFromCart() {
  if (cart.length === 0) return;
  const merchantId = cart[0].merchantId;
  const m = data.merchants.find(x => x.id === merchantId);

  // Re-validate stock right before checkout in case it changed while browsing
  for (const item of cart) {
    const p = m.products.find(x => x.id === item.productId);
    const limit = p ? variantStock(p, item.size, item.color) : null;
    if (p && typeof limit === 'number' && item.qty > limit) {
      showToast(`عذراً، الكمية المتوفرة من "${item.productName}" ما تكفي`);
      renderCartModal();
      return;
    }
  }

  currentCheckout = {
    merchantId,
    items: cart.map(i => ({ productId: i.productId, productName: i.productName, price: i.price, size: i.size, color: i.color, qty: i.qty }))
  };
  checkoutSpeed = 'fast';

  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-website').value = ''; // honeypot — always starts empty
  document.getElementById('checkout-error').textContent = '';
  checkoutModalOpenedAt = Date.now(); // anti-spam: a real person needs at least a couple
  // seconds to read the modal and fill it in — see the check in checkout-confirm-btn below.

  const govSelect = document.getElementById('co-governorate');
  const govOptions = (m.ownDelivery && m.ownDeliveryGovernorates && m.ownDeliveryGovernorates.length) ? m.ownDeliveryGovernorates : IRAQ_GOVERNORATES;
  govSelect.innerHTML = govOptions.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  populateAreaSelect('co-area', govSelect.value);

  updateCheckoutDelivery();
  closeCartModal();
  document.getElementById('checkout-modal').classList.add('show');
}

function setCheckoutSpeed(speed) {
  checkoutSpeed = speed;
  updateCheckoutDelivery();
}

function updateCheckoutDelivery() {
  if (!currentCheckout) return;
  const m = data.merchants.find(x => x.id === currentCheckout.merchantId);
  const governorate = document.getElementById('co-governorate').value;
  // Merchant handles their own delivery (see toggleMerchantOwnDelivery) — the platform's
  // shipping zones / fast-slow pricing never applied to them, so skip straight to a flat
  // zero delivery fee instead of looking any of that up.
  const zone = (!m.ownDelivery && data.settings.shippingEnabled) ? findShippingZone(governorate) : null;

  // If the currently-selected speed isn't offered for this governorate, switch to whichever speed is available
  if (zone && !zoneOffersSpeed(zone, checkoutSpeed)) {
    checkoutSpeed = zoneOffersSpeed(zone, 'fast') ? 'fast' : 'slow';
  }

  let deliveryFee;
  if (m.ownDelivery) {
    const area = document.getElementById('co-area').value;
    const areaPrice = (m.ownDeliveryAreaPrices && m.ownDeliveryAreaPrices[governorate] && typeof m.ownDeliveryAreaPrices[governorate][area] === 'number')
      ? m.ownDeliveryAreaPrices[governorate][area] : null;
    deliveryFee = areaPrice !== null ? areaPrice : (m.ownDeliveryPrice || 0);
  } else if (zone) {
    deliveryFee = checkoutSpeed === 'fast' ? zone.fastPrice : zone.slowPrice;
  } else {
    // no zones configured at all — fall back to the merchant's flat delivery price
    deliveryFee = data.settings.shippingEnabled ? (m.shippingAmount || 0) : 0;
  }

  // One combined delivery for the whole cart — service fee still applies per piece
  const subtotal = currentCheckout.items.reduce((s, i) => s + i.price * i.qty, 0);
  const serviceFee = currentCheckout.items.reduce((s, i) => s + calcFee(m, i.price, i.productId).customer * i.qty, 0);
  const couponForThisStore = (appliedCoupon && appliedCoupon.merchantId === currentCheckout.merchantId) ? appliedCoupon : null;
  const couponDiscount = couponDiscountAmount(couponForThisStore, subtotal);
  const total = subtotal - couponDiscount + serviceFee + deliveryFee;

  currentCheckout.deliveryFee = deliveryFee;
  currentCheckout.serviceFee = serviceFee;
  currentCheckout.subtotal = subtotal;
  currentCheckout.couponCode = couponForThisStore ? couponForThisStore.code : null;
  currentCheckout.couponDiscount = couponDiscount;
  currentCheckout.total = total;
  currentCheckout.governorate = governorate;
  currentCheckout.shippingSpeed = checkoutSpeed;

  let speedToggles = '';
  if (!m.ownDelivery) {
    if (zoneOffersSpeed(zone, 'fast')) {
      speedToggles += `<span class="toggle ${checkoutSpeed==='fast'?'selected':''}" onclick="setCheckoutSpeed('fast')">سريع${zone ? ' — ' + zone.fastPrice.toLocaleString() + ' د' : ''}</span>`;
    }
    if (zoneOffersSpeed(zone, 'slow')) {
      speedToggles += `<span class="toggle ${checkoutSpeed==='slow'?'selected':''}" onclick="setCheckoutSpeed('slow')">بطيء${zone ? ' — ' + zone.slowPrice.toLocaleString() + ' د' : ''}</span>`;
    }
  }
  document.getElementById('co-speed-toggles').innerHTML = speedToggles;
  document.getElementById('co-speed-label').style.display = m.ownDelivery ? 'none' : '';

  document.getElementById('checkout-summary').innerHTML = `
    ${currentCheckout.items.map(i => `<div class="checkout-line"><span>${i.productName}${i.size ? ' (مقاس ' + i.size + ')' : ''}${i.color ? ' — ' + i.color : ''} × ${i.qty}</span><span>${(i.price * i.qty).toLocaleString()} د</span></div>`).join('')}
    ${couponDiscount > 0 ? `<div class="checkout-line"><span>خصم الكوبون ${esc(currentCheckout.couponCode || '')}</span><span>-${couponDiscount.toLocaleString()} د</span></div>` : ''}
    ${serviceFee > 0 ? `<div class="checkout-line"><span>رسوم خدمة</span><span>${serviceFee.toLocaleString()} د</span></div>` : ''}
    <div class="checkout-line"><span>${m.ownDelivery ? 'التوصيل (يتكفّل بيه المحل مباشرة)' : 'التوصيل (' + (checkoutSpeed === 'fast' ? 'سريع' : 'بطيء') + ')'}</span><span>${deliveryFee > 0 ? deliveryFee.toLocaleString() + ' د' : 'مجاني'}</span></div>
    <div class="checkout-line total"><span>الإجمالي</span><span>${total.toLocaleString()} د</span></div>
    <div style="font-size:12px; color:var(--accent-dark); background:#F1F5F9; padding:8px 10px; border-radius:8px; margin-top:8px;">
      <b>الدفع عند الاستلام</b> — تدفع المبلغ نقداً لمندوب التوصيل عند وصول طلبك، ما فيه دفع إلكتروني حالياً
    </div>
  `;
}

function closeCheckoutModal() {
  currentCheckout = null;
  document.getElementById('checkout-modal').classList.remove('show');
}

document.getElementById('checkout-confirm-btn').addEventListener('click', async () => {
  if (!currentCheckout) return;
  const c = currentCheckout;

  // ---- Anti-spam checks (silent — never explained to whoever/whatever triggered them,
  // so a bot can't just adjust its script to dodge the exact wording of the message) ----
  // 1) Honeypot: a real person never sees or fills #co-website (see the markup — it's
  //    positioned off-screen and skipped by tab order). Only something blindly filling
  //    every input on the page fills it. Bail out as if it worked so the bot doesn't learn
  //    to leave this field alone next time.
  const honeypot = document.getElementById('co-website').value.trim();
  if (honeypot) {
    closeCheckoutModal();
    cart = [];
    renderCartModal();
    showToast('تم إرسال الطلب ');
    return;
  }
  // 2) Minimum fill time: nobody reads this form and types their name/phone/address in
  //    under ~2.5 seconds — a script that opens the modal and submits immediately does.
  if (checkoutModalOpenedAt && (Date.now() - checkoutModalOpenedAt) < CHECKOUT_MIN_FILL_MS) {
    document.getElementById('checkout-error').textContent = 'لحظة... تأكد من معلوماتك وجرب تأكيد الطلب مرة ثانية';
    return;
  }
  // 3) Per-browser cooldown between orders — sessionStorage so it survives a page
  //    reload within the same tab but resets in a fresh tab, same trust level as the
  //    rest of this client-side checkout flow.
  const lastOrderAt = parseInt((() => { try { return sessionStorage.getItem('tajerly-last-order-ts'); } catch (e) { return null; } })() || '0', 10);
  if (lastOrderAt && (Date.now() - lastOrderAt) < CHECKOUT_COOLDOWN_MS) {
    document.getElementById('checkout-error').textContent = 'أرسلت طلب للتو — خلي شوية وجرب مرة ثانية';
    return;
  }

  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const area = document.getElementById('co-area').value.trim();
  const addressDetail = document.getElementById('co-address').value.trim();
  const address = area ? `${area} — ${addressDetail}` : addressDetail;
  const errorBox = document.getElementById('checkout-error');
  if (!name || !phone || !area || !addressDetail) {
    errorBox.textContent = 'عبي اسمك، رقم هاتفك، منطقتك، وعنوانك قبل تأكيد الطلب';
    return;
  }
  if (!isValidIraqiPhone(phone)) {
    errorBox.textContent = 'رقم الهاتف غير صحيح — لازم يكون رقم عراقي صحيح (مثلاً 07XXXXXXXXX)';
    return;
  }
  errorBox.textContent = '';

  const m = data.merchants.find(x => x.id === c.merchantId);

  // Re-check stock right before placing the order, in case something changed
  for (const item of c.items) {
    const p = m.products.find(x => x.id === item.productId);
    const limit = p ? variantStock(p, item.size, item.color) : null;
    if (p && typeof limit === 'number' && item.qty > limit) {
      errorBox.textContent = `عذراً، الكمية المتوفرة من "${item.productName}" نفدت أو تغيرت`;
      refreshStorefrontView();
      return;
    }
  }

  // Re-check the applied coupon too — time passed since it was applied (could now be
  // expired, deactivated, or have hit its usage limit in the meantime). If it's no longer
  // usable, drop it and stop so the customer sees the real total before confirming, instead
  // of silently placing the order at the discounted price.
  let couponForOrder = null;
  if (c.couponCode) {
    couponForOrder = m.coupons.find(cp => cp.code === c.couponCode);
    const check = couponUsabilityCheck(couponForOrder);
    if (!check.ok) {
      appliedCoupon = null;
      errorBox.textContent = `${check.reason} — تم إزالته، تأكد من الإجمالي وأكد الطلب مرة ثانية`;
      updateCheckoutDelivery();
      return;
    }
  }

  const confirmBtn = document.getElementById('checkout-confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'جاري الإرسال...';

  // Every item in the cart becomes its own order (so the merchant can accept/ship each piece),
  // but they all share the same customer info, delivery choice, and a single delivery fee —
  // charged once, on the very first order of the batch — plus a shared group id.
  // IDs come from the shared genId() (timestamp + random, defined near the top of the file)
  // instead of the old shared nextId counter, since the customer placing this order isn't
  // logged in and has no write access to the admin-only settings document that used to hold
  // that counter.
  const groupId = genId();
  const newOrders = [];
  // A coupon discount is applied once, to the whole cart — but each cart line becomes one
  // order record per unit (see comment below), so the total discount has to be spread across
  // all of those unit-records here. Each item gets a share proportional to its contribution
  // to the subtotal, then that share is split evenly across its own units (remainder dinars
  // land on the first unit of each item so the sum always matches exactly, penny-rounding aside).
  const totalDiscount = c.couponDiscount || 0;
  const couponCode = c.couponCode || null;
  c.items.forEach((item, idx) => {
    const fee = calcFee(m, item.price, item.productId);
    const itemLineTotal = item.price * item.qty;
    const itemShare = (totalDiscount > 0 && c.subtotal > 0) ? Math.round((totalDiscount * itemLineTotal) / c.subtotal) : 0;
    const perUnit = item.qty > 0 ? Math.floor(itemShare / item.qty) : 0;
    let remainder = itemShare - perUnit * item.qty;
    for (let n = 0; n < item.qty; n++) {
      const unitDiscount = perUnit + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      // NOTE: stock is intentionally NOT deducted here. This checkout is running in the
      // customer's own browser, not logged in, and Firestore's security rules correctly
      // refuse to let an unauthenticated visitor write to the merchant's document (see
      // firestore.rules) — otherwise any visitor could edit any merchant's stock directly.
      // So the actual, authoritative deduction happens later, inside acceptInvoice() below,
      // which runs in the *merchant's own* logged-in session and therefore has real write
      // access to their own document. Same reasoning for the coupon's usedCount — see there.
      newOrders.push({
        id: genId(), merchantId: c.merchantId, merchantAuthUid: m.authUid || null, productId: item.productId, productName: item.productName, price: item.price, size: item.size, color: item.color,
        customerName: name, customerPhone: phone, customerAddress: address,
        governorate: c.governorate, shippingSpeed: c.shippingSpeed,
        feeFromCustomer: fee.customer, feeFromMerchant: fee.merchant, itemDeduction: fee.exempt ? 0 : (m.itemDeduction || 0),
        shippingFee: (idx === 0 && n === 0) ? c.deliveryFee : 0,
        couponCode: couponCode, couponDiscount: unitDiscount,
        status: 'pending',
        deliveryStatus: 'none',
        orderGroupId: groupId, removalStatus: null,
        cancelStage: 'none', cancelRequestReason: '', cancelRequestedAt: null,
        merchantCancelNote: '', merchantCancelAt: null,
        date: new Date().toISOString()
      });
    }
  });

  // IMPORTANT: written directly here (not through the generic saveData() sweep) and
  // actually awaited, for the same reason submitRequest() does this for join requests —
  // saveData()'s per-order sync is fire-and-forget (see the .catch() in saveData() that
  // only logs to console), so it always returned instantly regardless of whether the
  // write really landed. That meant a failed write on a spotty phone connection still
  // showed the customer a green "sent successfully" toast while the order silently never
  // reached the shared database — so it could never show up on the admin's screen, live
  // refresh or not, because there was nothing there to refresh.
  let ok = false;
  if (window.authApi) {
    const results = await Promise.allSettled(newOrders.map(o => window.authApi.saveDoc('orders', String(o.id), o)));
    ok = results.every(r => r.status === 'fulfilled');
    if (ok) newOrders.forEach(o => lastSyncedOrderSnapshots.set(o.id, JSON.stringify(o)));
    else console.error('Order save failed:', results.find(r => r.status === 'rejected').reason);
  } else {
    data.orders.push(...newOrders);
    ok = await saveData();
    if (!ok) newOrders.forEach(o => { data.orders = data.orders.filter(x => x.id !== o.id); });
  }

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'تأكيد الطلب';

  if (!ok) {
    errorBox.textContent = 'صار خطأ ولم يتم إرسال طلبك — تأكد من الاتصال بالإنترنت وحاول مرة ثانية';
    return;
  }

  if (window.authApi) data.orders.push(...newOrders); // already confirmed saved above

  // Best-effort — see upsertOrderTrackingGroup below: creates (first-ever order from this
  // phone at this store) or appends (every order after that) the public order_tracking
  // "view" copy that the guest تتبع طلبي page actually reads (it has no access to the real
  // orders collection — see firestore.rules). Deliberately NOT awaited before the success
  // toast: the real orders are already confirmed saved above, which is what matters most —
  // a slow/flaky tracking write should never delay or block checkout itself.
  if (window.authApi) {
    upsertOrderTrackingGroup(m.authUid, phone, groupId, newOrders[0].date, newOrders);
  }

  // Local-only optimistic bump so THIS browser's own UI (e.g. re-applying the same coupon
  // again later in the same session) reflects the use immediately. This never gets persisted
  // from here — a guest's browser has no write access to the merchant's own document per
  // firestore.rules. The real, authoritative increment happens later in acceptInvoice(),
  // once per checkout, the moment the merchant actually approves this invoice.
  if (couponForOrder) couponForOrder.usedCount = (couponForOrder.usedCount || 0) + 1;

  cart = [];
  appliedCoupon = null;
  try { sessionStorage.setItem('tajerly-last-order-ts', String(Date.now())); } catch (e) {} // anti-spam cooldown, see checks above
  saveData(); // best-effort sync of anything else (nextId, etc.) — orders themselves are already confirmed saved
  closeCheckoutModal();
  showToast('تم إرسال طلبك بنجاح بانتظار تأكيد المتجر');
  if (publicStoreMerchantId) { refreshStorefrontView(); } else { renderAll(); }
});

// ---------- CUSTOMER ORDER TRACKING (by phone, scoped to ONE store) ----------
// A customer on a merchant's public store link can look up their own orders by phone
// number — but only within that one store, never across the whole platform. This mirrors
// the "hard isolation" rule used everywhere else in this file (a merchant only ever sees
// their own orders): here it's the merchantId of the store currently open in the browser,
// captured when the modal opens, that every search is filtered against.
let trackOrderMerchantId = null;

function openOrderTrackModal(merchantId) {
  trackOrderMerchantId = merchantId;
  const phoneInput = document.getElementById('order-track-phone');
  const results = document.getElementById('order-track-results');
  if (phoneInput) phoneInput.value = '';
  if (results) results.innerHTML = '';
  document.getElementById('order-track-modal').classList.add('show');
  setTimeout(() => phoneInput && phoneInput.focus(), 50);
}
function closeOrderTrackModal() {
  document.getElementById('order-track-modal').classList.remove('show');
}

// Keeps only digits so "0790 123 4567", "0790-123-4567" and "07901234567" all match each other.
function normalizePhoneDigits(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

// Deterministic order_tracking doc id: merchant + normalized phone digits — this has to
// match firestore.rules EXACTLY (trackingKey == merchantAuthUid + '_' + phone), since the
// document key itself is the only "filter" a guest's get() is allowed to use.
function trackingKeyFor(merchantAuthUid, phone) {
  return merchantAuthUid + '_' + normalizePhoneDigits(phone);
}

// Only the fields the public tracking page (searchMyOrders below) actually displays —
// deliberately a subset of the real order object, not the whole thing, so this "view" copy
// doesn't carry more than it needs to. customerName/customerAddress/merchantId etc. stay
// out on purpose; the guest already knows their own name/address, and doesn't need ours.
function orderTrackingItemSummary(o) {
  return {
    id: o.id,
    productName: o.productName,
    size: o.size || null,
    color: o.color || null,
    price: o.price,
    shippingFee: o.shippingFee || 0,
    status: o.status,
    deliveryStatus: o.deliveryStatus || 'none',
    cancelled: !!o.cancelled,
    cancelReason: o.cancelReason || null,
    cancelBy: o.cancelBy || null,
    cancelByName: o.cancelByName || null,
    cancelAt: o.cancelAt || null,
    // Cancellation-REQUEST pipeline (separate from the final cancelled/cancelReason above,
    // which only gets set once the admin gives final approval) — lets the guest's own
    // tracking page show "we're reviewing your cancellation" while it's still in progress.
    cancelStage: o.cancelStage || 'none',
    cancelRequestReason: o.cancelRequestReason || null,
    cancelRequestedAt: o.cancelRequestedAt || null,
    merchantCancelNote: o.merchantCancelNote || null
  };
}

// Called once, right after checkout confirms the real orders were actually saved — creates
// the order_tracking doc on a customer's very first order at this store (orders.size()==1,
// matching firestore.rules' create condition exactly), or appends one new "group" entry
// (one checkout = one group, however many line items/products it has) on every order after
// that (orders.size() growing by exactly one group, matching the rules' unauthenticated
// update condition). NOTE: read-then-write, not a transaction — two checkouts from the same
// phone at the exact same store in the same instant could race and one could overwrite the
// other's group. Accepted as the same "no Cloud Functions" trust tradeoff already used for
// creating orders themselves from an untrusted browser (see firestore.rules comment on
// order_tracking's update rule) — an edge case, and the next status-change sync (see
// syncOrderTrackingUpdates) does not depend on this having gone perfectly.
async function upsertOrderTrackingGroup(merchantAuthUid, phone, groupId, date, items) {
  if (!window.authApi || !merchantAuthUid) return;
  const key = trackingKeyFor(merchantAuthUid, phone);
  try {
    const existing = await window.authApi.getPublicDoc('order_tracking', key);
    const orders = existing && Array.isArray(existing.orders) ? existing.orders.slice() : [];
    orders.push({ groupId, date, items: items.map(orderTrackingItemSummary) });
    await window.authApi.saveDoc('order_tracking', key, {
      merchantAuthUid, phone: normalizePhoneDigits(phone), orders
    });
  } catch (e) {
    console.error('order_tracking create/append failed for', key, e);
  }
}

// Called from saveData() for every order whose status actually changed (merchant accept/
// reject, shipping delivered/returned, admin cancel, removal approve/deny...) — patches
// just that one line item inside whichever group it already landed in, wherever
// upsertOrderTrackingGroup put it. Batches by tracking key first so N changed orders for
// the same customer/store cost one read+write, not N. Orders whose tracking doc/group
// doesn't exist yet are silently skipped — see the comment where this is called.
async function syncOrderTrackingUpdates(changedOrders) {
  if (!window.authApi || !changedOrders.length) return;
  const byKey = {};
  changedOrders.forEach(o => {
    if (!o.merchantAuthUid || !o.customerPhone) return;
    const key = trackingKeyFor(o.merchantAuthUid, o.customerPhone);
    (byKey[key] = byKey[key] || []).push(o);
  });
  for (const key of Object.keys(byKey)) {
    try {
      const existing = await window.authApi.getPublicDoc('order_tracking', key);
      if (!existing || !Array.isArray(existing.orders)) continue;
      const orders = existing.orders.map(g => ({ ...g, items: Array.isArray(g.items) ? g.items.slice() : [] }));
      byKey[key].forEach(o => {
        const gid = o.orderGroupId || o.id;
        const group = orders.find(g => g.groupId === gid);
        if (!group) return; // predates tracking, or its own create/append hasn't landed yet
        const idx = group.items.findIndex(it => it.id === o.id);
        const summary = orderTrackingItemSummary(o);
        if (idx >= 0) group.items[idx] = summary; else group.items.push(summary);
      });
      await window.authApi.saveDoc('order_tracking', key, {
        merchantAuthUid: existing.merchantAuthUid, phone: existing.phone, orders
      });
    } catch (e) {
      console.error('order_tracking status sync failed for', key, e);
    }
  }
}

// Same badge coloring rule as everywhere else (see orderFullStatusLabel): cancellation and
// delivery status override the base pending/accepted/rejected status for display purposes.
function orderTrackBadgeClass(o) {
  if (o.cancelled) return 'rejected';
  if (o.deliveryStatus === 'delivered') return 'accepted';
  if (o.deliveryStatus === 'returned') return 'rejected';
  if (o.deliveryStatus === 'received_by_shipping') return 'pending';
  if (o.deliveryStatus === 'with_shipping') return 'pending';
  if (o.cancelStage === 'merchant_approved' || o.cancelStage === 'customer_requested') return 'pending';
  return o.status;
}

async function searchMyOrders() {
  const results = document.getElementById('order-track-results');
  const phoneRaw = document.getElementById('order-track-phone').value;
  const phone = normalizePhoneDigits(phoneRaw);
  if (!phone) { results.innerHTML = `<div class="empty">اكتب رقم الهاتف اللي طلبت فيه أول شي</div>`; return; }
  if (!trackOrderMerchantId) { results.innerHTML = `<div class="empty">تعذر تحديد المتجر</div>`; return; }

  const m = data.merchants.find(x => x.id === trackOrderMerchantId);
  if (!m || !m.authUid) { results.innerHTML = `<div class="empty">تعذر تحديد المتجر</div>`; return; }

  results.innerHTML = `<div class="empty">جاري البحث...</div>`;

  // Hard isolation: keyed by this store's merchantAuthUid + the phone number — a phone
  // number that ordered from ten other stores on the platform will never surface those
  // orders here. A guest browser has no read access to the real orders collection at all
  // (see firestore.rules) — this reads the small order_tracking "view" copy instead, kept
  // in sync by upsertOrderTrackingGroup (checkout) and syncOrderTrackingUpdates (saveData()).
  // Local-fallback mode (Firebase failed to load, window.authApi missing) has no real
  // backend to begin with, so it keeps reading data.orders directly like before — there's
  // nothing else to read in that mode anyway.
  let groups = [];
  if (window.authApi) {
    try {
      const key = trackingKeyFor(m.authUid, phone);
      const trackDoc = await window.authApi.getPublicDoc('order_tracking', key);
      groups = (trackDoc && Array.isArray(trackDoc.orders)) ? trackDoc.orders : [];
    } catch (e) {
      console.error('order_tracking lookup failed:', e);
      results.innerHTML = `<div class="empty">صار خطأ بالبحث — تأكد من الاتصال بالإنترنت وحاول مرة ثانية</div>`;
      return;
    }
  } else {
    const myOrders = data.orders.filter(o => o.merchantId === trackOrderMerchantId && normalizePhoneDigits(o.customerPhone) === phone);
    const byGroup = {};
    myOrders.forEach(o => {
      const gid = o.orderGroupId || o.id;
      (byGroup[gid] = byGroup[gid] || { groupId: gid, date: o.date, items: [] }).items.push(o);
    });
    groups = Object.values(byGroup);
  }

  if (!groups.length) {
    results.innerHTML = `<div class="empty">ما لكينا أي طلب بهذا الرقم بهذا المتجر</div>`;
    return;
  }

  // Group line items back into the single checkout ("order") they were placed as part of.
  // Kept in a module-level variable (not just this function's local scope) so the
  // cancel-request modal can look the group's item ids back up without a second round-trip.
  lastTrackedGroups = groups.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  renderTrackedGroups();
}

// Renders whatever is currently in lastTrackedGroups into the tracking results box —
// split out of searchMyOrders so a local cancel-request update can re-render instantly
// without re-searching over the network.
function renderTrackedGroups() {
  const results = document.getElementById('order-track-results');
  if (!results) return;
  results.innerHTML = lastTrackedGroups.map(g => {
    const items = g.items || [];
    const total = items.reduce((s, o) => s + (o.price || 0) + (o.shippingFee || 0), 0);
    const itemsHtml = items.map(o => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px; padding:5px 0; border-bottom:1px dashed var(--border);">
        <span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''}</span>
        <span class="badge ${orderTrackBadgeClass(o)}">${orderFullStatusLabel(o)}</span>
      </div>
    `).join('');
    return `
      <div class="card" style="margin-bottom:10px; padding:12px;">
        <div style="font-size:11.5px; color:var(--text-mute); margin-bottom:6px;">${orderDateTimeLabel(g.date)}</div>
        ${itemsHtml}
        <div style="display:flex; justify-content:space-between; margin-top:7px; font-weight:700; font-size:12.5px;">
          <span>الإجمالي</span><span>${total.toLocaleString()} د</span>
        </div>
        ${customerCancelSectionHtml(g.groupId, items[0])}
      </div>
    `;
  }).join('');
}

// Decides what to show under a tracked order for cancellation purposes: the finalized
// cancellation reason, the in-progress request status, an eligible "cancel" button, or a
// short note explaining why cancellation isn't available anymore (already shipped/delivered).
function customerCancelSectionHtml(groupId, o) {
  if (!o) return '';
  if (o.cancelled) return cancelReasonLine(o);
  if (o.cancelStage && o.cancelStage !== 'none') return cancelRequestStatusLine(o);
  const elig = customerCancelEligibility(o);
  if (elig.eligible) {
    return `<div style="margin-top:8px; text-align:left;"><button class="btn danger small" onclick="openCustomerCancelModal(${groupId})">إلغاء الطلب</button></div>`;
  }
  if (elig.reason) return `<div style="font-size:11px; color:#92400E; margin-top:6px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:5px 6px;">${elig.reason}</div>`;
  return '';
}

// ---------- CUSTOMER-INITIATED ORDER CANCELLATION ----------
let lastTrackedGroups = [];
let currentCustomerCancelGroupId = null;

function openCustomerCancelModal(groupId) {
  currentCustomerCancelGroupId = groupId;
  const input = document.getElementById('customer-cancel-reason-input');
  if (input) input.value = '';
  document.getElementById('customer-cancel-modal').classList.add('show');
}
function closeCustomerCancelModal() {
  currentCustomerCancelGroupId = null;
  document.getElementById('customer-cancel-modal').classList.remove('show');
}

async function submitCustomerCancelRequest() {
  const reasonInput = document.getElementById('customer-cancel-reason-input');
  const reason = reasonInput ? reasonInput.value.trim() : '';
  if (!reason) { showToast('لازم تكتب سبب الإلغاء'); return; }
  const groupId = currentCustomerCancelGroupId;
  const group = lastTrackedGroups.find(g => g.groupId === groupId);
  const items = group ? (group.items || []) : [];
  if (!items.length) { closeCustomerCancelModal(); return; }

  // Re-check eligibility against the freshest data we're holding, in case the merchant/
  // admin changed something (e.g. already handed it to shipping) right before this click.
  const elig = customerCancelEligibility(items[0]);
  if (!elig.eligible) {
    showToast(elig.reason || 'ما يمكن إلغاء هذا الطلب حالياً');
    closeCustomerCancelModal();
    renderTrackedGroups();
    return;
  }

  const now = new Date().toISOString();
  const patch = { cancelStage: 'customer_requested', cancelRequestReason: reason, cancelRequestedAt: now };
  const submitBtn = document.getElementById('customer-cancel-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جاري الإرسال...'; }

  let ok = false;
  if (window.authApi) {
    // Guest write: patches ONLY these three fields on each order doc (see saveDoc's
    // merge:true) — never overwrites the full order, which this browser never had a
    // complete copy of to begin with. NOTE: firestore.rules needs a matching rule that
    // lets an unauthenticated caller update just these cancel-request fields on an
    // 'orders' doc (e.g. validated against the phone number), the same way it already
    // has a narrow rule for order_tracking's append-only update.
    const results = await Promise.allSettled(items.map(it => window.authApi.saveDoc('orders', String(it.id), patch)));
    ok = results.every(r => r.status === 'fulfilled');
  } else {
    // Local-fallback mode: data.orders IS the real (only) copy in this browser, same as
    // every other action in the file — mutate it directly.
    const realItems = data.orders.filter(o => (o.orderGroupId || o.id) === groupId);
    if (realItems.length) { realItems.forEach(o => Object.assign(o, patch)); ok = await saveData(); }
  }

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'تأكيد الإلغاء'; }

  if (!ok) {
    showToast('صار خطأ ولم يتم إرسال طلب الإلغاء — تأكد من الاتصال بالإنترنت وحاول مرة ثانية');
    return;
  }

  items.forEach(it => Object.assign(it, patch));

  // Best-effort: also patch the small order_tracking "view" copy right away so this same
  // page reflects the pending stage even before the merchant/admin's next save cycle
  // catches it up via syncOrderTrackingUpdates.
  if (window.authApi && trackOrderMerchantId) {
    const m = data.merchants.find(x => x.id === trackOrderMerchantId);
    const phoneInput = document.getElementById('order-track-phone');
    if (m && m.authUid && phoneInput) {
      const key = trackingKeyFor(m.authUid, normalizePhoneDigits(phoneInput.value));
      window.authApi.getPublicDoc('order_tracking', key).then(existing => {
        if (!existing || !Array.isArray(existing.orders)) return;
        const orders = existing.orders.map(g2 => {
          if (g2.groupId !== groupId) return g2;
          const idSet = new Set(items.map(it => it.id));
          return { ...g2, items: (g2.items || []).map(it => idSet.has(it.id) ? { ...it, ...patch } : it) };
        });
        return window.authApi.saveDoc('order_tracking', key, { merchantAuthUid: existing.merchantAuthUid, phone: existing.phone, orders });
      }).catch(() => {});
    }
  }

  closeCustomerCancelModal();
  showToast('تم إرسال طلب الإلغاء — بانتظار تأكيد المحل');
  renderTrackedGroups();
}

// Refreshes whichever storefront view is currently on screen — the public
// customer-facing link, or the admin's internal preview tool.
function refreshStorefrontView() {
  if (publicStoreMerchantId) {
    renderStorefrontInto(publicStoreMerchantId, document.getElementById('public-storefront-content'));
  } else {
    renderStorefront();
  }
  refreshOpenProductDetail();
}


