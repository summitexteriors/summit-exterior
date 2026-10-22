import { jobs, json } from '../lib/shared.mjs';

export const config = { path: '/api/viz-status', method: 'GET' };

export default async (req) => {
  const jobId = new URL(req.url).searchParams.get('jobId') || '';
  if (!/^[0-9a-f-]{36}$/.test(jobId)) return json({ error: 'Invalid request.' }, 400);
  const store = jobs();
  const out = await store.get(`out/${jobId}`, { type: 'json' });
  if (!out) return json({ status: 'working' });
  await store.delete(`out/${jobId}`); // the photo is not kept after you see it
  return json(out);
};
