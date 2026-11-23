# تفعيل إشعارات Push للتاجر — خطوات لمرة وحدة

الكود جاهز بالموقع، لكن يشتغل بعد هذي الخطوات (ما أكدر أسويها من بره حسابك):

1. **قواعد Firestore**: انشر `firestore.rules` (فيها قاعدة `push_tokens`): `firebase deploy --only firestore:rules`.
2. **دالة السيرفر**: انسخ `functions-push/notifyMerchantOnOrder.js` لمجلد `functions/` تبعك، صدّرها من `index.js`:
   `exports.notifyMerchantOnOrder = require('./notifyMerchantOnOrder').notifyMerchantOnOrder;`
   وانشر: `firebase deploy --only functions:notifyMerchantOnOrder` (يحتاج خطة Blaze مثل باقي الدوال).
3. **تأكد إن Firebase Cloud Messaging API مفعّلة** بمشروعك (Google Cloud Console ← APIs & Services ← Firebase Cloud Messaging API).
4. **جرّب**: التاجر يفتح لوحته ← «فعّل إشعارات الطلبات» ← تسوي طلب تجريبي من متجره ← يوصل إشعار.

مفتاح VAPID **اختياري** (`PUSH_VAPID_KEY` بـ `js/26-push.js`): لو تركته فاضي يستخدم Firebase مفتاحه الافتراضي.
لو تريد مفتاح خاص: Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair.

ملاحظات:
- على الآيفون الإشعارات تشتغل فقط إذا ثبّت التاجر الموقع على الشاشة الرئيسية (iOS 16.4+)، والبطاقة تشرح له ذلك.
- الإشعار يوصل للتاجر صاحب المتجر فقط، مو لموظفيه.
- الطلب الواحد (حتى لو كذا قطعة) يرسل إشعار واحد؛ الدالة تسجّل علامة بمجموعة `push_sent` (يكتبها السيرفر بس).
