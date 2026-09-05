// ---------- ORDER CANCELLATION (admin or merchant — with a reason) ----------
let currentCancelTarget = null;
function openCancelReasonModal(groupId, role, roleName) {
  currentCancelTarget = { groupId, role, roleName };
  document.getElementById('cancel-reason-input').value = '';
  document.getElementById('cancel-reason-modal').classList.add('show');
}
function closeCancelReasonModal() {
  currentCancelTarget = null;
  document.getElementById('cancel-reason-modal').classList.remove('show');
}
function confirmCancelOrderGroup() {
  if (!currentCancelTarget) return;
  const reason = document.getElementById('cancel-reason-input').value.trim();
  if (!reason) { showToast('لازم تكتب سبب الإلغاء'); return; }
  const { groupId, role, roleName } = currentCancelTarget;
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && !o.cancelled);
  if (items.length === 0) { closeCancelReasonModal(); return; }
  const now = new Date().toISOString();
  items.forEach(o => {
    reverseOrderEffectsOnCancel(o); // restore stock, and refund the merchant's balance if this had already been accepted
    o.cancelled = true;
    o.cancelReason = reason;
    o.cancelBy = role;
    o.cancelByName = roleName;
    o.cancelAt = now;
  });
  saveData();
  closeCancelReasonModal();
  showToast('تم إلغاء الطلب وتسجيل السبب');
  renderAll();
}

// ---------- CUSTOMER CANCELLATION REQUESTS — merchant + admin review queues ----------
// Merchant side: shows every invoice this merchant owns that has a live cancellation
// request on it (either stage). The merchant's job is to actually call the customer,
// confirm they really want to cancel and why, then either approve (writes their own note
// and hands it to the admin for final sign-off) or reject (keeps the order alive as normal).
function renderMerchantCancelRequests(m) {
  const requested = data.orders.filter(o => o.merchantId === m.id && !o.cancelled && (o.cancelStage === 'customer_requested' || o.cancelStage === 'merchant_approved')).slice().reverse();
  if (requested.length === 0) return '<div class="empty">ما فيه طلبات إلغاء من الزبائن حالياً</div>';
  const groups = groupOrders(requested);
  return groups.map(g => {
    const items = g.orders;
    const first = items[0];
    const itemsHtml = items.map(o => `<div class="invoice-line"><span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د</span></div>`).join('');
    const stageNote = first.cancelStage === 'merchant_approved'
      ? `<div style="font-size:11px; color:#92400E; margin-top:6px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:5px 6px;">
           وافقت وأرسلته للإدارة — بانتظار موافقتها النهائية
           <br>ملاحظتك: ${esc(first.merchantCancelNote) || '—'}
         </div>`
      : '';
    return `
    <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="width:100%;">
        <b>فاتورة الزبون${items.length > 1 ? ' — ' + items.length + ' قطع' : ''}</b>
        <div style="color:var(--text-mute); font-size:11px; margin-top:2px;">${orderDateTimeLabel(first.date)}</div>
        ${orderCustomerLine(first)}
        <div style="margin-top:6px;">${itemsHtml}</div>
        <div style="font-size:11px; color:#B3261E; margin-top:6px; border-top:1px dashed #EEC9C6; padding-top:6px;">
          سبب الزبون: ${esc(first.cancelRequestReason) || '—'}
        </div>
        ${stageNote}
      </div>
      <div style="display:flex; align-items:center; gap:8px; width:100%; justify-content:flex-end; flex-wrap:wrap;">
        ${first.cancelStage === 'customer_requested' ? `
          <button class="btn secondary small" onclick="rejectCustomerCancelRequest(${g.groupId}, 'merchant')">رفض — إبقاء الطلب</button>
          <button class="btn danger small" onclick="openMerchantApproveCancelModal(${g.groupId})">تأكيد الإلغاء</button>
        ` : `
          <button class="btn secondary small" onclick="rejectCustomerCancelRequest(${g.groupId}, 'merchant')">تراجع — إرجاع الطلب للزبون</button>
        `}
      </div>
    </div>`;
  }).join('');
}

// Resets a cancellation request back to normal (cancelStage -> 'none') — used both when the
// merchant rejects a still-fresh customer request, and when the merchant or admin undoes an
// already-merchant-approved one "بالغلط". Either way the order goes right back to whatever
// state it was already in (its status/deliveryStatus were never touched by the request), so
// it simply reappears as a normal active order to the customer, merchant, and admin alike.
function resetCancelRequest(groupId, byRole) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && !o.cancelled && o.cancelStage && o.cancelStage !== 'none');
  if (items.length === 0) return;
  items.forEach(o => {
    o.cancelStage = 'none';
    o.cancelRequestReason = '';
    o.cancelRequestedAt = null;
    o.merchantCancelNote = '';
    o.merchantCancelAt = null;
  });
  saveData();
  showToast(byRole === 'admin' ? 'تم إلغاء طلب الإلغاء — رجع الطلب متل ما كان' : 'تم التراجع — رجع الطلب للزبون متل ما كان');
  renderAll();
}
function rejectCustomerCancelRequest(groupId, byRole) {
  openConfirmModal('إرجاع الطلب', 'راح يرجع هذا الطلب يشتغل عادي وما ينلغي. متأكد؟', () => resetCancelRequest(groupId, byRole));
}

