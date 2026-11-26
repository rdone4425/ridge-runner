// Ridge Runner — deterministic randomness.
// One job: every random choice in the game comes from a seeded generator, so the
// same mission seed always builds the same valley and the same screenshot staging
// always flies the same line.

/** mulberry32: a small, fast seeded PRNG with a uniform [0, 1) output. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 2D hash of integer grid coordinates, in [0, 1). */
export function hash2(seed, x, y) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise: bilinear interpolation of the grid hash, smooth at cell edges.
 * `scale` is the cell size in world pixels.
 */
export function valueNoise(seed, x, y, scale) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/** Two octaves of value noise, still in [0, 1). */
export function fbm(seed, x, y, scale) {
  const coarse = valueNoise(seed, x, y, scale);
  const fine = valueNoise(seed + 101, x, y, scale / 4);
  return coarse * 0.7 + fine * 0.3;
}
