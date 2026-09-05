// ---------- REAL BACKEND STORAGE (Firebase Firestore) ----------
// All merchants, customers, and the admin read/write the SAME data, from any device,
// any browser, anywhere — because it's stored centrally on Firebase, not in the local browser.
//
// IMPORTANT: Firebase is loaded below with a *dynamic* import() inside a try/catch —
// not a static "import ... from ..." at the top of the file. A static import that fails
// to load (blocked CDN, dropped connection, ad-blocker, etc.) stops this ENTIRE module
// script from ever running — meaning every button on the whole page, including the
// login button, would silently do nothing, with no visible error. A dynamic import lets
// us catch that failure here and keep the app usable (with a clear warning) instead of
// the whole page going dead.
const firebaseConfig = {
  apiKey: "AIzaSyA-yka-khM2bHXEJULXp2jG9A6jXuQ8510",
  authDomain: "billionaire-e8b22.firebaseapp.com",
  projectId: "billionaire-e8b22",
  storageBucket: "billionaire-e8b22.firebasestorage.app",
  messagingSenderId: "505538118485",
  appId: "1:505538118485:web:b18514aa14d9c87632a5dc",
  measurementId: "G-9T6RZW451P"
};

window.__usingLocalFallback = false;

async function initStorage() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut: authSignOut, updatePassword } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
    const firebaseApp = initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    const auth = getAuth(firebaseApp);
    const functionsApi = getFunctions(firebaseApp);

    // Secondary, fully isolated Auth instance used ONLY when the admin creates a new
    // merchant account. Firebase's client SDK auto-signs-in as whatever account you just
    // created — without this second instance, approving a merchant would silently log the
    // admin out of their own session and into the new merchant's account instead.
    const secondaryApp = initializeApp(firebaseConfig, "account-creation");
    const secondaryAuth = getAuth(secondaryApp);

    // Firebase Authentication only understands emails, not usernames — so every username
    // in this app maps deterministically to a fake, never-emailed address on a fixed domain.
    // The person never sees this; they keep typing a plain username everywhere in the UI.
    const emailFor = (username) => username.trim().toLowerCase().replace(/\s+/g, '') + '@billionaire.local';

    // The admin's real Firebase Auth identity uses ONE fixed internal email, separate from
    // their visible username (which the admin can rename anytime in Settings). If it were
    // derived from the username like merchants/employees, renaming the admin username would
    // orphan the old Firebase Auth account and break write access until manually fixed. This
    // fixed identity never changes; only its password is kept in sync with whatever password
    // the admin currently uses to log in.
    const ADMIN_AUTH_EMAIL = 'platform-admin@billionaire.local';

    window.authApi = {
      emailFor,
      async signIn(username, password) {
        const cred = await signInWithEmailAndPassword(auth, emailFor(username), password);
        return cred.user.uid;
      },
      async signOutMain() { await authSignOut(auth); },
      async createAccount(username, password) {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, emailFor(username), password);
        await authSignOut(secondaryAuth); // clean up the isolated session — admin's own login is untouched
        return cred.user.uid;
      },
      // Establishes a REAL Firebase Auth session for the admin — required for isAdmin() in
      // firestore.rules to grant write access at all. Tries signing in with whatever password
      // the admin just typed on the login screen; if no such Firebase account exists yet
      // (very first login after this feature was added) or the stored Auth password has
      // drifted out of sync, it (re)creates/repairs it in place using that same password so
      // the two stay identical going forward. Returns the UID so the caller can tell the
      // admin, on first run, to register it once in the 'admins' collection (Console-only —
      // firestore.rules deliberately blocks writing that collection from the app itself).
      async ensureAdminAuth(password) {
        try {
          const cred = await signInWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
          return { uid: cred.user.uid, justCreated: false };
        } catch (e) {
          if (e && e.code === 'auth/user-not-found') {
            const cred = await createUserWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
            return { uid: cred.user.uid, justCreated: true };
          }
          // Newer Firebase projects have Email Enumeration Protection enabled by default,
          // which makes the sign-in API return the generic 'auth/invalid-credential' for
          // BOTH "no such account" and "wrong password" instead of distinguishing them like
          // older projects did with 'auth/user-not-found' / 'auth/wrong-password'. So on
          // 'auth/invalid-credential' we first try to create the account (covers the "no
          // such account yet" case); if an account already exists, creation itself will fail
          // with 'auth/email-already-in-use', which tells us it was really a wrong-password
          // situation.
          if (e && e.code === 'auth/invalid-credential') {
            try {
              const cred = await createUserWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
              return { uid: cred.user.uid, justCreated: true };
            } catch (createErr) {
              if (createErr && createErr.code === 'auth/email-already-in-use') {
                const err = new Error('admin-auth-password-mismatch');
                err.code = 'admin-auth-password-mismatch';
                throw err;
              }
              throw createErr;
            }
          }
          if (e && e.code === 'auth/wrong-password') {
            // A Firebase account exists but with an older password (e.g. it was changed
            // locally before this sync existed). Only fixable while already signed in as
            // that same account, which we're not — surface this so the caller can tell the
            // admin plainly instead of failing every write silently forever.
            const err = new Error('admin-auth-password-mismatch');
            err.code = 'admin-auth-password-mismatch';
            throw err;
          }
          throw e;
        }
      },
      // Keeps the admin's real Firebase Auth password identical to whatever password they
      // just set locally (Settings → admin credentials). Uses the client SDK's own
      // "change my own password" call — no Cloud Function needed here, unlike resetting
      // someone ELSE's password, because the admin IS currently signed in as this account.
      async syncAdminAuthPassword(newPassword) {
        if (!auth.currentUser) return false;
        await updatePassword(auth.currentUser, newPassword);
        return true;
      },
      // Changing a merchant/employee's REAL Firebase Auth password can only be done from a
      // trusted server, never from another user's browser — the client SDK only allows a user
      // to change their own password. This calls the 'resetUserPassword' Cloud Function (see
      // /functions in the project — must be deployed once with `firebase deploy --only functions`)
      // which uses the Admin SDK to do it for real. It proves the caller is really the admin by
      // sending the same admin username + password hash this app already trusts for admin login;
      // the function independently re-checks those against Firestore before touching anything.
      async resetAuthPassword(targetUsername, newPassword, adminUsername, adminPasswordHash) {
        const call = httpsCallable(functionsApi, 'resetUserPassword');
        const res = await call({ targetUsername, newPassword, adminUsername, adminPasswordHash });
        return res.data; // { updatedAuth: true, uid } or { updatedAuth: false } if no real account existed yet
      },
      async getPublicDoc(collectionName, uid) {
        const snap = await getDoc(doc(db, collectionName, uid));
        return snap.exists() ? snap.data() : null;
      },
      async getPrivateDoc(collectionName, uid) {
        const snap = await getDoc(doc(db, collectionName, uid));
        return snap.exists() ? snap.data() : null;
      },
      async saveDoc(collectionName, uid, payload) {
        // merge:true so a partial payload (e.g. a guest customer patching just their
        // cancellation-request fields on an order they don't have full read access to)
        // only touches the fields it actually sends, instead of silently wiping out every
        // other field on the document. Every other caller in this file always sends its
        // full known object anyway, so this is a no-op change for them.
        await setDoc(doc(db, collectionName, uid), payload, { merge: true });
      },
      async deleteDoc(collectionName, uid) {
        await deleteDoc(doc(db, collectionName, uid));
      },
      async listCollection(collectionName) {
        const snap = await getDocs(collection(db, collectionName));
        return snap.docs.map(d => ({ _uid: d.id, ...d.data() }));
      },
      // The Firebase Auth uid of whoever is signed in right now, or null if nobody is
      // (public storefront visitor). Needed outside this closure to decide which query to
      // run for 'orders' — see listOrdersByMerchant below and fetchRemoteData().
      currentUid() {
        return auth.currentUser ? auth.currentUser.uid : null;
      },
      // Firestore's own rule (see firestore.rules: "queries are all-or-nothing") means an
      // UNFILTERED getDocs(collection('orders')) can only ever succeed for a caller whose
      // access doesn't depend on each document's data — i.e. the real admin or an admin
      // employee. A merchant/merchant-employee's access rule (isMerchantSelf /
      // isMerchantEmployeeWithAny) DOES depend on each order's merchantAuthUid field, so an
      // unfiltered query is denied for the WHOLE collection even though plenty of the
      // documents in it are theirs. The fix is a query that already carries the same
      // where('merchantAuthUid','==', ...) the rule expects, so Firestore can verify every
      // possible matching document passes before running it.
      async listOrdersByMerchant(merchantAuthUid) {
        const snap = await getDocs(query(collection(db, 'orders'), where('merchantAuthUid', '==', merchantAuthUid)));
        return snap.docs.map(d => ({ _uid: d.id, ...d.data() }));
      },
      // Same "all-or-nothing" problem as listOrdersByMerchant above, but for 'employees':
      // firestore.rules' isOwningMerchantOfEmployee() depends on each employee doc's
      // merchantId field, so an unfiltered getDocs(collection('employees')) is denied for
      // the WHOLE collection for a merchant (or their employee) even though some of those
      // documents are theirs to see. Filtering by the same merchantId the rule checks lets
      // Firestore verify every possible matching document passes before running the query.
      async listEmployeesByMerchant(merchantId) {
        const snap = await getDocs(query(collection(db, 'employees'), where('merchantId', '==', merchantId)));
        return snap.docs.map(d => ({ _uid: d.id, ...d.data() }));
      }
    };

    // Same get/set(key, value, shared) shape the rest of this file already expects,
    // so nothing else in the app needs to change — just what's underneath it.
    window.storage = {
      async get(key) {
        const ref = doc(db, "storage", key);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('key not found');
        return { key, value: snap.data().value };
      },
      async set(key, value) {
        const ref = doc(db, "storage", key);
        await setDoc(ref, { value });
        return { key, value };
      }
    };
  } catch (e) {
    // Firebase failed to load or connect (blocked CDN, no internet, ad-blocker, temporary
    // outage, etc). Fall back to this browser's own local storage so the app still works
    // instead of freezing completely — but flag it so we can warn whoever is using it that
    // their data is NOT syncing with other devices/browsers right now.
    console.error('Firebase failed to load — falling back to local-only storage on this browser:', e);
    window.__usingLocalFallback = true;
    window.storage = {
      async get(key) {
        const raw = localStorage.getItem('local-fallback:' + key);
        if (raw === null) throw new Error('key not found');
        return { key, value: raw };
      },
      async set(key, value) {
        localStorage.setItem('local-fallback:' + key, value);
        return { key, value };
      }
    };
  }
}