// Merchant approval step: merchant must write their OWN note (e.g. confirming they actually
// called the customer) before this moves to the admin's queue for final sign-off — the
// customer's original reason stays attached separately (cancelRequestReason).
let currentMerchantApproveCancelGroupId = null;
function openMerchantApproveCancelModal(groupId) {
  currentMerchantApproveCancelGroupId = groupId;
  const input = document.getElementById('merchant-approve-cancel-note');
  if (input) input.value = '';
  document.getElementById('merchant-approve-cancel-modal').classList.add('show');
}
function closeMerchantApproveCancelModal() {
  currentMerchantApproveCancelGroupId = null;
  document.getElementById('merchant-approve-cancel-modal').classList.remove('show');
}
function confirmMerchantApproveCancel() {
  const groupId = currentMerchantApproveCancelGroupId;
  if (!groupId) return;
  const note = document.getElementById('merchant-approve-cancel-note').value.trim();
  if (!note) { showToast('لازم تكتب ملاحظة تأكيد الإلغاء (مثلاً: اتصلت بالزبون وأكد الإلغاء)'); return; }
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && o.cancelStage === 'customer_requested');
  if (items.length === 0) { closeMerchantApproveCancelModal(); return; }
  const now = new Date().toISOString();
  items.forEach(o => {
    o.cancelStage = 'merchant_approved';
    o.merchantCancelNote = note;
    o.merchantCancelAt = now;
  });
  saveData();
  closeMerchantApproveCancelModal();
  showToast('تم إرسال الإلغاء للإدارة للموافقة النهائية');
  renderAll();
}

// Admin-only: sends a prepared invoice back to the merchant to prepare/hand over again
// (e.g. the delivery attempt didn't go through this round) — without cancelling it.
function returnOrderGroupToMerchant(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && !o.cancelled);
  if (items.length === 0) return;
  openConfirmModal('إرجاع للتاجر', 'راح ترجع هذي الفاتورة كاملة للتاجر عشان يجهزها ويسلمها للتوصيل من جديد. متأكد؟', () => {
    items.forEach(o => { o.deliveryStatus = 'none'; });
    saveData();
    showToast('تم إرجاع الفاتورة للتاجر ليجهزها من جديد');
    renderAll();
  });
}

function orderCustomerLine(o) {
  if (!o.customerName) return '';
  const speedLabel = o.shippingSpeed === 'fast' ? 'سريع' : (o.shippingSpeed === 'slow' ? 'بطيء' : '');
  return `<div style="font-size:11px; color:#64748B; margin-top:2px;">
    ${esc(o.customerName)} — ${esc(o.customerPhone)} — ${esc(o.customerAddress)}${o.governorate ? ' — ' + esc(o.governorate) : ''}${speedLabel ? ' — شحن ' + speedLabel : ''}
  </div>`;
}

// Mini invoice shown to the merchant for a single order: exactly what the customer paid for
// (item + service fee + delivery), and — separately — what the platform deducts from the
// merchant and what the merchant nets from this specific sale.
function orderFinanceLine(o) {
  const customerTotal = o.price + (o.feeFromCustomer || 0) + (o.shippingFee || 0);
  const net = o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0);
  let breakdown = `القطعة ${o.price.toLocaleString()} د`;
  if (o.feeFromCustomer) breakdown += ` + رسوم خدمة ${o.feeFromCustomer.toLocaleString()} د`;
  if (o.shippingFee) breakdown += ` + توصيل ${o.shippingFee.toLocaleString()} د`;
  let deducted = `رسم المنصة المستقطع مني: ${(o.feeFromMerchant || 0).toLocaleString()} د`;
  if (o.itemDeduction) deducted += ` + استقطاع القطعة: ${o.itemDeduction.toLocaleString()} د`;
  return `<div style="font-size:11px; color:#64748B; margin-top:3px; border-top:1px dashed #EEE; padding-top:3px;">
    فاتورة الزبون: ${breakdown} = <b>${customerTotal.toLocaleString()} د</b>
    <br>${deducted}${o.status === 'accepted' && !o.cancelled ? ' — صافيّ من هذا الطلب: ' + net.toLocaleString() + ' د' : ''}
  </div>`;
}

function deliveryStatusLabel(status) {
  if (status === 'with_shipping') return 'جاهز للتوصيل';
  if (status === 'received_by_shipping') return 'مستلم من قبل شركة الشحن';
  if (status === 'delivered') return 'تم التسليم';
  if (status === 'returned') return 'مرجّع';
  return '';
}
function deliveryStatusBadgeClass(status) {
  if (status === 'delivered') return 'active';
  if (status === 'returned') return 'rejected';
  return 'pending';
}

// ---------- ADMIN-CONTROLLED PER-AREA DELIVERY PRICING ----------
// Only the admin sets these — from inside the "own delivery" modal (openOwnDeliveryModal) —
// for any merchant they've flagged with ownDelivery. The merchant has no ability to change
// their own delivery pricing or add areas; that's deliberate, so a merchant can't quietly
// inflate the "delivery fee" a customer pays. See registerCustomArea() for area management,
// which is likewise admin-only.
function renderOwnDeliveryAreaPricing() {
  const box = document.getElementById('own-delivery-area-pricing');
  if (!box) return;
  if (!ownDeliveryState.enabled) { box.innerHTML = ''; return; }
  const allowedGovs = ownDeliveryState.governorates.length ? ownDeliveryState.governorates : IRAQ_GOVERNORATES;
  box.innerHTML = `
    <label style="margin-top:12px;">أسعار التوصيل حسب المنطقة (اختياري)</label>
    <div class="subtitle" style="margin-bottom:6px;">أي منطقة ما تحددلها سعر هنا تاخذ السعر الافتراضي أعلاه تلقائياً</div>
    ${allowedGovs.map(gov => `
      <div class="card" style="padding:10px; margin-bottom:8px;">
        <div class="card-title" style="font-size:12.5px;">${esc(gov)}</div>
        <div id="own-delivery-areas-${esc(gov)}">${renderOwnDeliveryAreaRows(gov)}</div>
      </div>
    `).join('')}
  `;
}
function renderOwnDeliveryAreaRows(governorate) {
  const areas = allAreasForGovernorate(governorate);
  if (!areas.length) return '<div class="empty">ما فيه مناطق مسجلة لهذي المحافظة بعد</div>';
  return areas.map(area => {
    const price = (ownDeliveryState.areaPrices[governorate] && typeof ownDeliveryState.areaPrices[governorate][area] === 'number')
      ? ownDeliveryState.areaPrices[governorate][area] : '';
    return `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="flex:1; font-size:12.5px;">${esc(area)}</span>
        <input type="number" style="width:100px;" placeholder="${document.getElementById('own-delivery-price-input').value || 0}" value="${price}"
          onchange="setOwnDeliveryAreaPrice('${esc(governorate)}', '${esc(area)}', this.value)">
      </div>`;
  }).join('');
}
function setOwnDeliveryAreaPrice(governorate, area, value) {
  if (!ownDeliveryState.areaPrices[governorate]) ownDeliveryState.areaPrices[governorate] = {};
  const price = value === '' ? null : Math.max(0, parseFloat(value) || 0);
  if (price === null) delete ownDeliveryState.areaPrices[governorate][area];
  else ownDeliveryState.areaPrices[governorate][area] = price;
}

