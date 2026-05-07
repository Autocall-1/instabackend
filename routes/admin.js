const express  = require('express');
const router   = express.Router();
const adminMw  = require('../middleware/adminAuth');
const { getAllUsers, getUserById, updateUser, getAllPayments, db, TS } = require('../services/firebase');

// All admin routes protected
router.use(adminMw);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const users    = await getAllUsers();
    const payments = await getAllPayments();
    const now      = new Date();

    const activePaid  = users.filter(u => u.paid_until?._seconds && new Date(u.paid_until._seconds*1000) > now).length;
    const activeTrial = users.filter(u => {
      if (activePaid) return false;
      return u.trial_ends_at?._seconds && new Date(u.trial_ends_at._seconds*1000) > now;
    }).length;
    const mrr         = activePaid * 499;
    const totalRev    = payments.reduce((s, p) => s + (p.amount || 499), 0);

    res.json({
      totalUsers: users.length, activePaid, activeTrial, mrr, totalRevenue: totalRev,
      totalPayments: payments.length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    // Attach lead count per user
    for (const u of users) {
      try {
        const snap = await db.collection('users').doc(u.id).collection('leads').count().get();
        u.leadCount = snap.data().count;
      } catch { u.leadCount = 0; }
    }
    res.json({ users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/users/:uid — update any user field
router.patch('/users/:uid', async (req, res) => {
  try {
    const allowed = ['bot_active', 'plan', 'paid_until', 'suspended', 'is_admin'];
    const data    = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No valid fields' });
    await updateUser(req.params.uid, data);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/users/:uid/grant-pro — grant 30-day pro
router.post('/users/:uid/grant-pro', async (req, res) => {
  try {
    const days      = req.body.days || 30;
    const paidUntil = new Date(Date.now() + days * 86400000);
    await updateUser(req.params.uid, { plan: 'paid', paid_until: paidUntil, bot_active: true });
    res.json({ success: true, paid_until: paidUntil });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/users/:uid/suspend
router.post('/users/:uid/suspend', async (req, res) => {
  try {
    await updateUser(req.params.uid, { bot_active: false, suspended: true });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/users/:uid/toggle-bot
router.post('/users/:uid/toggle-bot', async (req, res) => {
  try {
    const user = await getUserById(req.params.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await updateUser(req.params.uid, { bot_active: !user.bot_active });
    res.json({ success: true, bot_active: !user.bot_active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/payments
router.get('/payments', async (req, res) => {
  try { res.json({ payments: await getAllPayments() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/leads — all leads across all users
router.get('/leads', async (req, res) => {
  try {
    const users = await getAllUsers();
    const all   = [];
    for (const u of users) {
      const snap = await db.collection('users').doc(u.id).collection('leads')
        .orderBy('created_at', 'desc').limit(100).get();
      snap.docs.forEach(d => all.push({ id: d.id, ownerName: u.name || u.email, ownerUid: u.id, ...d.data() }));
    }
    res.json({ leads: all, total: all.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/make-admin
router.post('/make-admin', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try { await updateUser(uid, { is_admin: true }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
