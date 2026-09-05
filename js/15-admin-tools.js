// ---------- ADMIN ACTIONS ----------
// Simple contact/profile directory for every registered store — not financial data, just
// who they are: store name, owner name, phone, and store description. Uses the same
// print-to-PDF technique as exportMerchantAccountingPDF (see there for why: client-side PDF
// libraries don't shape Arabic text correctly, the browser's own print engine does).
function exportMerchantsDirectoryPDF() {
  const list = activeMerchants();
  if (list.length === 0) { showToast('ما فيه محلات مسجلة بعد'); return; }

  const rowsHtml = list.map(m => `<tr>
      <td>${esc(m.shop)}</td>
      <td>${esc(m.name) || '—'}</td>
      <td>${esc(m.phone) || '—'}</td>
      <td style="text-align:right;">${esc(m.description) || '—'}</td>
      <td>${m.status === 'active' ? 'نشط' : 'معطل'}</td>
    </tr>`).join('');

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
      <div class="sub">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')} — عدد المحلات: ${list.length}</div>
      <div class="table-scroll">
      <table>
        <thead><tr><th>اسم المحل</th><th>اسم صاحب المحل</th><th>رقم الهاتف</th><th>وصف المتجر</th><th>الحالة</th></tr></thead>
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
        <button class="btn danger small" onclick="resetMerchantAccount(${m.id})">تصفير الحساب</button>
        <button class="btn danger small" onclick="deleteMerchant(${m.id})">حذف نهائي</button>
      </span>
    </div>`;
  }).join('');
}

