// ---------- MERCHANT REQUESTS ----------
async function submitRequest() {
  const name = document.getElementById('req-name').value.trim();
  const shop = document.getElementById('req-shop').value.trim();
  const phone = document.getElementById('req-phone').value.trim();
  const governorate = document.getElementById('req-governorate').value;
  const area = document.getElementById('req-area').value.trim();
  const description = document.getElementById('req-description').value.trim();
  const expectedDailyOrdersRaw = document.getElementById('req-daily-orders').value.trim();
  if (!name || !shop || !phone) { showToast('عبي كل الحقول'); return; }
  if (!expectedDailyOrdersRaw) { showToast('لازم تكتب عدد الطلبات المتوقعة باليوم'); return; }

  const submitBtn = document.querySelector('#join-screen .btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جاري الإرسال...'; }

  const s = data.settings;
  const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  data.merchants.push({
    id: newId,
    name, shop, phone, governorate, area,
    description,
    expectedDailyOrders: Number(expectedDailyOrdersRaw),
    status: 'pending',
    username: '', password: '',
    products: [],
    theme: { primaryColor: '#C77B4A', logo: null, banner: null },
    dashboardColor: '#10B981', visits: 0,
    balance: 0, salesCount: 0,
    linkSlug: shop.trim().replace(/\s+/g, '-') + '-' + newId, // unique even if two shops share a name
    feeSource: s.feeSource,
    feeType: s.feeType || 'fixed',
    feeAmount: s.feeAmount,
    feeCustomer: s.feeCustomer,
    feeMerchant: s.feeMerchant,
    itemDeduction: s.itemDeduction || 0,
    shippingAmount: s.shippingAmount
  });

  // IMPORTANT: the join-request document itself is written directly here (not through the
  // generic saveData() sweep), so we get an honest yes/no about whether it actually reached
  // the database before telling the person it worked — a silent background failure there
  // used to show "success" to the customer while the admin never saw the request at all.
  let ok = false;
  if (window.authApi) {
    try {
      await window.authApi.saveDoc('join_requests', String(newId), data.merchants.find(m => m.id === newId));
      ok = true;
    } catch (e) {
      console.error('Join request save failed:', e);
      ok = false;
    }
    // NOTE: we don't try to bump 'platform-settings' version here to wake up the admin's
    // live-refresh poller — this person is anonymous (no account yet) and firestore.rules
    // makes that doc admin-write-only, so the attempt would just fail silently every time.
    // See pollForUpdates(): it no longer depends on that version field for this reason.
  } else {
    ok = await saveData();
  }
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'إرسال الطلب'; }

  if (!ok) {
    // Roll back the local addition so the in-memory data doesn't drift from what's actually saved.
    data.merchants = data.merchants.filter(m => m.id !== newId);
    showToast('صار خطأ ولم يتم إرسال الطلب — تأكد من الاتصال بالإنترنت وحاول مرة ثانية');
    return;
  }

  document.getElementById('req-name').value = '';
  document.getElementById('req-shop').value = '';
  document.getElementById('req-phone').value = '';
  document.getElementById('req-description').value = '';
  document.getElementById('req-daily-orders').value = '';
  document.getElementById('req-governorate').selectedIndex = 0;
  populateAreaSelect('req-area', document.getElementById('req-governorate').value);
  showToast('تم إرسال طلبك بنجاح راح تراجعه الإدارة وترسلك بيانات دخولك');
  showLoginScreen();
}

let pendingApproveId = null;
let approveModalMode = 'approve'; // 'approve' (new merchant, needs username/password) | 'editFees' (existing merchant, fees only)
let approveFeeState = { feeSource: 'customer', feeType: 'fixed', feeAmount: 0, feeCustomer: 0, feeMerchant: 0, itemDeduction: 0, feeExemptMaxPrice: 0 };

// Opens the modal in "approve" mode: admin sets username/password AND the fee settings for this merchant in one step
function approveMerchant(id) {
  pendingApproveId = id;
  approveModalMode = 'approve';
  const m = data.merchants.find(x => x.id === id);
  document.getElementById('approve-username').value = '';
  document.getElementById('approve-password').value = '';
  document.getElementById('approve-credentials-fields').style.display = 'block';
  document.getElementById('approve-modal-title').textContent = 'قبول التاجر — بيانات الدخول ورسوم المنصة';
  approveFeeState = {
    feeSource: (m && m.feeSource) || data.settings.feeSource,
    feeType: (m && m.feeType) || data.settings.feeType || 'fixed',
    feeAmount: (m && m.feeAmount != null) ? m.feeAmount : (data.settings.feeAmount || 0),
    feeCustomer: (m && m.feeCustomer != null) ? m.feeCustomer : (data.settings.feeCustomer || 0),
    feeMerchant: (m && m.feeMerchant != null) ? m.feeMerchant : (data.settings.feeMerchant || 0),
    itemDeduction: (m && m.itemDeduction != null) ? m.itemDeduction : (data.settings.itemDeduction || 0),
    feeExemptMaxPrice: (m && m.feeExemptMaxPrice) || 0
  };
  renderApproveFeeFields();
  document.getElementById('approve-modal').classList.add('show');
}

// Opens the modal in "editFees" mode: an already-active merchant's login stays the same,
// admin only adjusts the platform fee settings for that merchant.
function editMerchantFees(id) {
  pendingApproveId = id;
  approveModalMode = 'editFees';
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  document.getElementById('approve-credentials-fields').style.display = 'none';
  document.getElementById('approve-modal-title').textContent = `تعديل رسوم المنصة — ${m.shop}`;
  approveFeeState = {
    feeSource: m.feeSource || data.settings.feeSource,
    feeType: m.feeType || data.settings.feeType || 'fixed',
    feeAmount: m.feeAmount || 0,
    feeCustomer: m.feeCustomer || 0,
    feeMerchant: m.feeMerchant || 0,
    itemDeduction: m.itemDeduction || 0,
    feeExemptMaxPrice: m.feeExemptMaxPrice || 0
  };
  renderApproveFeeFields();
  document.getElementById('approve-modal').classList.add('show');
}

function closeApproveModal() {
  pendingApproveId = null;
  document.getElementById('approve-credentials-fields').style.display = 'block';
  document.getElementById('approve-modal').classList.remove('show');
}

function setApproveFeeSource(src) { approveFeeState.feeSource = src; renderApproveFeeFields(); }
function setApproveFeeType(type) { approveFeeState.feeType = type; renderApproveFeeFields(); }
function setApproveFeeAmount(field, value) {
  let v = parseFloat(value) || 0;
  if (approveFeeState.feeType === 'percent') v = Math.min(100, Math.max(0, v));
  approveFeeState[field] = v;
}
function setApproveItemDeduction(value) {
  approveFeeState.itemDeduction = Math.max(0, parseFloat(value) || 0);
}
function setApproveFeeExemptMax(value) {
  approveFeeState.feeExemptMaxPrice = Math.max(0, parseFloat(value) || 0);
}

function renderApproveFeeFields() {
  document.getElementById('approve-fee-source-toggles').innerHTML = `
    <span class="toggle ${approveFeeState.feeSource==='customer'?'selected':''}" onclick="setApproveFeeSource('customer')">من الزبون</span>
    <span class="toggle ${approveFeeState.feeSource==='merchant'?'selected':''}" onclick="setApproveFeeSource('merchant')">من التاجر</span>
    <span class="toggle ${approveFeeState.feeSource==='both'?'selected':''}" onclick="setApproveFeeSource('both')">من الاثنين</span>
  `;
  document.getElementById('approve-fee-type-toggles').innerHTML = `
    <span class="toggle ${approveFeeState.feeType==='fixed'?'selected':''}" onclick="setApproveFeeType('fixed')">مبلغ ثابت (دينار)</span>
    <span class="toggle ${approveFeeState.feeType==='percent'?'selected':''}" onclick="setApproveFeeType('percent')">نسبة مئوية (%)</span>
  `;
  const unit = approveFeeState.feeType === 'percent' ? '%' : 'د';
  const amountFieldsEl = document.getElementById('approve-fee-amount-fields');
  if (approveFeeState.feeSource === 'both') {
    amountFieldsEl.innerHTML = `
      <div class="row2" style="margin-top:8px;">
        <div><label>من الزبون (${unit})</label><input type="number" value="${approveFeeState.feeCustomer}" onchange="setApproveFeeAmount('feeCustomer', this.value)"></div>
        <div><label>من التاجر (${unit})</label><input type="number" value="${approveFeeState.feeMerchant}" onchange="setApproveFeeAmount('feeMerchant', this.value)"></div>
      </div>`;
  } else {
    amountFieldsEl.innerHTML = `<label style="margin-top:8px;">مبلغ الرسم (${unit})</label><input type="number" value="${approveFeeState.feeAmount}" onchange="setApproveFeeAmount('feeAmount', this.value)">`;
  }
  const itemDeductionEl = document.getElementById('approve-item-deduction');
  if (itemDeductionEl) itemDeductionEl.value = approveFeeState.itemDeduction;
  const feeExemptMaxEl = document.getElementById('approve-fee-exempt-max');
  if (feeExemptMaxEl) feeExemptMaxEl.value = approveFeeState.feeExemptMaxPrice;
}

