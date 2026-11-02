// ---------- نموذج الاشتراك الشهري (ربح ثالث للمنصة بجانب العمولات والاستقطاعات الثابتة) ----------
// إضافة بحتة: ما تلمس أبداً حساب الرسوم (calcFee) ولا رسوم الخدمة على الزبون — الاشتراك مبلغ
// منفصل يدفعه التاجر للمنصة كل مدة (بالأيام) يحددها الأدمن، ويُسجَّل كربح مستقل بصفحة "الاشتراكات".
//
// حقول التاجر (كلها قرار أدمن حصراً، ومقفولة بـ firestore.rules ضد تعديل التاجر لنفسه):
//   subscriptionEnabled (bool) — هل التاجر مفعّل عليه الاشتراك
//   subscriptionPrice   (د)    — مبلغ الاشتراك للدورة الواحدة
//   subscriptionDays    (يوم)  — طول الدورة
//   subscriptionEndsAt  (ms)   — لحظة انتهاء الاشتراك الحالي (العدّاد التنازلي يحسب منها)
// سجل المدفوعات data.subscriptionPayments يعيش داخل نفس وثيقة 'platform-settings' (نفس نمط
// agentCashLogs) — فما نحتاج collection ولا rule جديد.
//
// الاشتراك لا يوقف المتجر عند انتهائه (ما طلبت هذا) — بس يبيّن "منتهي" للتاجر والأدمن.

const SUB_DAY_MS = 86400000;
const SUB_HOUR_MS = 3600000;

function subscriptionInfo(m, now) {
  if (!m || !m.subscriptionEnabled) return null;
  now = now || Date.now();
  const total = Math.max(1, Number(m.subscriptionDays) || 30);
  const ends = Number(m.subscriptionEndsAt) || 0;
  const msLeft = ends - now;
  const expired = msLeft <= 0;
  const daysLeft = expired ? 0 : Math.ceil(msLeft / SUB_DAY_MS);
  const ratio = expired ? 0 : Math.min(1, msLeft / (total * SUB_DAY_MS));
  // اللون يتغير مع نزول العدّاد: أخضر → أصفر → برتقالي → أحمر (يومين أو أقل) → أحمر غامق (منتهي)
  let level, color, bg;
  if (expired)            { level = 'expired';  color = '#991B1B'; bg = '#FEE2E2'; }
  else if (daysLeft <= 2) { level = 'critical'; color = '#DC2626'; bg = '#FEE2E2'; }
  else if (ratio <= 0.25) { level = 'warn';     color = '#EA580C'; bg = '#FFEDD5'; }
  else if (ratio <= 0.5)  { level = 'mid';      color = '#A16207'; bg = '#FEF9C3'; }
  else                    { level = 'good';     color = '#15803D'; bg = '#DCFCE7'; }
  let text;
  if (expired) text = 'منتهي';
  else if (msLeft < SUB_DAY_MS) text = `باقي ${Math.max(1, Math.ceil(msLeft / SUB_HOUR_MS))} ساعة`;
  else text = `باقي ${daysLeft} يوم`;
  return { level, color, bg, text, expired, daysLeft, msLeft, ratio, total, ends,
           price: Number(m.subscriptionPrice) || 0, urgent: expired || daysLeft <= 2 };
}
function subFmtDate(ms) {
  return ms ? new Date(ms).toLocaleDateString('en-GB') : '—';
}
function subFmtMoney(n) { return (Number(n) || 0).toLocaleString() + ' د'; }

// ---------- صفحة التاجر: شريط العدّاد التنازلي ----------
function renderMerchantSubscriptionBanner(m) {
  const info = subscriptionInfo(m);
  if (!info) return '';
  const pct = Math.round(info.ratio * 100);
  return `
    <div class="card sub-banner" style="border:1.5px solid ${info.color}; background:${info.bg};">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div>
          <div class="card-title" style="margin:0;">اشتراك المنصة</div>
          <div class="subtitle" style="margin:2px 0 0;">${info.expired ? 'انتهى بتاريخ' : 'ينتهي بتاريخ'} ${subFmtDate(info.ends)}</div>
        </div>
        <div style="color:${info.color}; font-size:22px; font-weight:800;">${info.text}</div>
      </div>
      <div class="sub-bar"><div style="width:${pct}%; background:${info.color};"></div></div>
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:12.5px; margin-top:8px;">
        <span>المبلغ المستحق للاشتراك القادم: <b style="color:${info.color};">${subFmtMoney(info.price)}</b></span>
        <span style="color:var(--text-mute);">مدة الاشتراك ${info.total} يوم</span>
      </div>
      ${info.expired ? '<div style="margin-top:6px; font-size:12px; color:#991B1B; font-weight:700;">اشتراكك منتهي — تواصل مع الإدارة لتجديده</div>' : ''}
    </div>`;
}

