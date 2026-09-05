// ---------- ROLE-BASED NAV ----------
// Each role only ever sees its own set of tabs — a merchant can never reach another
// merchant's dashboard.
// labelKey points into I18N (see the i18n engine near the top of this script) instead of a
// literal string, so every place that reads a view/permission's display text stays correct
// no matter which language is active — see t(), buildNav(), and labelForPerm() below.
const ADMIN_VIEWS = [
  {id: 'dashboard', labelKey: 'nav_dashboard'},
  {id: 'requests', labelKey: 'nav_requests'},
  {id: 'employees', labelKey: 'nav_employees'},
  {id: 'accounting', labelKey: 'nav_accounting'},
  {id: 'dues', labelKey: 'nav_dues'},
  {id: 'announcements', labelKey: 'nav_announcements'},
  {id: 'support', labelKey: 'nav_support'},
  {id: 'settings', labelKey: 'nav_settings'},
  {id: 'shipping', labelKey: 'nav_shipping'},
  {id: 'admin_tools', labelKey: 'nav_admin_tools'},
  {id: 'store', labelKey: 'nav_store_preview'}
];
const MERCHANT_VIEWS = [{id: 'merchant', labelKey: 'nav_merchant'}];
// Groups the admin sidebar into clear sections instead of one long flat list. Order here is
// what actually decides the on-screen order (ADMIN_VIEWS' own order no longer matters for
// display) — buildNav() below walks these groups and pulls in whichever ADMIN_VIEWS entries
// the current admin/admin-employee is actually allowed to see.
const ADMIN_NAV_GROUPS = [
  { label: 'الرئيسية', ids: ['dashboard'] },
  { label: 'التجار والموظفين', ids: ['requests', 'employees'] },
  { label: 'الحسابات والمالية', ids: ['accounting', 'dues'] },
  { label: 'التواصل والدعم', ids: ['announcements', 'support'] },
  { label: 'الإعدادات والنظام', ids: ['settings', 'shipping', 'admin_tools'] },
  { label: 'أخرى', ids: ['store'] }
];

// Delegable permission sets — what a merchant can hand to their own employee (each maps to
// one sub-tab inside the merchant panel), and what the admin can hand to an admin-team
// employee (each maps to one top-level admin tab). 'employees' itself is never delegable —
// only the real merchant/admin manages who has access. 'admin_tools' is ALSO never delegable
// — it holds admin credential changes, financial resets, and per-merchant admin actions, and
// is deliberately excluded here so it's never offered as a checkbox to any employee, no
// matter how much an admin trusts them. This is enforced again at the firestore.rules level
// (storage/admin-credentials write requires isAdmin()), not just hidden in the UI.
const MERCHANT_EMPLOYEE_PERMS = [
  {id: 'store', labelKey: 'perm_store'},
  {id: 'orders', labelKey: 'perm_orders'},
  {id: 'products', labelKey: 'perm_products'},
  {id: 'appearance', labelKey: 'perm_appearance'},
  {id: 'earnings', labelKey: 'perm_earnings'},
  {id: 'charts', labelKey: 'perm_charts'}
];
const ADMIN_EMPLOYEE_PERMS = ADMIN_VIEWS.filter(v => v.id !== 'employees' && v.id !== 'admin_tools');

function currentEmployee() {
  return loggedInEmployeeId != null ? data.employees.find(e => e.id === loggedInEmployeeId) : null;
}

function viewsForRole(role) {
  if (role === 'admin') return ADMIN_VIEWS;
  if (role === 'merchant') return MERCHANT_VIEWS;
  if (role === 'employee') {
    const emp = currentEmployee();
    if (!emp) return [];
    if (emp.ownerType === 'admin') {
      // 'admin_tools' excluded explicitly here too (defense in depth) — even if an
      // employee's permissions array were ever corrupted/tampered with to include it,
      // this view still wouldn't be offered, and the underlying Firestore writes it
      // triggers are separately blocked at the rules level regardless.
      return ADMIN_VIEWS.filter(v => v.id !== 'employees' && v.id !== 'admin_tools' && emp.permissions.includes(v.id));
    }
    // A merchant's employee always lands on the single merchant tab — which sub-sections
    // they can use inside it is gated separately (see applyEmployeeGating).
    return MERCHANT_VIEWS;
  }
  return [];
}