async function confirmApprove() {
  const m = data.merchants.find(x => x.id === pendingApproveId);
  if (!m) return;
  if (approveModalMode === 'approve') {
    const username = document.getElementById('approve-username').value.trim();
    const password = document.getElementById('approve-password').value.trim();
    if (!username || !password) { showToast('عبي اليوزر نيم والباسورد'); return; }
    if (password.length < 6) { showToast('لازم كلمة المرور ٦ خانات أو أكثر (شرط Firebase)'); return; }

    // Real account creation (Firebase Authentication) — this is the new, secure path.
    // If Firebase itself failed to load (offline fallback mode), we skip straight to the
    // legacy hash-based credential so the app keeps working instead of getting stuck.
    if (window.authApi) {
      const approveBtn = document.querySelector('#approve-modal .btn:not(.secondary)');
      if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = 'جاري إنشاء الحساب...'; }
      try {
        const uid = await window.authApi.createAccount(username, password);
        m.authUid = uid;
      } catch (e) {
        if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = 'تأكيد'; }
        if (e && e.code === 'auth/email-already-in-use') {
          showToast('اليوزرنيم هذا مستخدم من قبل — جرب يوزرنيم ثاني');
        } else {
          console.error('Account creation failed:', e);
          showToast('تعذر إنشاء حساب الدخول — تأكد من الاتصال وحاول مرة ثانية');
        }
        return; // stop here — never approve without a working login account
      }
      if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = 'تأكيد'; }
    }

    m.username = username; m.password = await hashPassword(password); m.status = 'active';
  }
  m.feeSource = approveFeeState.feeSource;
  m.feeType = approveFeeState.feeType;
  m.feeAmount = approveFeeState.feeAmount;
  m.feeCustomer = approveFeeState.feeCustomer;
  m.feeMerchant = approveFeeState.feeMerchant;
  m.itemDeduction = approveFeeState.itemDeduction;
  m.feeExemptMaxPrice = approveFeeState.feeExemptMaxPrice;

  // Mirror the sensitive/public split into the new per-merchant Firestore documents too,
  // so Firestore Security Rules (once published) can protect this merchant's data
  // individually — separately from every other merchant's.
  if (window.authApi && m.authUid) {
    try {
      const { password: _pw, ...publicFields } = m;
      await window.authApi.saveDoc('merchants', m.authUid, publicFields);
      await window.authApi.saveDoc('merchant_private', m.authUid, { balance: m.balance || 0, salesCount: m.salesCount || 0 });
      // The old pending-request document (keyed by the local id, not the new uid) is now
      // fully superseded by the two documents above — remove it so it doesn't linger.
      await window.authApi.deleteDoc('join_requests', String(m.id)).catch(() => {});
    } catch (e) {
      console.error('Could not write the new secure merchant document (approval still saved to the main record):', e);
    }
  }

  const approveOk = await saveData();
  closeApproveModal();
  if (!approveOk) {
    showToast('الموافقة صارت بالشاشة بس ما انحفظت بقاعدة البيانات — جرب اضغط قبول مرة ثانية بعد لحظات، وإلا التاجر ما راح يوصله شي');
  } else {
    showToast(approveModalMode === 'approve' ? 'تم القبول — لا تنسى ترسل بيانات الدخول للتاجر يدوياً' : 'تم تحديث رسوم المنصة لهذا التاجر');
    logAudit(approveModalMode === 'approve' ? 'قبول طلب انضمام تاجر' : 'تعديل رسوم تاجر', m.shop);
  }
  renderAll();
}

function rejectMerchant(id) {
  const m = data.merchants.find(x => x.id === id);
  const shopName = m ? m.shop : `#${id}`;
  data.merchants = data.merchants.filter(x => x.id !== id);
  if (window.authApi) window.authApi.deleteDoc('join_requests', String(id)).catch(() => {});
  saveData();
  logAudit('رفض طلب انضمام تاجر', shopName);
  showToast('تم رفض الطلب');
  renderAll();
}

// Generic confirm modal helper
let confirmCallback = null;
function openConfirmModal(title, text, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  confirmCallback = onConfirm;
  document.getElementById('confirm-modal').classList.add('show');
}
function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('show');
  confirmCallback = null;
}
document.getElementById('confirm-yes-btn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirmModal();
});

function renderRequests() {
  const joinChip = document.getElementById('join-link-chip');
  if (joinChip) joinChip.textContent = joinLinkUrl();

  const pendingList = document.getElementById('pending-list');
  const pending = data.merchants.filter(m => m.status === 'pending');
  pendingList.innerHTML = pending.length === 0 ? '<div class="empty">ما فيه طلبات حالياً</div>' : pending.map(m => `
    <div class="list-item">
      <span>${esc(m.name)} — ${esc(m.shop)} — ${esc(m.governorate)}${m.area ? ' / ' + esc(m.area) : ''}<br><span style="color:var(--text-mute); font-size:11px;">${esc(m.phone) || '—'}${(m.expectedDailyOrders !== null && m.expectedDailyOrders !== undefined) ? ` — توقعه: ${m.expectedDailyOrders} طلب/يوم` : ''}</span>${(currentRole === 'admin' && m.description) ? `<br><span style="color:var(--text-mute); font-size:11px;">${esc(m.description)}</span>` : ''}</span>
      <span>
        <button class="btn small" onclick="approveMerchant(${m.id})">قبول</button>
        <button class="btn danger small" onclick="rejectMerchant(${m.id})">رفض</button>
      </span>
    </div>
  `).join('');

  const removalList = document.getElementById('removal-requests-list');
  if (!removalList) return;
  const removalRequests = data.orders.filter(o => o.removalStatus === 'requested');
  removalList.innerHTML = removalRequests.length === 0 ? '<div class="empty">ما فيه طلبات حذف حالياً</div>' : removalRequests.map(o => {
    const m = data.merchants.find(x => x.id === o.merchantId);
    return `<div class="list-item" style="align-items:flex-start;">
      <span>${m ? esc(m.shop) : 'تاجر محذوف'} — ${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د
      <br><span style="color:var(--text-mute); font-size:11px;">${orderDateTimeLabel(o.date)}</span>
      <br><span style="color:var(--text-mute); font-size:11px;">${esc(o.customerName) || '—'} — ${esc(o.customerPhone) || ''}</span></span>
      <span>
        <button class="btn small" onclick="approveOrderRemoval(${o.id})">موافقة على الحذف</button>
        <button class="btn danger small" onclick="denyOrderRemoval(${o.id})">رفض الحذف</button>
      </span>
    </div>`;
  }).join('');

  renderCancelRequestsAdmin();
}

