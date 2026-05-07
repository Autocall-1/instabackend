const express   = require('express');
const router    = express.Router();
const Razorpay  = require('razorpay');
const crypto    = require('crypto');
const authMw    = require('../middleware/auth');
const { getUserById, updateUser, savePayment } = require('../services/firebase');

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// POST /api/payment/create-order — create Razorpay order for ₹499
router.post('/create-order', authMw, async (req, res) => {
  try {
    const user = await getUserById(req.user.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const order = await rzp.orders.create({
      amount:   49900,       // ₹499 in paise
      currency: 'INR',
      receipt:  `rcpt_${req.user.uid.slice(0,8)}_${Date.now()}`,
      notes:    { uid: req.user.uid, email: user.email, plan: 'paid' }
    });

    res.json({ orderId: order.id, amount: 499, currency: 'INR' });
  } catch(e) {
    console.error('Order creation failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payment/verify — verify signature & activate Pro plan
router.post('/verify', authMw, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // Verify signature
  const generated = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generated !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Signature mismatch' });
  }

  try {
    const user     = await getUserById(req.user.uid);
    const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await updateUser(req.user.uid, {
      plan:            'paid',
      paid_until:      paidUntil,
      razorpay_sub_id: razorpay_payment_id,
      bot_active:      true
    });

    await savePayment({
      uid:              req.user.uid,
      userName:         user.name || '',
      userEmail:        user.email || '',
      amount:           499,
      razorpay_order_id,
      razorpay_payment_id,
      plan:             'paid',
      paid_until:       paidUntil
    });

    console.log(`✅ Payment verified & Pro activated: ${req.user.uid}`);
    res.json({ success: true, paid_until: paidUntil });
  } catch(e) {
    console.error('Verify error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/razorpay-webhook — Razorpay server-to-server webhook
router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig       = req.headers['x-razorpay-signature'];
  const secret    = process.env.RAZORPAY_KEY_SECRET;
  const body      = req.body.toString();
  const expected  = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (sig !== expected) return res.status(400).json({ error: 'Invalid signature' });

  const event = JSON.parse(body);
  console.log(`💳 Razorpay webhook: ${event.event}`);

  if (event.event === 'payment.captured') {
    const notes = event.payload.payment.entity.notes || {};
    const uid   = notes.uid;
    if (uid) {
      const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await updateUser(uid, { plan: 'paid', paid_until: paidUntil, bot_active: true }).catch(console.error);
    }
  }

  if (event.event === 'subscription.charged') {
    const uid = event.payload.subscription.entity.notes?.uid;
    if (uid) {
      const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await updateUser(uid, { plan: 'paid', paid_until: paidUntil }).catch(console.error);
    }
  }

  res.json({ status: 'ok' });
});

module.exports = router;
