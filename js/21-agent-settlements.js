// =====================================================================================
// نظام التسديد بين المندوب والتاجر والأدمن
//
// المندوب يستلم مبلغ الطلب + أجرة التوصيل من الزبون، فيصير بحوزته 3 أشياء منفصلة:
//   1) حق التاجر  = سعر الطلب − استقطاع المنصة      → يدفعه المندوب للتاجر، والتاجر يأكد "تم/لم يتم الاستلام"
//   2) استقطاع المنصة من الطلبات (عمولة المنصة)     → يدفعه المندوب للأدمن، والأدمن يأكد
//   3) عمولة التوصيل (حصة المنصة من أجرة التوصيل)   → يدفعها المندوب للأدمن، والأدمن يأكد
// (2) و(3) سرّية بين الأدمن والمندوب — التاجر ما يقدر يقراها (شوف firestore.rules → agent_payments).
// التسديد لـ (2) و(3) يكون إما إجمالي أو لتاجر محدد. الأدمن يشوف كل دفعات المندوب للتجار للمتابعة بس.
//
// كل الدفعات بمجموعة agent_payments: { id, agentId, agentName, amount, note, at, status:
// 'pending'|'confirmed'|'rejected', type: 'platform'|'delivery'|'merchant', merchantId: null|رقم,
// merchantAuthUid: null|string (لنوع merchant بس), requestId: null|string, decidedAt, decidedBy, rejectReason }
// طلبات الأدمن من المندوب بمجموعة agent_payment_requests: { id, agentId, type, amount, note, at, by, status: 'open'|'done' }
// =====================================================================================

let cashLogAgentId = null;      // نافذة الأدمن (تسجيل استلام يدوي)
let payPresetMerchantId = null; // تاجر محدد مسبقاً بنافذة المندوب
let payPresetRequestId = null;  // طلب دفعة من الأدمن مرتبط بالدفعة الجارية

const SETTLE_LABELS = {
  platform: 'عمولة المنصة (استقطاع الطلبات)',
  delivery: 'عمولة التوصيل',
  merchant: 'تسديد لتاجر'
};

function payTypeOf(p) { return p && (p.type === 'delivery' || p.type === 'merchant') ? p.type : 'platform'; }
function merchantShopName(id) {
  const m = data.merchants.find(x => x.id === id);
  return m ? m.shop : 'تاجر محذوف';
}
function payKindLabel(l) {
  const t = payTypeOf(l);
  if (t === 'merchant') return 'تسديد للتاجر: ' + merchantShopName(l.merchantId);
  const base = t === 'delivery' ? 'عمولة التوصيل' : 'عمولة المنصة';
  return l && l.merchantId != null ? `${base} — ${merchantShopName(l.merchantId)}` : `${base} (إجمالي)`;
}
function isAdminSide() { return currentRole === 'admin' || currentRole === 'employee'; }