// Admin queue for customer-initiated cancellation requests — shows BOTH stages so the admin
// has visibility the moment a customer asks (even before the merchant has acted), but the
// final-approval button only appears once the merchant has confirmed with the customer and
// forwarded it (cancelStage === 'merchant_approved'). Full customer phone + product details
// are shown here, same as everywhere else the admin reviews an order.
function renderCancelRequestsAdmin() {
  const list = document.getElementById('cancel-requests-admin-list');
  if (!list) return;
  const requests = data.orders.filter(o => !o.cancelled && (o.cancelStage === 'customer_requested' || o.cancelStage === 'merchant_approved')).slice().reverse();
  if (requests.length === 0) { list.innerHTML = '<div class="empty">ما فيه طلبات إلغاء حالياً</div>'; return; }
  const groups = groupOrders(requests);
  list.innerHTML = groups.map(g => {
    const items = g.orders;
    const first = items[0];
    const m = data.merchants.find(x => x.id === first.merchantId);
    const itemsHtml = items.map(o => `<div class="invoice-line"><span>${esc(o.productName)}${o.size ? ' — مقاس ' + esc(o.size) : ''}${o.color ? ' — ' + esc(o.color) : ''} — ${o.price.toLocaleString()} د</span></div>`).join('');
    const stageBadge = first.cancelStage === 'merchant_approved'
      ? '<span class="badge pending">تمت المراجعة والموافقة من قبل التاجر — بانتظار موافقة الإدارة</span>'
      : '<span class="badge pending">الزبون طلب الإلغاء — بانتظار تأكيد التاجر</span>';
    return `
    <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="width:100%;">
        <b>${m ? esc(m.shop) : 'تاجر محذوف'}${items.length > 1 ? ' (' + items.length + ' قطع)' : ''}</b>
        <div style="margin-top:4px;">${stageBadge}</div>
        <div style="color:var(--text-mute); font-size:11px; margin-top:4px;">${orderDateTimeLabel(first.date)}</div>
        ${orderCustomerLine(first)}
        <div style="margin-top:6px;">${itemsHtml}</div>
        <div style="font-size:11px; color:#B3261E; margin-top:6px; border-top:1px dashed #EEC9C6; padding-top:6px;">
          سبب الزبون: ${esc(first.cancelRequestReason) || '—'}
        </div>
        ${first.cancelStage === 'merchant_approved' ? `<div style="font-size:11px; color:#92400E; margin-top:4px;">ملاحظة التاجر: ${esc(first.merchantCancelNote) || '—'}</div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:8px; width:100%; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn secondary small" onclick="rejectCustomerCancelRequest(${g.groupId}, 'admin')">رفض — إبقاء الطلب</button>
        ${first.cancelStage === 'merchant_approved' ? `<button class="btn danger small" onclick="finalizeCustomerCancel(${g.groupId})">الموافقة النهائية على الإلغاء</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Admin's final approval — this is the point the order actually becomes cancelled
// (mirrors confirmCancelOrderGroup's fields exactly, so it displays identically everywhere
// via cancelReasonLine), attributed to the customer since it was their request all along;
// the merchant's confirmation note stays attached and shown alongside it.
function finalizeCustomerCancel(groupId) {
  const items = data.orders.filter(o => (o.orderGroupId || o.id) === groupId && !o.cancelled && o.cancelStage === 'merchant_approved');
  if (items.length === 0) return;
  openConfirmModal('الموافقة النهائية على الإلغاء', 'راح ينلغي هذا الطلب نهائياً ولا يمكن التراجع بعدها. متأكد؟', () => {
    const now = new Date().toISOString();
    items.forEach(o => {
      reverseOrderEffectsOnCancel(o); // restore stock, and refund the merchant's balance if this had already been accepted
      o.cancelled = true;
      o.cancelReason = o.cancelRequestReason || '—';
      o.cancelBy = 'customer';
      o.cancelByName = 'الزبون';
      o.cancelAt = now;
      o.cancelStage = 'none';
    });
    saveData();
    showToast('تم إلغاء الطلب نهائياً');
    renderAll();
  });
}

function activeMerchants() { return data.merchants.filter(m => m.status !== 'pending'); }

// ---------- EMPLOYEES ----------
// Two independent ways an employee account gets created:
//  1) A merchant clicks "إضافة موظف" inside their panel, fills the employee's info and
//     picks which of their own tabs to delegate. That becomes a *pending request* — no
//     login exists yet — which lands in the admin's "الموظفين" queue. The admin is the one
//     who actually sets the username/password (status becomes 'active' only then).
//  2) The admin adds a member of their own team directly: no request/approval step,
//     since the admin IS the approver — name, phone, permissions, username and password
//     are all set in one go and the account is active immediately.
// Either way, once active, an employee can only ever see/use the tabs listed in their own
// `permissions` array — never more than what the merchant (or admin) granted them.

function labelForPerm(list, id) { const p = list.find(x => x.id === id); return p ? t(p.labelKey) : id; }

// ---- Merchant side: request a new employee, or edit an existing one's permissions ----
let editingEmployeeId = null; // non-null while the "add/edit employee" modal is open for an edit

function openAddEmployeeModal(existingId) {
  editingEmployeeId = existingId || null;
  const emp = editingEmployeeId ? data.employees.find(e => e.id === editingEmployeeId) : null;
  document.getElementById('emp-modal-title').textContent = emp ? 'تعديل صلاحيات الموظف' : 'إضافة موظف جديد';
  document.getElementById('emp-name-fields').style.display = emp ? 'none' : 'block';
  document.getElementById('emp-name').value = emp ? emp.name : '';
  document.getElementById('emp-phone').value = emp ? emp.phone : '';
  const permsBox = document.getElementById('emp-permissions-box');
  const currentPerms = emp ? emp.permissions : [];
  permsBox.innerHTML = MERCHANT_EMPLOYEE_PERMS.map(p => `
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:12.5px; cursor:pointer;">
      <input type="checkbox" value="${p.id}" ${currentPerms.includes(p.id) ? 'checked' : ''} style="width:auto;"> ${t(p.labelKey)}
    </label>`).join('');
  document.getElementById('employee-modal').classList.add('show');
}
function closeEmployeeModal() {
  editingEmployeeId = null;
  document.getElementById('employee-modal').classList.remove('show');
}
async function submitEmployeeModal() {
  const perms = Array.from(document.querySelectorAll('#emp-permissions-box input:checked')).map(c => c.value);
  if (perms.length === 0) { showToast('حدد صلاحية وحدة على الأقل'); return; }

  if (editingEmployeeId) {
    const emp = data.employees.find(e => e.id === editingEmployeeId);
    if (!emp) return;
    emp.permissions = perms;
    saveData();
    closeEmployeeModal();
    showToast('تم تحديث صلاحيات الموظف');
    renderAll();
    return;
  }

  const name = document.getElementById('emp-name').value.trim();
  const phone = document.getElementById('emp-phone').value.trim();
  if (!name || !phone) { showToast('عبي الاسم والهاتف'); return; }

  const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const emp = {
    id: newId, name, phone, permissions: perms,
    ownerType: 'merchant', merchantId: loggedInMerchantId,
    username: '', password: '', status: 'pending', authUid: null
  };
  data.employees.push(emp);

  let ok = false;
  if (window.authApi) {
    try { await window.authApi.saveDoc('employee_requests', String(newId), emp); ok = true; }
    catch (e) { console.error('Employee request save failed:', e); ok = false; }
    // Same reasoning as the merchant join request above — this merchant may well have
    // 'settings' permission and might succeed at bumping the version, but plenty of
    // merchants won't, so we can't depend on it. See pollForUpdates().
  } else {
    ok = await saveData();
  }
  if (!ok) {
    data.employees = data.employees.filter(e => e.id !== newId);
    showToast('صار خطأ ولم يتم إرسال الطلب — تأكد من الاتصال بالإنترنت وحاول مرة ثانية');
    return;
  }
  closeEmployeeModal();
  showToast('تم إرسال طلبك بنجاح راح يجهز الأدمن للموظف يوزر نيم وباسورد دخول');
  renderAll();
}

function renderMerchantEmployeesList(merchantId) {
  const list = data.employees.filter(e => e.ownerType === 'merchant' && e.merchantId === merchantId);
  if (list.length === 0) return '<div class="empty">ما ضفت موظفين بعد</div>';
  return list.map(e => `
    <div class="list-item" style="align-items:flex-start;">
      <span>${esc(e.name)}<br>
        <span style="color:var(--text-mute); font-size:11px;">${esc(e.phone) || '—'}</span><br>
        <span class="badge ${e.status === 'active' ? 'active' : 'disabled'}">${e.status === 'active' ? 'نشط — يكدر يسجل دخول' : 'بانتظار الأدمن يجهزله بيانات الدخول'}</span><br>
        <span style="color:var(--text-mute); font-size:11px;">الصلاحيات: ${e.permissions.map(id => labelForPerm(MERCHANT_EMPLOYEE_PERMS, id)).join('، ') || '—'}</span>
      </span>
      <span>
        <button class="btn small secondary" onclick="openAddEmployeeModal(${e.id})">تعديل الصلاحيات</button>
        <button class="btn danger small" onclick="deleteEmployee(${e.id})">حذف</button>
      </span>
    </div>`).join('');
}

function deleteEmployee(id) {
  const emp = data.employees.find(e => e.id === id);
  if (!emp) return;
  openConfirmModal('حذف الموظف', `متأكد تريد تحذف "${emp.name}"؟ راح ينحذف حسابه ولا يكدر يسجل دخول بعدها.`, async () => {
    data.employees = data.employees.filter(e => e.id !== id);
    if (window.authApi) {
      if (emp.authUid) window.authApi.deleteDoc('employees', emp.authUid).catch(() => {});
      else window.authApi.deleteDoc('employee_requests', String(id)).catch(() => {});
    }
    saveData();
    logAudit('حذف موظف', emp.name);
    showToast('تم حذف الموظف');
    renderAll();
  });
}

// ---- Admin side: approve/reject a merchant's employee request, or manage the admin's own team ----
let pendingApproveEmployeeId = null;

function openApproveEmployeeModal(id) {
  pendingApproveEmployeeId = id;
  document.getElementById('approve-emp-username').value = '';
  document.getElementById('approve-emp-password').value = '';
  document.getElementById('employee-approve-modal').classList.add('show');
}
function closeApproveEmployeeModal() {
  pendingApproveEmployeeId = null;
  document.getElementById('employee-approve-modal').classList.remove('show');
}
async function confirmApproveEmployee() {
  const e = data.employees.find(x => x.id === pendingApproveEmployeeId);
  if (!e) return;
  const username = document.getElementById('approve-emp-username').value.trim();
  const password = document.getElementById('approve-emp-password').value.trim();
  if (!username || !password) { showToast('عبي اليوزر نيم والباسورد'); return; }
  if (password.length < 6) { showToast('لازم كلمة المرور ٦ خانات أو أكثر (شرط Firebase)'); return; }

  if (window.authApi) {
    const btn = document.querySelector('#employee-approve-modal .btn:not(.secondary)');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري إنشاء الحساب...'; }
    try {
      const uid = await window.authApi.createAccount(username, password);
      e.authUid = uid;
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'تأكيد'; }
      if (err && err.code === 'auth/email-already-in-use') showToast('اليوزرنيم هذا مستخدم من قبل — جرب يوزرنيم ثاني');
      else { console.error('Employee account creation failed:', err); showToast('تعذر إنشاء حساب الدخول — تأكد من الاتصال وحاول مرة ثانية'); }
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'تأكيد'; }
  }

  e.username = username;
  e.password = await hashPassword(password);
  e.status = 'active';

  if (window.authApi) {
    if (e.authUid) await window.authApi.saveDoc('employees', e.authUid, e).catch(() => {});
    await window.authApi.deleteDoc('employee_requests', String(e.id)).catch(() => {});
  }
  saveData();
  closeApproveEmployeeModal();
  logAudit('قبول طلب انضمام موظف', e.name);
  showToast('تم قبول الموظف — لا تنسى ترسل بيانات الدخول له يدوياً');
  renderAll();
}

function rejectEmployee(id) {
  const emp = data.employees.find(x => x.id === id);
  const empName = emp ? emp.name : `#${id}`;
  data.employees = data.employees.filter(x => x.id !== id);
  if (window.authApi) window.authApi.deleteDoc('employee_requests', String(id)).catch(() => {});
  saveData();
  logAudit('رفض طلب انضمام موظف', empName);
  showToast('تم رفض طلب الموظف');
  renderAll();
}

let editingAdminEmployeeId = null;

function openAdminEmployeeModal(existingId) {
  editingAdminEmployeeId = existingId || null;
  const e = editingAdminEmployeeId ? data.employees.find(x => x.id === editingAdminEmployeeId) : null;
  document.getElementById('admin-emp-modal-title').textContent = e ? 'تعديل موظف الإدارة' : 'إضافة موظف للإدارة';
  document.getElementById('admin-emp-name').value = e ? e.name : '';
  document.getElementById('admin-emp-phone').value = e ? e.phone : '';
  document.getElementById('admin-emp-name').disabled = !!e;
  document.getElementById('admin-emp-phone').disabled = !!e;
  document.getElementById('admin-emp-credentials-fields').style.display = e ? 'none' : 'block';
  document.getElementById('admin-emp-username').value = '';
  document.getElementById('admin-emp-password').value = '';
  const permsBox = document.getElementById('admin-emp-permissions-box');
  const currentPerms = e ? e.permissions : [];
  permsBox.innerHTML = ADMIN_EMPLOYEE_PERMS.map(p => `
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:12.5px; cursor:pointer;">
      <input type="checkbox" value="${p.id}" ${currentPerms.includes(p.id) ? 'checked' : ''} style="width:auto;"> ${t(p.labelKey)}
    </label>`).join('');
  document.getElementById('admin-employee-modal').classList.add('show');
}
function closeAdminEmployeeModal() {
  editingAdminEmployeeId = null;
  document.getElementById('admin-employee-modal').classList.remove('show');
}
async function submitAdminEmployeeModal() {
  const perms = Array.from(document.querySelectorAll('#admin-emp-permissions-box input:checked')).map(c => c.value);
  if (perms.length === 0) { showToast('حدد صلاحية وحدة على الأقل'); return; }
  const name = document.getElementById('admin-emp-name').value.trim();
  const phone = document.getElementById('admin-emp-phone').value.trim();
  if (!name || !phone) { showToast('عبي الاسم والهاتف'); return; }

  if (editingAdminEmployeeId) {
    const e = data.employees.find(x => x.id === editingAdminEmployeeId);
    if (!e) return;
    e.permissions = perms;
    saveData();
    closeAdminEmployeeModal();
    showToast('تم تحديث صلاحيات الموظف');
    renderAll();
    return;
  }

  const username = document.getElementById('admin-emp-username').value.trim();
  const password = document.getElementById('admin-emp-password').value.trim();
  if (!username || !password) { showToast('عبي اليوزر نيم والباسورد'); return; }
  if (password.length < 6) { showToast('لازم كلمة المرور ٦ خانات أو أكثر (شرط Firebase)'); return; }

  const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const emp = { id: newId, name, phone, permissions: perms, ownerType: 'admin', merchantId: null, username: '', password: '', status: 'active', authUid: null };

  if (window.authApi) {
    const btn = document.querySelector('#admin-employee-modal .btn:not(.secondary)');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري إنشاء الحساب...'; }
    try {
      const uid = await window.authApi.createAccount(username, password);
      emp.authUid = uid;
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'إضافة'; }
      if (err && err.code === 'auth/email-already-in-use') showToast('اليوزرنيم هذا مستخدم من قبل — جرب يوزرنيم ثاني');
      else { console.error('Employee account creation failed:', err); showToast('تعذر إنشاء حساب الدخول — تأكد من الاتصال وحاول مرة ثانية'); }
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'إضافة'; }
  }

  emp.username = username;
  emp.password = await hashPassword(password);
  data.employees.push(emp);

  if (window.authApi && emp.authUid) await window.authApi.saveDoc('employees', emp.authUid, emp).catch(() => {});
  saveData();
  closeAdminEmployeeModal();
  showToast('تمت إضافة الموظف ');
  renderAll();
}

// ---------- ANNOUNCEMENTS (admin broadcasts messages to merchants) ----------
// Toggles the multi-select merchant checkbox list on/off depending on whether "كل التجار"
// or "تجار محددين" is chosen in the composer above.
function renderAnnouncementTargetPicker() {
  const targetSel = document.getElementById('ann-target');
  const box = document.getElementById('ann-target-picker');
  if (!targetSel || !box) return;
  if (targetSel.value !== 'specific') { box.style.display = 'none'; return; }
  box.style.display = '';
  const merchants = data.merchants.filter(m => m.status === 'active');
  box.innerHTML = merchants.length
    ? merchants.map(m => `
        <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-weight:400;">
          <input type="checkbox" class="ann-target-check" value="${m.id}"> ${esc(m.shop)}
        </label>`).join('')
    : '<div class="empty">ما فيه تجار نشطين حالياً</div>';
}

// Sends a new broadcast: reads the composer, validates it, appends to data.announcements
// (persisted inside the shared platform-settings doc — see saveData/fetchRemoteData), then
// resets the form and re-renders the sent-messages list.
async function sendAnnouncement() {
  const textEl = document.getElementById('ann-text');
  const text = (textEl.value || '').trim();
  if (!text) { showToast('اكتب نص الرسالة أولاً'); return; }

  const targetSel = document.getElementById('ann-target');
  let target = 'all';
  if (targetSel.value === 'specific') {
    const ids = Array.from(document.querySelectorAll('.ann-target-check:checked')).map(cb => parseInt(cb.value));
    if (ids.length === 0) { showToast('اختر تاجر واحد على الأقل'); return; }
    target = ids;
  }

  data.announcements.unshift({
    id: genId(),
    text,
    createdAt: new Date().toISOString(),
    target,
    readBy: []
  });
  await saveData();

  textEl.value = '';
  targetSel.value = 'all';
  renderAnnouncementTargetPicker();
  renderAnnouncementsAdmin();
  showToast('تم إرسال الرسالة ');
}

async function deleteAnnouncement(id) {
  data.announcements = data.announcements.filter(a => a.id !== id);
  await saveData();
  renderAnnouncementsAdmin();
}

// Describes who an announcement went to + how many of them have opened it, for the admin's
// "sent messages" list.
function announcementRecipients(a) {
  return a.target === 'all' ? data.merchants.filter(m => m.status === 'active') : data.merchants.filter(m => a.target.includes(m.id));
}
function renderAnnouncementsAdmin() {
  const list = document.getElementById('ann-sent-list');
  if (!list) return;
  if (!data.announcements.length) { list.innerHTML = '<div class="empty">ما أرسلت أي رسالة بعد</div>'; return; }
  list.innerHTML = data.announcements.map(a => {
    const recipients = announcementRecipients(a);
    const readCount = recipients.filter(m => (a.readBy || []).includes(m.id)).length;
    const targetLabel = a.target === 'all' ? 'كل التجار' : `تجار محددين (${recipients.length})`;
    const date = new Date(a.createdAt).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });
    return `
      <div class="card" style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1;">
            <div style="white-space:pre-wrap;">${esc(a.text)}</div>
            <div class="subtitle" style="margin-top:6px;">${date} · ${targetLabel} · قُرئت من ${readCount}/${recipients.length}</div>
          </div>
          <button class="btn danger small" onclick="deleteAnnouncement(${a.id})"></button>
        </div>
      </div>`;
  }).join('');
}