// Ready-for-delivery orders are grouped into invoices (same orderGroupId = one customer
// checkout) so the merchant marks the whole invoice as prepared/handed to delivery as a
// single unit, instead of handling each piece separately. The admin then confirms the
// final delivery outcome (واصل / غير واصل) from the admin delivery-control screen.
function renderReadyForShipping(m) {
  // Orders with a live cancellation request (cancelStage !== 'none') are excluded here —
  // they show in the "طلبات إلغاء من الزبائن" card instead, so the merchant can't
  // accidentally hand an order to shipping while its cancellation is still under review.
  const ready = data.orders.filter(o => o.merchantId === m.id && o.status === 'accepted' && !o.cancelled && o.deliveryStatus === 'none' && (!o.cancelStage || o.cancelStage === 'none')).slice().reverse();
  if (ready.length === 0) return '<div class="empty">ما فيه طلبات جاهزة للتجهيز حالياً</div>';
  const groups = groupOrders(ready);
  return groups.map(g => {
    const items = g.orders;
    const first = items[0];
    const itemsHtml = items.map(o => `
      <div class="invoice-line">
        <span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د</span>
      </div>
    `).join('');
    return `
    <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="width:100%;">
        <b>فاتورة الزبون${items.length > 1 ? ' — ' + items.length + ' قطع' : ''}</b>
        <div style="color:var(--text-mute); font-size:11px; margin-top:2px;">${orderDateTimeLabel(first.date)}</div>
        ${orderCustomerLine(first)}
        <div style="margin-top:6px;">${itemsHtml}</div>
        ${items.map(o => orderFinanceLine(o)).join('')}
      </div>
      <div style="display:flex; align-items:center; gap:8px; width:100%; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn small" onclick="handOverInvoiceToShipping(${g.groupId}, this)">تم التجهيز — تسليم للتوصيل</button>
        <button class="btn danger small" onclick="openCancelReasonModal(${g.groupId}, 'merchant', '${esc(m.shop || '').replace(/'/g, "\\'")}')">إلغاء الطلب</button>
      </div>
    </div>`;
  }).join('');
}

async function handOverInvoiceToShipping(groupId, btn) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && o.status === 'accepted' && !o.cancelled && o.deliveryStatus === 'none');
  if (items.length === 0) {
    // هذا سابقاً كان يرجع بصمت بدون أي رسالة، فيبين إن الزر "ما يشتغل". لو صار هذا،
    // فعلياً يعني إن حالة الطلب تغيّرت (من مكان ثاني) بين ما انعرضت الفاتورة وبين وقت
    // الضغط على الزر — نطلب تحديث بدل ما نسكت.
    console.warn('handOverInvoiceToShipping: no matching items for groupId', groupId);
    showToast('هذي الفاتورة تغيّرت حالتها — جاري تحديث الشاشة');
    renderAll();
    return;
  }
  // يمنع دبل-كليك أو ضغطة ثانية أثناء ما الحفظ الأول لسا شغال.
  if (btn) { btn.disabled = true; btn.textContent = 'جاري التسليم...'; }
  items.forEach(o => {
    o.deliveryStatus = 'with_shipping';
  });
  saveData(); // يتكفل بمزامنة باقي البيانات (best-effort زي دايماً)
  // نتأكد فعلياً من نجاح حفظ هالفاتورة بالذات — saveData() لحالها تكتب الطلبات
  // "fire-and-forget" وترجع true حتى لو الكتابة فشلت، فما تصلح للتحقق من هذا الإجراء.
  let ok = true;
  if (window.authApi) {
    try {
      await Promise.all(items.map(o => window.authApi.saveDoc('orders', String(o.id), o)));
    } catch (e) {
      console.error('handOverInvoiceToShipping: order write failed', e);
      ok = false;
    }
  }
  if (!ok) {
    // نرجّع الحالة المحلية زي ما كانت عشان الشاشة تطابق الحقيقة، ونعطي رسالة واضحة
    // بدل ما نخلي المستخدم يظن إن الزر "توقف" بدون أي سبب.
    items.forEach(o => { o.deliveryStatus = 'none'; });
    showToast('فشل حفظ التسليم — تأكد من الاتصال بالإنترنت وحاول مرة ثانية');
    if (btn) { btn.disabled = false; btn.textContent = 'تم التجهيز — تسليم للتوصيل'; }
    renderAll();
    return;
  }
  showToast(`تم تسليم الفاتورة كاملة (${items.length} قطعة) للتوصيل — بانتظار تأكيد الأدمن`);
  renderAll();
}

// Groups orders into "invoices" — every order created together from one cart checkout
// shares an orderGroupId and should be shown/actioned as a single invoice; legacy/older
// single-item orders (no orderGroupId) fall back to being their own one-item invoice.
function groupOrders(orders) {
  const groups = {};
  const list = [];
  orders.forEach(o => {
    const key = o.orderGroupId || o.id;
    if (!groups[key]) { groups[key] = { groupId: key, orders: [] }; list.push(groups[key]); }
    groups[key].orders.push(o);
  });
  return list;
}

