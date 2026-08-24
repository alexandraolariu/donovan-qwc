// QWC Form 6 -> DocuSign sender (Netlify Function, zero dependencies)
// Env vars required: DS_INTEGRATION_KEY, DS_USER_ID, DS_ACCOUNT_ID, DS_PRIVATE_KEY
// Optional: DS_BASE (default https://au.docusign.net), QWC_SEND_KEY (shared secret)
import crypto from 'node:crypto';

const b64u = (x) => Buffer.from(x).toString('base64url');

async function dsToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({
    iss: process.env.DS_INTEGRATION_KEY,
    sub: process.env.DS_USER_ID,
    aud: 'account.docusign.com',
    iat: now, exp: now + 300,
    scope: 'signature impersonation',
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  const key = (process.env.DS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jwt = header + '.' + claims + '.' + signer.sign(key).toString('base64url');
  const r = await fetch('https://account.docusign.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  const j = await r.json();
  if (!j.access_token) {
    if (j.error === 'consent_required') throw new Error('DocuSign consent required - open the one-time consent URL from SETUP.md');
    throw new Error('DocuSign auth failed: ' + (j.error_description || j.error || r.status));
  }
  return j.access_token;
}

const tab = (label, [pg, x, y], value) => ({
  documentId: '1', tabLabel: label,
  pageNumber: '' + pg, xPosition: '' + x, yPosition: '' + y,
  ...(value !== undefined ? { value: '' + value } : {}),
});

export default async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-qwc-key',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = (obj, status = 200) => Response.json(obj, { status, headers: cors });
  try {
    if (req.method !== 'POST') return out({ ok: false, error: 'POST only' }, 405);
    if (process.env.QWC_SEND_KEY && req.headers.get('x-qwc-key') !== process.env.QWC_SEND_KEY)
      return out({ ok: false, error: 'unauthorised' }, 401);

    const p = await req.json();
    if (p.v !== 'QWC-F6-v2') return out({ ok: false, error: 'bad payload version' }, 400);
    if (!p.signer1?.name || !p.signer1?.email) return out({ ok: false, error: 'client name/email missing' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.signer1.email)) return out({ ok: false, error: 'client email invalid' }, 400);

    // Blank template: fetched from this same site so DocuSign never needs external access
    const pdfR = await fetch(new URL('/form6-blank.pdf', req.url));
    if (!pdfR.ok) throw new Error('blank PDF not found on site (' + pdfR.status + ') - is form6-blank.pdf deployed?');
    const pdfB64 = Buffer.from(await pdfR.arrayBuffer()).toString('base64');

    const s1tabs = {
      textTabs: Object.entries(p.text || {}).map(([k, a]) => tab(k, a, a[3])),
      checkboxTabs: (p.check || []).map((a, i) => ({ ...tab('chk' + i, a), selected: 'true' })),
      signHereTabs: (p.sign1 || []).map((a, i) => tab('s1sign' + i, a)),
      dateSignedTabs: (p.date1 || []).map((a, i) => tab('s1date' + i, a)),
    };
    const s2tabs = {
      signHereTabs: (p.sign2 || []).map((a, i) => tab('s2sign' + i, a)),
      dateSignedTabs: (p.date2 || []).map((a, i) => tab('s2date' + i, a)),
    };

    const envelope = {
      emailSubject: (p.subject || 'Form 6 - Queensland Water Consultancy').slice(0, 100),
      status: 'sent',
      documents: [{ documentId: '1', name: 'Form 6 - QWC Broker Appointment.pdf', fileExtension: 'pdf', documentBase64: pdfB64 }],
      recipients: { signers: [
        { recipientId: '1', routingOrder: '1', name: p.signer1.name, email: p.signer1.email, tabs: s1tabs },
        { recipientId: '2', routingOrder: '2', name: p.signer2?.name || 'Matthew Donovan', email: p.signer2?.email || 'matt@qldwc.com.au', tabs: s2tabs },
      ] },
    };

    const token = await dsToken();
    const base = (process.env.DS_BASE || 'https://au.docusign.net') +
      '/restapi/v2.1/accounts/' + process.env.DS_ACCOUNT_ID + '/envelopes';
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    const j = await r.json();
    if (!r.ok) return out({ ok: false, error: j.message || j.errorCode || ('DocuSign ' + r.status) }, 502);
    return out({ ok: true, envelopeId: j.envelopeId });
  } catch (e) {
    return out({ ok: false, error: '' + (e.message || e) }, 500);
  }
};
