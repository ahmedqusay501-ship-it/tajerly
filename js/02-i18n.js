// ---------- I18N (multi-language support) ----------
// PHASE 1 of the multi-language rollout: the engine itself, language switcher, RTL/LTR
// handling, and full coverage of the "shared chrome" every visitor sees regardless of role
// (boot screen, login, join screen, public storefront header/footer, topbar, sidebar label,
// legal modal buttons) plus every nav/permission label (ADMIN_VIEWS, MERCHANT_VIEWS,
// MERCHANT_EMPLOYEE_PERMS, ADMIN_EMPLOYEE_PERMS below). Deep panel-specific content
// (dashboard tables, accounting, settings forms, employee management, shipping, admin
// tools, the merchant panel's own tabs, checkout/tracking modal bodies, toasts) is NOT
// translated yet — that's hundreds more individual strings across render*() functions,
// meant to be converted panel-by-panel in follow-up passes so each section can be tested
// on its own instead of one giant risky sweep.
const SUPPORTED_LANGS = ['ar', 'en', 'ku'];
const LANG_DIR = { ar: 'rtl', en: 'ltr', ku: 'rtl' };
const LANG_NATIVE_NAME = { ar: 'العربية', en: 'English', ku: 'کوردی' };

const I18N = {
  ar: {
    boot_note: 'جاري تجهيز الصفحة...',
    login_title: 'تسجيل الدخول',
    login_username_label: 'اسم المستخدم',
    login_username_placeholder: 'اسم المستخدم',
    login_password_label: 'كلمة المرور',
    login_password_placeholder: 'كلمة المرور',
    login_btn: 'دخول',
    login_btn_loading: 'جاري الدخول...',
    login_no_account: 'تاجر جديد ما عندك حساب؟',
    login_join_link: 'قدّم طلب انضمام',
    login_legal_link: 'الشروط والأحكام وسياسة الخصوصية',
    login_about_link: 'نبذة عن المنصة',
    brand_tagline_login: 'منصة التجارة الإلكترونية المتكاملة',
    home_brand_tag: 'متجرك الإلكتروني مجاناً — بدون اشتراك شهري',
    home_login_title: 'تسجيل الدخول',
    home_login_sub: 'عندك حساب؟ ادخل من هنا',
    home_join_title: 'تقديم طلب انضمام',
    home_join_sub: 'تاجر جديد؟ افتح متجرك مجاناً',
    back_to_home_link: '→ رجوع للصفحة الرئيسية',
    join_title: 'طلب انضمام تاجر جديد',
    join_form_title: 'عبّي بياناتك',
    join_form_sub: 'راح تراجع الإدارة طلبك وترسلك بيانات دخول حسابك بعد الموافقة',
    join_about_link: 'نبذة عن المنصة قبل لا تسجل',
    join_name_label: 'اسمك',
    join_name_placeholder: 'مثلاً: احمد محمد',
    join_shop_label: 'اسم المحل',
    join_shop_placeholder: 'مثلاً: محل احمد للملابس',
    join_phone_label: 'رقم الهاتف',
    join_governorate_label: 'المحافظة',
    join_area_label: 'المنطقة/الحي',
    join_category_label: 'محله بشنو مختص',
    join_description_label: 'وصف مختصر عن محلك وشنو نوع البضاعة اللي تبيعها',
    join_description_placeholder: 'مثلاً: نبيع ملابس رجالية تركية الصنع، أسعار متوسطة، توصيل لكل العراق',
    join_daily_orders_label: 'كم طلب متوقع يجيك باليوم تقريباً؟',
    join_daily_orders_placeholder: 'مثلاً: 5',
    join_daily_orders_note: 'يرجى كتابة عدد الطلبات الحقيقية بكل شفافية، هذا الرقم يساعدنا نجهزلك الخدمة المناسبة',
    join_submit_btn: 'إرسال الطلب',
    join_submit_loading: 'جاري الإرسال...',
    join_have_account: 'عندك حساب مسبقاً؟',
    join_back_to_login: 'رجوع لتسجيل الدخول',
    join_legal_link: 'الشروط والأحكام وسياسة الخصوصية',
    track_order_btn: 'تتبع طلبي',
    public_footer_made_by: 'تم إنشاء هذا المتجر مجاناً بواسطة موقع تاجرلي —',
    public_footer_get_store: 'للحصول على متجر اضغط هنا',
    public_footer_legal: 'الشروط وسياسة الخصوصية',
    sidebar_menu_label: 'القائمة',
    sidebar_toggle_aria: 'القائمة',
    topbar_welcome: 'مرحباً،',
    topbar_logout: 'تسجيل خروج',
    lang_switcher_label: 'اللغة',
    nav_dashboard: 'لوحة التحكم',
    nav_requests: 'طلبات التجار',
    nav_announcements: 'رسائل للتجار',
    nav_employees: 'الموظفين',
    nav_accounting: 'الحسابات',
    nav_dues: 'المستحقات',
    nav_settings: 'إعدادات التسعير',
    nav_shipping: 'التوصيل',
    nav_admin_tools: 'إجراءات حساسة',
    nav_store_preview: 'معاينة المتاجر',
    nav_support: 'دعم التجار',
    nav_merchant: 'لوحة متجري',
    perm_store: 'المتجر',
    perm_orders: 'الطلبات',
    perm_products: 'المنتجات',
    perm_appearance: 'المظهر',
    perm_earnings: 'الأرباح والحسابات',
    perm_charts: 'الرسوم البيانية'
  },
  en: {
    boot_note: 'Getting things ready...',
    login_title: 'Sign In',
    login_username_label: 'Username',
    login_username_placeholder: 'Username',
    login_password_label: 'Password',
    login_password_placeholder: 'Password',
    login_btn: 'Sign in',
    login_btn_loading: 'Signing in...',
    login_no_account: "New merchant, don't have an account?",
    login_join_link: 'Submit a join request',
    login_legal_link: 'Terms & Privacy Policy',
    login_about_link: 'About the platform',
    brand_tagline_login: 'The all-in-one e-commerce platform',
    home_brand_tag: 'Your online store, free — no monthly subscription',
    home_login_title: 'Log In',
    home_login_sub: 'Already have an account? Sign in here',
    home_join_title: 'Submit a Join Request',
    home_join_sub: 'New merchant? Open your store for free',
    back_to_home_link: '→ Back to home',
    join_title: 'New Merchant Application',
    join_form_title: 'Fill in your details',
    join_form_sub: "The admin team will review your request and send your login details once approved",
    join_about_link: 'About the platform before you sign up',
    join_name_label: 'Your name',
    join_name_placeholder: 'e.g. Ahmed Mohammed',
    join_shop_label: 'Shop name',
    join_shop_placeholder: "e.g. Ahmed's Clothing Store",
    join_phone_label: 'Phone number',
    join_governorate_label: 'Governorate',
    join_area_label: 'Area/District',
    join_category_label: 'What does your shop sell?',
    join_description_label: 'A short description of your shop and what you sell',
    join_description_placeholder: 'e.g. We sell Turkish-made menswear, mid-range prices, delivery all over Iraq',
    join_daily_orders_label: 'Roughly how many orders do you expect per day?',
    join_daily_orders_placeholder: 'e.g. 5',
    join_daily_orders_note: 'Please write your real order volume honestly — this helps us set you up with the right service',
    join_submit_btn: 'Submit Request',
    join_submit_loading: 'Sending...',
    join_have_account: 'Already have an account?',
    join_back_to_login: 'Back to sign in',
    join_legal_link: 'Terms & Privacy Policy',
    track_order_btn: 'Track My Order',
    public_footer_made_by: 'This store was created for free using Tajerly —',
    public_footer_get_store: 'Click here to get your own store',
    public_footer_legal: 'Terms & Privacy Policy',
    sidebar_menu_label: 'Menu',
    sidebar_toggle_aria: 'Menu',
    topbar_welcome: 'Welcome,',
    topbar_logout: 'Sign out',
    lang_switcher_label: 'Language',
    nav_dashboard: 'Dashboard',
    nav_requests: 'Merchant Requests',
    nav_announcements: 'Merchant Messages',
    nav_employees: 'Employees',
    nav_accounting: 'Accounting',
    nav_dues: 'Dues',
    nav_settings: 'Pricing Settings',
    nav_shipping: 'Shipping',
    nav_admin_tools: 'Sensitive Actions',
    nav_store_preview: 'Preview Stores',
    nav_support: 'Merchant Support',
    nav_merchant: 'My Store',
    perm_store: 'Store',
    perm_orders: 'Orders',
    perm_products: 'Products',
    perm_appearance: 'Appearance',
    perm_earnings: 'Earnings & Accounts',
    perm_charts: 'Charts'
  },
  ku: {
    boot_note: 'ئامادەکردنی پەڕەکە...',
    login_title: 'چوونەژوورەوە',
    login_username_label: 'ناوی بەکارهێنەر',
    login_username_placeholder: 'ناوی بەکارهێنەر',
    login_password_label: 'وشەی نهێنی',
    login_password_placeholder: 'وشەی نهێنی',
    login_btn: 'چوونەژوورەوە',
    login_btn_loading: 'چوونەژوورەوە...',
    login_no_account: 'فرۆشیارێکی نوێیت و هەژمارت نییە؟',
    login_join_link: 'داواکاری پەیوەستبوون بنێرە',
    login_legal_link: 'مەرج و یاسا و سیاسەتی تایبەتمەندی',
    login_about_link: 'دەربارەی پلاتفۆرمەکە',
    brand_tagline_login: 'پلاتفۆرمی تەواوی بازرگانی ئەلیکترۆنی',
    home_brand_tag: 'فرۆشگای ئۆنلاینت بەخۆڕایی — بەبێ بەشداریی مانگانە',
    home_login_title: 'چوونەژوورەوە',
    home_login_sub: 'هەژمارت هەیە؟ لێرەوە بچۆرەژوورەوە',
    home_join_title: 'داواکاری پەیوەستبوون بنێرە',
    home_join_sub: 'فرۆشیارێکی نوێیت؟ فرۆشگاکەت بەخۆڕایی بکەرەوە',
    back_to_home_link: '→ گەڕانەوە بۆ سەرەکی',
    join_title: 'داواکاری فرۆشیاری نوێ',
    join_form_title: 'زانیارییەکانت پڕبکەرەوە',
    join_form_sub: 'بەڕێوەبەرایەتی داواکارییەکەت پێداچوونەوەی بۆ دەکات و زانیاری چوونەژوورەوەت بۆ دەنێرێت دوای پەسەندکردن',
    join_about_link: 'دەربارەی پلاتفۆرمەکە پێش تۆمارکردن',
    join_name_label: 'ناوت',
    join_name_placeholder: 'بۆ نموونە: ئەحمەد محەمەد',
    join_shop_label: 'ناوی مەحەڵ',
    join_shop_placeholder: 'بۆ نموونە: مەحەڵی ئەحمەد بۆ جل و بەرگ',
    join_phone_label: 'ژمارەی مۆبایل',
    join_governorate_label: 'پارێزگا',
    join_area_label: 'ناوچە/گەڕەک',
    join_category_label: 'مەحەڵەکەت لە چ بواریکدایە',
    join_description_label: 'وەسفێکی کورت لەبارەی مەحەڵەکەت و چ شتێک دەفرۆشیت',
    join_description_placeholder: 'بۆ نموونە: جلوبەرگی پیاوانەی دروستکراوی تورکیا دەفرۆشین، نرخی مامناوەند، گەیاندن بۆ هەموو عێراق',
    join_daily_orders_label: 'خەمڵاندنت چەندە داواکاری بۆت دێت لە ڕۆژێکدا؟',
    join_daily_orders_placeholder: 'بۆ نموونە: 5',
    join_daily_orders_note: 'تکایە ژمارەی ڕاستەقینەی داواکارییەکان بە ڕوونی بنووسە، ئەمە یارمەتیمان دەدات باشترین خزمەتگوزاری بۆت ئامادە بکەین',
    join_submit_btn: 'ناردنی داواکاری',
    join_submit_loading: 'ناردن...',
    join_have_account: 'پێشتر هەژمارت هەیە؟',
    join_back_to_login: 'گەڕانەوە بۆ چوونەژوورەوە',
    join_legal_link: 'مەرج و یاسا و سیاسەتی تایبەتمەندی',
    track_order_btn: 'شوێنکەوتنی داواکاریم',
    public_footer_made_by: 'ئەم فرۆشگایە بەخۆڕایی دروستکراوە لەلایەن ماڵپەڕی تاجەرلی —',
    public_footer_get_store: 'بۆ بەدەستهێنانی فرۆشگا لێرە کرتە بکە',
    public_footer_legal: 'مەرج و سیاسەتی تایبەتمەندی',
    sidebar_menu_label: 'لیستە',
    sidebar_toggle_aria: 'لیستە',
    topbar_welcome: 'بەخێربێیت،',
    topbar_logout: 'چوونەدەرەوە',
    lang_switcher_label: 'زمان',
    nav_dashboard: 'داشبۆرد',
    nav_requests: 'داواکاری فرۆشیاران',
    nav_announcements: 'پەیام بۆ فرۆشیاران',
    nav_employees: 'کارمەندەکان',
    nav_accounting: 'ژمێریاری',
    nav_dues: 'پارەی مانگرتوو',
    nav_settings: 'ڕێکخستنی نرخ',
    nav_shipping: 'گەیاندن',
    nav_admin_tools: 'کردارە هەستیارەکان',
    nav_store_preview: 'بینینی فرۆشگاکان',
    nav_support: 'پشتگیری فرۆشیاران',
    nav_merchant: 'فرۆشگای من',
    perm_store: 'فرۆشگا',
    perm_orders: 'داواکارییەکان',
    perm_products: 'بەرهەمەکان',
    perm_appearance: 'ڕووکار',
    perm_earnings: 'قازانج و هەژمارەکان',
    perm_charts: 'چارتەکان'
  }
};

