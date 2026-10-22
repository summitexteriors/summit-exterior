import { jobs, json, hashIp, newJobId, findChoice, cleanupOld, bumpCounter, MAX_IMAGE_BYTES } from '../lib/shared.mjs';

export const config = { path: '/api/viz-start', method: 'POST' };

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export default async (req, context) => {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  // Honeypot: real visitors never fill this in.
  if (body.website) return json({ error: 'Invalid request.' }, 400);

  const mode = body.mode;
  const choice = findChoice(mode, body.choiceId);
  if (!choice) return json({ error: 'Please pick a roof or paint color.' }, 400);

  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').replace(/\D/g, '');
  if (name.length < 2 || name.length > 80) return json({ error: 'Please enter your name.' }, 400);
  if (phone.length < 10 || phone.length > 15) return json({ error: 'Please enter a phone number.' }, 400);
  if (body.consent !== true) return json({ error: 'Please check the box to continue.' }, 400);

  const image = String(body.image || '');
  if (!DATA_URL.test(image)) return json({ error: 'Please upload a JPG, PNG or WebP photo.' }, 400);
  if (Math.floor((image.length * 3) / 4) > MAX_IMAGE_BYTES) return json({ error: 'That photo is too large. Try a smaller one.' }, 413);

  const store = jobs();
  const day = new Date().toISOString().slice(0, 10);
  const perIp = Number(process.env.VIZ_LIMIT_PER_IP_PER_DAY || 3);
  const global = Number(process.env.VIZ_LIMIT_GLOBAL_PER_DAY || 60);
  const ipHash = hashIp((context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '');

  if (!(await bumpCounter(store, `limit/${day}-${ipHash}`, perIp)))
    return json({ error: 'You have reached today\'s preview limit. Call us and we will show you options in person.' }, 429);
  if (!(await bumpCounter(store, `limit/${day}-all`, global)))
    return json({ error: 'Our preview tool is busy today. Please try again tomorrow or call us.' }, 429);

  await cleanupOld(store);

  const jobId = newJobId();
  await store.setJSON(`in/${jobId}`, { mode, choiceId: choice.id, image, ipHash }, { metadata: { createdAt: Date.now() } });

  // Kick off the background worker. It returns 202 right away and runs for up to several minutes.
  try {
    const origin = new URL(req.url).origin;
    await fetch(`${origin}/api/viz-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
  } catch (e) {
    console.error('could not start worker', e && e.message);
    await store.delete(`in/${jobId}`);
    return json({ error: 'Could not start your preview. Please try again.' }, 502);
  }

  console.log('viz lead', JSON.stringify({ mode, choice: choice.name, name, phone }));
  return json({ jobId });
};