function renderEmployees() {
  const pendingBox = document.getElementById('pending-employee-list');
  if (pendingBox) {
    const pending = data.employees.filter(e => e.ownerType === 'merchant' && e.status === 'pending');
    pendingBox.innerHTML = pending.length === 0 ? '<div class="empty">ما فيه طلبات موظفين حالياً</div>' : pending.map(e => {
      const m = data.merchants.find(x => x.id === e.merchantId);
      return `<div class="list-item" style="align-items:flex-start;">
        <span>${esc(e.name)} — موظف عند ${m ? esc(m.shop) : 'تاجر محذوف'}<br>
          <span style="color:var(--text-mute); font-size:11px;">${esc(e.phone) || '—'}</span><br>
          <span style="color:var(--text-mute); font-size:11px;">الصلاحيات المطلوبة: ${e.permissions.map(id => labelForPerm(MERCHANT_EMPLOYEE_PERMS, id)).join('، ') || '—'}</span>
        </span>
        <span>
          <button class="btn small" onclick="openApproveEmployeeModal(${e.id})">قبول وتحديد بيانات الدخول</button>
          <button class="btn danger small" onclick="rejectEmployee(${e.id})">رفض</button>
        </span>
      </div>`;
    }).join('');
  }

  const adminEmpBox = document.getElementById('admin-employee-list');
  if (adminEmpBox) {
    const list = data.employees.filter(e => e.ownerType === 'admin');
    adminEmpBox.innerHTML = list.length === 0 ? '<div class="empty">ما ضفت موظفين للإدارة بعد</div>' : list.map(e => `
      <div class="list-item" style="align-items:flex-start;">
        <span>${esc(e.name)}<br>
          <span style="color:var(--text-mute); font-size:11px;">${esc(e.phone) || '—'}</span><br>
          <span style="color:var(--text-mute); font-size:11px;">الصلاحيات: ${e.permissions.map(id => labelForPerm(ADMIN_EMPLOYEE_PERMS, id)).join('، ') || '—'}</span>
        </span>
        <span>
          <button class="btn small secondary" onclick="openAdminEmployeeModal(${e.id})">تعديل الصلاحيات</button>
          <button class="btn small secondary" onclick="openResetPasswordModal('employee', ${e.id})">تصفير كلمة المرور</button>
          <button class="btn danger small" onclick="deleteEmployee(${e.id})">حذف</button>
        </span>
      </div>`).join('');
  }

  const activeBox = document.getElementById('active-merchant-employee-list');
  if (activeBox) {
    const list = data.employees.filter(e => e.ownerType === 'merchant' && e.status === 'active');
    activeBox.innerHTML = list.length === 0 ? '<div class="empty">ما فيه موظفين نشطين عند التجار حالياً</div>' : list.map(e => {
      const m = data.merchants.find(x => x.id === e.merchantId);
      return `<div class="list-item" style="align-items:flex-start;">
        <span>${esc(e.name)} — عند ${m ? esc(m.shop) : 'تاجر محذوف'}<br>
          <span style="color:var(--text-mute); font-size:11px;">الصلاحيات (يحددها التاجر): ${e.permissions.map(id => labelForPerm(MERCHANT_EMPLOYEE_PERMS, id)).join('، ') || '—'}</span>
        </span>
        <span>
          <button class="btn small secondary" onclick="openResetPasswordModal('employee', ${e.id})">تصفير كلمة المرور</button>
          <button class="btn danger small" onclick="deleteEmployee(${e.id})">حذف</button>
        </span>
      </div>`;
    }).join('');
  }
}

