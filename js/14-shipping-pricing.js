// ---------- PRICING SETTINGS ----------
function renderSettings() {
  const s = data.settings;
  document.getElementById('fee-source-toggles').innerHTML = `
    <span class="toggle ${s.feeSource==='customer'?'selected':''}" onclick="setFeeSource('customer')">من الزبون</span>
    <span class="toggle ${s.feeSource==='merchant'?'selected':''}" onclick="setFeeSource('merchant')">من التاجر</span>
    <span class="toggle ${s.feeSource==='both'?'selected':''}" onclick="setFeeSource('both')">من الاثنين</span>
  `;
  const isPercent = s.feeType === 'percent';
  document.getElementById('fee-type-toggles').innerHTML = `
    <span class="toggle ${!isPercent?'selected':''}" onclick="setFeeType('fixed')">مبلغ ثابت (دينار)</span>
    <span class="toggle ${isPercent?'selected':''}" onclick="setFeeType('percent')">نسبة مئوية (%) من سعر القطعة</span>
  `;
  document.getElementById('fee-amount-label').textContent = isPercent ? 'نسبة الرسم (%)' : 'مبلغ الرسم (دينار)';
  document.getElementById('fee-customer-label').textContent = isPercent ? 'من الزبون (%)' : 'من الزبون (د)';
  document.getElementById('fee-merchant-label').textContent = isPercent ? 'من التاجر (%)' : 'من التاجر (د)';
  document.getElementById('fee-amount').value = s.feeAmount;
  document.getElementById('fee-customer').value = s.feeCustomer;
  document.getElementById('fee-merchant').value = s.feeMerchant;
  document.getElementById('both-fields').style.display = s.feeSource === 'both' ? 'block' : 'none';
  document.getElementById('fee-amount').style.display = s.feeSource === 'both' ? 'none' : 'block';

  document.getElementById('shipping-toggle-group').innerHTML = `
    <span class="toggle ${s.shippingEnabled?'selected':''}" onclick="toggleShipping(true)">مفعّل</span>
    <span class="toggle ${!s.shippingEnabled?'selected':''}" onclick="toggleShipping(false)">معطّل</span>
  `;
  document.getElementById('shipping-amount').value = s.shippingAmount;
  document.getElementById('item-deduction').value = s.itemDeduction || 0;

  renderZonesList();
  renderAdminAreaGovernorateSelect();

  const previewPrice = 20000; // sample item price, just to show the admin what the fee looks like
  const fee = calcFee(null, previewPrice);
  const shipping = s.shippingEnabled ? s.shippingAmount : 0;
  document.getElementById('preview-note').textContent = isPercent
    ? `المعاينة محسوبة على قطعة سعرها ${previewPrice.toLocaleString()} د كمثال — الرسم يتغير تلقائياً حسب سعر كل قطعة فعلياً`
    : 'المعاينة أدناه ثابتة لأي قطعة، بغض النظر عن سعرها';
  document.getElementById('preview-grid').innerHTML = `
    <div class="stat"><div class="stat-num">${fee.customer.toLocaleString()}</div><div class="stat-label">من الزبون</div></div>
    <div class="stat"><div class="stat-num">${fee.merchant.toLocaleString()}</div><div class="stat-label">من التاجر</div></div>
    <div class="stat"><div class="stat-num">${(s.itemDeduction || 0).toLocaleString()}</div><div class="stat-label">استقطاع القطعة</div></div>
    <div class="stat"><div class="stat-num">${(fee.customer + fee.merchant + (s.itemDeduction || 0) + shipping).toLocaleString()}</div><div class="stat-label">إجمالي ربحك</div></div>
  `;
}
function setFeeSource(src) { data.settings.feeSource = src; saveData(); renderSettings(); }
function setFeeType(type) { data.settings.feeType = type; saveData(); renderSettings(); }
function setShippingAmount(v) { data.settings.shippingAmount = v; saveData(); renderSettings(); }
function toggleShipping(v) { data.settings.shippingEnabled = v; saveData(); renderSettings(); }
function saveSettings() {
  const clamp = (v) => data.settings.feeType === 'percent' ? Math.min(100, Math.max(0, v)) : v;
  data.settings.feeAmount = clamp(parseFloat(document.getElementById('fee-amount').value) || 0);
  data.settings.feeCustomer = clamp(parseFloat(document.getElementById('fee-customer').value) || 0);
  data.settings.feeMerchant = clamp(parseFloat(document.getElementById('fee-merchant').value) || 0);
  data.settings.itemDeduction = Math.max(0, parseFloat(document.getElementById('item-deduction').value) || 0);
  data.settings.shippingAmount = parseFloat(document.getElementById('shipping-amount').value) || 0;
  saveData();
  renderSettings();
}

// ---------- SHIPPING ZONES (customer-facing fast/slow delivery pricing) ----------
function zoneOffersSpeed(zone, speed) {
  if (!zone) return true;
  return speed === 'fast' ? zone.fastEnabled !== false : zone.slowEnabled !== false;
}
function renderZonesList() {
  const list = document.getElementById('zones-list');
  const datalist = document.getElementById('gov-list');
  if (datalist) datalist.innerHTML = IRAQ_GOVERNORATES.map(g => `<option value="${g}">`).join('');
  const zones = data.settings.shippingZones || [];
  if (zones.length === 0) { list.innerHTML = '<div class="empty">ما فيه مناطق محددة بعد</div>'; return; }
  list.innerHTML = zones.map(z => `
    <div class="list-item">
      <span>${z.name} — سريع: ${zoneOffersSpeed(z,'fast') ? z.fastPrice.toLocaleString() + ' د' : 'غير متوفر'} / بطيء: ${zoneOffersSpeed(z,'slow') ? z.slowPrice.toLocaleString() + ' د' : 'غير متوفر'}</span>
      <span>
        <button class="btn secondary small" onclick="editShippingZone('${z.id}')">تعديل</button>
        <button class="btn danger small" onclick="deleteShippingZone('${z.id}')">حذف</button>
      </span>
    </div>
  `).join('');
}