function renderPendingOrders(m) {
  // Same exclusion as renderReadyForShipping — an order mid-cancellation-review is
  // handled from the "طلبات إلغاء من الزبائن" card, not accepted/rejected here.
  const pending = data.orders.filter(o => o.merchantId === m.id && o.status === 'pending' && !o.cancelled && (!o.cancelStage || o.cancelStage === 'none')).slice().reverse();
  if (pending.length === 0) return '<div class="empty">ما فيه طلبات جديدة حالياً</div>';
  const groups = groupOrders(pending);
  return groups.map(g => {
    const items = g.orders;
    const first = items[0];
    const subtotal = items.reduce((s, o) => s + o.price, 0);
    const serviceFee = items.reduce((s, o) => s + (o.feeFromCustomer || 0), 0);
    const shipping = items.reduce((s, o) => s + (o.shippingFee || 0), 0);
    const customerTotal = subtotal + serviceFee + shipping;
    const feeFromMerchant = items.reduce((s, o) => s + (o.feeFromMerchant || 0), 0);
    const itemDeduction = items.reduce((s, o) => s + (o.itemDeduction || 0), 0);
    const platformCommission = feeFromMerchant + itemDeduction;
    const netPayout = subtotal - platformCommission;
    const hasPendingRemoval = items.some(o => o.removalStatus === 'requested');

    const itemsHtml = items.map(o => `
      <div class="invoice-line">
        <span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د
          ${o.removalStatus === 'requested' ? ' <span class="badge pending">بانتظار موافقة الأدمن على الحذف</span>' : ''}
          ${o.removalStatus === 'denied' ? ' <span class="badge rejected">الأدمن رفض حذفها</span>' : ''}
        </span>
        ${(!o.removalStatus || o.removalStatus === 'denied') ? `<button class="btn secondary small" onclick="requestOrderRemoval(${o.id})">غير متوفرة</button>` : ''}
      </div>
    `).join('');

    return `
    <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="width:100%;">
        <b>فاتورة الزبون${items.length > 1 ? ' — ' + items.length + ' قطع' : ''}</b>
        <div style="color:var(--text-mute); font-size:11px; margin-top:2px;">${orderDateTimeLabel(first.date)}</div>
        ${orderCustomerLine(first)}
        <div style="margin-top:6px;">${itemsHtml}</div>
        <div style="font-size:11px; color:#64748B; margin-top:6px; border-top:1px dashed #EEE; padding-top:6px;">
          إجمالي الفاتورة: ${subtotal.toLocaleString()} د قطع${serviceFee ? ' + ' + serviceFee.toLocaleString() + ' د رسوم خدمة' : ''}${shipping ? ' + ' + shipping.toLocaleString() + ' د توصيل' : ''} = <b>${customerTotal.toLocaleString()} د</b>
        </div>
        <div style="font-size:11px; color:var(--accent-dark); margin-top:3px; border-top:1px dashed #EEE; padding-top:6px;">
          عمولة المنصة المستقطعة منك بهذي الفاتورة: <b>${platformCommission.toLocaleString()} د</b>${feeFromMerchant ? ' (رسم منصة ' + feeFromMerchant.toLocaleString() + ' د' : ''}${itemDeduction ? (feeFromMerchant ? ' + ' : ' (') + 'استقطاع قطع ' + itemDeduction.toLocaleString() + ' د' : ''}${(feeFromMerchant || itemDeduction) ? ')' : ''}
          — صافيك المتوقع لو انقبلت الفاتورة: <b>${netPayout.toLocaleString()} د</b>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; width:100%; justify-content:flex-end; flex-wrap:wrap;">
        ${hasPendingRemoval ? `<span style="font-size:11px; color:var(--warn);">بانتظار رد الأدمن على طلب حذف قطعة قبل ما تكدر تقبل الفاتورة</span>` : ''}
        <button class="btn small" ${hasPendingRemoval ? 'disabled style="opacity:.5;"' : ''} onclick="acceptInvoice(${g.groupId})">قبول الفاتورة</button>
        <button class="btn danger small" onclick="rejectInvoice(${g.groupId})">رفض الفاتورة</button>
      </div>
    </div>`;
  }).join('');
}

function acceptInvoice(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && o.status === 'pending' && !o.cancelled);
  if (items.length === 0) return;
  if (items.some(o => o.removalStatus === 'requested')) {
    showToast('لازم تنتظر رد الأدمن على طلب حذف القطعة قبل قبول الفاتورة');
    return;
  }
  const m = data.merchants.find(x => x.id === items[0].merchantId);
  items.forEach(o => {
    o.status = 'accepted';
    m.salesCount++;
    // NOTE: was missing the coupon discount deduction here — every accounting report/export
    // in the app already subtracts couponDiscount to compute the merchant's net (see
    // orderFinanceLine, exportMerchantAccountingExcel, renderAdminAccounting...), so leaving
    // it out of the actual balance credit meant the real balance silently drifted higher than
    // what every report told the merchant they'd earned, by the full coupon amount.
    m.balance += (o.price - o.feeFromMerchant - (o.itemDeduction || 0) - (o.couponDiscount || 0));
    // This is the real, authoritative stock deduction — deliberately placed here instead of at
    // guest checkout time (see the comment in submitCheckout/newOrders.push above). This code
    // runs inside the merchant's own logged-in session, which does have permission to write to
    // their own document, so this write actually reaches Firestore (unlike a guest's attempt).
    const p = o.productId ? m.products.find(x => x.id === o.productId) : null;
    if (p) deductVariantStock(p, o.size, o.color);
  });
  // The coupon was used once per checkout (this whole invoice), not once per unit sold, so this
  // increments usedCount a single time here — outside the items.forEach above — even though the
  // invoice may bundle several units that each repeat the same couponCode field.
  const couponCode = items[0].couponCode;
  if (couponCode) {
    const coupon = m.coupons.find(c => c.code === couponCode);
    if (coupon) coupon.usedCount = (coupon.usedCount || 0) + 1;
  }
  saveData();
  showToast('تم قبول الفاتورة');
  renderAll();
}