// ---------- الحسابات ----------
function agentResetSince(agentId) {
  const resets = (data.agentLedgerClosures || []).filter(c => c.agentId === agentId && c.scope === 'reset')
    .map(c => new Date(c.closedAt).getTime()).filter(t => !isNaN(t));
  return resets.length ? Math.max(...resets) : 0;
}
// حصة المنصة من أجرة التوصيل على طلب موصَّل = أجرة التوصيل اللي دفعها الزبون − أجرة المندوب.
// (shippingFee تنكتب على أول قطعة بالفاتورة بس، لذلك ما تنزل تحت الصفر لكل طلب).
function orderDeliveryPlatformShare(o) {
  if (o.deliveryStatus !== 'delivered') return 0;
  return Math.max(0, (o.shippingFee || 0) - (o.agentFeeSnapshot || 0));
}
function agentVisibleDeliveredOrders(agentId) {
  return data.orders.filter(o => o.deliveryAgentId === agentId && o.deliveryStatus === 'delivered'
    && !isAgentLedgerDayHiddenFor(agentId, ledgerDayKey(o.date)));
}
function agentPaymentsOf(agentId, status, type, sinceMs) {
  return (data.agentPayments || []).filter(p => p.agentId === agentId && p.status === status && payTypeOf(p) === type
    && (sinceMs == null || new Date(p.at).getTime() > sinceMs));
}
// dueBy: { merchantId: مستحق } — payments: دفعات مقبولة — pendingList: دفعات معلقة (للعرض بس)
function buildBalance(due, dueBy, payments, legacyGeneral, pendingList) {
  const paidBy = {}, pendBy = {};
  let general = legacyGeneral || 0;
  payments.forEach(p => {
    if (p.merchantId != null) paidBy[p.merchantId] = (paidBy[p.merchantId] || 0) + p.amount;
    else general += p.amount;
  });
  (pendingList || []).forEach(p => {
    if (p.merchantId != null) pendBy[p.merchantId] = (pendBy[p.merchantId] || 0) + p.amount;
  });
  const ids = Array.from(new Set([...Object.keys(dueBy), ...Object.keys(paidBy), ...Object.keys(pendBy)])).map(Number);
  const rows = ids.map(id => {
    const d = dueBy[id] || 0, paid = paidBy[id] || 0, net = d - paid;
    return { merchantId: id, due: d, paid, pending: pendBy[id] || 0, remaining: Math.max(0, net), overpaid: Math.max(0, -net) };
  }).sort((a, b) => b.remaining - a.remaining);
  const paid = general + Object.values(paidBy).reduce((s, v) => s + v, 0);
  const net = due - paid;
  return {
    due, paid, general,
    pending: (pendingList || []).reduce((s, p) => s + p.amount, 0),
    remaining: Math.max(0, net), overpaid: Math.max(0, -net), rows
  };
}
// (2) استقطاع المنصة من الطلبات — يشمل التعديلات اليدوية، والدفعات بعد آخر "تصفير حسابات".
function agentBalance(agentId) {
  const since = agentResetSince(agentId);
  const days = buildAgentLedgerDays(agentId);
  const due = days.reduce((s, d) => s + d.totalPlatformCommission, 0);
  const dueBy = {};
  days.forEach(d => Object.values(d.byMerchant).forEach(mb => { dueBy[mb.merchantId] = (dueBy[mb.merchantId] || 0) + mb.platformCommission; }));
  // سجلات يدوية قديمة (قبل هذا النظام) — الجديدة كلها بـ agent_payments
  const legacy = (data.agentCashLogs || [])
    .filter(l => l.agentId === agentId && !l.paymentId && (l.type || 'platform') === 'platform' && new Date(l.at).getTime() > since)
    .reduce((s, l) => s + (l.amount || 0), 0);
  return buildBalance(due, dueBy, agentPaymentsOf(agentId, 'confirmed', 'platform', since), legacy, agentPaymentsOf(agentId, 'pending', 'platform', since));
}
// (3) عمولة التوصيل
function agentDeliveryBalance(agentId) {
  const since = agentResetSince(agentId);
  const dueBy = {};
  let due = 0;
  agentVisibleDeliveredOrders(agentId).forEach(o => {
    const s = orderDeliveryPlatformShare(o);
    due += s;
    dueBy[o.merchantId] = (dueBy[o.merchantId] || 0) + s;
  });
  return buildBalance(due, dueBy, agentPaymentsOf(agentId, 'confirmed', 'delivery', since), 0, agentPaymentsOf(agentId, 'pending', 'delivery', since));
}
// (1) حق التجار عند المندوب — طول الوقت (تصفير الأدمن ما يمسح دين المندوب للتاجر).
function agentMerchantBalance(agentId) {
  const dueBy = {};
  let due = 0;
  data.orders.filter(o => o.deliveryAgentId === agentId && o.deliveryStatus === 'delivered').forEach(o => {
    const n = orderAgentDueSplit(o).merchantNetDue;
    due += n;
    dueBy[o.merchantId] = (dueBy[o.merchantId] || 0) + n;
  });
  return buildBalance(due, dueBy, agentPaymentsOf(agentId, 'confirmed', 'merchant', null), 0, agentPaymentsOf(agentId, 'pending', 'merchant', null));
}
function settlementBalanceFor(agentId, type) {
  return type === 'merchant' ? agentMerchantBalance(agentId) : type === 'delivery' ? agentDeliveryBalance(agentId) : agentBalance(agentId);
}