function buildNav(role) {
  const nav = document.getElementById('nav');
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const list = viewsForRole(role);
  // A single-tab role (merchant) doesn't need a sidebar at all
  const needsNav = list.length > 1;
  sidebar.style.display = needsNav ? 'flex' : 'none';
  toggleBtn.style.display = needsNav ? '' : 'none';

  const renderBtn = (v) => {
    // Nav labels are plain text now (no emoji prefix), so each button is just its label —
    // no icon column to split out.
    return `<button data-view="${v.id}" onclick="showView('${v.id}')"><span>${t(v.labelKey)}</span></button>`;
  };

  if (role === 'admin' || (role === 'employee' && currentEmployee() && currentEmployee().ownerType === 'admin')) {
    // Grouped sidebar with section headers (see ADMIN_NAV_GROUPS) instead of one long flat
    // list of buttons — an admin-team employee only ever sees the sections that still have at
    // least one tab their permissions allow.
    const used = new Set();
    let html = '';
    ADMIN_NAV_GROUPS.forEach(group => {
      const items = list.filter(v => group.ids.includes(v.id));
      if (items.length === 0) return;
      items.forEach(v => used.add(v.id));
      html += `<div class="sidebar-section-label">${group.label}</div>` + items.map(renderBtn).join('');
    });
    const leftovers = list.filter(v => !used.has(v.id)); // defensive: any future view not yet grouped still shows up
    if (leftovers.length > 0) html += `<div class="sidebar-section-label">أخرى</div>` + leftovers.map(renderBtn).join('');
    nav.innerHTML = html;
  } else {
    nav.innerHTML = list.map(renderBtn).join('');
  }
  updateSupportNavBadge();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
  const viewEl = document.getElementById('view-' + id);
  if (viewEl) viewEl.classList.add('active');
  const navBtn = document.querySelector(`#nav button[data-view="${id}"]`);
  if (navBtn) navBtn.classList.add('active');
  closeSidebar(); // on mobile, picking a page should close the drawer
  document.getElementById('main-content').scrollTop = 0;
  renderAll();
}

// ---------- ADMIN DASHBOARD SUB-TABS ----------
// The dashboard is split into sections (overview / charts / merchants / settlements)
// instead of stacking everything on one long page. currentDashTab remembers which
// section is open so re-renders (e.g. from the 5s live-refresh poll) don't reset it.
let currentDashTab = 'overview';
function showDashboardTab(id) {
  currentDashTab = id;
  document.querySelectorAll('#dash-subnav .toggle').forEach(b => b.classList.toggle('selected', b.dataset.dashtab === id));
  document.querySelectorAll('#dashboard-content .dash-tab').forEach(el => el.classList.toggle('active', el.dataset.dashtabContent === id));
  // Chart.js can't size a canvas that was hidden (display:none) when it was drawn,
  // so re-render the charts now that their tab is actually visible.
  if (id === 'charts') renderDashboardCharts();
}

// ---------- SESSION / AUTHENTICATION ----------
let currentRole = null; // 'admin' | 'merchant' | 'employee'
let loggedInEmployeeId = null; // set only when currentRole === 'employee'
// Kept in memory ONLY (never saved/sent anywhere else) for the duration of an admin session,
// so a real password reset (see resetAuthPassword) can prove to the Cloud Function that the
// caller really is the admin, without asking the admin to re-type their own password every time.
let adminSessionCreds = null; // { username, passwordHash } | null

function showHomeScreen() {
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('home-screen').style.display = 'flex';
}

function showLoginScreen() {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
}

function showJoinScreen() {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('join-screen').style.display = 'flex';
  populateAreaSelect('req-area', document.getElementById('req-governorate').value);
}