function rejectInvoice(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && o.status === 'pending' && !o.cancelled);
  if (items.length === 0) return;
  items.forEach(o => {
    o.status = 'rejected';
    // No restoreVariantStock() call here — a 'pending' invoice never had its stock deducted
    // in the first place (that only happens in acceptInvoice() now), so there's nothing to
    // give back. Restoring here would have incorrectly added stock that was never removed.
  });
  saveData();
  showToast('تم رفض الفاتورة');
  renderAll();
}

// Undoes the stock/balance side-effects of a single order when it's cancelled, no matter
// which of the (several) cancellation paths triggered it — admin/merchant instant cancel
// with a reason (confirmCancelOrderGroup) or a customer-initiated cancellation once it's
// fully approved (finalizeCustomerCancel). Both things this undoes were only ever applied in
// acceptInvoice() (stock deduction, balance credit, salesCount bump) — a still-'pending' order
// never had any of them applied yet (deduction now happens at acceptance, not at checkout —
// see the comment where newOrders are built), so there's nothing to reverse for those; only
// an order that had actually reached 'accepted' needs undoing here.
// Must be called BEFORE the caller flips o.cancelled — it doesn't check o.cancelled itself,
// so calling it twice on the same order would double-refund/double-restock.
function reverseOrderEffectsOnCancel(o) {
  const m = data.merchants.find(x => x.id === o.merchantId);
  if (!m) return;
  if (o.status === 'accepted') {
    const p = o.productId ? m.products.find(x => x.id === o.productId) : null;
    if (p) restoreVariantStock(p, o.size, o.color);
    m.balance -= (o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0));
    m.salesCount = Math.max(0, (m.salesCount || 0) - 1);
  }
}

// Merchant flags a single piece inside a pending invoice as unavailable — it doesn't get removed
// right away, it just waits in the admin's queue until the admin approves or denies the removal.
function requestOrderRemoval(orderId) {
  const o = data.orders.find(x => x.id === orderId);
  if (!o || o.status !== 'pending') return;
  o.removalStatus = 'requested';
  saveData();
  showToast('تم إرسال طلب حذف القطعة للأدمن — بانتظار موافقته');
  renderAll();
}

// Admin approves removing a flagged piece from its invoice: the order itself is marked "removed"
// (so it drops out of the merchant's pending invoice) and its stock is restored.
function approveOrderRemoval(orderId) {
  const o = data.orders.find(x => x.id === orderId);
  if (!o || o.removalStatus !== 'requested') return;
  o.status = 'removed';
  o.removalStatus = 'approved';
  // No restoreVariantStock() call here — requestOrderRemoval() only allows flagging a still-
  // 'pending' order (checked there), and pending orders never had stock deducted (that now
  // only happens in acceptInvoice()), so there's nothing to give back.
  saveData();
  showToast('تمت الموافقة على حذف القطعة من فاتورة الزبون');
  renderAll();
}

// Admin denies the removal: the piece goes back into its invoice, unchanged, for the merchant to
// accept or reject along with the rest.
function denyOrderRemoval(orderId) {
  const o = data.orders.find(x => x.id === orderId);
  if (!o || o.removalStatus !== 'requested') return;
  o.removalStatus = 'denied';
  saveData();
  showToast('تم رفض طلب الحذف — القطعة رجعت للفاتورة');
  renderAll();
}

// Was hard-capped at the latest 15 orders with no way to see anything older — a merchant
// with more history than that could simply never look further back. Now paginated (15 per
// page, newest first) with a page state kept per-merchant so switching tabs/re-rendering
// elsewhere doesn't reset which page they were on.
let merchantOrdersPage = {};
const MERCHANT_ORDERS_PAGE_SIZE = 15;
function changeMerchantOrdersPage(merchantId, page) {
  merchantOrdersPage[merchantId] = page;
  const el = document.getElementById(`merchant-orders-${merchantId}`);
  const m = data.merchants.find(x => x.id === merchantId);
  if (el && m) el.innerHTML = renderMerchantOrders(m);
}
function renderMerchantOrders(m) {
  const myOrders = data.orders.filter(o => o.merchantId === m.id).slice().reverse();
  if (myOrders.length === 0) return '<div class="empty">ما فيه طلبات بعد</div>';

  const totalPages = Math.max(1, Math.ceil(myOrders.length / MERCHANT_ORDERS_PAGE_SIZE));
  let page = merchantOrdersPage[m.id] || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  merchantOrdersPage[m.id] = page;

  const start = (page - 1) * MERCHANT_ORDERS_PAGE_SIZE;
  const pageOrders = myOrders.slice(start, start + MERCHANT_ORDERS_PAGE_SIZE);

  const rows = pageOrders.map(o => {
    const dateLabel = orderDateTimeLabel(o.date);
    return `<div class="list-item" style="align-items:flex-start;">
      <span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د${orderCustomerLine(o)}${orderFinanceLine(o)}${cancelReasonLine(o)}<br>
      <span style="color:var(--text-mute); font-size:11px;">${dateLabel}</span></span>
      <span>${o.cancelled ? '<span class="badge rejected">ملغي</span>' : `<span class="badge ${o.status}">${orderStatusLabel(o.status)}</span> ${o.deliveryStatus && o.deliveryStatus !== 'none' ? `<span class="badge ${deliveryStatusBadgeClass(o.deliveryStatus)}">${deliveryStatusLabel(o.deliveryStatus)}</span>` : ''}`}</span>
    </div>`;
  }).join('');

  const pager = totalPages > 1 ? `
    <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-top:12px;">
      <button class="btn secondary small" ${page <= 1 ? 'disabled' : ''} onclick="changeMerchantOrdersPage(${m.id}, ${page - 1})">‹ السابق</button>
      <span style="font-size:11.5px; color:var(--text-mute);">صفحة ${page} من ${totalPages} (${myOrders.length} طلب)</span>
      <button class="btn secondary small" ${page >= totalPages ? 'disabled' : ''} onclick="changeMerchantOrdersPage(${m.id}, ${page + 1})">التالي ›</button>
    </div>` : `<div style="text-align:center; font-size:11px; color:var(--text-mute); margin-top:8px;">${myOrders.length} طلب</div>`;

  return rows + pager;
}