// ---------- نوافذ الدفعة (نافذة المندوب agent-pay + نافذة الأدمن اليدوية agent-cash) ----------
function payModalTypes(prefix) { return prefix === 'agent-pay' ? ['platform', 'delivery', 'merchant'] : ['platform', 'delivery']; }
function payModalFill(prefix, agentId, preset) {
  const types = payModalTypes(prefix);
  const typeEl = document.getElementById(prefix + '-type');
  typeEl.innerHTML = types.map(t => `<option value="${t}">${SETTLE_LABELS[t]}</option>`).join('');
  typeEl.value = preset && types.includes(preset.type) ? preset.type : 'platform';
  payPresetMerchantId = preset && preset.merchantId != null ? preset.merchantId : null;
  document.getElementById(prefix + '-scope').value = payPresetMerchantId != null && typeEl.value !== 'merchant' ? 'merchant' : 'total';
  payModalSync(prefix, agentId, true, preset ? preset.amount : null);
}
function payModalSync(prefix, agentId, prefill, presetAmount) {
  const type = document.getElementById(prefix + '-type').value;
  const scopeEl = document.getElementById(prefix + '-scope');
  document.getElementById(prefix + '-scope-wrap').style.display = type === 'merchant' ? 'none' : '';
  const scope = type === 'merchant' ? 'merchant' : scopeEl.value;
  document.getElementById(prefix + '-merchant-wrap').style.display = scope === 'merchant' ? '' : 'none';
  const bal = settlementBalanceFor(agentId, type);
  const sel = document.getElementById(prefix + '-merchant');
  if (scope === 'merchant') {
    const prev = payPresetMerchantId != null ? String(payPresetMerchantId) : sel.value;
    payPresetMerchantId = null;
    sel.innerHTML = bal.rows.length
      ? bal.rows.map(r => `<option value="${r.merchantId}">${esc(merchantShopName(r.merchantId))} — متبقي ${r.remaining.toLocaleString()} د</option>`).join('')
      : '<option value="">ما فيه تجار بحسابه بعد</option>';
    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  }
  const noun = type === 'merchant' ? 'للتاجر' : (type === 'delivery' ? 'من عمولة التوصيل' : 'من عمولة المنصة');
  let remaining, text;
  if (scope === 'merchant') {
    const mid = parseInt(sel.value, 10);
    const r = bal.rows.find(x => x.merchantId === mid);
    remaining = r ? r.remaining : 0;
    text = r ? `المتبقي ${noun} (${merchantShopName(mid)}): ${remaining.toLocaleString()} د — المستحق ${r.due.toLocaleString()} − المسدَّد ${r.paid.toLocaleString()}` : 'اختار تاجر';
  } else {
    remaining = bal.remaining;
    text = `المتبقي ${noun} (إجمالي): ${remaining.toLocaleString()} د — المستحق ${bal.due.toLocaleString()} − المسدَّد ${bal.paid.toLocaleString()}`;
  }
  document.getElementById(prefix === 'agent-cash' ? 'agent-cash-hint' : 'agent-pay-hint').textContent = text;
  if (prefill) document.getElementById(prefix + '-amount').value = presetAmount != null ? presetAmount : (remaining > 0 ? remaining : '');
}
function payModalRead(prefix) {
  const type = document.getElementById(prefix + '-type').value;
  const scope = type === 'merchant' ? 'merchant' : document.getElementById(prefix + '-scope').value;
  if (scope !== 'merchant') return { type, merchantId: null };
  const merchantId = parseInt(document.getElementById(prefix + '-merchant').value, 10);
  if (isNaN(merchantId)) { showToast('اختار التاجر'); return null; }
  return { type, merchantId };
}

// ---------- الأدمن: تسجيل استلام يدوي (يُحفظ كدفعة مؤكَّدة، وسرّية عن التجار) ----------
function openAgentCashLogModal(agentId, prefillRemaining) {
  cashLogAgentId = agentId;
  payModalFill('agent-cash', agentId, null);
  if (!prefillRemaining) document.getElementById('agent-cash-amount').value = '';
  document.getElementById('agent-cash-note').value = '';
  document.getElementById('agent-cash-log-modal').classList.add('show');
}
function closeAgentCashLogModal() {
  cashLogAgentId = null;
  document.getElementById('agent-cash-log-modal').classList.remove('show');
}
async function submitAgentCashLog() {
  if (cashLogAgentId == null) return;
  const amount = parseInt(document.getElementById('agent-cash-amount').value, 10);
  const note = document.getElementById('agent-cash-note').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('عبي مبلغ صحيح'); return; }
  const kind = payModalRead('agent-cash');
  if (!kind) return;
  const a = data.employees.find(x => x.id === cashLogAgentId);
  const now = new Date().toISOString();
  const id = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const payload = {
    id, agentId: cashLogAgentId, agentName: a ? (a.name || '') : '', amount, note, at: now, status: 'confirmed',
    type: kind.type, merchantId: kind.merchantId, merchantAuthUid: null, requestId: null,
    decidedAt: now, decidedBy: currentActorLabel()
  };
  try {
    await window.authApi.saveDoc('agent_payments', id, payload);
  } catch (e) {
    console.error('manual agent payment failed', e);
    showToast('ما انحفظ التسجيل — تأكد من الاتصال ونشر قواعد Firestore الجديدة', 6000);
    return;
  }
  data.agentPayments.push(payload);
  await logAudit('تسجيل استلام نقدي من مندوب', `${a ? a.name : cashLogAgentId} — ${amount.toLocaleString()} د — ${payKindLabel(payload)}`);
  showToast('تم تسجيل الاستلام');
  closeAgentCashLogModal();
  renderAll();
}
function deleteAgentCashLog(id) {
  openConfirmModal('حذف سجل استلام نقدي', 'متأكد تريد تحذف هذا السجل؟ هذا الإجراء يخص الأدمن بس.', async () => {
    data.agentCashLogs = (data.agentCashLogs || []).filter(l => l.id !== id);
    await saveData();
    showToast('تم حذف السجل');
    renderAll();
  });
}
function deleteAgentPayment(id) {
  openConfirmModal('حذف دفعة', 'متأكد تريد تحذف هذي الدفعة؟ راح ينتغير رصيد المندوب. هذا الإجراء يخص الأدمن بس.', async () => {
    try { await window.authApi.deleteDoc('agent_payments', id); }
    catch (e) { console.error(e); showToast('ما انحذفت الدفعة'); return; }
    data.agentPayments = (data.agentPayments || []).filter(p => p.id !== id);
    showToast('تم حذف الدفعة');
    renderAll();
  });
}

