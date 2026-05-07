const express  = require('express');
const router   = express.Router();
const { getUserByPageId, getActiveUsers } = require('../services/firebase');
const { processMessage } = require('../services/flowEngine');

const VERIFY = process.env.WEBHOOK_VERIFY_TOKEN || 'leadmachine_verify_2025';

// Meta webhook verification
router.get('/instagram', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY) { console.log('✅ Webhook verified'); return res.status(200).send(challenge); }
  res.status(403).json({ error: 'Forbidden' });
});

// Receive DMs
router.post('/instagram', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  const body = req.body;
  if (body.object !== 'instagram' && body.object !== 'page') return;

  for (const entry of body.entry || []) {
    let owner = await getUserByPageId(entry.id).catch(() => null);
    if (!owner) { const users = await getActiveUsers().catch(() => []); owner = users[0] || null; }
    if (!owner || !owner.bot_active) continue;

    for (const evt of entry.messaging || []) {
      if (evt.message && !evt.message.is_echo) {
        const text = (evt.message.text || '').trim();
        if (!text) continue;
        console.log(`📨 [${owner.id}] from ${evt.sender.id}: "${text}"`);
        try { await processMessage(owner.id, owner, evt.sender.id, text); } catch(e) { console.error('❌', e.message); }
      }
    }
    for (const change of entry.changes || []) {
      if (change.field === 'comments' || change.field === 'mentions') {
        const igUserId = change.value?.from?.id;
        if (!igUserId) continue;
        try { await processMessage(owner.id, owner, igUserId, change.value?.text || 'hi'); } catch(e) { console.error('❌', e.message); }
      }
    }
  }
});

// Dev test endpoint
router.post('/test', async (req, res) => {
  const { owner_uid, ig_user_id, message, user_profile } = req.body;
  if (!owner_uid || !ig_user_id || !message) return res.status(400).json({ error: 'owner_uid, ig_user_id, message required' });
  try {
    await processMessage(owner_uid, user_profile || { website_link: 'https://example.com', ig_access_token: null }, ig_user_id, message);
    res.json({ success: true, note: 'Check console for bot output' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