// ---------- ADMIN-ONLY AREA MANAGEMENT (registerCustomArea is defined near AREAS_BY_GOVERNORATE) ----------
// The admin prices these areas per-merchant (see renderOwnDeliveryAreaPricing) and is also the
// only one who can add a brand-new area name to a governorate — keeps the shared list clean
// instead of every merchant typing their own inconsistent spelling of the same neighborhood.
function renderAdminAreaGovernorateSelect() {
  const sel = document.getElementById('admin-area-governorate');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = IRAQ_GOVERNORATES.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  if (current && IRAQ_GOVERNORATES.includes(current)) sel.value = current;
  renderAdminAreasList();
}
function renderAdminAreasList() {
  const sel = document.getElementById('admin-area-governorate');
  const list = document.getElementById('admin-areas-list');
  if (!sel || !list) return;
  const governorate = sel.value;
  const builtIn = AREAS_BY_GOVERNORATE[governorate] || [];
  const custom = (data.settings.customAreas && data.settings.customAreas[governorate]) || [];
  list.innerHTML = `
    ${builtIn.length ? `<div class="subtitle" style="margin-bottom:6px;">مناطق أساسية (${builtIn.length}): ${builtIn.map(esc).join('، ')}</div>` : ''}
    ${custom.length ? custom.map(a => `
      <div class="list-item">
        <span>${esc(a)}</span>
        <button class="btn danger small" onclick="deleteAdminArea('${esc(governorate)}', '${esc(a)}')">حذف</button>
      </div>`).join('') : '<div class="empty">ما فيه مناطق مضافة يدوياً بعد لهذي المحافظة</div>'}
  `;
}
function addAdminArea() {
  const governorate = document.getElementById('admin-area-governorate').value;
  const input = document.getElementById('admin-new-area-name');
  const name = input.value.trim();
  if (!governorate || !name) return;
  const added = registerCustomArea(governorate, name);
  if (!added) { showToast('هذي المنطقة مسجلة أصلاً بهذي المحافظة'); return; }
  saveData();
  input.value = '';
  renderAdminAreasList();
  showToast(`تمت إضافة منطقة "${name}" لمحافظة ${governorate}`);
}
function deleteAdminArea(governorate, areaName) {
  openConfirmModal('حذف منطقة', `متأكد تحذف منطقة "${areaName}"؟ أي سعر خاص محدد لها بتوصيل تجار حاليين يبقى محفوظ بس ما تظهر بعدها بقوائم الاختيار.`, () => {
    if (data.settings.customAreas && Array.isArray(data.settings.customAreas[governorate])) {
      data.settings.customAreas[governorate] = data.settings.customAreas[governorate].filter(a => a !== areaName);
      saveData();
      renderAdminAreasList();
      showToast('تم حذف المنطقة');
    }
  });
}

function addShippingZone() {
  const nameInput = document.getElementById('zone-name');
  const fastInput = document.getElementById('zone-fast');
  const slowInput = document.getElementById('zone-slow');
  const fastEnabledInput = document.getElementById('zone-fast-enabled');
  const slowEnabledInput = document.getElementById('zone-slow-enabled');
  const name = nameInput.value.trim();
  const fastPrice = parseFloat(fastInput.value) || 0;
  const slowPrice = parseFloat(slowInput.value) || 0;
  const fastEnabled = fastEnabledInput.checked;
  const slowEnabled = slowEnabledInput.checked;
  if (!name) { showToast('اكتب اسم المحافظة أو المنطقة'); return; }
  if (!fastEnabled && !slowEnabled) { showToast('لازم يتوفر نوع شحن واحد على الأقل (سريع أو بطيء)'); return; }
  const existing = data.settings.shippingZones.find(z => z.name === name);
  if (existing) {
    existing.fastPrice = fastPrice;
    existing.slowPrice = slowPrice;
    existing.fastEnabled = fastEnabled;
    existing.slowEnabled = slowEnabled;
    showToast('تم تحديث المنطقة');
  } else {
    data.settings.shippingZones.push({ id: 'z' + genId(), name, fastPrice, slowPrice, fastEnabled, slowEnabled });
    showToast('تمت إضافة المنطقة');
  }
  saveData();
  nameInput.value = ''; fastInput.value = ''; slowInput.value = '';
  fastEnabledInput.checked = true; slowEnabledInput.checked = true;
  renderZonesList();
}
function editShippingZone(id) {
  const z = data.settings.shippingZones.find(x => x.id === id);
  if (!z) return;
  document.getElementById('zone-name').value = z.name;
  document.getElementById('zone-fast').value = z.fastPrice;
  document.getElementById('zone-slow').value = z.slowPrice;
  document.getElementById('zone-fast-enabled').checked = z.fastEnabled !== false;
  document.getElementById('zone-slow-enabled').checked = z.slowEnabled !== false;
}
function deleteShippingZone(id) {
  data.settings.shippingZones = data.settings.shippingZones.filter(x => x.id !== id);
  saveData();
  showToast('تم حذف المنطقة');
  renderZonesList();
}