// ---------- المندوب: إرسال دفعة ----------
function openAgentPayModal(preset) {
  const emp = currentEmployee();
  if (!emp || emp.ownerType !== 'delivery_agent') return;
  payPresetRequestId = preset && preset.requestId ? preset.requestId : null;
  payModalFill('agent-pay', emp.id, preset || null);
  document.getElementById('agent-pay-note').value = '';
  document.getElementById('agent-pay-modal').classList.add('show');
}
function closeAgentPayModal() {
  payPresetRequestId = null;
  document.getElementById('agent-pay-modal').classList.remove('show');
}
async function submitAgentPay() {
  const emp = currentEmployee();
  if (!emp || emp.ownerType !== 'delivery_agent') return;
  const amount = parseInt(document.getElementById('agent-pay-amount').value, 10);
  const note = document.getElementById('agent-pay-note').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('عبي مبلغ صحيح'); return; }
  const kind = payModalRead('agent-pay');
  if (!kind) return;
  let merchantAuthUid = null;
  if (kind.type === 'merchant') {
    const m = data.merchants.find(x => x.id === kind.merchantId);
    if (!m || !m.authUid) { showToast('هذا التاجر ما عنده حساب دخول مفعّل'); return; }
    merchantAuthUid = m.authUid;
  }
  const id = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const payload = {
    id, agentId: emp.id, agentName: emp.name || '', amount, note, at: new Date().toISOString(), status: 'pending',
    type: kind.type, merchantId: kind.merchantId, merchantAuthUid, requestId: payPresetRequestId || null
  };
  try {
    await window.authApi.saveDoc('agent_payments', id, payload);
  } catch (e) {
    console.error('agent payment submit failed', e);
    showToast('ما انرسلت الدفعة — تأكد من الاتصال أو انشر قواعد Firestore الجديدة', 6000);
    return;
  }
  data.agentPayments.push(payload);
  showToast(kind.type === 'merchant' ? 'انرسلت الدفعة — بانتظار تأكيد التاجر' : 'انرسلت الدفعة — بانتظار تأكيد الأدمن');
  closeAgentPayModal();
  renderAll();
}

// ---------- القرار: تم الاستلام / لم يتم الاستلام ----------
// الأدمن يقرر دفعات (عمولة المنصة/التوصيل)، والتاجر يقرر دفعات تسديده هو — الأدمن يشوف دفعات التجار بس.
async function decideAgentPayment(id, decision) {
  const p = (data.agentPayments || []).find(x => x.id === id);
  if (!p || p.status !== 'pending') return;
  let reason = '';
  if (decision === 'rejected') {
    const r = prompt('سبب عدم الاستلام (اختياري) — يبين للمندوب:');
    if (r === null) return;
    reason = r.trim();
  }
  const patch = { status: decision, decidedAt: new Date().toISOString(), decidedBy: currentActorLabel() };
  if (decision === 'rejected') patch.rejectReason = reason;
  try {
    await window.authApi.saveDoc('agent_payments', id, patch);
  } catch (e) {
    console.error('agent payment decision failed', e);
    showToast('ما انحفظ القرار — جرّب مرة ثانية');
    return;
  }
  Object.assign(p, patch);
  if (decision === 'confirmed' && p.requestId && isAdminSide()) {
    const req = (data.agentPaymentRequests || []).find(r => r.id === p.requestId);
    try {
      await window.authApi.saveDoc('agent_payment_requests', p.requestId, { status: 'done', doneAt: patch.decidedAt });
      if (req) req.status = 'done';
    } catch (e) { /* اختياري */ }
  }
  if (isAdminSide()) {
    try { await logAudit(decision === 'confirmed' ? 'قبول دفعة مندوب' : 'رفض دفعة مندوب', `${p.agentName || p.agentId} — ${p.amount.toLocaleString()} د — ${payKindLabel(p)}`); } catch (e) { /* اختياري */ }
  }
  showToast(decision === 'confirmed' ? 'تم تأكيد الاستلام' : 'تم تسجيل "لم يتم الاستلام"');
  renderAll();
}

