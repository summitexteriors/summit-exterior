// Runs automatically on every Netlify form submission. Texts the owner a short alert.
// Needs these Netlify environment variables (Site configuration > Environment variables):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (your Twilio number, +1...), ALERT_PHONE (the phone to text, +1...)
// The phone numbers are never stored in the code or on the website.
export default async (req) => {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from, ALERT_PHONE: to } = process.env;
  if (!sid || !token || !from || !to) return new Response('alerts not configured', { status: 200 });
  let p;
  try { p = (await req.json()).payload; } catch { return new Response('bad payload', { status: 200 }); }
  const d = p?.data || {};
  if (!['estimate', 'visualizer'].includes(p?.form_name)) return new Response('ignored', { status: 200 });
  if (d['bot-field']) return new Response('spam', { status: 200 });
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const lines = [
    p.form_name === 'visualizer' ? 'NEW VISUALIZER REQUEST' : 'NEW ESTIMATE REQUEST',
    clean(d.name) + (d.phone ? ' ' + clean(d.phone) : ''),
    d.project ? 'Project: ' + clean(d.project) : d.preview ? 'Preview: ' + clean(d.preview) + ' ' + clean(d.choice) : '',
    d.zip ? 'ZIP: ' + clean(d.zip) : d.address ? clean(d.address) : '',
    d.utm_content ? 'Ad: ' + clean(d.utm_content) : d.form_page ? 'Page: ' + clean(d.form_page) : '',
    'Call them now.',
  ].filter(Boolean);
  const body = new URLSearchParams({ To: to, From: from, Body: lines.join('\n') });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) console.log('Twilio error', r.status, await r.text());
  return new Response('ok', { status: 200 });
};