const STORAGE_KEY = 'platform-data-v1';
const IRAQ_GOVERNORATES = [
  'بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','الأنبار','ديالى','كركوك',
  'واسط','ذي قار','بابل','ميسان','المثنى','القادسية','صلاح الدين','دهوك','السليمانية'
];
// Districts/areas per governorate (أقضية ونواحي وأهم المناطق) — used to populate the
// "المنطقة" dropdown once a customer/merchant picks a governorate. Baghdad gets a longer,
// neighborhood-level list since almost all traffic on the platform is from there; the rest
// use their main administrative districts (أقضية), which is the practical level of detail
// people actually address deliveries to.
const AREAS_BY_GOVERNORATE = {
  'بغداد': [
    'الكرادة','الجادرية','زيونة','المنصور','اليرموك','الحارثية','العلاوي','الكاظمية','الأعظمية',
    'الوزيرية','الشعب','حي أور','البياع','الدورة','الغزالية','الجهاد','الرشيد','المشتل','النهروان',
    'الزعفرانية','المدائن','أبو غريب','الطارمية','التاجي','الحرية','الشعلة','سبع البور','مدينة الصدر',
    'الأمين','بغداد الجديدة','السيدية','العامل','الخضراء','الوشاش','حي الجامعة','الكرخ','الرصافة',
    'باب المعظم','الفضل','الصالحية','المسبح','المحمودية','اليوسفية','الكاظمية القديمة','حي الجهاد',
    'زايونة','الرياض','الإعلام','قناة'
  ],
  'البصرة': [
    'مركز البصرة','أبو الخصيب','الزبير','شط العرب','القرنة','المدينة','الفاو','الدير',
    'العشار','الجزائر','الأندلس','الجمهورية','التنومة','الحيانية','الكويت (منطقة)','الهارثة','النشوة'
  ],
  'نينوى': [
    'الموصل','تلعفر','سنجار','الحضر','البعاج','الشيخان','تلكيف','الحمدانية (قره قوش)','مخمور','بعشيقة'
  ],
  'أربيل': [
    'أربيل','عنكاوة','شقلاوة','كويسنجق','سوران','رواندوز','خبات','حرير','مخمور'
  ],
  'النجف': ['النجف','الكوفة','المناذرة','المشخاب'],
  'كربلاء': ['كربلاء','عين التمر','الهندية (طويريج)'],
  'الأنبار': ['الرمادي','الفلوجة','هيت','حديثة','عنه','القائم','الرطبة','الحبانية','الكرمة'],
  'ديالى': ['بعقوبة','المقدادية','الخالص','بلدروز','خانقين','بني سعد','الوجيهية','خالص'],
  'كركوك': ['مركز كركوك','الحويجة','داقوق','دبس','الرياض'],
  'واسط': ['الكوت','الحي','النعمانية','الصويرة','بدرة','العزيزية','الشحيمية'],
  'ذي قار': ['الناصرية','سوق الشيوخ','الرفاعي','الشطرة','الجبايش','قلعة سكر','الفجر','الإصلاح'],
  'بابل': ['الحلة','المحاويل','المسيب','الهاشمية','القاسم','المدحتية'],
  'ميسان': ['العمارة','المجر الكبير','الكحلاء','قلعة صالح','علي الغربي','الميمونة'],
  'المثنى': ['السماوة','الرميثة','الخضر','السلمان'],
  'القادسية': ['الديوانية','عفك','الشامية','الحمزة','غماس'],
  'صلاح الدين': ['تكريت','سامراء','بيجي','الدور','بلد','الشرقاط','الضلوعية'],
  'دهوك': ['دهوك','زاخو','عقرة','سميل','آميدي','بردرش'],
  'السليمانية': ['السليمانية','حلبجة','رانية','دوكان','پنجوين','چمچمال','دربندیخان']
};
// Fills an area <select> based on the chosen governorate, keeping the current value if it's
// still valid (e.g. re-rendering after a save) and always adding "أخرى" as a fallback since
// this list can't cover every neighborhood.
function populateAreaSelect(selectId, governorate, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const areas = allAreasForGovernorate(governorate);
  const options = areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  sel.innerHTML = `<option value="">اختر المنطقة</option>${options}<option value="أخرى">أخرى</option>`;
  if (currentValue && areas.includes(currentValue)) sel.value = currentValue;
}
// Built-in areas for a governorate plus any custom ones a merchant or the admin has added
// (data.settings.customAreas) — merged so a newly-registered area shows up for every store,
// not just the one that added it. See registerCustomArea().
function allAreasForGovernorate(governorate) {
  const builtIn = AREAS_BY_GOVERNORATE[governorate] || [];
  const custom = (data.settings.customAreas && data.settings.customAreas[governorate]) || [];
  const seen = new Set();
  const merged = [];
  [...builtIn, ...custom].forEach(a => { if (a && !seen.has(a)) { seen.add(a); merged.push(a); } });
  return merged;
}
// Adds a brand-new area name to the shared, platform-wide list for a governorate (idempotent).
// Used both by the admin's general shipping-zone settings and by a merchant with own-delivery
// enabled who wants to price a neighborhood that isn't in the built-in list yet.
function registerCustomArea(governorate, areaName) {
  const name = (areaName || '').trim();
  if (!governorate || !name) return false;
  if (!data.settings.customAreas) data.settings.customAreas = {};
  if (!Array.isArray(data.settings.customAreas[governorate])) data.settings.customAreas[governorate] = [];
  if (allAreasForGovernorate(governorate).includes(name)) return false; // already exists, built-in or custom
  data.settings.customAreas[governorate].push(name);
  return true;
}
// The 4 social platforms a merchant can add to their storefront — each has a URL field and
// its own visibility toggle (see ensureMerchantTheme). label/icon used in both the merchant's
// edit form and the public storefront buttons, so they always match.
const SOCIAL_PLATFORMS = [
  { key: 'facebook', label: 'فيسبوك' },
  { key: 'instagram', label: 'انستغرام' },
  { key: 'twitter', label: 'تويتر (X)' },
  { key: 'tiktok', label: 'تيكتوك' }
];
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// Every product/category/coupon/review/etc. below used to get its id from `data.nextId++` —
// a single counter synced across sessions only by the ~5s live-refresh poll. Two sessions
// (the merchant on their phone and their own employee on a desktop, say — or even the same
// merchant with two tabs open) that each created something in that same window both read the
// same stale nextId and produced the exact same id for two DIFFERENT products in the same
// merchant's own product list. Since every lookup here is `m.products.find(x => x.id ===
// productId)`, which always returns the first match, tapping the second (colliding) product's
// card silently opened the first one instead — "أضغط على منتج يطلعلي منتج غير". This generates
// an id from the current millisecond plus a random component instead, so two sessions can't
// collide without literally creating a record in the exact same millisecond AND rolling the
// same random number — no cross-session coordination needed at all.
function genId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }

let data = {
  version: 0,
  merchants: [],
  orders: [],
  employees: [],
  // Admin -> merchants broadcast messages (see ANNOUNCEMENTS section). Lives inside the same
  // 'platform-settings' doc as settings/nextId/version, so it inherits the exact same
  // admin-only write protection firestore.rules already enforces there — no new collection
  // or rule needed. { id, text, createdAt, target: 'all' | number[] (merchant ids), readBy: number[] }
  announcements: [],
  // Daily ledger closures ("تسوية/إغلاق يومية"). Each entry closes ONE (merchant, day) page of
  // the daily settlements ledger for one or both sides, after that day's dues were paid out.
  // Only the admin can create these (see closeLedgerDay()) — a merchant never gets a delete
  // control on their own ledger. { id, dateKey:'YYYY-MM-DD', merchantId, scope: 'both'|'admin'|'merchant',
  // closedAt, closedBy }. scope 'both' actually deletes the underlying orders for that
  // merchant+day (so no lingering record is needed); 'admin' / 'merchant' just hide that page
  // from the matching side while leaving the real order data untouched. Lives inside the same
  // 'platform-settings' doc as settings/nextId/version/announcements — no new collection or
  // rule needed.
  ledgerClosures: [],
  // Audit trail of sensitive admin-level actions (approve/reject/delete a merchant, reset a
  // password, change admin credentials, ...). See logAudit() below. Lives in its own doc
  // ('audit-log', shared/admin-write) so it never competes with the version-conflict logic
  // that guards 'platform-settings'.
  auditLog: [],
  // Merchant <-> admin support chat threads. Each merchant has at most one thread, keyed by
  // their Firebase Auth uid (see SUPPORT CHAT section below) — one Firestore doc per merchant
  // in the 'support_chats' collection, fetched/merged the same way as 'employees'/'orders'.
  // { authUid, merchantId, merchantShop, messages:[{id, from:'merchant'|'admin', text, ts}],
  //   unreadForAdmin, unreadForMerchant, updatedAt }. Ending the session (admin action) deletes
  // the doc entirely, wiping the conversation for both sides — see endSupportSession().
  supportChats: [],
  settings: {
    feeSource: 'customer',
    feeType: 'fixed',
    feeAmount: 500,
    feeCustomer: 500,
    feeMerchant: 500,
    itemDeduction: 0,
    shippingEnabled: true,
    shippingAmount: 1000,
    shippingZones: [
      { id: 'z1', name: 'بغداد', fastPrice: 4000, slowPrice: 2000 },
      { id: 'z2', name: 'باقي المحافظات', fastPrice: 7000, slowPrice: 4000 }
    ],
    adminUsername: 'admin',
    adminPassword: 'admin123',
    customAreas: {}
  },
  nextId: 1
};