// ---------- طلب دفعة من الأدمن للمندوب ----------
let payRequestAgentId = null;
function openPayRequestModal(agentId) {
  payRequestAgentId = agentId;
  document.getElementById('pay-request-type').value = 'platform';
  document.getElementById('pay-request-note').value = '';
  payRequestSyncAmount();
  document.getElementById('pay-request-modal').classList.add('show');
}
function closePayRequestModal() {
  payRequestAgentId = null;
  document.getElementById('pay-request-modal').classList.remove('show');
}
function payRequestSyncAmount() {
  if (payRequestAgentId == null) return;
  const type = document.getElementById('pay-request-type').value;
  const bal = settlementBalanceFor(payRequestAgentId, type);
  document.getElementById('pay-request-hint').textContent = `المتبقي حالياً على المندوب: ${bal.remaining.toLocaleString()} د`;
  document.getElementById('pay-request-amount').value = bal.remaining > 0 ? bal.remaining : '';
}
async function submitPayRequest() {
  if (payRequestAgentId == null) return;
  const amount = parseInt(document.getElementById('pay-request-amount').value, 10);
  if (isNaN(amount) || amount <= 0) { showToast('عبي المبلغ المطلوب'); return; }
  const type = document.getElementById('pay-request-type').value === 'delivery' ? 'delivery' : 'platform';
  const note = document.getElementById('pay-request-note').value.trim();
  const id = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const payload = { id, agentId: payRequestAgentId, type, amount, note, at: new Date().toISOString(), by: currentActorLabel(), status: 'open' };
  try {
    await window.authApi.saveDoc('agent_payment_requests', id, payload);
  } catch (e) {
    console.error('pay request failed', e);
    showToast('ما انرسل الطلب — تأكد من الاتصال ونشر قواعد Firestore الجديدة', 6000);
    return;
  }
  data.agentPaymentRequests.push(payload);
  const a = data.employees.find(x => x.id === payRequestAgentId);
  await logAudit('طلب دفعة من مندوب', `${a ? a.name : payRequestAgentId} — ${amount.toLocaleString()} د — ${SETTLE_LABELS[type]}`);
  showToast('انرسل الطلب للمندوب');
  closePayRequestModal();
  renderAll();
}
function cancelPayRequest(id) {
  openConfirmModal('إلغاء طلب الدفعة', 'تريد تلغي هذا الطلب من المندوب؟', async () => {
    try { await window.authApi.deleteDoc('agent_payment_requests', id); }
    catch (e) { console.error(e); showToast('ما انلغى الطلب'); return; }
    data.agentPaymentRequests = (data.agentPaymentRequests || []).filter(r => r.id !== id);
    showToast('تم إلغاء الطلب');
    renderAll();
  });
}

// ---------- العرض ----------
const PAY_STATUS_COLOR = { pending: '#92400E', confirmed: '#065F46', rejected: '#B3261E' };
function payStatusLabel(p) {
  if (p.status === 'confirmed') return '✓ تم الاستلام';
  if (p.status === 'rejected') return '✕ لم يتم الاستلام';
  return payTypeOf(p) === 'merchant' ? '⏳ بانتظار تأكيد التاجر' : '⏳ بانتظار تأكيد الأدمن';
}
function money(n) { return (n || 0).toLocaleString() + ' د'; }

// بطاقات الحساب الثلاثة. mode: 'agent' (أزرار تسديد) أو 'admin' (عرض فقط).
function agentSettlementCardsHtml(agent, mode) {
  if (!agent) return '';
  const cards = [
    { type: 'platform', title: 'استقطاع المنصة من الطلبات (بحوزتك للمنصة)', bal: agentBalance(agent.id), who: 'الأدمن' },
    { type: 'delivery', title: 'عمولة التوصيل (بحوزتك للمنصة)', bal: agentDeliveryBalance(agent.id), who: 'الأدمن' },
    { type: 'merchant', title: 'مستحقات التجار (بحوزتك للتجار)', bal: agentMerchantBalance(agent.id), who: 'التاجر' }
  ];
  return cards.map(c => {
    const b = c.bal;
    const title = mode === 'admin' ? c.title.replace('بحوزتك', 'بحوزته') : c.title;
    const rows = b.rows.filter(r => r.due > 0 || r.paid > 0 || r.pending > 0).map(r => `
      <div class="list-item" style="align-items:center; gap:6px;">
        <span style="font-size:12px;"><b>${esc(merchantShopName(r.merchantId))}</b> — مستحق ${money(r.due)} — مسدَّد ${money(r.paid)}${r.pending ? ` <span style="color:#92400E;">(معلّق ${money(r.pending)})</span>` : ''} —
          متبقي <b style="color:${r.remaining > 0 ? '#B3261E' : '#065F46'};">${money(r.remaining)}</b></span>
        ${mode === 'agent' && r.remaining > 0 ? `<button class="btn small secondary" onclick="openAgentPayModal({type:'${c.type}', merchantId:${r.merchantId}})">تسديد</button>` : ''}
      </div>`).join('');
    return `<div class="card" style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <b style="font-size:13px;">${esc(title)}</b>
        ${mode === 'agent' && b.remaining > 0 ? `<button class="btn small" onclick="openAgentPayModal({type:'${c.type}'})">تسديد إجمالي</button>` : ''}
      </div>
      <div class="grid3" style="margin-top:8px;">
        <div class="stat"><div class="stat-num">${b.due.toLocaleString()}</div><div class="stat-label">الإجمالي المستحق (د)</div></div>
        <div class="stat"><div class="stat-num">${b.paid.toLocaleString()}</div><div class="stat-label">مسدَّد (د)${b.pending ? ' — معلّق ' + b.pending.toLocaleString() : ''}</div></div>
        <div class="stat"><div class="stat-num" style="color:${b.remaining > 0 ? '#B3261E' : '#065F46'};">${b.remaining.toLocaleString()}</div><div class="stat-label">المتبقي (د)${b.overpaid ? ' — زيادة ' + b.overpaid.toLocaleString() : ''}</div></div>
      </div>
      <div class="subtitle" style="margin-top:6px;">${c.type === 'merchant'
        ? 'كل دفعة للتاجر يأكد استلامها التاجر نفسه. الأدمن يشوفها للمتابعة.'
        : `التسديد إجمالي أو لكل تاجر على حده، و${c.who} يأكد الاستلام. هذا الحساب سري بين الأدمن والمندوب.`}</div>
      ${rows}
    </div>`;
  }).join('');
}