// One login box, one set of credentials — the account type (admin / merchant)
// is looked up automatically and decides what the person sees next.
// Generic helper: swap a button's label for a spinner + loading text while an async
// action runs, and always restore it afterwards (even if the action throws).
function withBtnLoading(btn, loadingText, fn) {
  if (!btn) return fn();
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>${loadingText}`;
  const restore = () => { btn.disabled = false; btn.innerHTML = original; };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (e) {
    restore();
    throw e;
  }
}

async function platformLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');

  // NEW accounts (approved from now on) use real Firebase Authentication. We try this
  // first since it's the secure path; if it fails for any reason (this is an old-style
  // account that predates this system, wrong password, etc.) we silently fall back to
  // the legacy check below — the person never sees a difference either way.
  if (window.authApi) {
    try {
      const uid = await window.authApi.signIn(username, password);
      // Firestore's security rules now scope 'orders'/'employees' reads to whoever is
      // actually signed in (a merchant/employee only sees their own data; an anonymous
      // visitor sees none). data.merchants/orders/employees were last loaded under the
      // PREVIOUS (anonymous, pre-login) identity, so they won't contain this person's own
      // records yet — refresh right now, under the new authenticated identity, before
      // looking anything up below. Without this, a real employee's very first login
      // attempt would wrongly appear to fail (their own employee doc isn't in `data`
      // yet), even though the password was correct.
      await fetchRemoteData();
      const merchant = data.merchants.find(x => x.authUid === uid && x.status !== 'pending');
      if (merchant) {
        errorBox.textContent = '';
        loggedInMerchantId = merchant.id;
        enterApp('merchant');
        return;
      }
      const employee = data.employees.find(x => x.authUid === uid && x.status === 'active');
      if (employee) {
        errorBox.textContent = '';
        loggedInEmployeeId = employee.id;
        enterApp('employee');
        return;
      }
      // Signed in successfully via Firebase Auth but no matching local record —
      // fall through to the legacy checks below rather than silently failing the login.
    } catch (e) {
      // auth/user-not-found or auth/wrong-password just means: not a new-style account
      // (or wrong password) — fall through to the legacy check, same as before.
    }
  }

  const passwordHash = await hashPassword(password);
  if (username === data.settings.adminUsername && passwordHash === data.settings.adminPassword) {
    // The visible login itself still uses the local username/password check above (so the
    // admin keeps whatever username they've set) — but firestore.rules now requires a REAL
    // signed-in Firebase Auth session before it lets the admin write anything at all. Without
    // this, every save (password changes, merchant approvals, settings...) would look like it
    // worked in the UI and then silently fail at the database.
    if (window.authApi) {
      try {
        const result = await window.authApi.ensureAdminAuth(password);
        if (result && result.justCreated) {
          // First-ever login under the new rules. Firestore Security Rules deliberately
          // block writing the 'admins' collection from inside the app (see firestore.rules) —
          // so this one-time registration step has to happen manually in the Firebase
          // Console. Keep this visible long enough to actually copy it.
          showToast('تم إنشاء حساب الدخول الفعلي — روح Firestore Database وأضف وثيقة بمجموعة admins بمعرّف: ' + result.uid, 15000);
          console.log('Admin Firebase Auth UID (register this in the "admins" collection):', result.uid);
        }
        // Same reason as the employee/merchant path above: data.orders/employees/etc. were
        // last loaded under the PREVIOUS (anonymous, pre-login) identity, so orders/employees
        // reads in that snapshot were denied by firestore.rules and came back empty. Now that
        // ensureAdminAuth() has established a real signed-in Firebase Auth session, refresh
        // everything under the authenticated admin identity before entering the dashboard —
        // otherwise the admin panel shows stale/empty data and "Missing or insufficient
        // permissions" errors even though the login itself succeeded.
        await fetchRemoteData();
      } catch (e) {
        if (e && e.code === 'admin-auth-password-mismatch') {
          errorBox.textContent = 'كلمة المرور تغيّرت محلياً بس ما تزامنت مع حساب الدخول الفعلي — سجّل دخول بكلمة المرور القديمة مرة، أو تواصل معي لإصلاحها';
          return;
        }
        console.error('Admin Firebase Auth setup failed — writes will be denied by firestore.rules until this succeeds:', e);
        errorBox.textContent = 'دخلت بنجاح لكن تعذر تفعيل صلاحيات الحفظ الحقيقية — تأكد من الاتصال بالإنترنت وحاول تسجيل الدخول مرة ثانية';
        return;
      }
    }
    errorBox.textContent = '';
    adminSessionCreds = { username, passwordHash };
    enterApp('admin');
    return;
  }
  const merchant = data.merchants.find(x => x.username === username && x.password === passwordHash && x.status !== 'pending');
  if (merchant) {
    // This account already has a real Firebase Auth login (authUid) — the attempt above at
    // the top of this function already tried that exact username/password against Firebase
    // and failed, yet the OLD locally-cached password hash still matches here. That means the
    // two have drifted out of sync (e.g. a password reset that only touched one side). Letting
    // them into the app anyway would look like a successful login, but every read that needs a
    // real signed-in identity — most importantly the merchant's own orders — would then be
    // silently denied by firestore.rules, making it look like customer orders never arrive.
    // Surface the real problem instead of hiding it behind a broken session.
    if (window.authApi && merchant.authUid) {
      errorBox.textContent = 'كلمة المرور ما تزامنت مع حساب الدخول الفعلي، فراح تدخل بس ما تكدر تشوف الطلبات — تواصل مع الإدارة لتصفير كلمة المرور';
      return;
    }
    errorBox.textContent = '';
    loggedInMerchantId = merchant.id;
    enterApp('merchant');
    return;
  }
  const employee = data.employees.find(x => x.username === username && x.password === passwordHash && x.status === 'active');
  if (employee) {
    // Same reasoning as the merchant case above.
    if (window.authApi && employee.authUid) {
      errorBox.textContent = 'كلمة المرور ما تزامنت مع حساب الدخول الفعلي، فراح تدخل بس ما تكدر تشوف الطلبات — تواصل مع الإدارة لتصفير كلمة المرور';
      return;
    }
    errorBox.textContent = '';
    loggedInEmployeeId = employee.id;
    enterApp('employee');
    return;
  }
  errorBox.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
}

function enterApp(role) {
  currentRole = role;
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  const roleLabels = { admin: 'أدمن', merchant: 'تاجر', employee: 'موظف' };
  document.getElementById('topbar-role').textContent = roleLabels[role] || '';
  let name = '';
  if (role === 'admin') { name = data.settings.adminUsername; applyMerchantDashboardColor(null); }
  if (role === 'merchant') { const m = data.merchants.find(x => x.id === loggedInMerchantId); name = m ? m.shop : ''; applyMerchantDashboardColor(m); }
  if (role === 'employee') {
    const emp = currentEmployee();
    name = emp ? emp.name : '';
    if (emp && emp.ownerType === 'merchant') {
      loggedInMerchantId = emp.merchantId;
      const m = data.merchants.find(x => x.id === emp.merchantId);
      applyMerchantDashboardColor(m || null);
    } else {
      applyMerchantDashboardColor(null);
    }
  }
  document.getElementById('topbar-name').textContent = name;

  buildNav(role);
  if (role === 'admin') showView('dashboard');
  else if (role === 'merchant') showView('merchant');
  else if (role === 'employee') {
    const emp = currentEmployee();
    if (emp && emp.ownerType === 'merchant') {
      showView('merchant');
    } else {
      const views = viewsForRole('employee');
      showView(views.length ? views[0].id : 'dashboard');
    }
  }

  saveSession(role);
  warnIfOrdersLoadDenied();
  updateSupportFab();
}

function platformLogout() {
  currentRole = null;
  loggedInMerchantId = null;
  loggedInEmployeeId = null;
  adminSessionCreds = null;
  ordersLoadDenied = false;
  ordersLoadWarningShown = false;
  applyMerchantDashboardColor(null);
  clearSession();
  if (window.authApi) window.authApi.signOutMain().catch(() => {});
  showLoginScreen();
}

