// ---------- LIVE AUTO-REFRESH ----------
// The screen only loaded data once, on page open. So if a customer placed an order from
// their phone while a merchant/admin had their screen open, the order was
// saved correctly to the shared database — but the open screen never knew to look again,
// and only showed it after a manual full page reload. This quietly re-checks the database
// every 5 seconds and refreshes the on-screen view (without a page reload) whenever new
// data has arrived, as long as nobody is mid-typing or has a popup open (so it never yanks
// away something the person is in the middle of doing).
//
// This used to read a key called 'platform-data' that nothing in Firebase mode ever writes
// (an old single-blob storage design), then briefly watched 'platform-settings' version
// bumps instead. BOTH were silent no-ops for the exact cases that matter most: a brand new
// merchant submitting a join request, a customer placing an order, or a merchant
// accepting/cancelling one. None of those people are the admin, and firestore.rules only
// lets the real admin write 'platform-settings' — so the version field they were watching
// almost never actually moved, and the admin's screen sat stale until a manual reload.
//
// Instead of trusting a signal only the admin can move, this now looks at the real data:
// it re-fetches on every tick and compares a lightweight fingerprint (ids + statuses) of
// merchants/orders/employees against what's currently on screen. It only re-renders if
// something in that fingerprint actually changed, so an idle tick with no news is cheap
// and doesn't flicker the UI.
function dataFingerprint() {
  const orders = data.orders.map(o => `${o.id}:${o.status}:${o.deliveryStatus || ''}:${o.cancelled ? 1 : 0}:${o.cancelStage || ''}`).join(',');
  const merchants = data.merchants.map(m => `${m.id}:${m.status}:${m.customDomain || ''}:${(m.commissionRequests || []).map(r => r.id + '-' + r.status).join('.')}`).join(',');
  const employees = data.employees.map(e => `${e.id}:${e.status}`).join(',');
  const announcements = (data.announcements || []).map(a => `${a.id}:${(a.readBy || []).length}`).join(',');
  const supportChats = (data.supportChats || []).map(c => `${c.authUid}:${c.messages.length}:${c.unreadForAdmin ? 1 : 0}:${c.unreadForMerchant ? 1 : 0}`).join(',');
  const ledgerClosures = (data.ledgerClosures || []).map(c => `${c.id}`).join(',');
  return `${orders}|${merchants}|${employees}|${announcements}|${supportChats}|${ledgerClosures}`;
}

async function pollForUpdates() {
  try {
    // The support chat modal is deliberately excluded from this check — a chat needs to
    // keep refreshing while it's open (see pollSupportChat below), unlike every other modal
    // here which is a one-shot form the person is actively filling in.
    const openModal = document.querySelector('.modal-overlay.show:not(#support-chat-modal)');
    const active = document.activeElement;
    const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) && active.id !== 'support-chat-input';
    // Also skip while an order write from THIS tab is still in flight — otherwise this
    // fetch can land between "we changed an order locally" and "that write actually
    // reached Firestore", pull the still-old remote copy, and stomp the local change right
    // back (accept/reject/cancel appearing to silently fail until repeated or reloaded).
    if (openModal || isTyping || pendingOrderWrites > 0) return; // try again next tick instead

    const before = dataFingerprint();
    await fetchRemoteData(); // re-fetches settings + merchants + orders + employees and normalizes them, without re-routing the screen
    warnIfOrdersLoadDenied();
    // The open support chat modal (if any) has its own re-render below, independent of the
    // fingerprint short-circuit, so a reply lands even if nothing else on the page changed.
    if (document.getElementById('support-chat-modal').classList.contains('show')) renderSupportChatMessages(true);
    // Guest order-tracking results (searchMyOrders) had no live refresh at all — a customer
    // had to manually hit "بحث" again to see a merchant's/admin's cancel decision land,
    // which is exactly the "status doesn't update quickly" complaint. Re-run the same
    // lookup they already did. Placed BEFORE the fingerprint short-circuit below: a guest
    // has no read access to the real orders collection at all, so their fingerprint never
    // moves and that check would otherwise always skip this.
    if (trackOrderMerchantId && lastTrackedGroups.length) searchMyOrders(true);
    if (dataFingerprint() === before) return; // nothing else actually changed, skip the rest of the re-render

    // Refresh whichever screen is actually on-screen right now
    if (document.getElementById('app-shell').style.display !== 'none') {
      if (currentRole === 'admin') renderAll();
      else if (currentRole === 'merchant') renderMerchantPanel();
      else if (currentRole === 'employee') {
        const emp = currentEmployee();
        if (emp && emp.ownerType === 'merchant') renderMerchantPanel();
        else renderAll();
      }
      // نظام تنبيه الطلبات الجديدة — loggedInMerchantId موجود سواء كان الداخل تاجر
      // نفسه أو موظف تابع له (يتحدد وقت تسجيل الدخول)، فيغطي الحالتين بسطر واحد.
      if ((currentRole === 'merchant' || currentRole === 'employee') && loggedInMerchantId) {
        const alertMerchant = data.merchants.find(x => x.id === loggedInMerchantId);
        if (alertMerchant) checkForNewOrdersAndAlert(alertMerchant);
      }
      updateSupportFab();
    } else if (publicStoreMerchantId && document.getElementById('public-store-screen').style.display !== 'none') {
      renderStorefrontInto(publicStoreMerchantId, document.getElementById('public-storefront-content'));
    }
  } catch (e) {
    console.error('Live refresh error:', e);
  }
}
setInterval(pollForUpdates, 5000);

// App boot: set up storage (Firebase, or the local fallback if that fails) first,
// THEN load saved data. routeOnLoad() (called at the end of loadData) decides whether
// to show a merchant's public store link, or the login screen.
// The boot-loading screen stays up (covering the empty login form) until this whole
// chain actually finishes, so the person never sees a flash of an unready page.
function hideBootLoading() {
  const el = document.getElementById('boot-loading');
  if (el) el.classList.add('hide');
}

initLang(); // applies saved/default language + RTL/LTR + static chrome text before anything else renders
initStorage().then(async () => {
  await loadData();
  hideBootLoading();
  if (window.__usingLocalFallback) {
    // Give this its own delay so it doesn't get lost among other startup toasts.
    setTimeout(() => {
      showToast('تعذر الاتصال بقاعدة البيانات المركزية — تعمل الآن ببيانات محفوظة على هذا المتصفح فقط ولن تتزامن مع الأجهزة الأخرى. تحقق من الإنترنت وأعد تحميل الصفحة.', 6000);
    }, 800);
  }
}).catch(() => {
  // Even if something above throws, never leave the person staring at a frozen loading screen.
  hideBootLoading();
});
