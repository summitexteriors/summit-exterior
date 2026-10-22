import { getStore } from '@netlify/blobs';
import { createHash, randomUUID } from 'node:crypto';
import catalog from '../../viz-catalog.json' with { type: 'json' };

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function jobs() {
  if (globalThis.__VIZ_TEST_STORE) return globalThis.__VIZ_TEST_STORE;
  return getStore('viz-jobs');
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function hashIp(ip) {
  return createHash('sha256').update('summit-viz|' + (ip || 'unknown')).digest('hex').slice(0, 24);
}

export function newJobId() {
  return randomUUID();
}

export function findChoice(mode, choiceId) {
  if (mode === 'roof') {
    for (const line of catalog.roof.lines) {
      const c = line.colors.find((x) => x.id === choiceId);
      if (c) return { ...c, lineName: line.name };
    }
  } else if (mode === 'paint') {
    return catalog.paint.colors.find((x) => x.id === choiceId) || null;
  }
  return null;
}

// Prompts are built here from catalog data only. Nothing typed by the visitor goes into them.
export function buildPrompt(mode, choice) {
  if (mode === 'roof') {
    return (
      `Edit this photo of a house. Replace ONLY the roof covering with CertainTeed ${choice.lineName} architectural asphalt shingles ` +
      `in the color "${choice.name}" (${choice.desc}). Show realistic dimensional shingle texture, shingle courses that follow the roof planes, ` +
      `and lighting and shadows that match the photo. Do not change anything else: keep the walls, siding, trim, windows, doors, gutters, chimney, ` +
      `garage, driveway, landscaping, trees, sky, people, vehicles, camera angle, framing and image proportions exactly as they are. ` +
      `If no roof is visible in the photo, return the photo unchanged.`
    );
  }
  return (
    `Edit this photo of a house. Repaint ONLY the main exterior walls and siding in Sherwin-Williams ${choice.name} (${choice.sw}), ` +
    `approximately ${choice.hex}. Keep the existing siding texture, shadows and lighting realistic so the color looks natural in daylight. ` +
    `Do not change the roof, trim, windows, doors, garage door, gutters, foundation, brick or stone, landscaping, sky, people, vehicles, ` +
    `camera angle, framing or image proportions. If no exterior walls are visible in the photo, return the photo unchanged.`
  );
}

export async function cleanupOld(store, maxAgeMs = 2 * 60 * 60 * 1000) {
  try {
    const { blobs } = await store.list();
    const now = Date.now();
    for (const b of blobs) {
      const isJob = /^(in|out)\//.test(b.key);
      if (!isJob && !b.key.startsWith('limit/')) continue;
      const limit = isJob ? maxAgeMs : 3 * 24 * 60 * 60 * 1000;
      const m = await store.getMetadata(b.key);
      const created = m && m.metadata && Number(m.metadata.createdAt);
      if (!created || now - created > limit) await store.delete(b.key);
    }
  } catch (e) {
    console.error('cleanup failed', e && e.message);
  }
}

export async function bumpCounter(store, key, limit) {
  const rec = await store.get(key, { type: 'json' });
  const count = rec && rec.count ? rec.count : 0;
  if (count >= limit) return false;
  await store.setJSON(key, { count: count + 1 }, { metadata: { createdAt: Date.now(), counter: true } });
  return true;
}