// كل دفعات المندوب (سجله) — للمندوب.
function agentPaymentsSectionHtml(agent) {
  if (!agent || agent.ownerType !== 'delivery_agent') return '';
  const mine = (data.agentPayments || []).filter(p => p.agentId === agent.id).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15);
  const rows = mine.map(p => `<div class="list-item"><span>${new Date(p.at).toLocaleString('ar-IQ')} — <b>${money(p.amount)}</b> — ${esc(payKindLabel(p))}${p.note ? ' — ' + esc(p.note) : ''}${p.status === 'rejected' && p.rejectReason ? ' — السبب: ' + esc(p.rejectReason) : ''}</span>
    <span style="font-size:11.5px; color:${PAY_STATUS_COLOR[p.status] || 'inherit'};">${payStatusLabel(p)}</span></div>`).join('');
  return `<div class="card" style="margin-top:10px;">
    <b style="font-size:13px;">سجل دفعاتك</b>
    ${rows || '<div class="empty" style="margin-top:6px;">ما أرسلت أي دفعة بعد</div>'}
  </div>`;
}

// تنبيه طلبات الأدمن المفتوحة عند المندوب.
function agentRequestsBannerHtml(agent) {
  if (!agent || agent.ownerType !== 'delivery_agent') return '';
  const open = (data.agentPaymentRequests || []).filter(r => r.agentId === agent.id && r.status === 'open').sort((a, b) => new Date(b.at) - new Date(a.at));
  return open.map(r => `<div class="card" style="border:1px solid #FDE68A; background:#FFFBEB; margin-bottom:8px;">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <span>🔔 <b>الأدمن يطلب منك تسديد ${money(r.amount)}</b> — ${esc(SETTLE_LABELS[r.type] || '')}${r.note ? ' — ' + esc(r.note) : ''}
        <span style="font-size:11px; color:var(--text-mute);">(${new Date(r.at).toLocaleString('ar-IQ')})</span></span>
      <button class="btn small" onclick="openAgentPayModal({type:'${r.type === 'delivery' ? 'delivery' : 'platform'}', amount:${r.amount}, requestId:'${esc(r.id)}'})">دفع الآن</button>
    </div>
  </div>`).join('');
}