async function addProduct(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const nameInput = document.getElementById(`p-name-${merchantId}`);
  const priceInput = document.getElementById(`p-price-${merchantId}`);
  const descInput = document.getElementById(`p-desc-${merchantId}`);
  const stockInput = document.getElementById(`p-stock-${merchantId}`);
  const categorySelect = document.getElementById(`p-category-${merchantId}`);
  const imageInput = document.getElementById(`p-image-${merchantId}`);
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  const description = descInput.value.trim();
  const sizes = (draftProductSizes[merchantId] || []).slice();
  const colors = (draftProductColors[merchantId] || []).slice();
  const stockRaw = stockInput.value.trim();
  const stock = stockRaw === '' ? null : (parseInt(stockRaw) || 0);
  const categoryId = categorySelect && categorySelect.value ? parseInt(categorySelect.value) : null;
  if (!name || !price || price <= 0) { showToast('عبي اسم المنتج والسعر (لازم يكون رقم أكبر من صفر)'); return; }

  // Multiple photos per product — capped at MAX_PRODUCT_IMAGES so one product can't blow up
  // the merchant's whole document (all of a merchant's products live in one Firestore doc,
  // which has a hard 1MB size limit shared across everything else on their storefront).
  const images = [];
  if (imageInput.files && imageInput.files.length) {
    const files = Array.from(imageInput.files).slice(0, MAX_PRODUCT_IMAGES);
    if (imageInput.files.length > MAX_PRODUCT_IMAGES) showToast(`تم اعتماد أول ${MAX_PRODUCT_IMAGES} صور بس`);
    for (const file of files) {
      try { images.push(await resizeImageFile(file, 500, 0.75)); }
      catch (e) { /* skip this one, keep the rest */ }
    }
  }

  m.products.push({id: genId(), name, price, image: images[0] || null, images, description, sizes, colors, stock, categoryId});
  saveData();
  nameInput.value = ''; priceInput.value = ''; descInput.value = ''; stockInput.value = ''; imageInput.value = '';
  draftProductSizes[merchantId] = [];
  draftProductColors[merchantId] = [];
  if (categorySelect) categorySelect.value = '';
  renderMerchantPanel();
  showToast('تمت إضافة المنتج');
}

// ---------- BULK PRODUCT IMPORT (Excel/CSV) ----------
// Downloads a ready-made template so the merchant fills in a familiar spreadsheet instead of
// guessing column names — one example row shows the expected format for sizes/colors.
function downloadProductImportTemplate() {
  if (typeof XLSX === 'undefined') { showToast('تعذر تحميل مكتبة الإكسل — تأكد من اتصالك بالإنترنت'); return; }
  const headers = ['اسم المنتج', 'السعر', 'الوصف', 'الكمية', 'القسم', 'المقاسات', 'الألوان'];
  const example = [
    'قميص قطن أبيض', 15000, 'قماش قطن 100%، صناعة تركية', '', 'ملابس', 'M:5, L:3, XL:2', 'أبيض:6, أسود:4'
  ];
  const note = ['', '', '', '', '', '', ''];
  const ws = XLSX.utils.aoa_to_sheet([headers, example, note]);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'منتجات');
  XLSX.writeFile(wb, 'قالب-استيراد-منتجات.xlsx');
}

// Parses a comma-separated "label:qty, label:qty" cell (used for both المقاسات and الألوان)
// into the same {value/name, stock} shape the manual add-product chips already use elsewhere.
function parseImportVariantList(str, kind) {
  if (!str || typeof str !== 'string') return [];
  return str.split(',').map(part => part.trim()).filter(Boolean).map(part => {
    const [label, qty] = part.split(':').map(s => (s || '').trim());
    const stock = (qty !== undefined && qty !== '') ? (parseInt(qty) || 0) : null;
    return kind === 'size' ? { value: label, stock } : { name: label, hex: '#10B981', stock };
  }).filter(v => (kind === 'size' ? v.value : v.name));
}

