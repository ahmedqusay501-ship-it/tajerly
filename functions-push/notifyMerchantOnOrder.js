// دالة سيرفر: ترسل إشعار Push للتاجر لما ينضاف طلب جديد لمتجره.
// تنضاف لمجلد functions/ تبع مشروعك (الموجود فيه validateNewOrder وغيرها) — مو جزء من الموقع نفسه.
//
// الاستخدام داخل functions/index.js:
//   const { notifyMerchantOnOrder } = require('./notifyMerchantOnOrder');
//   exports.notifyMerchantOnOrder = notifyMerchantOnOrder;
// ثم:  firebase deploy --only functions:notifyMerchantOnOrder
//
// تحتاج firebase-functions v2 و firebase-admin (موجودين غالباً). لو مشروعك على v1 غيّر السطر
// الأول لـ functions.firestore.document('orders/{id}').onCreate(...).
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

exports.notifyMerchantOnOrder = onDocumentCreated('orders/{id}', async (event) => {
  const order = event.data && event.data.data();
  if (!order || !order.merchantAuthUid) return;

  const db = admin.firestore();
  const snap = await db.collection('push_tokens').doc(String(order.merchantAuthUid)).get();
  const tokens = snap.exists && Array.isArray(snap.data().tokens) ? snap.data().tokens : [];
  if (!tokens.length) return;

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    // data فقط (بدون notification) حتى يعرضه sw.js بنفسه بنفس الشكل بكل المتصفحات
    data: {
      title: 'طلب جديد 🛍️',
      body: 'وصلك طلب جديد على متجرك — افتح لوحة التاجر لمراجعته',
      url: '/',
      tag: 'order-' + event.params.id
    },
    webpush: { headers: { Urgency: 'high', TTL: '3600' } }
  });

  // نحذف التوكنات الميتة (تطبيق انحذف/صلاحية انسحبت) حتى ما تتراكم
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(tokens[i]);
  });
  if (dead.length) {
    await snap.ref.update({ tokens: tokens.filter((t) => !dead.includes(t)) });
  }
});
