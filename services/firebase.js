const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();
const TS = () => admin.firestore.FieldValue.serverTimestamp();

// ── Leads ─────────────────────────────────────────────────────────────────────
async function saveLead(ownerUid, igUserId, data) {
  const col  = db.collection('users').doc(ownerUid).collection('leads');
  const snap = await col.where('ig_user_id', '==', igUserId).limit(1).get();
  if (!snap.empty) {
    await snap.docs[0].ref.update({ ...data, updated_at: TS() });
    return snap.docs[0].id;
  }
  return (await col.add({ ...data, ig_user_id: igUserId, status: 'active', created_at: TS(), updated_at: TS() })).id;
}

async function markConverted(ownerUid, igUserId) {
  const snap = await db.collection('users').doc(ownerUid).collection('leads')
    .where('ig_user_id', '==', igUserId).limit(1).get();
  if (!snap.empty) await snap.docs[0].ref.update({ status: 'converted', converted_at: TS() });
}

// ── Sessions ──────────────────────────────────────────────────────────────────
async function getSession(ownerUid, igUserId) {
  const snap = await db.collection('sessions').doc(`${ownerUid}_${igUserId}`).get();
  return snap.exists ? snap.data() : null;
}
async function saveSession(ownerUid, igUserId, data) {
  await db.collection('sessions').doc(`${ownerUid}_${igUserId}`)
    .set({ ...data, owner_uid: ownerUid, ig_user_id: igUserId, updated_at: TS() }, { merge: true });
}
async function clearSession(ownerUid, igUserId) {
  await db.collection('sessions').doc(`${ownerUid}_${igUserId}`).delete();
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function getUserByPageId(pageId) {
  const snap = await db.collection('users').where('ig_page_id', '==', pageId).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function getActiveUsers() {
  const snap = await db.collection('users').where('bot_active', '==', true).where('ig_connected', '==', true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getUserById(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function getAllUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function updateUser(uid, data) {
  await db.collection('users').doc(uid).update({ ...data, updated_at: TS() });
}

// ── Payments ──────────────────────────────────────────────────────────────────
async function savePayment(data) {
  return (await db.collection('payments').add({ ...data, created_at: TS() })).id;
}
async function getAllPayments() {
  const snap = await db.collection('payments').orderBy('created_at', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Plan check ────────────────────────────────────────────────────────────────
function isPlanActive(user) {
  const now = new Date();
  const paidUntil  = user.paid_until?._seconds  ? new Date(user.paid_until._seconds * 1000)  : null;
  const trialEnds  = user.trial_ends_at?._seconds ? new Date(user.trial_ends_at._seconds * 1000) : null;
  return (paidUntil && paidUntil > now) || (trialEnds && trialEnds > now);
}

// ── Verify Firebase ID token ──────────────────────────────────────────────────
async function verifyToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { db, admin, TS, saveLead, markConverted, getSession, saveSession, clearSession,
  getUserByPageId, getActiveUsers, getUserById, getAllUsers, updateUser,
  savePayment, getAllPayments, isPlanActive, verifyToken };