// الأدمن: طلبات مفتوحة + دفعات بانتظار قراره (+ متابعة دفعات المندوب للتجار).
function renderAgentPendingPayments(agentId, withMerchantFeed) {
  const all = (data.agentPayments || []).filter(p => p.agentId === agentId);
  const pending = all.filter(p => p.status === 'pending' && payTypeOf(p) !== 'merchant').sort((a, b) => new Date(b.at) - new Date(a.at));
  const rejected = all.filter(p => p.status === 'rejected' && payTypeOf(p) !== 'merchant').sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 3);
  const openReqs = (data.agentPaymentRequests || []).filter(r => r.agentId === agentId && r.status === 'open');
  let html = '';
  if (openReqs.length) {
    html += `<div style="margin-bottom:8px;"><b style="font-size:12.5px;">طلبات دفعة مفتوحة عند المندوب</b>${openReqs.map(r => `<div class="list-item" style="margin-top:4px;">
      <span>📨 ${money(r.amount)} — ${esc(SETTLE_LABELS[r.type] || '')}${r.note ? ' — ' + esc(r.note) : ''} <span style="color:var(--text-mute); font-size:11px;">(${new Date(r.at).toLocaleString('ar-IQ')})</span></span>
      <button class="btn danger small" onclick="cancelPayRequest('${esc(r.id)}')">إلغاء الطلب</button></div>`).join('')}</div>`;
  }
  if (pending.length || rejected.length) {
    html += `<div style="margin-bottom:10px;"><b style="font-size:12.5px;">دفعات بانتظار موافقتك${pending.length ? ' (' + pending.length + ')' : ''}</b>
      ${pending.map(p => `<div class="list-item" style="border:1px solid #FDE68A; background:#FFFBEB; border-radius:8px; padding:8px; margin-top:6px;">
        <span>⏳ ${new Date(p.at).toLocaleString('ar-IQ')} — <b>${money(p.amount)}</b> — <span style="color:#1D4ED8;">${esc(payKindLabel(p))}</span>${p.note ? ' — ' + esc(p.note) : ''}
          <span style="color:var(--text-mute); font-size:11px;">(هل وصلتك؟)</span></span>
        <span style="display:flex; gap:6px;">
          <button class="btn small" onclick="decideAgentPayment('${esc(p.id)}','confirmed')">✓ تم الاستلام</button>
          <button class="btn danger small" onclick="decideAgentPayment('${esc(p.id)}','rejected')">✕ لم يتم الاستلام</button>
        </span></div>`).join('')}
      ${rejected.map(p => `<div style="font-size:11.5px; color:var(--text-mute); padding:4px 0;">✕ لم تُستلم: ${new Date(p.at).toLocaleString('ar-IQ')} — ${money(p.amount)} — ${esc(payKindLabel(p))}${p.rejectReason ? ' — ' + esc(p.rejectReason) : ''}</div>`).join('')}
    </div>`;
  }
  if (withMerchantFeed) {
    const feed = all.filter(p => payTypeOf(p) === 'merchant').sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15);
    if (feed.length) {
      html += `<div style="margin-bottom:10px;"><b style="font-size:12.5px;">دفعات المندوب للتجار (متابعة — التاجر هو اللي يأكد)</b>
        ${feed.map(p => `<div class="list-item"><span>${new Date(p.at).toLocaleString('ar-IQ')} — <b>${money(p.amount)}</b> — ${esc(payKindLabel(p))}${p.note ? ' — ' + esc(p.note) : ''}${p.status === 'rejected' && p.rejectReason ? ' — السبب: ' + esc(p.rejectReason) : ''}</span>
          <span style="font-size:11.5px; color:${PAY_STATUS_COLOR[p.status]};">${payStatusLabel(p)}</span></div>`).join('')}</div>`;
    }
  }
  return html;
}

// سجل الأدمن: دفعات مؤكَّدة (عمولة/توصيل) + سجلات يدوية قديمة.
function renderAgentCashLogs(agentId) {
  const confirmed = (data.agentPayments || []).filter(p => p.agentId === agentId && p.status === 'confirmed' && payTypeOf(p) !== 'merchant')
    .map(p => ({ kind: 'pay', id: p.id, at: p.at, amount: p.amount, label: payKindLabel(p), note: p.note, by: p.decidedBy || '' }));
  const legacy = (data.agentCashLogs || []).filter(l => l.agentId === agentId && !l.paymentId && (l.type || 'platform') !== 'merchant')
    .map(l => ({ kind: 'legacy', id: l.id, at: l.at, amount: l.amount, label: 'عمولة المنصة (سجل قديم)', note: l.note, by: l.by || '' }));
  const logs = confirmed.concat(legacy).sort((a, b) => new Date(b.at) - new Date(a.at));
  if (logs.length === 0) return '<div class="empty">ما فيه أي استلام مؤكَّد من هذا المندوب</div>';
  return logs.map(l => `<div class="list-item">
    <span>${new Date(l.at).toLocaleString('ar-IQ')} — <b>${money(l.amount)}</b> — <span style="color:#1D4ED8;">${esc(l.label)}</span>${l.note ? ' — ' + esc(l.note) : ''} <span style="color:var(--text-mute); font-size:11px;">(${esc(l.by)})</span></span>
    <button class="btn danger small" onclick="${l.kind === 'pay' ? 'deleteAgentPayment' : 'deleteAgentCashLog'}('${esc(l.id)}')">حذف</button>
  </div>`).join('');
}

// صفوف الإكسل لدفعات المندوب (كل الأنواع/الحالات).
function agentPaymentExportRows(agentId) {
  const st = { pending: 'معلّقة', confirmed: 'تم الاستلام', rejected: 'لم يتم الاستلام' };
  const pays = (data.agentPayments || []).filter(p => p.agentId === agentId).map(p => ({
    'المبلغ (د)': p.amount, 'النوع': payKindLabel(p), 'الحالة': st[p.status] || p.status,
    'ملاحظة': p.note || '—', 'بواسطة': p.decidedBy || '—', 'التاريخ': new Date(p.at).toLocaleString('ar-IQ')
  }));
  const legacy = (data.agentCashLogs || []).filter(l => l.agentId === agentId && !l.paymentId).map(l => ({
    'المبلغ (د)': l.amount, 'النوع': 'عمولة المنصة (سجل قديم)', 'الحالة': 'تم الاستلام',
    'ملاحظة': l.note || '—', 'بواسطة': l.by || '—', 'التاريخ': new Date(l.at).toLocaleString('ar-IQ')
  }));
  return pays.concat(legacy);
}