// Passwords are never stored or compared in plain text — only their SHA-256 hash is kept.
// This means once a password is set, nobody (including the admin) can "see" it again —
// only reset it to a new value. That's the correct, secure pattern for handling credentials.
async function hashPassword(plain) {
  const bytes = new TextEncoder().encode(String(plain));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function looksHashed(str) {
  return typeof str === 'string' && /^[0-9a-f]{64}$/.test(str);
}
// Persists the admin's username/password hash to their own protected doc — separate from
// saveData()/platform-settings so that no delegable employee permission (settings, shipping,
// or anything else) can ever write these fields; firestore.rules only allows the real admin
// (isAdmin()) to write storage/admin-credentials. Best-effort like the rest of saveData()'s
// per-collection writes — a permission-denied here (e.g. called before the admin's real
// Firebase Auth session exists) is expected and silently ignored rather than surfaced.
async function saveAdminCredentials() {
  try {
    await window.storage.set('admin-credentials', JSON.stringify({
      adminUsername: data.settings.adminUsername,
      adminPassword: data.settings.adminPassword
    }), true);
    return true;
  } catch (e) {
    if (!(e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')))) {
      console.error('Failed to save admin credentials:', e);
    }
    return false;
  }
}
// One-time migration: any credential still stored as plain text (old demo data, or data
// saved before hashing existed) gets hashed in place the first time it's loaded.
async function migratePlainTextPasswords() {
  let changed = false;
  if (data.settings.adminPassword && !looksHashed(data.settings.adminPassword)) {
    data.settings.adminPassword = await hashPassword(data.settings.adminPassword);
    changed = true;
    saveAdminCredentials(); // separate doc/permission from the rest of saveData() below
  }
  for (const m of data.merchants) {
    if (m.password && !looksHashed(m.password)) { m.password = await hashPassword(m.password); changed = true; }
  }
  for (const e of data.employees) {
    if (e.password && !looksHashed(e.password)) { e.password = await hashPassword(e.password); changed = true; }
  }
  if (changed) await saveData();
}

// Backfills any fields older/incoming employee records might be missing so the rest of the
// app never has to null-check them.
function ensureEmployeeDefaults(e) {
  if (!Array.isArray(e.permissions)) e.permissions = [];
  if (!e.status) e.status = 'pending';
  if (!e.ownerType) e.ownerType = 'merchant';
  if (typeof e.name !== 'string') e.name = '';
  if (typeof e.phone !== 'string') e.phone = '';
  if (typeof e.username !== 'string') e.username = '';
  if (typeof e.password !== 'string') e.password = '';
  return e;
}

// Merchants/orders now live in their own protected Firestore documents
// (see initStorage) instead of one shared blob. This map remembers the last-synced JSON of
// every order so saveData() only re-writes orders that actually changed, instead of
// re-uploading the entire order history on every single save.
let lastSyncedOrderSnapshots = new Map();
// Counts order writes currently in flight to Firestore. The 5s live-refresh poll
// (see pollForUpdates in 17-live-refresh-boot.js) checks this before overwriting local
// `data` with a fresh fetch — otherwise a poll tick landing between "we changed an order
// locally" and "that write actually reached Firestore" would fetch the still-old remote
// copy and stomp the local change right back, making an action (cancel, accept, reject...)
// look like it silently failed until the person repeats it or reloads a few times.
let pendingOrderWrites = 0;
// Same idea, but for merchants — and much more important here than it was for orders.
// saveData() used to unconditionally re-write EVERY merchant's full document on every single
// save, no matter which merchant the action was actually about. For a regular merchant/
// employee session that's harmless (firestore.rules rejects the writes to every OTHER
// merchant's doc, so only their own goes through) — but the admin CAN write every merchant's
// doc. So an admin deleting one product, or approving/rejecting one commission-exemption
// request, resaved every merchant in the admin's local (possibly stale) in-memory cache —
// silently overwriting any product another merchant had added/edited/deleted moments earlier
// on their own device, before the admin's next 5-second poll caught up. That looked exactly
// like "deleting a product / responding to a commission request affects every merchant's
// products". This map lets saveData() skip any merchant whose data hasn't actually changed
// locally since it was last synced, the same way lastSyncedOrderSnapshots already does for
// orders — so only the merchant that was genuinely just edited gets written.
let lastSyncedMerchantSnapshots = new Map();
// Set inside fetchRemoteData() when 'orders' comes back permission-denied while someone is
// actually signed into the app (see the comment there) — checked right after login and on
// every live-refresh tick so the person gets told plainly instead of just seeing an
// inexplicably empty orders list forever.
let ordersLoadDenied = false;
let ordersLoadWarningShown = false;
function warnIfOrdersLoadDenied() {
  if (!ordersLoadDenied || ordersLoadWarningShown) return;
  ordersLoadWarningShown = true;
  showToast('تعذر تحميل الطلبات — جلستك مو متصلة بشكل صحيح، سجّل خروج وادخل مرة ثانية. إذا استمرت المشكلة تواصل مع الإدارة', 8000);
}

// Fetches settings + merchants + orders from storage and normalizes them, without touching
// which screen is currently showing. Split out from loadData() so the live-refresh poller
// (which must never re-route someone away from the screen they're already on) can call this
// part alone, while the initial page-boot loadData() below still also routes afterward.
// True for a Firestore "permission-denied" rejection specifically — the EXPECTED result
// when a signed-out visitor (or a merchant/employee without the right role) tries to list
// a collection that firestore.rules now restricts (orders, employees, employee_requests).
// Used below to keep the console clean for that expected case while still surfacing any
// OTHER failure (network drop, misconfigured rules deploy, quota, ...) loudly as before.
function isPermissionDeniedError(e) {
  return !!(e && (e.code === 'permission-denied' || /missing or insufficient permissions/i.test(e.message || '')));
}

async function fetchRemoteData() {
  try {
    // Pricing/shipping settings + the shared id counter live in one small doc — writable by
    // 'settings'-permission employees too, publicly readable (customers need fee/shipping-zone
    // info to price their own orders). Admin login credentials are NOT in here anymore — see
    // 'admin-credentials' below — so an employee with 'settings' access can never touch them.
    const result = await window.storage.get('platform-settings', true);
    if (result && result.value) {
      const loaded = JSON.parse(result.value);
      data.settings = { ...data.settings, ...(loaded.settings || {}) };
      data.nextId = loaded.nextId || data.nextId;
      data.version = loaded.version || 0;
      data.announcements = Array.isArray(loaded.announcements) ? loaded.announcements : (data.announcements || []);
      data.ledgerClosures = Array.isArray(loaded.ledgerClosures) ? loaded.ledgerClosures : (data.ledgerClosures || []);
    }
  } catch (e) {
    if (e && e.message !== 'key not found') console.error('Storage error while loading settings:', e);
  }
  loadedVersion = data.version || 0;

  try {
    // Admin login credentials (username + password hash) — kept in their own doc, writable
    // only by the real admin (see firestore.rules), so no delegable employee permission can
    // ever reach them even with direct SDK access. Publicly readable because the login screen
    // has to compare against them locally before any Firebase Auth session exists.
    const credResult = await window.storage.get('admin-credentials', true);
    if (credResult && credResult.value) {
      const loadedCreds = JSON.parse(credResult.value);
      if (loadedCreds.adminUsername) data.settings.adminUsername = loadedCreds.adminUsername;
      if (loadedCreds.adminPassword) data.settings.adminPassword = loadedCreds.adminPassword;
    }
  } catch (e) {
    if (e && e.message !== 'key not found') console.error('Storage error while loading admin credentials:', e);
  }

  try {
    // Audit trail — same publicly-readable/admin-writable shape as admin-credentials, so
    // everyone's live-refresh can display it but only a real admin session can ever append
    // to it (see logAudit below and the matching firestore.rules entry it needs).
    const auditResult = await window.storage.get('audit-log', true);
    if (auditResult && auditResult.value) {
      const loadedAudit = JSON.parse(auditResult.value);
      if (Array.isArray(loadedAudit)) data.auditLog = loadedAudit;
    }
  } catch (e) {
    if (e && e.message !== 'key not found') console.error('Storage error while loading audit log:', e);
  }

  if (window.authApi) {
    // 'orders' needs special handling before the batch below fires. An UNFILTERED
    // getDocs(collection('orders')) can only ever succeed for the real admin or an admin
    // employee — Firestore denies a "list" query for the WHOLE collection if the rule's
    // answer can vary per document and the query itself doesn't already carry a matching
    // where() clause (see listOrdersByMerchant's comment, and firestore.rules' own
    // "queries are all-or-nothing" note on order_tracking, for why). A merchant's rule
    // (isMerchantSelf) and a merchant-employee's rule (isMerchantEmployeeWithAny) both
    // depend on each order's merchantAuthUid field, so the old unfiltered call here was
    // being denied for the ENTIRE collection for those two roles — even for their own
    // orders. That's the exact bug where a merchant's page never shows any customer order.
    // Figure out, before firing the batch, whether the signed-in identity is a merchant or
    // a merchant's employee, and if so which merchant's orders to filter by.
    let ordersPromise;
    // 'employees' has the EXACT same all-or-nothing problem as 'orders' (see below) —
    // isOwningMerchantOfEmployee() in firestore.rules depends on each employee doc's
    // merchantId, so an unfiltered listCollection('employees') is denied for the WHOLE
    // collection for a merchant or their employee, even for their own records. This is
    // the actual bug behind "a newly-added employee disappears from the employees list"
    // (the merchant's fetchRemoteData() never got their employees back at all — it was
    // silently swallowed as an expected permission-denied) AND "an employee's login
    // throws an error even though their username/password is correct in Firebase" (that
    // employee's own fetchRemoteData(), called right after Firebase Auth sign-in inside
    // platformLogin(), also got denied, so their own record wasn't in `data.employees`
    // yet for platformLogin()'s lookup to find). Fixed the same way orders was fixed:
    // figure out the right merchantId to filter by BEFORE firing the batch below.
    let employeesPromise;
    try {
      const uid = window.authApi.currentUid();
      let filterAuthUid = null;
      let employeeFilterMerchantId = null;
      let ownEmployeeDocOnly = null;
      if (uid) {
        const ownMerchant = data.merchants.find(m => m.authUid === uid);
        if (ownMerchant) {
          filterAuthUid = ownMerchant.authUid;
          // Only a merchant reading THEIR OWN uid's employees passes
          // isOwningMerchantOfEmployee() (it requires merchants/{request.auth.uid} to
          // exist) — so this merchantId-filtered list is only valid when WE are the
          // merchant, never when we're one of their employees (see the ownerType ===
          // 'merchant' branch below, which deliberately does NOT reuse this).
          employeeFilterMerchantId = ownMerchant.id;
        } else {
          // Not a merchant themselves — a direct get() on their own employee doc (always
          // allowed by the rules) tells us if they're a merchant's employee, without
          // depending on the (separately restricted) full 'employees' list below.
          const empDoc = await window.authApi.getPrivateDoc('employees', uid).catch(() => null);
          if (empDoc && empDoc.ownerType === 'merchant' && empDoc.status === 'active') {
            const owningMerchant = data.merchants.find(m => m.id === empDoc.merchantId);
            if (owningMerchant && owningMerchant.authUid) filterAuthUid = owningMerchant.authUid;
            // NOT employeeFilterMerchantId here on purpose: isOwningMerchantOfEmployee()
            // needs merchants/{request.auth.uid} to exist, which is false for an
            // employee's own uid, so a merchantId-filtered list of the whole team would
            // still be denied for this identity (Firestore can't prove every possible
            // matching doc — i.e. every colleague's doc — passes the rule for THIS
            // caller). Merchant employees don't have an 'employees' permission anyway
            // (see MERCHANT_EMPLOYEE_PERMS) — they only ever need their own doc, which
            // IS covered by the direct request.auth.uid == empUid clause in the rule.
            ownEmployeeDocOnly = { _uid: uid, ...empDoc };
          } else if (empDoc && empDoc.ownerType === 'admin') {
            // Admin employees are deliberately NOT delegated any access to the full
            // 'employees' collection (see firestore.rules comment: employee management
            // isn't delegable, not even to an admin employee) — the rule only lets them
            // read their OWN doc. Wrap it as a single-item "list" so at least their own
            // login/session lookup (data.employees.find(...)) still works.
            ownEmployeeDocOnly = { _uid: uid, ...empDoc };
          }
          // Otherwise: the real admin, or an anonymous/unmatched identity — the
          // unfiltered listCollection('orders'/'employees') below already covers those.
        }
      }
      ordersPromise = filterAuthUid ? window.authApi.listOrdersByMerchant(filterAuthUid) : window.authApi.listCollection('orders');
      employeesPromise = ownEmployeeDocOnly
        ? Promise.resolve([ownEmployeeDocOnly])
        : (employeeFilterMerchantId != null
            ? window.authApi.listEmployeesByMerchant(employeeFilterMerchantId)
            : window.authApi.listCollection('employees'));
    } catch (e) {
      // Any failure while figuring this out just falls back to the old unfiltered attempt
      // — never worse than before this fix.
      ordersPromise = window.authApi.listCollection('orders');
      employeesPromise = window.authApi.listCollection('employees');
    }

    // Each collection is fetched independently now (Promise.allSettled instead of
    // Promise.all) so that a permission-denied on ANY one of them — e.g. a Firestore rule
    // that restricts who can list a given collection — doesn't wipe out everything else.
    // Before this change, one denied collection silently emptied the entire app (storefront,
    // dashboards, everything) for that visitor, because a single failed promise inside
    // Promise.all rejects the whole batch.
    const [merchantsRes, ordersRes, joinReqRes, employeesRes, employeeReqRes, supportChatsRes] = await Promise.allSettled([
      window.authApi.listCollection('merchants'),
      ordersPromise,
      window.authApi.listCollection('join_requests'),
      employeesPromise,
      window.authApi.listCollection('employee_requests'),
      window.authApi.listCollection('support_chats')
    ]);

    if (merchantsRes.status === 'fulfilled') {
      const merchantPubs = merchantsRes.value;
      // Each merchant's private balance/sales-count doc is fetched separately and on its own
      // try/catch: a visitor who isn't that merchant (or their employee/admin) is *expected*
      // to be denied here by the security rules — that must not stop the public storefront
      // (product list, shop name, theme...) from loading for everyone else.
      const merchantPrivs = await Promise.all(merchantPubs.map(async m => {
        try { return await window.authApi.getPrivateDoc('merchant_private', m._uid); }
        catch (e) { return null; }
      }));
      const approvedMerchants = merchantPubs.map((m, i) => ({ ...m, ...(merchantPrivs[i] || { balance: 0, salesCount: 0 }), authUid: m._uid }));
      // Pending join requests (submitted by anyone, not yet approved — no login account exists
      // for them yet) live in their own collection so an anonymous visitor can create one
      // without needing write access to anything else.
      let pendingMerchants = [];
      if (joinReqRes.status === 'fulfilled') {
        pendingMerchants = joinReqRes.value.map(r => { const { _uid, ...rest } = r; return rest; });
      } else {
        // Couldn't list pending join requests (e.g. admin-only read rule and we're not the
        // admin) — keep whatever pending entries we already had locally instead of dropping them.
        pendingMerchants = data.merchants.filter(m => m.status === 'pending' && !m.authUid);
      }
      data.merchants = [...approvedMerchants, ...pendingMerchants];
      // Baseline the "last synced" snapshot to what the server actually has right now, so
      // saveData()'s diff (see lastSyncedMerchantSnapshots above) compares against reality —
      // not against whatever this admin's session happened to save last.
      approvedMerchants.forEach(m => {
        const { password: _pw, balance: _b, salesCount: _s, authUid: _a, ...publicFields } = m;
        lastSyncedMerchantSnapshots.set(m.authUid, JSON.stringify(publicFields));
      });
    } else {
      console.error('Storage error while loading merchants:', merchantsRes.reason);
    }

    if (ordersRes.status === 'fulfilled') {
      data.orders = ordersRes.value.map(o => { const { _uid, ...rest } = o; return rest; });
      data.orders.forEach(o => lastSyncedOrderSnapshots.set(o.id, JSON.stringify(o)));
      ordersLoadDenied = false;
    } else if (!isPermissionDeniedError(ordersRes.reason)) {
      // Expected for any signed-out visitor or non-admin/non-merchant session now that
      // firestore.rules restricts orders — that case is silent on purpose (see
      // isPermissionDeniedError above). Anything else (network, misconfigured rules, ...)
      // still gets logged loudly like before.
      console.error('Storage error while loading orders:', ordersRes.reason);
    } else if (currentRole === 'merchant' || currentRole === 'employee' || currentRole === 'admin') {
      // Permission-denied is only "expected" for an anonymous/logged-out visitor. If we get
      // here while someone is actually inside the app (merchant/employee/admin), their real
      // Firebase Auth session must be missing or broken — this is exactly the bug where a
      // merchant appears logged in but never sees any customer orders. Surface it once instead
      // of failing silently forever.
      ordersLoadDenied = true;
    }

    // Same pattern as merchants: an active employee (admin already set a username/password)
    // lives in 'employees' keyed by its auth uid; a not-yet-approved employee request
    // (submitted by a merchant, waiting on the admin) lives in 'employee_requests' keyed by id.
    let activeEmployees = data.employees.filter(e => e.authUid);
    if (employeesRes.status === 'fulfilled') {
      activeEmployees = employeesRes.value.map(e => { const { _uid, ...rest } = e; return { ...rest, authUid: _uid }; });
    } else if (!isPermissionDeniedError(employeesRes.reason)) {
      // Expected for any visitor who isn't an admin, that employee themselves, or the
      // owning merchant — see isPermissionDeniedError above.
      console.error('Storage error while loading employees:', employeesRes.reason);
    }
    let pendingEmployees = data.employees.filter(e => !e.authUid);
    if (employeeReqRes.status === 'fulfilled') {
      pendingEmployees = employeeReqRes.value.map(r => { const { _uid, ...rest } = r; return rest; });
    } else if (!isPermissionDeniedError(employeeReqRes.reason)) {
      // Expected for any visitor who isn't the admin or the owning merchant — see
      // isPermissionDeniedError above.
      console.error('Storage error while loading employee requests:', employeeReqRes.reason);
    }
    data.employees = [...activeEmployees, ...pendingEmployees];

    // Merchant support chats — firestore.rules only grants LIST on this collection to the
    // admin/support-permission employee (an unfiltered list query can't be scoped to "just
    // my own doc" server-side, same reason order_tracking uses get-only). A merchant instead
    // gets their own single doc via a targeted get() below — allowed by isMerchantSelf().
    if (supportChatsRes.status === 'fulfilled') {
      data.supportChats = supportChatsRes.value.map(c => { const { _uid, ...rest } = c; return { ...rest, authUid: c.authUid || _uid }; });
    } else if (!isPermissionDeniedError(supportChatsRes.reason)) {
      console.error('Storage error while loading support chats:', supportChatsRes.reason);
    } else if (currentRole === 'merchant' && loggedInMerchantId != null) {
      const m = data.merchants.find(x => x.id === loggedInMerchantId);
      if (m && m.authUid) {
        try {
          const own = await window.authApi.getPrivateDoc('support_chats', m.authUid);
          if (own) {
            const idx = data.supportChats.findIndex(c => c.authUid === m.authUid);
            if (idx >= 0) data.supportChats[idx] = { ...own, authUid: m.authUid };
            else data.supportChats.push({ ...own, authUid: m.authUid });
          } else {
            // getPrivateDoc() resolves to null (not a thrown error) when the doc genuinely
            // doesn't exist on the server — which is exactly what happens right after the
            // admin ends the session (endSupportSession deletes the Firestore doc outright).
            // The old code only ever ADDED/UPDATED the local entry here and never removed
            // one, so a merchant's browser kept showing the ended chat's messages and unread
            // badge forever — "the support session never ends or gets deleted" from their
            // side, even though it really was deleted on the server. Drop the stale local
            // copy so a fresh session starts clean next time they open the chat.
            data.supportChats = data.supportChats.filter(c => c.authUid !== m.authUid);
          }
        } catch (e) { /* offline or a real error — keep whatever's already in memory */ }
      }
    }
  }
  if (!Array.isArray(data.supportChats)) data.supportChats = [];
  data.supportChats.forEach(c => {
    if (!Array.isArray(c.messages)) c.messages = [];
    if (typeof c.unreadForAdmin !== 'boolean') c.unreadForAdmin = false;
    if (typeof c.unreadForMerchant !== 'boolean') c.unreadForMerchant = false;
  });

  if (!Array.isArray(data.employees)) data.employees = [];
  data.employees.forEach(ensureEmployeeDefaults);
  await migratePlainTextPasswords();
  data.merchants.forEach(ensureMerchantTheme);
  data.orders.forEach(o => {
    if (!o.status) o.status = 'accepted';
    if (!o.deliveryStatus) o.deliveryStatus = 'none';
    if (typeof o.itemDeduction !== 'number') o.itemDeduction = 0;
    if (typeof o.cancelled !== 'boolean') o.cancelled = false;
    // ---- Customer-initiated cancellation request pipeline ----
    // cancelStage walks: 'none' -> 'customer_requested' (customer asked, merchant must
    // confirm with them first) -> 'merchant_approved' (merchant confirmed + wrote their own
    // note, now awaiting the admin's final say) -> back to 'none' (either side undid it) or
    // finalized by setting o.cancelled = true via the existing cancel fields.
    if (!o.cancelStage) o.cancelStage = 'none';
    if (typeof o.cancelRequestReason !== 'string') o.cancelRequestReason = '';
    if (!o.cancelRequestedAt) o.cancelRequestedAt = null;
    if (typeof o.merchantCancelNote !== 'string') o.merchantCancelNote = '';
    if (!o.merchantCancelAt) o.merchantCancelAt = null;
  });
  if (typeof data.settings.itemDeduction !== 'number') data.settings.itemDeduction = 0;
  if (!Array.isArray(data.settings.shippingZones) || data.settings.shippingZones.length === 0) {
    data.settings.shippingZones = [
      { id: 'z1', name: 'بغداد', fastPrice: 4000, slowPrice: 2000 },
      { id: 'z2', name: 'باقي المحافظات', fastPrice: 7000, slowPrice: 4000 }
    ];
  }
  if (!data.settings.adminPassword) data.settings.adminPassword = 'admin123';
  if (!data.settings.adminUsername) data.settings.adminUsername = 'admin';
  if (!data.settings.feeType) data.settings.feeType = 'fixed';
  // Custom areas added by merchants or the admin beyond the built-in AREAS_BY_GOVERNORATE
  // list — shared platform-wide (see populateAreaSelect) so a new area entered by one
  // merchant's own-delivery pricing is also usable in checkout for every other store.
  if (!data.settings.customAreas || typeof data.settings.customAreas !== 'object') data.settings.customAreas = {};
  if (!Array.isArray(data.announcements)) data.announcements = [];
  data.announcements.forEach(a => { if (!Array.isArray(a.readBy)) a.readBy = []; });
  if (!Array.isArray(data.ledgerClosures)) data.ledgerClosures = [];
}

async function loadData() {
  await fetchRemoteData();
  routeOnLoad();
}

