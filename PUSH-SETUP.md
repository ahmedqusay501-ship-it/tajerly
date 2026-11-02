# تفعيل إشعارات Push للتاجر — خطوات لمرة وحدة

الكود جاهز بالموقع، لكن يشتغل بعد هذي الخطوات الأربع (ما أكدر أسويها من بره حسابك):

1. **مفتاح VAPID**: Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair.
   انسخ المفتاح وحطه بـ `js/26-push.js` مكان `PUSH_VAPID_KEY = ''`. (لحد ما تحطه، زر التفعيل ما يظهر للتاجر.)
2. **قواعد Firestore**: انشر `firestore.rules` (أُضيفت قاعدة `push_tokens`).
3. **دالة السيرفر**: انسخ `functions-push/notifyMerchantOnOrder.js` لمجلد `functions/` تبعك، صدّرها من `index.js`
   وانشر: `firebase deploy --only functions:notifyMerchantOnOrder` (يحتاج خطة Blaze مثل باقي الدوال).
4. **جرّب**: التاجر يفتح لوحته ← «فعّل إشعارات الطلبات» ← تسوي طلب تجريبي من متجره ← يوصل إشعار.

ملاحظات: على الآيفون الإشعارات تشتغل فقط إذا ثبّت التاجر الموقع على الشاشة الرئيسية (iOS 16.4+).
الإشعار يوصل للتاجر صاحب المتجر فقط، مو لموظفيه.