// ---------- جهة التاجر: حسابي مع المندوب ----------
function merchantAgentStatementHtml(merchantId) {
  const orders = data.orders.filter(o => o.merchantId === merchantId && o.deliveryAgentId != null && o.deliveryStatus === 'delivered')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const pays = (data.agentPayments || []).filter(p => payTypeOf(p) === 'merchant' && p.merchantId === merchantId)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (orders.length === 0 && pays.length === 0) {
    return `<div class="card"><div class="card-title">حسابي مع المندوب</div><div class="empty">ما فيه طلبات موصَّلة عن طريق المندوب بعد</div></div>`;
  }
  const splits = orders.map(o => ({ o, s: orderAgentDueSplit(o) }));
  const totalNet = splits.reduce((s, x) => s + x.s.merchantNetDue, 0);
  const received = pays.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0);
  const pendingSum = pays.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, totalNet - received);
  const pendingRows = pays.filter(p => p.status === 'pending').map(p => `<div class="list-item" style="border:1px solid #FDE68A; background:#FFFBEB; border-radius:8px; padding:8px; margin-top:6px;">
    <span>💵 المندوب ${esc(p.agentName || '')} يقول دفع لك <b>${money(p.amount)}</b>${p.note ? ' — ' + esc(p.note) : ''} <span style="color:var(--text-mute); font-size:11px;">(${new Date(p.at).toLocaleString('ar-IQ')})</span></span>
    <span style="display:flex; gap:6px;">
      <button class="btn small" onclick="decideAgentPayment('${esc(p.id)}','confirmed')">✓ تم الاستلام</button>
      <button class="btn danger small" onclick="decideAgentPayment('${esc(p.id)}','rejected')">✕ لم يتم الاستلام</button>
    </span></div>`).join('');
  const history = pays.filter(p => p.status !== 'pending').slice(0, 10).map(p => `<div class="list-item"><span>${new Date(p.at).toLocaleString('ar-IQ')} — <b>${money(p.amount)}</b>${p.agentName ? ' — ' + esc(p.agentName) : ''}${p.status === 'rejected' && p.rejectReason ? ' — ' + esc(p.rejectReason) : ''}</span>
    <span style="font-size:11.5px; color:${PAY_STATUS_COLOR[p.status]};">${payStatusLabel(p)}</span></div>`).join('');
  const orderRows = splits.slice(0, 60).map(({ o, s }) => `<tr>
    <td>${new Date(o.date).toLocaleDateString('ar-IQ')}</td><td>${esc(o.productName || '')}</td>
    <td>${(o.price || 0).toLocaleString()}</td><td>${(o.shippingFee || 0).toLocaleString()}</td>
    <td style="color:#B3261E;">${s.platformCommission.toLocaleString()}</td><td><b>${s.merchantNetDue.toLocaleString()}</b></td></tr>`).join('');
  return `<div class="card">
    <div class="card-title">حسابي مع المندوب</div>
    <div class="subtitle" style="margin-bottom:8px;">المندوب يستلم المبلغ من الزبون ويسدد لك صافيك (سعر الطلب − استقطاع المنصة). كل دفعة يرسلها تظهر هنا وتأكد استلامها.</div>
    <div class="grid3">
      <div class="stat"><div class="stat-num">${totalNet.toLocaleString()}</div><div class="stat-label">صافي مستحق لي (د)</div></div>
      <div class="stat"><div class="stat-num">${received.toLocaleString()}</div><div class="stat-label">مستلم (د)${pendingSum ? ' — بانتظار تأكيدي ' + pendingSum.toLocaleString() : ''}</div></div>
      <div class="stat"><div class="stat-num" style="color:${remaining > 0 ? '#B3261E' : '#065F46'};">${remaining.toLocaleString()}</div><div class="stat-label">المتبقي عند المندوب (د)</div></div>
    </div>
    ${pendingRows}
    ${history ? `<div style="margin-top:10px;"><b style="font-size:12.5px;">سجل الدفعات</b>${history}</div>` : ''}
    ${orderRows ? `<div style="margin-top:10px;"><b style="font-size:12.5px;">تفاصيل الطلبات الموصَّلة</b>
      <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px; text-align:center;">
        <thead><tr style="background:#F1F5F9;"><th>التاريخ</th><th>المنتج</th><th>سعر الطلب (د)</th><th>سعر التوصيل (د)</th><th>استقطاع المنصة (د)</th><th>صافي لي (د)</th></tr></thead>
        <tbody>${orderRows}</tbody></table></div></div>` : ''}
  </div>`;
}