// Normalizes a product name for duplicate comparison: trims edge whitespace, collapses
// repeated internal spaces to one, and lowercases (matters for Latin-script names —
// Arabic has no case, so this is a no-op there, but it's harmless either way).
function normalizeProductNameForDupeCheck(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Last import's per-row report, kept keyed by merchant id (not just a local variable) so it
// survives the renderMerchantPanel() re-render that importProductsFromFile() triggers right
// after a successful import — that re-render rebuilds this whole card's HTML from scratch,
// which would otherwise wipe out a results box filled in directly via .innerHTML.
const lastImportReports = {};
function renderImportResultsBox(merchantId) {
  const report = lastImportReports[merchantId];
  if (!report) return `<div id="p-import-results-${merchantId}"></div>`;
  const skippedList = report.skippedDetails.length ? `
    <div style="margin-top:10px; max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:8px;">
      ${report.skippedDetails.map(d => `
        <div style="font-size:12px; padding:4px 0; border-bottom:1px solid var(--border);">
          <b>صف ${d.row}</b> — ${esc(d.name)} — <span style="color:var(--warn);">${esc(d.reason)}</span>
        </div>
      `).join('')}
    </div>` : '';
  return `
    <div id="p-import-results-${merchantId}">
      <div class="subtitle" style="margin-top:10px;">
        آخر استيراد — انضاف: ${report.added} منتج${report.skippedDetails.length ? ` &nbsp;|&nbsp; تم تجاوز: ${report.skippedDetails.length} صف` : ''}
      </div>
      ${skippedList}
    </div>
  `;
}

async function importProductsFromFile(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  const input = document.getElementById(`p-import-file-${merchantId}`);
  if (!input || !input.files || !input.files[0]) { showToast('اختر ملف Excel أو CSV أولاً'); return; }
  if (typeof XLSX === 'undefined') { showToast('تعذر تحميل مكتبة قراءة الإكسل — تأكد من اتصالك بالإنترنت'); return; }

  let rows;
  try {
    const buf = await input.files[0].arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (e) {
    console.error('Product import parse failed:', e);
    showToast('تعذر قراءة الملف — تأكد إنه ملف Excel أو CSV صحيح وبنفس شكل القالب');
    return;
  }
  if (!rows || rows.length === 0) { showToast('الملف فاضي، ما فيه صفوف بيانات'); return; }

  // Names already in the merchant's catalog before this import started, plus every name
  // accepted so far *during* this same import — both checked so a row can be rejected either
  // for duplicating an existing product or for duplicating an earlier row in the same file
  // (e.g. the merchant pasted the same product twice by mistake).
  const existingNames = new Set(m.products.map(p => normalizeProductNameForDupeCheck(p.name)));

  let added = 0;
  // One entry per skipped row, each with the spreadsheet row number (header = row 1, so the
  // first data row is row 2 — matches what the merchant sees if they open the file) and the
  // specific reason, instead of a single opaque total count.
  const skippedDetails = [];
  rows.forEach((row, idx) => {
    const sheetRow = idx + 2;
    const name = String(row['اسم المنتج'] || '').trim();
    const price = parseFloat(row['السعر']);
    if (!name) { skippedDetails.push({ row: sheetRow, name: name || '(بدون اسم)', reason: 'اسم المنتج فاضي' }); return; }
    // price <= 0 catches negatives too — a plain `!price` check lets negative numbers through
    // silently (they're JS-truthy), which would have let a bad/garbled spreadsheet cell
    // create a product with a negative price nobody would notice until a customer bought it.
    if (!price || isNaN(price) || price <= 0) { skippedDetails.push({ row: sheetRow, name, reason: 'السعر فاضي أو غير صحيح' }); return; }
    const normalized = normalizeProductNameForDupeCheck(name);
    if (existingNames.has(normalized)) { skippedDetails.push({ row: sheetRow, name, reason: 'اسم مكرر — موجود مسبقاً بمنتجاتك أو بصف سابق بنفس الملف' }); return; }
    const description = String(row['الوصف'] || '').trim();
    const stockRaw = row['الكمية'];
    const stock = (stockRaw === '' || stockRaw === undefined || stockRaw === null) ? null : (parseInt(stockRaw) || 0);
    const categoryName = String(row['القسم'] || '').trim();
    const category = categoryName ? m.categories.find(c => c.name.trim() === categoryName) : null;
    const sizes = parseImportVariantList(row['المقاسات'], 'size');
    const colors = parseImportVariantList(row['الألوان'], 'color');
    m.products.push({
      id: genId(), name, price, image: null, images: [],
      description, sizes, colors,
      stock: (sizes.length === 0 && colors.length === 0) ? stock : null,
      categoryId: category ? category.id : null
    });
    existingNames.add(normalized);
    added++;
  });

  // Stored (not written straight to the DOM) because renderMerchantPanel() below rebuilds
  // this whole card's markup from scratch right after — see renderImportResultsBox().
  lastImportReports[merchantId] = { added, skippedDetails };

  if (added === 0) {
    saveData();
    renderMerchantPanel();
    showToast('ما انضاف أي منتج — راجع تفاصيل الصفوف المتجاوزة بالأسفل');
    return;
  }
  saveData();
  input.value = '';
  renderMerchantPanel();
  showToast(`تم استيراد ${added} منتج${skippedDetails.length > 0 ? ` (تم تجاوز ${skippedDetails.length} صف — التفاصيل بالأسفل)` : ''} — تكدر تضيف الصور لكل واحد من "منتجاتي"`);
}

// ---------- ADMIN: mark prepared invoices as delivered (واصل) or not delivered (غير واصل) ----------
// Split into two tabs (توصيل سريع / توصيل بطيء) since a fast-delivery driver and a
// slow-delivery driver work off two completely separate lists in practice.
let currentShippingSpeedTab = 'fast';
function showShippingSpeedTab(id) {
  currentShippingSpeedTab = id;
  document.querySelectorAll('#shipping-speed-subnav .toggle').forEach(b => b.classList.toggle('selected', b.dataset.speedtab === id));
  renderAdminShippingControl();
}

// Whether the person looking at this screen right now is allowed to see the platform's
// commission breakdown (not just the customer's full paid amount). True admin: always.
// An admin-team employee: only if they were specifically given the 'accounting' permission
// on top of 'shipping' — someone just handed the delivery list shouldn't see the platform's
// margin on every order, only the total they need to collect/hand over.
function canSeeShippingAccounting() {
  if (currentRole === 'admin') return true;
  if (currentRole === 'employee') {
    const emp = currentEmployee();
    return !!(emp && emp.ownerType === 'admin' && emp.permissions.includes('accounting'));
  }
  return false;
}

function renderAdminShippingControl() {
  const el = document.getElementById('admin-shipping-control-list');
  if (!el) return;
  document.querySelectorAll('#shipping-speed-subnav .toggle').forEach(b => b.classList.toggle('selected', b.dataset.speedtab === currentShippingSpeedTab));

  // Includes 'returned' invoices too, not just the ones still actively out for delivery.
  // BUG FIX: marking an invoice "غير واصل" (markInvoiceReturned) used to drop it out of this
  // list entirely — with no button left anywhere to do anything with it — while o.status
  // stayed 'accepted' and o.cancelled stayed false, so every accounting report kept counting
  // it as a normal successful sale forever, even though the customer never received or paid
  // for it (COD). It's kept in this same screen (rather than a separate one) so the admin
  // doesn't have to hunt for a second list to close these out.
  const readyForDelivery = data.orders
    .filter(o => (o.deliveryStatus === 'with_shipping' || o.deliveryStatus === 'received_by_shipping' || o.deliveryStatus === 'returned') && !o.cancelled && (o.shippingSpeed || 'fast') === currentShippingSpeedTab)
    .slice().reverse();
  if (readyForDelivery.length === 0) {
    el.innerHTML = `<div class="empty">ما فيه طلبات ${currentShippingSpeedTab === 'fast' ? 'توصيل سريع' : 'توصيل بطيء'} مجهّزة بانتظار التوصيل أو راجعة من التوصيل حالياً</div>`;
    return;
  }
  const showAccounting = canSeeShippingAccounting();
  const groups = groupOrders(readyForDelivery);
  el.innerHTML = groups.map(g => {
    const items = g.orders;
    const first = items[0];
    const m = data.merchants.find(x => x.id === first.merchantId);

    const subtotal = items.reduce((s, o) => s + o.price, 0);
    const serviceFee = items.reduce((s, o) => s + (o.feeFromCustomer || 0), 0);
    const shipping = items.reduce((s, o) => s + (o.shippingFee || 0), 0);
    const customerTotal = subtotal + serviceFee + shipping;
    const feeFromMerchant = items.reduce((s, o) => s + (o.feeFromMerchant || 0), 0);
    const itemDeduction = items.reduce((s, o) => s + (o.itemDeduction || 0), 0);
    const platformCommission = feeFromMerchant + itemDeduction;
    const netPayout = subtotal - platformCommission;

    const itemsHtml = items.map(o => `<div class="invoice-line"><span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''}</span></div>`).join('');

    const merchantArea = m ? [m.governorate, m.area].filter(Boolean).join(' / ') : '';
    const merchantLine = m ? `
      <div style="font-size:11.5px; color:var(--ink-2); margin-top:4px; background:#F8FAFC; border:1px solid var(--border); border-radius:8px; padding:6px 8px;">
        عنوان المحل: ${esc(merchantArea) || '—'}${m.phone ? ' — صاحب المحل: ' + esc(m.phone) : ''}
      </div>` : '';

    const isReturned = first.deliveryStatus === 'returned';

    return `
    <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="width:100%;">
        <b>${m ? esc(m.shop) : '—'}${items.length > 1 ? ' (' + items.length + ' قطع)' : ''}</b>
        <span class="badge ${deliveryStatusBadgeClass(first.deliveryStatus)}" style="margin-right:6px;">${deliveryStatusLabel(first.deliveryStatus)}</span>
        ${isReturned ? `<div style="font-size:11px; color:#B3261E; margin-top:4px;">الشحنة رجعت — لازم تسويلها "إرجاع للتاجر" يجهزها من جديد، أو "إلغاء" لو ما راح يعاد إرسالها (يرجّع رصيد التاجر والمخزون تلقائياً).</div>` : ''}
        ${merchantLine}
        ${orderCustomerLine(first)}
        <div style="margin-top:6px;">${itemsHtml}</div>
        <div style="font-size:11px; color:#64748B; margin-top:6px; border-top:1px dashed #EEE; padding-top:6px;">
          المبلغ الكامل من الزبون: <b>${customerTotal.toLocaleString()} د</b>
        </div>
        ${showAccounting ? `
        <div style="font-size:11px; color:var(--accent-dark); margin-top:3px; border-top:1px dashed #EEE; padding-top:6px;">
          عمولة المنصة: <b>${platformCommission.toLocaleString()} د</b> — صافي التاجر: <b>${netPayout.toLocaleString()} د</b>
        </div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:8px; width:100%; justify-content:flex-end; flex-wrap:wrap;">
        ${(!isReturned && first.deliveryStatus === 'with_shipping') ? `<button class="btn secondary small" onclick="markInvoiceReceivedByShipping(${g.groupId})">مستلم من قبل شركة الشحن</button>` : ''}
        ${!isReturned ? `<button class="btn small" onclick="markInvoiceDelivered(${g.groupId})">واصل</button>` : ''}
        ${!isReturned ? `<button class="btn secondary small" onclick="markInvoiceReturned(${g.groupId})">غير واصل</button>` : ''}
        <button class="btn secondary small" onclick="returnOrderGroupToMerchant(${g.groupId})">إرجاع للتاجر يجهزها من جديد</button>
        <button class="btn danger small" onclick="openCancelReasonModal(${g.groupId}, 'admin', 'الأدمن')">إلغاء</button>
      </div>
    </div>`;
  }).join('');
}

// New intermediate step: the order has been physically handed over to the (external)
// shipping company, but hasn't been confirmed delivered to the customer yet. Shows to
// admin, merchant, and the customer's own tracking page via orderFullStatusLabel/
// deliveryStatusLabel — no separate rendering path needed since both already read
// deliveryStatus directly.
function markInvoiceReceivedByShipping(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && o.deliveryStatus === 'with_shipping');
  if (items.length === 0) return;
  items.forEach(o => { o.deliveryStatus = 'received_by_shipping'; });
  saveData();
  showToast('تم تسجيل الفاتورة كمستلمة من قبل شركة الشحن');
  renderAll();
}

function markInvoiceDelivered(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && (o.deliveryStatus === 'with_shipping' || o.deliveryStatus === 'received_by_shipping'));
  if (items.length === 0) return;
  items.forEach(o => { o.deliveryStatus = 'delivered'; });
  saveData();
  showToast('تم تسجيل الفاتورة كاملة كواصلة');
  renderAll();
}

function markInvoiceReturned(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && (o.deliveryStatus === 'with_shipping' || o.deliveryStatus === 'received_by_shipping'));
  if (items.length === 0) return;
  items.forEach(o => { o.deliveryStatus = 'returned'; });
  saveData();
  showToast('تم تسجيل الفاتورة كاملة كغير واصلة');
  renderAll();
}

