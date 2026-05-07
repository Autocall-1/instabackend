require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');

const webhookRoute  = require('./routes/webhook');
const paymentRoute  = require('./routes/payment');
const adminRoute    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

const origins = [
  process.env.FRONTEND_URL, process.env.ADMIN_URL,
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'http://localhost:5501', 'http://127.0.0.1:5501'
].filter(Boolean);

app.use(cors({ origin: (o, cb) => (!o || origins.some(a => o.startsWith(a))) ? cb(null, true) : cb(new Error('CORS')) }));

// Raw body for Razorpay webhook signature verification
app.use('/api/payment/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/webhook',     webhookRoute);
app.use('/api/payment', paymentRoute);
app.use('/api/admin',   adminRoute);

app.get('/', (_, res) => res.json({
  service: '⚡ LeadMachine Backend v2',
  endpoints: {
    'GET  /webhook/instagram':          'Meta verification',
    'POST /webhook/instagram':          'Receive DMs',
    'POST /webhook/test':               'Dev test',
    'POST /api/payment/create-order':   'Create Razorpay order',
    'POST /api/payment/verify':         'Verify & activate Pro',
    'POST /api/payment/razorpay-webhook':'Razorpay server webhook',
    'GET  /api/admin/stats':            'Admin stats',
    'GET  /api/admin/users':            'All users',
    'GET  /api/admin/leads':            'All leads',
    'GET  /api/admin/payments':         'All payments',
    'POST /api/admin/users/:uid/grant-pro': 'Grant pro plan',
    'POST /api/admin/users/:uid/toggle-bot':'Toggle bot'
  }
}));

app.use((err, req, res, next) => { console.error('💥', err.message); res.status(500).json({ error: 'Server error' }); });

app.listen(PORT, () => {
  console.log(`\n⚡ LeadMachine Backend on :${PORT}`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook/instagram`);
  console.log(`💳 Payment: http://localhost:${PORT}/api/payment/create-order`);
  console.log(`👑 Admin:   http://localhost:${PORT}/api/admin/stats\n`);
});

module.exports = app;