// ---------- صفحة الأدمن "الاشتراكات" ----------
function subscribedMerchantsSorted() {
  const now = Date.now();
  return data.merchants
    .filter(m => m.subscriptionEnabled)
    .map(m => ({ m, info: subscriptionInfo(m, now) }))
    // الأقرب للانتهاء (والمنتهي) أول الصفحة
    .sort((a, b) => (a.info.ends - b.info.ends));
}

function renderSubscriptions() {
  const listEl = document.getElementById('sub-list');
  if (!listEl || currentRole !== 'admin') return;
  const rows = subscribedMerchantsSorted();
  const payments = data.subscriptionPayments || [];

  // --- أرباح الاشتراكات ---
  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const nowD = new Date();
  const monthTotal = payments.filter(p => {
    const d = new Date(p.at);
    return d.getFullYear() === nowD.getFullYear() && d.getMonth() === nowD.getMonth();
  }).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const activeCount = rows.filter(r => !r.info.expired).length;
  const urgentCount = rows.filter(r => r.info.level === 'critical').length;
  const expiredCount = rows.filter(r => r.info.expired).length;
  const stat = (num, label, color) => `
    <div class="stat"><div class="stat-num" style="font-size:15px;${color ? ` color:${color};` : ''}">${num}</div><div class="stat-label">${label}</div></div>`;
  document.getElementById('sub-stats').innerHTML =
    stat(subFmtMoney(total), 'إجمالي أرباحي من الاشتراكات', '#15803D') +
    stat(subFmtMoney(monthTotal), 'أرباح هذا الشهر', '#15803D') +
    stat(activeCount, 'اشتراكات فعّالة') +
    stat(urgentCount, 'ينتهي خلال يومين', urgentCount ? '#DC2626' : '') +
    stat(expiredCount, 'منتهية', expiredCount ? '#991B1B' : '') +
    stat(payments.length, 'عدد الدفعات المسجلة');

  // --- قائمة المشتركين ---
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="empty">ما فيه تجار مفعّل عليهم اشتراك — فعّل اشتراك لتاجر من النموذج تحت</div>';
  } else {
    const urgentRows = rows.filter(r => r.info.urgent);
    const head = urgentRows.length
      ? `<div style="background:#FEE2E2; color:#991B1B; border-radius:8px; padding:8px 10px; font-size:12.5px; font-weight:700; margin-bottom:8px;">⚠️ ${urgentRows.length} ${urgentRows.length === 1 ? 'تاجر اشتراكه' : 'تجار اشتراكهم'} ينتهي خلال يومين أو منتهي — بأول القائمة</div>`
      : '';
    listEl.innerHTML = head + rows.map(({ m, info }) => `
      <div class="list-item" style="flex-direction:column; align-items:stretch; gap:6px; border:1.5px solid ${info.urgent ? info.color : 'transparent'}; background:${info.urgent ? info.bg : 'transparent'}; border-radius:10px; padding:10px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <b>${esc(m.shop)}</b>
          <span style="color:${info.color}; font-weight:800; font-size:15px;">${info.text}</span>
        </div>
        <div class="sub-bar"><div style="width:${Math.round(info.ratio * 100)}%; background:${info.color};"></div></div>
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:12px; color:var(--text-mute);">
          <span>المبلغ: <b style="color:var(--ink);">${subFmtMoney(info.price)}</b> كل ${info.total} يوم</span>
          <span>${info.expired ? 'انتهى' : 'ينتهي'} ${subFmtDate(info.ends)}</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn small" onclick="subRenew(${m.id})">تجديد ${info.total} يوم (+${subFmtMoney(info.price)})</button>
          <button class="btn secondary small" onclick="openSubEdit(${m.id})">تعديل</button>
          <button class="btn danger small" onclick="subStop(${m.id})">إيقاف الاشتراك</button>
        </div>
      </div>`).join('');
  }

  // --- قائمة التجار بنموذج التفعيل (بدون ما نمسح اللي كتبه الأدمن) ---
  const sel = document.getElementById('sub-new-merchant');
  if (sel) {
    const cur = sel.value;
    const options = data.merchants.filter(m => !m.subscriptionEnabled);
    sel.innerHTML = '<option value="">اختر التاجر</option>' + options.map(m => `<option value="${m.id}">${esc(m.shop)}</option>`).join('');
    if (cur && options.some(m => String(m.id) === cur)) sel.value = cur;
  }

  // --- سجل الدفعات (آخر ٣٠) ---
  const payEl = document.getElementById('sub-payments');
  if (payEl) {
    payEl.innerHTML = payments.length === 0
      ? '<div class="empty">ما فيه دفعات مسجلة بعد</div>'
      : payments.slice(0, 30).map(p => `
        <div class="list-item" style="justify-content:space-between; gap:8px; font-size:12.5px;">
          <span><b>${esc(p.shop || '')}</b> <span style="color:var(--text-mute);">— ${p.kind === 'activate' ? 'تفعيل' : 'تجديد'} ${p.days} يوم · ${new Date(p.at).toLocaleDateString('en-GB')}</span></span>
          <span style="display:flex; align-items:center; gap:8px;"><b style="color:#15803D;">${subFmtMoney(p.amount)}</b>
          <button class="btn danger small" style="margin:0; padding:2px 8px;" onclick="subDeletePayment('${esc(p.id)}')">حذف</button></span>
        </div>`).join('');
  }
}