// Loaded once at boot (see initLang, called from the page's startup sequence) and changed
// only through setLang() below, never assigned directly, so every place that reads it is
// guaranteed to already reflect document.documentElement.lang/dir.
let currentLang = 'ar';

// Falls back to Arabic (the platform's original/complete language) if a key is missing in
// the current language, then to the raw key itself as a last resort — so a translation gap
// shows up as visibly-wrong text to fix, never as a blank UI or a thrown error.
function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.ar && I18N.ar[key]) || key;
}

function applyLangToDocument() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = LANG_DIR[currentLang] || 'rtl';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
  ['lang-switcher-select', 'public-lang-switcher-select', 'app-lang-switcher-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = currentLang;
  });
}

async function initLang() {
  // Language system disabled for now — the switcher UI is hidden (see CSS) and the app is
  // forced to Arabic regardless of anything saved from before. The read from sessionStorage
  // is intentionally skipped rather than deleted, so re-enabling the switcher later is just
  // uncommenting these two lines and removing the CSS display:none rule above.
  // let saved = null;
  // try { saved = sessionStorage.getItem('tajerly-lang'); } catch (e) {}
  // if (saved && SUPPORTED_LANGS.includes(saved)) currentLang = saved;
  currentLang = 'ar';
  applyLangToDocument();
}

// Called from the language-switcher dropdown. Re-renders whatever's currently on screen
// (app shell or public storefront) so already-rendered dynamic content picks up the change
// too, not just the static data-i18n chrome.
function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  try { sessionStorage.setItem('tajerly-lang', lang); } catch (e) {}
  applyLangToDocument();
  if (document.getElementById('app-shell') && document.getElementById('app-shell').style.display !== 'none') {
    if (typeof currentRole !== 'undefined' && currentRole) buildNav(currentRole);
    if (typeof renderAll === 'function') renderAll();
  }
  if (typeof publicStoreMerchantId !== 'undefined' && publicStoreMerchantId) refreshStorefrontView();
}

