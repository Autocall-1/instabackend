const axios = require('axios');
const { saveLead, markConverted, getSession, saveSession, clearSession } = require('./firebase');

const T = {
  trigger: ['hi','hello','hii','hey','price','details','start','info','interested','help','kya','bata','join'],
  steps: [
    { id:1, hi:"Hey 👋 Kaise ho! Aapka naam kya hai?",                                                                en:"Hey 👋 What's your name?",                                                     save:'name'          },
    { id:2, hi:"Nice to meet you {name}! 😊\nBusiness kya hai?\n1️⃣ Service  2️⃣ Product  3️⃣ Freelance  4️⃣ Other",  en:"Nice {name}! 😊\n1️⃣ Service  2️⃣ Product  3️⃣ Freelance  4️⃣ Other",          save:'business_type' },
    { id:3, hi:"Aap exactly kya sell karte ho?",                                                                       en:"What exactly do you sell?",                                                    save:'product'       },
    { id:4, hi:"Perfect! 🎯\nBudget approx?\n💰 Under ₹5K\n💰 ₹5–15K\n💰 ₹15K+",                                  en:"Perfect! 🎯\nApprox budget?\n💰 Under ₹5K\n💰 ₹5–15K\n💰 ₹15K+",          save:'budget'        },
    { id:5, hi:"🔥 Excellent! Details yahan dekho 👇\n{website_link}",                                                en:"🔥 Check here 👇\n{website_link}",                                            save:null            },
    { id:6, hi:"Interested? Reply karo: YES 👍\nTeam 24hrs me contact karegi! 🚀",                                   en:"Reply YES if interested 👍\nWe'll contact in 24hrs! 🚀",                      save:'interest'      }
  ],
  end_hi:"🎉 Shukriya {name}! Hamari team jald contact karegi। 🙏",
  end_en:"🎉 Thank you {name}! Our team will reach out soon! 🙏"
};

function inject(msg, data) { return msg.replace(/\{(\w+)\}/g, (_,k)=>data[k]||''); }
function lang(txt)         { return /[\u0900-\u097F]/.test(txt)?'hi':'en'; }
function isTrigger(txt)    { const l=txt.toLowerCase(); return T.trigger.some(k=>l.includes(k)); }

async function sendDM(to, text, token) {
  if (!token) { console.log(`📤 [DEV] → ${to}: ${text.slice(0,50)}...`); return; }
  try {
    await axios.post('https://graph.instagram.com/v18.0/me/messages',
      { recipient:{id:to}, message:{text} },
      { headers:{Authorization:`Bearer ${token}`} });
  } catch(e) { console.error('❌ DM failed:', e.response?.data||e.message); }
}

async function processMessage(ownerUid, profile, igUserId, text) {
  const cfg = { website_link: profile.website_link||'https://yourwebsite.com', ig_access_token: profile.ig_access_token||null };
  let session = await getSession(ownerUid, igUserId);

  if (!session || session.current_step===0) {
    if (!isTrigger(text)) return;
    session = { current_step:0, lang:lang(text), data:{} };
    console.log(`🎯 Flow started: ${igUserId}`);
  }

  const step   = session.current_step;
  const prev   = step > 0 ? T.steps[step-1] : null;
  if (prev?.save) {
    session.data[prev.save] = text;
    if (prev.save==='interest' && text.toLowerCase().trim()==='yes') {
      await markConverted(ownerUid, igUserId);
      console.log(`🎉 CONVERTED: ${igUserId}`);
    }
  }

  await saveLead(ownerUid, igUserId, { ...session.data, flow:'lead_funnel' });

  if (step < T.steps.length) {
    const s   = T.steps[step];
    const msg = inject(s[session.lang]||s.hi, { ...session.data, ...cfg });
    await sendDM(igUserId, msg, cfg.ig_access_token);
    session.current_step = step + 1;
    await saveSession(ownerUid, igUserId, session);
    console.log(`✉️  Step ${step+1}/${T.steps.length} → ${igUserId}`);
  } else {
    const endMsg = inject(T[`end_${session.lang}`]||T.end_hi, { ...session.data, ...cfg });
    await sendDM(igUserId, endMsg, cfg.ig_access_token);
    await clearSession(ownerUid, igUserId);
    console.log(`✅ Done: ${igUserId}`);
  }
}

module.exports = { processMessage, isTrigger };
