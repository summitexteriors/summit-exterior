import { jobs, findChoice, buildPrompt } from '../lib/shared.mjs';

export const config = { path: '/api/viz-run', method: 'POST', background: true };

export default async (req) => {
  const store = jobs();
  let jobId;
  try { ({ jobId } = await req.json()); } catch { return; }
  if (!/^[0-9a-f-]{36}$/.test(String(jobId))) return;

  const job = await store.get(`in/${jobId}`, { type: 'json' });
  if (!job) return;

  const fail = async (msg) => {
    await store.setJSON(`out/${jobId}`, { status: 'error', error: msg }, { metadata: { createdAt: Date.now() } });
    await store.delete(`in/${jobId}`);
  };

  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.error('OPENAI_API_KEY is not set'); return fail('The preview tool is not available right now. Please call us.'); }

  const choice = findChoice(job.mode, job.choiceId);
  if (!choice) return fail('Something went wrong. Please try again.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
        images: [{ image_url: job.image }],
        prompt: buildPrompt(job.mode, choice),
        size: 'auto',
        quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
        output_format: 'jpeg',
        n: 1,
        safety_identifier: job.ipHash,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error('image api error', res.status, (await res.text()).slice(0, 500));
      return fail('We could not create a preview from that photo. Try a clearer photo of the front of the house.');
    }
    const data = await res.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return fail('We could not create a preview from that photo. Please try another one.');
    await store.setJSON(`out/${jobId}`, { status: 'done', image: `data:image/jpeg;base64,${b64}` }, { metadata: { createdAt: Date.now() } });
    await store.delete(`in/${jobId}`);
  } catch (e) {
    console.error('worker failed', e && e.message);
    await fail('The preview took too long. Please try again.');
  } finally {
    clearTimeout(timer);
  }
};