function subRecordPayment(m, amount, days, kind) {
  if (!Array.isArray(data.subscriptionPayments)) data.subscriptionPayments = [];
  data.subscriptionPayments.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    merchantId: m.id, shop: m.shop, amount: Number(amount) || 0, days, kind, at: Date.now()
  });
}

async function subActivate() {
  if (currentRole !== 'admin') return;
  const m = data.merchants.find(x => String(x.id) === document.getElementById('sub-new-merchant').value);
  const days = Math.floor(parseFloat(document.getElementById('sub-new-days').value) || 0);
  const price = Math.max(0, parseFloat(document.getElementById('sub-new-price').value) || 0);
  const paid = document.getElementById('sub-new-paid').checked;
  if (!m) { showToast('اختر التاجر أول'); return; }
  if (days < 1) { showToast('اكتب عدد الأيام (يوم واحد على الأقل)'); return; }
  m.subscriptionEnabled = true;
  m.subscriptionDays = days;
  m.subscriptionPrice = price;
  m.subscriptionEndsAt = Date.now() + days * SUB_DAY_MS;
  if (paid && price > 0) subRecordPayment(m, price, days, 'activate');
  await saveData();
  logAudit('تفعيل اشتراك لتاجر', `${m.shop} — ${days} يوم / ${fmtNum(price)} د`);
  document.getElementById('sub-new-merchant').value = '';
  showToast(`تم تفعيل اشتراك "${m.shop}" لمدة ${days} يوم`);
  renderAll();
}

function subRenew(id) {
  if (currentRole !== 'admin') return;
  const m = data.merchants.find(x => x.id === id);
  if (!m || !m.subscriptionEnabled) return;
  const days = Math.max(1, Number(m.subscriptionDays) || 30);
  const price = Number(m.subscriptionPrice) || 0;
  openConfirmModal('تجديد الاشتراك',
    `تجديد اشتراك "${m.shop}" لمدة ${days} يوم وتسجيل ${fmtNum(price)} د ضمن أرباحك من الاشتراكات؟ (إذا اشتراكه لسا ما انتهى، الأيام تنضاف فوق المتبقي)`,
    async () => {
      const base = Math.max(Date.now(), Number(m.subscriptionEndsAt) || 0);
      m.subscriptionEndsAt = base + days * SUB_DAY_MS;
      if (price > 0) subRecordPayment(m, price, days, 'renew');
      await saveData();
      logAudit('تجديد اشتراك تاجر', `${m.shop} — ${days} يوم / ${fmtNum(price)} د`);
      showToast(`تم تجديد اشتراك "${m.shop}"`);
      renderAll();
    });
}

