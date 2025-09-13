// Small utility helpers

// Seeded PRNG (Mulberry32)
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(prng, min, max) {
  return Math.floor(prng() * (max - min + 1)) + min;
}

export function choiceWeighted(prng, items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a,b)=>a+b, 0);
  if (total <= 0) return items[0];
  let r = prng() * total;
  for (let i=0;i<items.length;i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length-1];
}

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function nowMs() { return performance.now(); }

export function tryFetchJson(path, fallback) {
  return fetch(path).then(r => {
    if (!r.ok) throw new Error('fetch fail');
    return r.json();
  }).catch(()=> fallback);
}

