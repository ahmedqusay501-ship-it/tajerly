// ---------- ADMIN ACTIONS ----------
// Simple contact/profile directory for every registered store — not financial data, just
// who they are: store name, owner name, phone, and store description. Uses the same
// print-to-PDF technique as exportMerchantAccountingPDF (see there for why: client-side PDF
// libraries don't shape Arabic text correctly, the browser's own print engine does).
function exportMerchantsDirectoryPDF() {
  const list = activeMerchants();
  if (list.length === 0) { showToast('ما فيه محلات مسجلة بعد'); return; }

  const rowsHtml = list.map(m => {
    const s = computeMerchantLiveStats(m.id);
    return `<tr>
      <td>${esc(m.shop)}</td>
      <td>${esc(m.name) || '—'}</td>
      <td>${esc(m.phone) || '—'}</td>
      <td style="text-align:right;">${esc(m.description) || '—'}</td>
      <td>${m.status === 'active' ? 'نشط' : 'معطل'}</td>
      <td>${s.sales.toLocaleString()}</td>
      <td>${s.merchantDue.toLocaleString()}</td>
      <td>${s.platformDue.toLocaleString()}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>دليل التجار</title>
    <style>
      body { font-family: 'Cairo', Tahoma, Arial, sans-serif; padding: 24px; color:#1E293B; }
      h1 { font-size: 18px; margin-bottom: 2px; }
      .sub { color:#64748B; font-size:12px; margin-bottom:18px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th, td { border:1px solid #E2E8F0; padding:6px 8px; text-align:center; }
      th { background:#D1FAE5; }
      .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      @media (max-width: 480px) { table { font-size: 10.5px; } th, td { padding: 5px 5px; } }
      @media print { body { padding: 8px; } .table-scroll { overflow-x: visible; } }
    </style></head><body>
      <h1>دليل التجار</h1>
      <div class="sub">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')} — عدد المحلات: ${list.length}. الأرقام المالية (د) محسوبة لحظياً من كل طلبات التاجر المقبولة غير الملغية.</div>
      <div class="table-scroll">
      <table>
        <thead><tr><th>اسم المحل</th><th>اسم صاحب المحل</th><th>رقم الهاتف</th><th>وصف المتجر</th><th>الحالة</th><th>رصيد المبيعات (د)</th><th>مستحقات التاجر (د)</th><th>مستحقات المنصة (د)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      </div>
    </body></html>`;

  const printWin = window.open('', '_blank');
  if (!printWin) { showToast('المتصفح منع فتح نافذة الطباعة — فعّل النوافذ المنبثقة واعد المحاولة'); return; }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  setTimeout(() => { try { printWin.focus(); printWin.print(); } catch (e) {} }, 350);
  showToast('اختر "حفظ كـ PDF" من نافذة الطباعة اللي فتحت');
}
function resetFinancials(type) {
  openConfirmModal('تصفير الأرصدة', 'متأكد؟ هذا يصفر كل الأرصدة المالية ولا يمكن التراجع.', () => {
    if (type === 'merchants') {
      data.merchants.forEach(m => { m.balance = 0; m.salesCount = 0; });
    }
    saveData();
    showToast('تم تصفير الأرصدة');
    renderAll();
  });
}
function toggleMerchantStatus(id) {
  const m = data.merchants.find(x => x.id === id);
  m.status = m.status === 'active' ? 'disabled' : 'active';
  saveData();
  logAudit(m.status === 'active' ? 'تفعيل متجر' : 'تعطيل متجر', m.shop);
  showToast(m.status === 'active' ? 'تم تفعيل المتجر' : 'تم تعطيل المتجر');
  renderAll();
}
// Lets the admin mark a merchant as handling delivery themselves (their own driver/service)
// instead of through the platform's shipping zones — AND set the flat delivery price that
// gets charged to the customer for that merchant instead of the platform's zone pricing.
// The merchant's "prepare for shipping" queue is replaced with a note in that case, since the
// platform's delivery team was never going to pick these orders up in the first place.
let pendingOwnDeliveryId = null;
let ownDeliveryState = { enabled: false, governorates: [], areaPrices: {} };

function openOwnDeliveryModal(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  pendingOwnDeliveryId = id;
  ownDeliveryState = {
    enabled: !!m.ownDelivery,
    governorates: [...(m.ownDeliveryGovernorates || [])],
    // Deep-copy so editing in the modal doesn't touch live data until "حفظ" is pressed
    areaPrices: JSON.parse(JSON.stringify(m.ownDeliveryAreaPrices || {}))
  };
  document.getElementById('own-delivery-title').textContent = `توصيل خاص — ${m.shop}`;
  document.getElementById('own-delivery-price-input').value = m.ownDeliveryPrice || 0;
  renderOwnDeliveryToggle();
  renderOwnDeliveryGovernorates();
  renderOwnDeliveryAreaPricing();
  document.getElementById('own-delivery-modal').classList.add('show');
}
function renderOwnDeliveryToggle() {
  document.getElementById('own-delivery-toggle-group').innerHTML = `
    <span class="toggle ${ownDeliveryState.enabled ? 'selected' : ''}" onclick="setOwnDeliveryEnabled(true)">توصيل خاص بالمحل</span>
    <span class="toggle ${!ownDeliveryState.enabled ? 'selected' : ''}" onclick="setOwnDeliveryEnabled(false)">توصيل المنصة</span>
  `;
}
function renderOwnDeliveryGovernorates() {
  document.getElementById('own-delivery-governorates-list').innerHTML = IRAQ_GOVERNORATES.map(g => `
    <span class="toggle ${ownDeliveryState.governorates.includes(g) ? 'selected' : ''}" onclick="toggleOwnDeliveryGovernorate('${esc(g)}')">${esc(g)}</span>
  `).join('');
}
function toggleOwnDeliveryGovernorate(g) {
  const i = ownDeliveryState.governorates.indexOf(g);
  if (i === -1) ownDeliveryState.governorates.push(g); else ownDeliveryState.governorates.splice(i, 1);
  renderOwnDeliveryGovernorates();
  renderOwnDeliveryAreaPricing();
}
function setOwnDeliveryEnabled(v) { ownDeliveryState.enabled = v; renderOwnDeliveryToggle(); renderOwnDeliveryAreaPricing(); }
function closeOwnDeliveryModal() {
  pendingOwnDeliveryId = null;
  document.getElementById('own-delivery-modal').classList.remove('show');
}
function confirmOwnDelivery() {
  const m = data.merchants.find(x => x.id === pendingOwnDeliveryId);
  if (!m) return;
  const price = Math.max(0, parseFloat(document.getElementById('own-delivery-price-input').value) || 0);
  m.ownDelivery = ownDeliveryState.enabled;
  m.ownDeliveryPrice = price;
  m.ownDeliveryGovernorates = [...ownDeliveryState.governorates];
  m.ownDeliveryAreaPrices = JSON.parse(JSON.stringify(ownDeliveryState.areaPrices));
  saveData();
  showToast(m.ownDelivery
    ? `تم تفعيل التوصيل الخاص لـ"${m.shop}" بسعر افتراضي ${price.toLocaleString()} د`
    : `تم رجّاع "${m.shop}" لتوصيل المنصة`);
  closeOwnDeliveryModal();
  renderAll();
}

// ---------- CUSTOM DOMAIN (admin assigns an official domain to a merchant's store) ----------
// Simple hostname format check — not a full RFC validator, just enough to catch obvious
// mistakes (spaces, missing dot, a pasted full URL with http:// still attached, etc.) before
// saving something that will never resolve.
function isValidDomainFormat(d) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(d);
}
let pendingCustomDomainId = null;
function openCustomDomainModal(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  pendingCustomDomainId = id;
  document.getElementById('custom-domain-title').textContent = `دومين مخصص — ${m.shop}`;
  document.getElementById('custom-domain-input').value = m.customDomain || '';
  document.getElementById('custom-domain-error').textContent = '';
  document.getElementById('custom-domain-remove-btn').style.display = m.customDomain ? '' : 'none';
  document.getElementById('custom-domain-modal').classList.add('show');
}
function closeCustomDomainModal() {
  pendingCustomDomainId = null;
  document.getElementById('custom-domain-modal').classList.remove('show');
}
function confirmCustomDomain() {
  const m = data.merchants.find(x => x.id === pendingCustomDomainId);
  if (!m) return;
  const errEl = document.getElementById('custom-domain-error');
  let domain = normalizeDomain(document.getElementById('custom-domain-input').value);
  if (!domain) { errEl.textContent = 'اكتب الدومين أولاً'; return; }
  if (!isValidDomainFormat(domain)) { errEl.textContent = 'صيغة الدومين غير صحيحة — اكتبه بدون http:// وبدون مسارات، مثلاً: mystore.com'; return; }
  const conflict = data.merchants.find(x => x.id !== m.id && normalizeDomain(x.customDomain) === domain);
  if (conflict) { errEl.textContent = `هذا الدومين معطى أصلاً لمتجر "${conflict.shop}"`; return; }
  // Purely additive: only sets this one field, nothing else about the merchant (products,
  // orders, slug, balance...) is touched, and their old platform link keeps working too.
  m.customDomain = domain;
  saveData();
  showToast(`تم ربط الدومين بمتجر "${m.shop}" `);
  closeCustomDomainModal();
  renderAll();
}
function removeCustomDomain() {
  const m = data.merchants.find(x => x.id === pendingCustomDomainId);
  if (!m) return;
  m.customDomain = '';
  saveData();
  showToast(`تمت إزالة الدومين المخصص من متجر "${m.shop}" — رابطه الفرعي يشتغل متل قبل`);
  closeCustomDomainModal();
  renderAll();
}

// ---------- GRANULAR PER-MERCHANT RESETS ----------
// The three functions below split resetMerchantAccount() above into independent pieces —
// so the admin can, for example, zero out just a merchant's balance without touching their
// order history, or clear their visit counter without touching money or orders at all.

function resetMerchantMoney(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  openConfirmModal('تصفير أموال التاجر', `متأكد؟ راح يرجع رصيد "${m.shop}" وعدد عمليات البيع إلى صفر، وراح تُحذف طلباته المقبولة (المدفوعة) المرتبطة بهذا الرصيد — عشان "رصيد المبيعات" و"مستحقات التاجر" و"مستحقات المنصة" تختفي فعلياً من الداشبورد بنفس اللحظة، بدون ما تحتاج تروح لـ"تصفير أرصدة التجار" (اللي يصفر كل التجار سوا). طلباته الأخرى (قيد الانتظار/المرفوضة/الملغية) وعدد زياراته ما يتأثرون بهذا الإجراء.`, async () => {
    m.balance = 0;
    m.salesCount = 0;
    // الطلبات المقبولة غير الملغية هي نفسها مصدر "رصيد المبيعات"/"مستحقات التاجر"/"مستحقات
    // المنصة" المحسوبة لحظياً بـ computeMerchantLiveStats() — تصفير الرصيد بس، من غير حذفها،
    // كان يخلي هذي الأرقام تبقى ظاهرة بالداشبورد وكأن التصفير ما اشتغل، وكان الحل المؤقت
    // الرجوع لـ "تصفير أرصدة التجار" (اللي أصلاً ما يحذف الطلبات هو نفسه، بس يوهم إنه اشتغل
    // لأنه يصفر كل التجار). حذفها هنا تحديداً (مو الطلبات الأخرى) يخلي التصفير سلس ومكتمل
    // لهذا التاجر بس، بضغطة وحدة.
    const paidOrders = data.orders.filter(o => o.merchantId === id && o.status === 'accepted' && !o.cancelled);
    data.orders = data.orders.filter(o => !(o.merchantId === id && o.status === 'accepted' && !o.cancelled));
    let balanceSaved = true;
    if (window.authApi && m.authUid) {
      try {
        await window.authApi.saveDoc('merchant_private', m.authUid, { balance: 0, salesCount: 0 });
      } catch (e) {
        balanceSaved = false;
        console.error('Failed to reset merchant balance in database:', e);
      }
    }
    await saveData();
    let failCount = 0;
    if (window.authApi && paidOrders.length > 0) {
      const results = await Promise.allSettled(paidOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('paid order delete failed for', failCount, 'of', paidOrders.length, 'orders', results);
    }
    if (!balanceSaved && failCount > 0) {
      showToast(`تعذر تصفير الرصيد وحذف ${failCount} من ${paidOrders.length} طلب مقبول من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else if (!balanceSaved) {
      showToast('تعذر تصفير الرصيد بقاعدة البيانات (صلاحيات؟) — راح يرجع الرصيد القديم يظهر عند أول تحديث');
    } else if (failCount > 0) {
      showToast(`تصفّر الرصيد، لكن تعذر حذف ${failCount} من ${paidOrders.length} طلب مقبول من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else {
      showToast('تم تصفير أموال التاجر بالكامل');
    }
    logAudit('تصفير أموال تاجر', `${m.shop} — ${paidOrders.length} طلب مقبول محذوف`);
    renderAll();
  });
}

function resetMerchantOrders(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  openConfirmModal('تصفير طلبات التاجر', `متأكد؟ راح تنمسح كل طلبات "${m.shop}" نهائياً وتختفي من الداشبورد وسجل حساباته. رصيده الحالي وعدد الزيارات ما يتأثرون بهذا الإجراء.`, async () => {
    const removedOrders = data.orders.filter(o => o.merchantId === id);
    data.orders = data.orders.filter(o => o.merchantId !== id);
    await saveData();
    let failCount = 0;
    if (window.authApi && removedOrders.length > 0) {
      const results = await Promise.allSettled(removedOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('order delete failed for', failCount, 'of', removedOrders.length, 'orders', results);
    }
    showToast(failCount > 0
      ? `تصفّرت الطلبات محلياً، لكن تعذر حذف ${failCount} من ${removedOrders.length} من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`
      : 'تم تصفير طلبات التاجر');
    logAudit('تصفير طلبات تاجر', `${m.shop} — ${removedOrders.length} طلب`);
    renderAll();
  });
}

function resetMerchantVisits(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  openConfirmModal('تصفير زيارات المتجر', `متأكد راح يرجع عدد زيارات "${m.shop}" إلى صفر؟ الرصيد والطلبات ما يتأثرون بهذا الإجراء.`, () => {
    m.visits = 0;
    saveData();
    showToast('تم تصفير زيارات المتجر');
    logAudit('تصفير زيارات تاجر', m.shop);
    renderAll();
  });
}

function resetMerchantAccount(id) {
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  openConfirmModal('تصفير حساب التاجر', `متأكد؟ راح تنمسح كل معاملات "${m.shop}" المالية وطلباته نهائياً وتختفي من الداشبورد، وراح يرجع عدد الطلبات وعدد الزيارات إلى صفر. بيانات الحساب والمنتجات تبقى محفوظة.`, async () => {
    m.balance = 0;
    m.salesCount = 0;
    // عدد الطلبات نفسه يرجع صفر تلقائياً بعد حذف طلبات هذا التاجر تحت (لأنه محسوب لحظياً من
    // data.orders)، لكن الزيارات (m.visits) رقم مستقل ما يتأثر بحذف الطلبات — لازم تصفيره هنا
    // يدوياً حتى يختفي من داشبورد الأدمن ومن لوحة التاجر نفسه ("زيارات متجرك").
    m.visits = 0;
    const removedOrders = data.orders.filter(o => o.merchantId === id);
    data.orders = data.orders.filter(o => o.merchantId !== id);

    // The balance/salesCount reset above only lives in local memory until this write actually
    // lands — saveData() below re-saves it too, but through a fire-and-forget .catch(() => {})
    // that swallows any failure silently. That made the toast below claim "تم التصفير" even when
    // the real database write was denied (e.g. a stale admin session) — so the old balance would
    // just come right back on the next 5-second live-refresh. Awaiting it here directly, once,
    // for this specific merchant, lets a real failure be reported instead of hidden.
    let balanceSaved = true;
    if (window.authApi && m.authUid) {
      try {
        await window.authApi.saveDoc('merchant_private', m.authUid, { balance: 0, salesCount: 0 });
      } catch (e) {
        balanceSaved = false;
        console.error('Failed to reset merchant balance in database:', e);
      }
    }

    await saveData();
    // saveData() only re-uploads orders that are still in data.orders — it never deletes
    // remote docs for orders removed from the array. Without this, the "deleted" orders
    // stay in Firestore and come right back on the next page load / other device.
    // We wait for and check every delete instead of firing-and-forgetting, so a Firestore
    // rules rejection surfaces as a visible warning instead of silently doing nothing.
    let failCount = 0;
    if (window.authApi && removedOrders.length > 0) {
      const results = await Promise.allSettled(removedOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('order delete failed for', failCount, 'of', removedOrders.length, 'orders', results);
    }
    if (!balanceSaved && failCount > 0) {
      showToast(`تعذر تصفير الرصيد وحذف ${failCount} من ${removedOrders.length} طلب من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else if (!balanceSaved) {
      showToast('تعذر تصفير الرصيد بقاعدة البيانات (صلاحيات؟) — راح يرجع الرصيد القديم يظهر عند أول تحديث');
    } else if (failCount > 0) {
      showToast(`تصفّر الرصيد، لكن تعذر حذف ${failCount} من ${removedOrders.length} طلب من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else {
      showToast('تم تصفير حساب التاجر بالكامل');
    }
    logAudit('تصفير حساب تاجر مالياً', m.shop);
    renderAll();
  });
}
function deleteMerchant(id) {
  openConfirmModal('حذف نهائي', 'متأكد من الحذف النهائي؟ سيتم حذف كل بيانات هذا التاجر ولا يمكن التراجع.', () => {
    const m = data.merchants.find(x => x.id === id);
    if (window.authApi && m) {
      if (m.authUid) {
        window.authApi.deleteDoc('merchants', m.authUid).catch(() => {});
        window.authApi.deleteDoc('merchant_private', m.authUid).catch(() => {});
      } else {
        window.authApi.deleteDoc('join_requests', String(id)).catch(() => {});
      }
    }
    const shopName = m ? m.shop : `#${id}`;
    data.merchants = data.merchants.filter(x => x.id !== id);
    saveData();
    logAudit('حذف تاجر نهائياً', shopName);
    showToast('تم الحذف النهائي');
    renderAll();
  });
}
// ---------- GLOBAL ADMIN SEARCH (dashboard overview) ----------
// One search box across merchants, orders (by customer phone or order id), and employees —
// instead of hunting through separate tabs. Purely client-side over data already in memory,
// so it's instant; clicking a result jumps straight to that merchant's accounting page.
function adminGlobalSearch(query) {
  const box = document.getElementById('admin-search-results');
  if (!box) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';

  const merchantHits = data.merchants.filter(m =>
    (m.shop || '').toLowerCase().includes(q) ||
    (m.name || '').toLowerCase().includes(q) ||
    (m.phone || '').includes(q) ||
    (m.username || '').toLowerCase().includes(q)
  ).slice(0, 6);

  const qDigits = q.replace(/\D/g, '');
  const orderHits = qDigits.length >= 4 ? data.orders.filter(o =>
    (o.customerPhone || '').includes(qDigits) || String(o.orderGroupId || o.id).includes(qDigits)
  ).slice(0, 6) : [];

  const employeeHits = data.employees.filter(e =>
    (e.name || '').toLowerCase().includes(q) || (e.username || '').toLowerCase().includes(q)
  ).slice(0, 6);

  if (merchantHits.length === 0 && orderHits.length === 0 && employeeHits.length === 0) {
    box.innerHTML = '<div class="empty" style="padding:10px;">ما فيه نتائج مطابقة</div>';
    return;
  }

  let html = '';
  if (merchantHits.length) {
    html += `<div class="search-result-group-title">محلات</div>`;
    html += merchantHits.map(m => `
      <div class="search-result-row" onclick="jumpToMerchantAccounting(${m.id})">
        <span>${esc(m.shop)} <span class="badge ${m.status==='active'?'active':'disabled'}">${m.status==='active'?'نشط':'معطل'}</span></span>
        <span style="color:var(--text-mute);">${esc(m.phone || '')}</span>
      </div>`).join('');
  }
  if (orderHits.length) {
    html += `<div class="search-result-group-title">طلبات</div>`;
    html += orderHits.map(o => {
      const m = data.merchants.find(x => x.id === o.merchantId);
      return `
      <div class="search-result-row" onclick="jumpToMerchantAccounting(${o.merchantId})">
        <span>${esc(o.customerName || 'زبون')} — ${esc(o.customerPhone || '')}</span>
        <span style="color:var(--text-mute);">${m ? esc(m.shop) : 'محل محذوف'}</span>
      </div>`;
    }).join('');
  }
  if (employeeHits.length) {
    html += `<div class="search-result-group-title">موظفين</div>`;
    html += employeeHits.map(e => `
      <div class="search-result-row" onclick="showView('employees')">
        <span>${esc(e.name || e.username || '—')}</span>
        <span style="color:var(--text-mute);">${e.ownerType === 'admin' ? 'موظف أدمن' : 'موظف تاجر'}</span>
      </div>`).join('');
  }
  box.innerHTML = html;
}
function jumpToMerchantAccounting(merchantId) {
  const input = document.getElementById('admin-search-input');
  const box = document.getElementById('admin-search-results');
  if (input) input.value = '';
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  showView('accounting'); // showView() already calls renderAll(), rebuilding #acc-merchant's options
  const sel = document.getElementById('acc-merchant');
  if (sel) { sel.value = String(merchantId); renderAccounting(); }
}

// ---------- MERCHANT RANKING (dashboard "المحلات" tab) ----------
// Simple leaderboard by accepted, non-cancelled sales — reuses computeMerchantLiveStats,
// the exact same numbers already shown per-merchant elsewhere on the dashboard.
function renderMerchantRanking() {
  const el = document.getElementById('merchant-ranking-list');
  if (!el) return;
  const active = activeMerchants().filter(m => m.status === 'active');
  if (active.length === 0) { el.innerHTML = '<div class="empty">ما فيه محلات نشطة بعد</div>'; return; }
  const ranked = active
    .map(m => ({ m, s: computeMerchantLiveStats(m.id) }))
    .sort((a, b) => b.s.sales - a.s.sales)
    .slice(0, 10);
  el.innerHTML = ranked.map((r, i) => `
    <div class="list-item">
      <span><b>#${i + 1}</b> ${esc(r.m.shop)}</span>
      <span>${r.s.sales.toLocaleString()} د — ${r.s.ordersCount} طلب</span>
    </div>`).join('');
}

// ---------- "NEEDS REVIEW" FLAG (unusually high cancellation rate) ----------
// A lightweight, purely computed warning — no separate flag stored anywhere — so it can
// never go stale: it's recalculated fresh from data.orders every time the dashboard renders.
// Needs a minimum order count first so a brand-new store with 1 cancelled order out of 2
// doesn't get flagged off a meaninglessly small sample.
const NEEDS_REVIEW_MIN_ORDERS = 8;
const NEEDS_REVIEW_CANCEL_RATE = 0.3; // 30%+ of a merchant's orders ending up cancelled
function merchantNeedsReview(merchantId) {
  const orders = data.orders.filter(o => o.merchantId === merchantId);
  if (orders.length < NEEDS_REVIEW_MIN_ORDERS) return null;
  const cancelled = orders.filter(o => o.cancelled).length;
  const rate = cancelled / orders.length;
  if (rate < NEEDS_REVIEW_CANCEL_RATE) return null;
  return { rate, cancelled, total: orders.length };
}
function needsReviewBadgeHtml(merchantId) {
  const flag = merchantNeedsReview(merchantId);
  if (!flag) return '';
  return ` <span class="badge warn-review" title="${Math.round(flag.rate * 100)}% من طلباته ملغاة (${flag.cancelled} من ${flag.total})">يحتاج مراجعة</span>`;
}

// ---------- PERIODIC REPORT (ready-made weekly/monthly Excel export) ----------
// Reuses the exact same exportAccountingExcel() logic the manual "تصدير الكل — Excel" button
// uses — just quietly sets the accounting filters to the last 7/30 days first, exports, then
// restores whatever filters the admin had before, so this never disturbs their accounting view.
function generatePeriodicReport(period) {
  const fromEl = document.getElementById('acc-from');
  const toEl = document.getElementById('acc-to');
  const merchantEl = document.getElementById('acc-merchant');
  const statusEl = document.getElementById('acc-status');
  if (!fromEl || !toEl || !merchantEl || !statusEl) return;
  const prev = { from: fromEl.value, to: toEl.value, merchant: merchantEl.value, status: statusEl.value };

  const to = new Date();
  const from = new Date(to.getTime() - (period === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000);
  fromEl.value = from.toISOString().slice(0, 10);
  toEl.value = to.toISOString().slice(0, 10);
  merchantEl.value = 'all';
  statusEl.value = 'all';

  exportAccountingExcel();

  fromEl.value = prev.from; toEl.value = prev.to; merchantEl.value = prev.merchant; statusEl.value = prev.status;
  renderAll();
}

// ---------- FULL PLATFORM BACKUP / RESTORE ----------
// A point-in-time JSON snapshot of everything currently in `data` — for disaster recovery,
// not routine use. Restoring rewrites every matching merchant/order/employee document back
// to its value in the file; it does NOT delete anything created after the backup was taken
// (this app stores each merchant/order as its own Firestore doc, not one big blob, so a
// wholesale "delete everything not in the file" would risk wiping unrelated live records —
// see the confirmation text below, which is explicit about this limit).
function exportPlatformBackupJSON() {
  const snapshot = {
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    merchants: data.merchants,
    orders: data.orders,
    employees: data.employees,
    announcements: data.announcements,
    ledgerClosures: data.ledgerClosures,
    auditLog: data.auditLog,
    supportChats: data.supportChats,
    settings: data.settings,
    nextId: data.nextId
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `tajerly-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  logAudit('تصدير نسخة احتياطية كاملة', `${data.merchants.length} تاجر — ${data.orders.length} طلب`);
  showToast('تم تحميل النسخة الاحتياطية');
}
function triggerRestoreBackup() {
  document.getElementById('backup-restore-file-input').click();
}
function handleRestoreBackupFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let snapshot;
    try { snapshot = JSON.parse(e.target.result); }
    catch (err) { showToast('الملف مو JSON صالح'); input.value = ''; return; }
    if (!snapshot || !Array.isArray(snapshot.merchants) || !Array.isArray(snapshot.orders)) {
      showToast('هذا الملف مو نسخة احتياطية صالحة من تاجرلي');
      input.value = ''; return;
    }
    const dateLabel = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString('ar-IQ') : 'غير معروف';
    openConfirmModal(
      'استرجاع نسخة احتياطية؟',
      `راح يعيد كتابة بيانات كل تاجر وطلب موجود بهذي النسخة (بتاريخ ${dateLabel} — ${(snapshot.merchants||[]).length} تاجر، ${(snapshot.orders||[]).length} طلب) فوق البيانات الحالية بنفس الأرقام التعريفية. أي تاجر أو طلب انسوى بعد تاريخ هذي النسخة يضل موجود ولازم تحذفه يدوياً إذا ما تريده — هذا ما يمسح شي تلقائياً. تأكد قبل ما توافق.`,
      () => confirmRestoreBackup(snapshot)
    );
    input.value = '';
  };
  reader.onerror = () => showToast('تعذر قراءة الملف');
  reader.readAsText(file);
}
async function confirmRestoreBackup(snapshot) {
  showToast('جاري استرجاع النسخة الاحتياطية...');
  data.merchants = snapshot.merchants || [];
  data.orders = snapshot.orders || [];
  data.employees = snapshot.employees || [];
  data.announcements = snapshot.announcements || [];
  data.ledgerClosures = snapshot.ledgerClosures || [];
  data.auditLog = snapshot.auditLog || [];
  data.supportChats = snapshot.supportChats || [];
  if (snapshot.settings) {
    // adminUsername/adminPassword deliberately excluded — those live in their own protected
    // 'admin-credentials' doc (see saveAdminCredentials); restoring them here could lock the
    // admin out of their own account with an old, forgotten password.
    const { adminUsername: _au, adminPassword: _ap, ...restoredSettings } = snapshot.settings;
    data.settings = { ...data.settings, ...restoredSettings };
  }
  if (snapshot.nextId) data.nextId = Math.max(data.nextId, snapshot.nextId);

  // Force every doc to be re-written to Firestore on this save, not just whatever changed
  // in-memory this session — saveData() normally only pushes diffs against these snapshots.
  lastSyncedMerchantSnapshots.clear();
  lastSyncedOrderSnapshots.clear();

  const ok = await saveData();
  await logAudit('استرجاع نسخة احتياطية كاملة', `${data.merchants.length} تاجر — ${data.orders.length} طلب`);
  showToast(ok ? 'تم استرجاع النسخة الاحتياطية' : 'صار خطأ أثناء الاسترجاع — تأكد من الاتصال بالإنترنت');
  renderAll();
}

function renderMerchantActions() {
  const list = document.getElementById('merchant-actions-list');
  const active = activeMerchants();
  if (active.length === 0) { list.innerHTML = '<div class="empty">ما فيه تجار مسجلين</div>'; return; }
  list.innerHTML = active.map(m => {
    const key = 'merchant-' + m.id;
    const revealed = revealedUsernames.has(key);
    const usernameDisplay = m.username ? (revealed ? m.username : '•'.repeat(Math.max(6, m.username.length))) : '—';
    return `
    <div class="list-item" style="align-items:flex-start;">
      <span>${m.shop} <span class="badge ${m.status==='active'?'active':'disabled'}">${m.status==='active'?'نشط':'معطل'}</span>${!m.ownDelivery ? ` <span class="badge" style="background:#E0F2FE; color:#0369A1;">توصيل: ${deliverySpeedLabel(m)}</span>` : ''}${m.ownDelivery ? ` <span class="badge" style="background:#FEF3C7; color:#92400E;">توصيل خاص — ${(m.ownDeliveryPrice||0).toLocaleString()} د</span>` : ''}${m.customDomain ? ` <span class="badge active">${esc(m.customDomain)}</span>` : ''}<br>
      <span style="color:var(--text-mute); font-size:11px;">
        يوزر: ${usernameDisplay}
        ${m.username ? `<span class="link-chip" style="padding:2px 6px; font-size:10px;" onclick="toggleUsernameReveal('${key}')">${revealed ? 'إخفاء' : 'إظهار'}</span>` : ''}
        — باسورد: مخفية
      </span></span>
      <span>
        <button class="btn secondary small" onclick="editMerchantFees(${m.id})">تعديل الرسوم والتوصيل</button>
        <button class="btn secondary small" onclick="exportMerchantAccountingExcel(${m.id})">تصدير حسابات</button>
        <button class="btn secondary small" onclick="openResetPasswordModal('merchant', ${m.id})">تصفير الباسورد</button>
        <button class="btn ${m.ownDelivery ? 'secondary' : 'warn'} small" onclick="openOwnDeliveryModal(${m.id})">${m.ownDelivery ? 'تعديل التوصيل الخاص' : 'توصيل خاص بالمحل'}</button>
        <button class="btn ${m.customDomain ? 'secondary' : 'warn'} small" onclick="openCustomDomainModal(${m.id})">${m.customDomain ? 'تعديل الدومين' : 'إضافة دومين مخصص'}</button>
        <button class="btn warn small" onclick="toggleMerchantStatus(${m.id})">${m.status==='active'?'تعطيل':'تفعيل'}</button>
        <button class="btn danger small" onclick="resetMerchantMoney(${m.id})">تصفير الأموال</button>
        <button class="btn danger small" onclick="resetMerchantOrders(${m.id})">تصفير الطلبات</button>
        <button class="btn danger small" onclick="resetMerchantVisits(${m.id})">تصفير الزيارات</button>
        <button class="btn danger small" onclick="resetMerchantAccount(${m.id})">تصفير الحساب بالكامل</button>
        <button class="btn danger small" onclick="deleteMerchant(${m.id})">حذف نهائي</button>
      </span>
    </div>`;
  }).join('');
}