// ---------- RESET PASSWORD (merchant) ----------
// Passwords are hashed, so there is no "original" to show — the admin can only set a new one.
let resetPasswordTarget = null; // { type: 'merchant' | 'employee', id }

function openResetPasswordModal(type, id) {
  resetPasswordTarget = { type, id };
  const target = type === 'employee' ? data.employees.find(x => x.id === id) : data.merchants.find(x => x.id === id);
  document.getElementById('reset-password-title').textContent =
    `تصفير كلمة مرور: ${target ? (type === 'employee' ? target.name : target.shop) : ''}`;
  document.getElementById('reset-password-input').value = '';
  document.getElementById('reset-password-modal').classList.add('show');
}
function closeResetPasswordModal() {
  resetPasswordTarget = null;
  document.getElementById('reset-password-modal').classList.remove('show');
}
async function confirmResetPassword() {
  if (!resetPasswordTarget) return;
  const newPassword = document.getElementById('reset-password-input').value.trim();
  if (!newPassword) { showToast('اكتب كلمة مرور جديدة'); return; }
  if (newPassword.length < 6) { showToast('لازم كلمة المرور ٦ خانات أو أكثر (شرط Firebase)'); return; }

  const target = resetPasswordTarget.type === 'employee'
    ? data.employees.find(x => x.id === resetPasswordTarget.id)
    : data.merchants.find(x => x.id === resetPasswordTarget.id);
  if (!target) return;

  // IMPORTANT: target.password (the hash below) is only ever checked as a LEGACY fallback —
  // platformLogin() always tries real Firebase Auth first. So for any account that already has
  // a real account (target.authUid set), updating just the hash here would silently do nothing:
  // the person could still log in with their OLD password forever, and the admin would wrongly
  // believe access was cut off. For those accounts we must also update the REAL Firebase Auth
  // password via the resetUserPassword Cloud Function (Admin SDK — the only thing that's
  // allowed to change another user's password). See /functions in the project.
  if (target.authUid && window.authApi && window.authApi.resetAuthPassword) {
    if (!adminSessionCreds) {
      showToast('انتهت صلاحية جلستك — سجل خروج ودخول من جديد قبل تصفير كلمة المرور');
      return;
    }
    const saveBtn = document.querySelector('#reset-password-modal .btn:not(.secondary)');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'جاري التغيير...'; }
    try {
      const targetUsername = target.username;
      const result = await window.authApi.resetAuthPassword(
        targetUsername, newPassword, adminSessionCreds.username, adminSessionCreds.passwordHash
      );
      if (!result || !result.updatedAuth) {
        // No real Firebase Auth account found for this username after all — fall through and
        // just update the local hash below, same as a legacy account.
        console.warn('resetUserPassword: no matching Firebase Auth account, only updating local hash.');
      }
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'حفظ'; }
      console.error('Real password reset failed:', err);
      // Do NOT tell the admin the reset succeeded — the old password still works.
      showToast('تعذر تغيير كلمة الدخول الفعلية (تأكد إن الخدمة السحابية مفعّلة بالمشروع) — كلمة المرور القديمة لسا شغالة، لم يتم تغيير شي');
      return;
    }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'حفظ'; }
  }

  target.password = await hashPassword(newPassword);
  const resetTargetType = resetPasswordTarget.type; // captured before closeResetPasswordModal() clears resetPasswordTarget
  const resetOk = await saveData();
  closeResetPasswordModal();
  if (!resetOk) {
    showToast('تعذر حفظ كلمة المرور الجديدة — جرب مرة ثانية بعد لحظات، وإلا القديمة تضل شغالة');
  } else {
    showToast('تم تصفير كلمة المرور فعلياً — لا تنسى ترسلها للحساب يدوياً');
    logAudit('تصفير كلمة مرور', `${resetTargetType === 'employee' ? 'موظف' : 'تاجر'}: ${resetTargetType === 'employee' ? target.name : target.shop}`);
  }
  renderAll();
}

// Masked username display with a per-row show/hide toggle — kept out of view by default.
let revealedUsernames = new Set();
function toggleUsernameReveal(key) {
  if (revealedUsernames.has(key)) revealedUsernames.delete(key);
  else revealedUsernames.add(key);
  renderAll();
}

// ---------- ADMIN CREDENTIALS ----------
async function changeAdminPassword() {
  const oldUserInput = document.getElementById('old-admin-username');
  const oldPassInput = document.getElementById('old-admin-password');
  const userInput = document.getElementById('new-admin-username');
  const passInput = document.getElementById('new-admin-password');
  const errorBox = document.getElementById('admin-cred-error');
  const oldUsername = oldUserInput.value.trim();
  const oldPassword = oldPassInput.value;
  const newUsername = userInput.value.trim();
  const newPassword = passInput.value.trim();

  errorBox.textContent = '';

  const oldPasswordHash = await hashPassword(oldPassword);
  if (oldUsername !== data.settings.adminUsername || oldPasswordHash !== data.settings.adminPassword) {
    errorBox.textContent = 'اسم المستخدم أو كلمة المرور الحاليين غير صحيحين';
    return;
  }
  if (!newUsername && !newPassword) { errorBox.textContent = 'اكتب اسم مستخدم جديد أو كلمة مرور جديدة'; return; }

  // Sync the REAL Firebase Auth password FIRST, before touching anything local. If this step
  // fails, we bail out completely rather than changing the local password — otherwise the
  // admin's local password and their real Firebase Auth password would drift apart, and their
  // very next login would be blocked by the mismatch check in platformLogin().
  if (newPassword && window.authApi && window.authApi.syncAdminAuthPassword) {
    try {
      const synced = await window.authApi.syncAdminAuthPassword(newPassword);
      if (!synced) {
        errorBox.textContent = 'انتهت صلاحية جلستك — سجل خروج ودخول من جديد قبل تغيير كلمة المرور';
        return;
      }
    } catch (e) {
      console.error('Failed to sync admin Firebase Auth password:', e);
      errorBox.textContent = 'تعذر تحديث كلمة الدخول الفعلية — تأكد من الاتصال وحاول مرة ثانية';
      return;
    }
  }

  const prevUsername = data.settings.adminUsername;
  const prevPassword = data.settings.adminPassword;
  if (newUsername) data.settings.adminUsername = newUsername;
  if (newPassword) data.settings.adminPassword = await hashPassword(newPassword);

  // Saved to its own protected doc (storage/admin-credentials) — NOT via the general
  // saveData(), which no longer writes these fields at all (see fetchRemoteData/saveData
  // above). This is what actually enforces "only the real admin can change this", since
  // firestore.rules restricts that doc's write to isAdmin() regardless of what any
  // employee permission is set to.
  const credsOk = await saveAdminCredentials();
  if (!credsOk) {
    data.settings.adminUsername = prevUsername;
    data.settings.adminPassword = prevPassword;
    errorBox.textContent = 'تعذر حفظ التغيير — جرب مرة ثانية بعد لحظات';
    return;
  }
  await saveData(); // persists the version bump / anything else pending as usual

  adminSessionCreds = { username: data.settings.adminUsername, passwordHash: data.settings.adminPassword };
  oldUserInput.value = ''; oldPassInput.value = '';
  userInput.value = ''; passInput.value = '';
  document.getElementById('topbar-name').textContent = data.settings.adminUsername;
  showToast('تم تحديث بيانات دخول الأدمن — لا تنساها!');
  logAudit('تغيير بيانات دخول الأدمن', newUsername ? `اسم مستخدم جديد: ${newUsername}` : 'تغيير كلمة المرور فقط');
}