function subStop(id) {
  if (currentRole !== 'admin') return;
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  openConfirmModal('إيقاف الاشتراك', `إيقاف الاشتراك عن "${m.shop}"؟ يختفي العدّاد من لوحته، وسجل دفعاته السابقة يبقى محسوب بأرباحك.`, async () => {
    m.subscriptionEnabled = false;
    await saveData();
    logAudit('إيقاف اشتراك تاجر', m.shop);
    showToast(`تم إيقاف اشتراك "${m.shop}"`);
    renderAll();
  });
}

function subDeletePayment(paymentId) {
  if (currentRole !== 'admin') return;
  const p = (data.subscriptionPayments || []).find(x => x.id === paymentId);
  if (!p) return;
  openConfirmModal('حذف دفعة', `حذف دفعة ${subFmtMoney(p.amount)} الخاصة بـ"${p.shop}" من سجل أرباح الاشتراكات؟ (ما يغيّر مدة الاشتراك، بس ينقص من إجمالي الأرباح)`, async () => {
    data.subscriptionPayments = data.subscriptionPayments.filter(x => x.id !== paymentId);
    await saveData();
    logAudit('حذف دفعة اشتراك', `${p.shop} — ${fmtNum(p.amount)} د`);
    renderAll();
  });
}

// ---------- تعديل اشتراك تاجر (المبلغ / الدورة / الأيام المتبقية يدوياً) ----------
let subEditId = null;
function openSubEdit(id) {
  if (currentRole !== 'admin') return;
  const m = data.merchants.find(x => x.id === id);
  if (!m) return;
  subEditId = id;
  document.getElementById('sub-edit-title').textContent = `تعديل اشتراك — ${m.shop}`;
  document.getElementById('sub-edit-price').value = Number(m.subscriptionPrice) || 0;
  document.getElementById('sub-edit-days').value = Number(m.subscriptionDays) || 30;
  document.getElementById('sub-edit-remaining').value = '';
  document.getElementById('sub-edit-modal').classList.add('show');
}
function closeSubEdit() {
  subEditId = null;
  document.getElementById('sub-edit-modal').classList.remove('show');
}
async function confirmSubEdit() {
  if (currentRole !== 'admin') return;
  const m = data.merchants.find(x => x.id === subEditId);
  if (!m) return;
  const price = Math.max(0, parseFloat(document.getElementById('sub-edit-price').value) || 0);
  const days = Math.floor(parseFloat(document.getElementById('sub-edit-days').value) || 0);
  const remRaw = document.getElementById('sub-edit-remaining').value.trim();
  if (days < 1) { showToast('عدد أيام الدورة لازم يكون يوم أو أكثر'); return; }
  m.subscriptionPrice = price;
  m.subscriptionDays = days;
  if (remRaw !== '') {
    const rem = Math.max(0, parseFloat(remRaw) || 0);
    m.subscriptionEndsAt = Date.now() + rem * SUB_DAY_MS;
  }
  await saveData();
  logAudit('تعديل اشتراك تاجر', `${m.shop} — ${days} يوم / ${fmtNum(price)} د${remRaw !== '' ? ` / متبقي ${remRaw} يوم` : ''}`);
  closeSubEdit();
  showToast(`تم حفظ تعديلات اشتراك "${m.shop}"`);
  renderAll();
}

// ---------- تحديث حي للعدّاد (كل دقيقة) بدون ما ننتظر تغيّر بالبيانات ----------
// الأيام/الألوان تعتمد على الوقت الحالي، فلو التاجر تارك الصفحة مفتوحة لازم العدّاد ولونه
// يتحدثون لحالهم — renderAll الأصلي ما يشتغل إلا لما تتغير البيانات نفسها.
setInterval(() => {
  try {
    if (currentRole === 'admin') {
      const v = document.getElementById('view-subscriptions');
      if (v && v.classList.contains('active')) renderSubscriptions();
    } else if (currentRole === 'merchant' && typeof loggedInMerchantId !== 'undefined' && loggedInMerchantId) {
      const el = document.getElementById('merchant-subscription-banner');
      const m = data.merchants.find(x => x.id === loggedInMerchantId);
      if (el && m) el.innerHTML = renderMerchantSubscriptionBanner(m);
    }
  } catch (e) { /* تحديث شكلي فقط — ما يستاهل يوقف شي */ }
}, 60000);