// Builds the real, shareable link for a merchant's storefront. If the admin has assigned
// this merchant a custom domain (see assignCustomDomain), that official domain IS the link —
// otherwise it falls back to the shared platform link with the merchant's own slug. Nothing
// about the merchant's products/orders/data changes either way; this only changes which URL
// customers use to reach the exact same storefront.
function storeLinkUrl(m) {
  if (m && m.customDomain) return `https://${m.customDomain}`;
  const slug = typeof m === 'string' ? m : (m ? m.linkSlug : '');
  return `${location.origin}${location.pathname}?store=${encodeURIComponent(slug)}`;
}

function copyStoreLink(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const url = storeLinkUrl(m);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast('تم نسخ رابط المتجر'),
      () => showToast('تعذر نسخ الرابط، انسخه يدوياً')
    );
  } else {
    showToast('تعذر نسخ الرابط، انسخه يدوياً');
  }
}
// Opens the merchant's real storefront link (custom domain if assigned, otherwise the
// shared platform link) in a new tab — same URL customers actually use.
function openStoreLinkInNewTab(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (m) window.open(storeLinkUrl(m), '_blank');
}

// Builds the shareable link that takes any new merchant straight to the "طلب انضمام" form
function joinLinkUrl() {
  return `${location.origin}${location.pathname}?join=1`;
}

function copyJoinLink() {
  const url = joinLinkUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast('تم نسخ رابط انضمام التجار'),
      () => showToast('تعذر نسخ الرابط، انسخه يدوياً')
    );
  } else {
    showToast('تعذر نسخ الرابط، انسخه يدوياً');
  }
}

let loggedInMerchantId = null;

function renderMerchantPanel() {
  if (!loggedInMerchantId) return;
  const m = data.merchants.find(x => x.id === loggedInMerchantId);
  const panel = document.getElementById('merchant-panel');
  if (!m) { panel.innerHTML = ''; return; }
  ensureMerchantTheme(m);

  panel.innerHTML = `
    <div class="toggle-group" id="merchant-dash-subnav">
      <div class="toggle" data-mdashtab="store" onclick="showMerchantDashTab('store')">المتجر</div>
      <div class="toggle" data-mdashtab="orders" onclick="showMerchantDashTab('orders')">الطلبات</div>
      <div class="toggle" data-mdashtab="earnings" onclick="showMerchantDashTab('earnings')">الأرباح والحسابات</div>
      <div class="toggle" data-mdashtab="products" onclick="showMerchantDashTab('products')">${lowStockBadgeHtml(m)}المنتجات</div>
      <div class="toggle" data-mdashtab="appearance" onclick="showMerchantDashTab('appearance')">المظهر</div>
      <div class="toggle" data-mdashtab="charts" onclick="showMerchantDashTab('charts')">الرسوم البيانية</div>
      <div class="toggle" data-mdashtab="messages" onclick="showMerchantDashTab('messages')">${unreadAnnouncementsBadgeHtml(m)}رسائل الإدارة</div>
      <div class="toggle" data-mdashtab="employees" onclick="showMerchantDashTab('employees')">الموظفين</div>
    </div>

    <div class="dash-tab" data-mdashtab-content="store">
      <div class="card">
        <div class="card-title">حالة المتجر: <span class="badge ${m.status === 'active' ? 'active' : 'disabled'}">${m.status === 'active' ? 'نشط' : 'معطل'}</span></div>
        ${m.customDomain ? `
        <div class="card-title" style="margin-top:8px;">دومينك الرسمي (هدية من الإدارة)</div>
        <div class="link-chip" onclick="copyStoreLink(${m.id})">${storeLinkUrl(m)}</div>
        <div class="subtitle" style="margin-top:6px;">هذا الدومين صار العنوان الرسمي لمتجرك — أرسله لزبائنك. متجرك ومنتجاتك وطلباتك ما تغيرت أبداً، بس تغيّر العنوان اللي يوصلون بيه.</div>
        ` : `
        <div class="card-title" style="margin-top:8px;">رابط متجرك الفريد — أرسله لزبائنك</div>
        <div class="link-chip" onclick="copyStoreLink(${m.id})">${storeLinkUrl(m)}</div>
        `}
        ${m.status === 'active'
          ? `<button class="btn secondary small" style="margin-top:8px;" onclick="openStoreLinkInNewTab(${m.id})">فتح المتجر بصفحة جديدة</button>`
          : `<div class="subtitle" style="margin-top:8px;">الرابط اعلاه يشتغل بعد ما يفعّل الأدمن متجرك. لين هسه استخدم زر المعاينة تحت لتشوف شكل متجرك.</div>`}
        <button class="btn small" style="margin-top:8px;" onclick="openMerchantPreview(${m.id})">عاين متجرك متل ما راح يشوفه الزبون</button>
      </div>
      <div class="card" id="own-credentials-card-${m.id}">
        <div class="card-title">بيانات حسابي (خاصة بيك انت بس)</div>
        <div class="subtitle" style="margin-bottom:8px;">هاي البيانات ما يشوفها أي تاجر ثاني — يشوفها الأدمن وانت بس</div>
        <div style="font-size:12.5px; color:var(--text-mute);">
          اسم المستخدم: <b style="color:var(--ink);">${(revealedUsernames.has('own-'+m.id) ? m.username : '•'.repeat(Math.max(6, (m.username||'').length))) || '—'}</b>
          ${m.username ? `<span class="link-chip" style="padding:2px 6px; font-size:10px;" onclick="toggleUsernameReveal('own-${m.id}')">${revealedUsernames.has('own-'+m.id) ? 'إخفاء' : 'إظهار'}</span>` : ''}
          <br>كلمة المرور: مخفية لحمايتك — إذا نسيتها اطلب من الأدمن يصفرها ويعطيك وحدة جديدة
        </div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="orders">
      <div class="card">
        <div class="card-title">طلبات جديدة بانتظار ردك</div>
        <div id="pending-orders-${m.id}">${renderPendingOrders(m)}</div>
      </div>
      <div class="card" id="merchant-cancel-requests-card-${m.id}">
        <div class="card-title">طلبات إلغاء من الزبائن</div>
        <div class="subtitle" style="margin-bottom:8px;">اتصل بالزبون لتأكيد سبب الإلغاء قبل ما توافق عليه — بعد موافقتك ينتقل الطلب للإدارة للموافقة النهائية</div>
        <div id="merchant-cancel-requests-${m.id}">${renderMerchantCancelRequests(m)}</div>
      </div>
      <div class="card">
        <div class="card-title">تجهيز الطلبات للتوصيل</div>
        <div id="ready-shipping-${m.id}">${m.ownDelivery
          ? '<div class="subtitle">متجرك مستثنى من توصيل المنصة (توصيلك خاص بيك) — الطلبات المقبولة ما تحتاج تجهيز لفريق توصيل المنصة.</div>'
          : renderReadyForShipping(m)}</div>
      </div>
      <div class="card">
        <div class="card-title">سجل الطلبات (الكل)</div>
        <div id="merchant-orders-${m.id}">${renderMerchantOrders(m)}</div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="products">
      <div class="card">
        <div class="card-title">تنبيهات المخزون — الكمية قربت تخلص</div>
        <div class="subtitle" style="margin-bottom:8px;">نعرضلك هنا أي مقاس، لون، أو منتج وصلت كميته للحد اللي تحدده تحت (أو نفدت خلص)</div>
        <div class="row2" style="margin-bottom:10px;">
          <div><label>نبهني لما توصل الكمية إلى (أو أقل من)</label><input type="number" id="low-stock-threshold-${m.id}" value="${getLowStockThreshold(m)}" min="0"></div>
          <div style="flex:0 0 auto; display:flex; align-items:flex-end;"><button class="btn secondary small" style="margin-top:0;" onclick="saveLowStockThreshold(${m.id})">حفظ الحد</button></div>
        </div>
        <div id="low-stock-list-${m.id}">${renderLowStockAlerts(m)}</div>
      </div>
      <div class="card">
        <div class="card-title">أقسام متجرك (اختياري)</div>
        <div class="subtitle" style="margin-bottom:8px;">مثل: تيشيرتات، أحذية، اكسسوارات... تكدر تربط أي منتج بقسم لما تضيفه، وتظهر بمتجرك مقسّمة لزبونك</div>
        <div style="margin-bottom:8px;">
          ${m.categories.length === 0 ? '<span class="subtitle" style="margin:0;">ما ضفت أقسام بعد</span>' :
            m.categories.map(c => `<span class="category-chip">${esc(c.name)} <span class="x" onclick="deleteCategory(${m.id}, ${c.id})">✕</span></span>`).join('')}
        </div>
        <div class="row2">
          <div><input id="new-category-${m.id}" placeholder="اسم القسم — مثلاً: أحذية"></div>
          <div style="flex:0 0 auto;"><button class="btn secondary" style="margin-top:0;" onclick="addCategory(${m.id})">إضافة قسم</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">كوبونات الخصم</div>
        <div class="subtitle" style="margin-bottom:8px;">أنشئ كود خصم يقدر زبونك يطبّقه بالسلة — نسبة مئوية أو مبلغ ثابت، وبإمكانك تحدد حد أدنى للطلب (اختياري). قيمة الكوبون تُخصم من صافي أرباحك انت، وما تأثر على رسوم المنصة</div>
        <div id="coupons-list-${m.id}" style="margin-bottom:10px;">${renderCouponsList(m)}</div>
        <label>كود الكوبون</label><input id="coupon-code-${m.id}" placeholder="مثلاً: EID25" style="text-transform:uppercase;">
        <div class="row2">
          <div>
            <label>نوع الخصم</label>
            <select id="coupon-type-${m.id}">
              <option value="percent">نسبة مئوية %</option>
              <option value="fixed">مبلغ ثابت (د)</option>
            </select>
          </div>
          <div><label>القيمة</label><input type="number" id="coupon-value-${m.id}" placeholder="مثلاً: 10"></div>
        </div>
        <label>حد أدنى لقيمة الطلب (اختياري)</label><input type="number" id="coupon-min-${m.id}" placeholder="اتركه فارغ لعدم وجود حد أدنى">
        <div class="row2">
          <div><label>تاريخ الانتهاء (اختياري)</label><input type="date" id="coupon-expiry-${m.id}"></div>
          <div><label>أقصى عدد استخدام (اختياري)</label><input type="number" id="coupon-maxuses-${m.id}" placeholder="اتركه فارغ لعدم وجود حد"></div>
        </div>
        <label>أقصى مبلغ خصم بالدينار (اختياري — يفيد مع النسبة المئوية حتى ما ينفلت الخصم بطلب كبير)</label>
        <input type="number" id="coupon-maxdiscount-${m.id}" placeholder="اتركه فارغ لعدم وجود حد أقصى">
        <button class="btn secondary" onclick="addCoupon(${m.id})">إضافة كوبون</button>
      </div>
      <div class="card">
        <div class="card-title">إضافة منتج</div>
        <label>اسم المنتج</label><input id="p-name-${m.id}" placeholder="قميص قطن">
        <label>السعر (دينار)</label><input type="number" id="p-price-${m.id}" placeholder="15000">
        <label>وصف القطعة (اختياري)</label><textarea id="p-desc-${m.id}" placeholder="مثلاً: قماش قطن 100%، صناعة تركية، مناسب لكل الفصول"></textarea>
        <label>المقاسات المتوفرة (اختياري) — أضف أي عدد تريده، مقاسات أحذية أو ملابس أو أي شي، وحط كمية كل مقاس</label>
        <div class="size-chip-add-row">
          <input id="p-size-input-${m.id}" placeholder="مثلاً: 42 أو L أو XL" onkeydown="if(event.key==='Enter'){event.preventDefault();addSizeChipDraft(${m.id});}">
          <input type="number" id="p-size-stock-input-${m.id}" placeholder="الكمية (اختياري)" style="max-width:120px;">
          <button type="button" class="btn secondary small" onclick="addSizeChipDraft(${m.id})">إضافة</button>
        </div>
        <div class="size-chip-row" id="p-sizes-chips-${m.id}">${sizeChipsHtml(draftProductSizes[m.id] || [], (i) => `removeSizeChipDraft(${m.id}, ${i})`)}</div>
        <label>الألوان المتوفرة (اختياري) — اختر لون، اكتب اسمه، وحط كمية كل لون</label>
        <div class="color-chip-add-row">
          <input type="color" id="p-color-hex-${m.id}" value="#10B981">
          <input type="text" id="p-color-name-${m.id}" placeholder="مثلاً: أحمر" onkeydown="if(event.key==='Enter'){event.preventDefault();addColorChipDraft(${m.id});}">
          <input type="number" id="p-color-stock-${m.id}" placeholder="الكمية (اختياري)">
          <button type="button" class="btn secondary small" onclick="addColorChipDraft(${m.id})">إضافة</button>
        </div>
        <div class="color-chip-row" id="p-colors-chips-${m.id}">${colorChipsHtml(draftProductColors[m.id] || [], (i) => `removeColorChipDraft(${m.id}, ${i})`)}</div>
        <label>الكمية المتوفرة الإجمالية (اختياري — تُستخدم فقط لو ما أضفت مقاسات أو ألوان، اتركها فارغة لو غير محدودة)</label><input type="number" id="p-stock-${m.id}" placeholder="مثلاً: 20">
        ${m.categories.length > 0 ? `
        <label>القسم (اختياري)</label>
        <select id="p-category-${m.id}">
          <option value="">بدون قسم</option>
          ${m.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>` : ''}
        <label>صور المنتج (اختياري) — تكدر تختار أكثر من صورة مرة وحدة (حتى 5 صور)</label>
        <input type="file" accept="image/*" multiple id="p-image-${m.id}">
        <button class="btn" onclick="addProduct(${m.id})">إضافة المنتج</button>
      </div>
      <div class="card">
        <div class="card-title">استيراد منتجات بالجملة</div>
        <div class="subtitle" style="margin-bottom:8px;">عندك قائمة منتجات جاهزة؟ حمّل القالب، عبّيه، وارفعه هنا بدل ما تضيف كل منتج يدوياً. الصور تنضاف بعدين لكل منتج من "منتجاتي" بالأسفل.</div>
        <button class="btn secondary small" onclick="downloadProductImportTemplate()">تحميل قالب Excel فاضي</button>
        <label style="margin-top:10px;">اختر ملف Excel أو CSV المعبّى</label>
        <input type="file" accept=".xlsx,.xls,.csv" id="p-import-file-${m.id}">
        <button class="btn" onclick="importProductsFromFile(${m.id})">استيراد المنتجات من الملف</button>
        ${renderImportResultsBox(m.id)}
      </div>
      <div class="card">
        <div class="card-title">منتجاتي</div>
        <div id="products-list-${m.id}">${renderProductList(m)}</div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="appearance">
      <div class="card">
        <div class="card-title">لون لوحة تحكمك</div>
        <div class="subtitle" style="margin-bottom:8px;">هذا اللون يخص شكل لوحتك انت بس (الأزرار والعناوين هنا بلوحة التحكم) — منفصل تماماً عن شكل متجرك اللي يشوفه الزبون</div>
        <div class="theme-row">
          <input type="color" id="dash-color-${m.id}" value="${m.dashboardColor}" onchange="setDashboardColor(${m.id}, this.value)">
          <span style="font-size:12px; color:#475569;">اختر اللون المفضل لواجهتك</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">تخصيص شكل متجرك</div>
        <div class="subtitle" style="margin-bottom:8px;">هذا الشكل يظهر للزبون بالضبط بصفحة متجرك</div>

        <label>اللون الرئيسي (للأزرار والعناوين)</label>
        <div class="theme-row">
          <input type="color" id="theme-color-${m.id}" value="${m.theme.primaryColor}" onchange="setThemeColor(${m.id}, this.value)">
          <span style="font-size:12px; color:#475569;">اختر لون يمثل هوية محلك</span>
        </div>

        <label>شعار المحل (لوگو)</label>
        <div class="theme-row">
          ${m.theme.logo
            ? `<img class="logo-preview" src="${m.theme.logo}">`
            : `<div class="thumb-placeholder" style="width:56px;height:56px;"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9l1-5h14l1 5" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" stroke="#94A3B8" stroke-width="1.6"/><path d="M9.5 19v-4a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v4" stroke="#94A3B8" stroke-width="1.6"/></svg></div>`}
          <div style="flex:1;">
            <input type="file" accept="image/*" id="theme-logo-${m.id}" onchange="setThemeLogo(${m.id}, this)">
            ${m.theme.logo ? `<span class="link-chip" style="margin-top:6px;" onclick="removeThemeImage(${m.id},'logo')">إزالة الشعار</span>` : ''}
          </div>
        </div>

        <label>صورة غلاف المتجر (اختياري)</label>
        <input type="file" accept="image/*" id="theme-banner-${m.id}" onchange="setThemeBanner(${m.id}, this)">
        ${m.theme.banner
          ? `<img class="banner-preview" src="${m.theme.banner}"><span class="link-chip" style="margin-top:6px;" onclick="removeThemeImage(${m.id},'banner')">إزالة صورة الغلاف</span>`
          : ''}
      </div>
      <div class="card">
        <div class="card-title">رسالة ترحيبية ونبذة عنك (اختياري)</div>
        <div class="subtitle" style="margin-bottom:8px;">الرسالة الترحيبية تظهر بمنتصف صفحة متجرك للزبون، والنبذة تظهر تحت اسم متجرك — اتركهن فاضيات لو ما تريد تستخدمهن</div>
        <label>رسالة ترحيبية</label>
        <textarea id="welcome-msg-${m.id}" placeholder="مثلاً: أهلاً بيكم بمتجرنا! كل منتجاتنا أصلية ومضمونة 100%" onchange="setWelcomeMessage(${m.id}, this.value)">${esc(m.welcomeMessage)}</textarea>
        <label>نبذة عني</label>
        <textarea id="bio-${m.id}" placeholder="مثلاً: متجر متخصص بالملابس الرجالية، شغالين من 2022" onchange="setBio(${m.id}, this.value)">${esc(m.bio)}</textarea>
      </div>
      <div class="card">
        <div class="card-title">روابط التواصل الاجتماعي (اختياري)</div>
        <div class="subtitle" style="margin-bottom:8px;">أضف روابط حساباتك، وتكدر تخفي أي واحد بدون ما تحذف رابطه — يظهر بصفحة متجرك بس اللي مفعّل وعنده رابط</div>
        ${SOCIAL_PLATFORMS.map(p => {
          const s = m.theme.social[p.key];
          return `
          <div class="social-edit-row">
            <input id="social-url-${p.key}-${m.id}" placeholder="رابط ${esc(p.label)}" value="${esc(s.url)}" onchange="setSocialLink(${m.id}, '${p.key}', this.value)">
            <button type="button" class="social-visibility-btn ${s.visible ? 'visible' : ''}" onclick="toggleSocialVisible(${m.id}, '${p.key}')">${s.visible ? 'ظاهر' : 'مخفي'}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <div class="card-title">شروط وأحكام خاصة بمتجرك (اختياري)</div>
        <div class="subtitle" style="margin-bottom:8px;">اكتب هنا سياسة الاستبدال/الإرجاع أو أي شروط تخص محلك بالتحديد. تنعرض للزبون كرابط بصفحة متجرك — بس إذا فعّلتها وكتبت نص فيها. تكدر تخفيها بأي وقت بدون ما يضيع النص المكتوب.</div>
        <textarea id="merchant-terms-input-${m.id}" placeholder="مثلاً: يحق للزبون استبدال المنتج خلال ٣ أيام من الاستلام بشرط عدم الاستخدام..." onchange="setMerchantCustomTerms(${m.id}, this.value)">${esc(m.theme.customTerms.text)}</textarea>
        <button type="button" class="social-visibility-btn ${m.theme.customTerms.visible ? 'visible' : ''}" style="margin-top:6px;" onclick="toggleMerchantCustomTermsVisible(${m.id})">${m.theme.customTerms.visible ? 'ظاهرة للزبون' : 'مخفية عن الزبون'}</button>
      </div>
      <div class="card" style="border:1px solid var(--accent); background:linear-gradient(135deg,#fff,var(--accent-soft));">
        <div class="card-title">تصميم ذكي بالذكاء الاصطناعي</div>
        <div class="subtitle" style="margin-bottom:8px;">ارفع شعار محلك وخل الذكاء الاصطناعي يحلل ألوانه ويصمملك لون رئيسي وصورة غلاف تناسب هويتك تلقائياً — اقتراح فقط، ما ينطبق إلا إذا وافقت، وما يغير أي شي من إعداداتك الحالية</div>
        <label>شعار المحل ${m.theme.logo ? '(عندك وحدة محفوظة — تكدر ترفع وحدة جديدة أو تحلل الحالية)' : '(ارفعه هنا)'}</label>
        <input type="file" accept="image/*" id="ai-logo-${m.id}" onchange="runAiDesign(${m.id}, this)">
        ${m.theme.logo && !(aiDesignSuggestion && aiDesignSuggestion.merchantId === m.id)
          ? `<button class="btn secondary small" style="margin-top:8px;" onclick="runAiDesign(${m.id})">حلّل شعاري الحالي وصمملي الألوان</button>`
          : ''}
        ${aiDesignSuggestion && aiDesignSuggestion.merchantId === m.id ? `
          <div style="margin-top:12px; padding:10px; border-radius:10px; background:#fff; border:1px dashed var(--accent);">
            <div style="font-size:12px; color:#475569; margin-bottom:8px;">اقتراح الذكاء الاصطناعي — استوحيناه من ألوان شعارك:</div>
            <img src="${aiDesignSuggestion.banner}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">
            <div class="theme-row">
              <span style="width:30px; height:30px; border-radius:6px; display:inline-block; background:${aiDesignSuggestion.primaryColor}; border:1px solid #ddd;"></span>
              <span style="font-size:12px; color:#475569;">اللون الرئيسي المقترح للمتجر</span>
            </div>
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button class="btn small" onclick="applyAiDesign(${m.id})">تطبيق هذا التصميم</button>
              <button class="btn small secondary" onclick="dismissAiDesign()">تجاهل الاقتراح</button>
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="earnings">
      <div class="card">
        <div class="card-title">أرباحي</div>
        <div class="grid3">
          <div class="stat"><div class="stat-num">${m.salesCount}</div><div class="stat-label">عمليات بيع</div></div>
          <div class="stat"><div class="stat-num">${m.balance.toLocaleString()}</div><div class="stat-label">رصيدي (د)</div></div>
          <div class="stat"><div class="stat-num">${m.visits || 0}</div><div class="stat-label">زيارات متجرك</div></div>
        </div>
        ${m.feeExemptMaxPrice > 0 ? `<div class="subtitle" style="margin-top:8px;">أي قطعة سعرها ${m.feeExemptMaxPrice.toLocaleString()} د أو أقل — الأدمن أعفاها من عمولة المنصة بالكامل</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">سجل حساباتي اليومي</div>
        <div class="subtitle" style="margin-bottom:8px;">كل يوم صفحة لحاله — تصفحها بالأسهم من غير ما تحدد أي تاريخ، وبآخر كل صفحة تلاقي المبلغ المستحق لك والمستحق للمنصة من هذا اليوم بالضبط</div>
        <div id="macc-ledger-nav-${m.id}" style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;"></div>
        <div id="macc-ledger-${m.id}"><div class="empty">جاري التحميل...</div></div>
        <div id="macc-ledger-total-${m.id}" style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);"></div>
      </div>
      <div class="card">
        <div class="card-title">حساباتي الدقيقة (فلترة بتاريخ مخصص)</div>
        <div class="subtitle" style="margin-bottom:8px;">كل أموالك، الرسوم المستقطعة منك لصالح المنصة، وصافي أرباحك — هذي بياناتك انت بس ولا تظهر أي حساب لتاجر ثاني أو للأدمن</div>
        <div class="row2">
          <div><label>من تاريخ</label><input type="date" id="macc-from-${m.id}" onchange="renderMerchantAccounting(${m.id})"></div>
          <div><label>إلى تاريخ</label><input type="date" id="macc-to-${m.id}" onchange="renderMerchantAccounting(${m.id})"></div>
        </div>
        <button class="btn secondary small" onclick="resetMerchantAccountingFilters(${m.id})">إعادة تعيين الفلاتر</button>
        <div class="grid3" id="macc-summary-${m.id}" style="margin-top:10px;"></div>
        <div class="grid3" id="macc-summary2-${m.id}"></div>
        <div style="margin-top:6px;">
          <button class="btn small" onclick="exportMerchantAccountingExcel(${m.id})">تحميل تقرير Excel</button>
          <button class="btn small secondary" onclick="exportMerchantAccountingPDF(${m.id})">تحميل تقرير PDF</button>
        </div>
        <div class="card-title" style="margin-top:14px;">فواتير طلباتي بالتفصيل</div>
        <div id="macc-orders-${m.id}"></div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="charts">
      <div class="card">
        <div class="card-title">مبيعاتي آخر 7 أيام</div>
        <div class="chart-wrap"><canvas id="chart-merchant-sales"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">الأكثر مبيعاً</div>
        <div class="chart-wrap"><canvas id="chart-merchant-products"></canvas></div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="messages">
      <div class="card">
        <div class="card-title">رسائل الإدارة</div>
        <div class="subtitle" style="margin-bottom:8px;">رسائل يرسلها لك الأدمن — إعلانات، تنبيهات، أو تعليمات عامة</div>
        <div id="merchant-announcements-${m.id}">${renderMerchantAnnouncements(m)}</div>
      </div>
    </div>

    <div class="dash-tab" data-mdashtab-content="employees">
      <div class="card">
        <div class="card-title">موظفيني</div>
        <div class="subtitle" style="margin-bottom:8px;">ضيف موظف يساعدك بالشغل وحدد الصلاحيات اللي تريده يشتغل بيها بس — طلبك يروح للأدمن يجهز للموظف يوزر نيم وباسورد دخول</div>
        <button class="btn" onclick="openAddEmployeeModal()">إضافة موظف</button>
        <div style="margin-top:10px;">${renderMerchantEmployeesList(m.id)}</div>
      </div>
    </div>
  `;
  renderMerchantCharts(m);
  renderMerchantLedger(m.id);
  renderMerchantAccounting(m.id);
  applyEmployeeGating();
  applyMerchantDashTab();
  maybeShowLowStockToast(m);
}

