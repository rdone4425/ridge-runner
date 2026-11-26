// Ridge Runner — the valley itself.
// One job: turn a mission seed into recognisable terrain (fields, forest, river,
// towns, mountains, airfields) and paint it in cached tiles. The physics and the
// renderer both ask this module the same questions, so the ground you see is the
// ground you can hit.

import { WORLD, TILE } from './config.js';
import { createRandom, fbm, valueNoise } from './random.js';

const CROP_COLORS = ['#7fae4e', '#a8b545', '#c9b458', '#6d9e4a', '#b7a03c', '#8fb04e', '#d0c06a'];
const FIELD_BORDER = '#5d7f3a';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function shade(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (v) => clamp(Math.round(v * factor), 0, 255);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
/** Colour of ground at a height, before hill shading. */
function groundColour(h) {
  if (h < 900) return '#7cab4f';
  if (h < 1400) return '#6f9a48';
  if (h < 1800) return '#8a7a4e';
  if (h < 3200) return '#7d6b52';
  if (h < 4500) return '#6f6a66';
  return '#e8ecef'; // snow
}

export function createTerrain(seed, mission) {
  const rng = createRandom(seed);
  const mountainAmp = mission.id === 'storm-pass' ? 5200 : mission.id === 'supply-drop' ? 2600 : 1500;

  // The route the mission flies: home, rings, drop zone, destination. The valley
  // is carved along it so there is always a flyable line; mountains rise outside it.
  const route = [{ x: mission.home.x, y: mission.home.y }];
  for (const ring of mission.rings) route.push({ x: ring.x, y: ring.y });
  if (mission.dropZone) route.push({ x: mission.dropZone.x, y: mission.dropZone.y });
  route.push({ x: mission.destination.x, y: mission.destination.y });

  function corridorDistance(x, y) {
    let best = Infinity;
    for (let i = 0; i < route.length - 1; i += 1) {
      const d = distToSegment(x, y, route[i].x, route[i].y, route[i + 1].x, route[i + 1].y);
      if (d < best) best = d;
    }
    return best;
  }

  // A meandering river, west to east, plus two lakes.
  const river = [];
  let ry = 1200 + rng() * 3600;
  for (let x = -100; x <= WORLD + 200; x += 180) {
    river.push({ x, y: ry });
    ry += (rng() - 0.5) * 260;
    ry = clamp(ry, 600, WORLD - 600);
  }
  const lakes = [];
  for (let i = 0; i < 2; i += 1) {
    lakes.push({ x: 800 + rng() * (WORLD - 1600), y: 800 + rng() * (WORLD - 1600), rx: 220 + rng() * 180, ry: 150 + rng() * 130 });
  }

  function riverDistance(x, y) {
    let best = Infinity;
    for (let i = 0; i < river.length - 1; i += 1) {
      const d = distToSegment(x, y, river[i].x, river[i].y, river[i + 1].x, river[i + 1].y);
      if (d < best) best = d;
    }
    return best;
  }

  function heightAt(x, y) {
    const rolling = 300 + fbm(seed, x, y, 900) * 900;
    const corridor = corridorDistance(x, y);
    // Mountains rise close beside the route, so the pass reads on screen:
    // full height is reached about a kilometre from the centreline.
    const outside = smoothstep(600, 1400, corridor);
    const mass = smoothstep(0.40, 0.65, fbm(seed + 7, x, y, 1500));
    let h = rolling + mass * mountainAmp * (0.5 + 0.5 * outside);
    // The valley floor along the route is low and gentle (350-500 ft), so a
    // plane climbing out of the 350 ft strip can always stay above the ground;
    // the mountains rise outside the corridor.
    const valleyFloor = 350 + fbm(seed + 31, x, y, 3200) * 150;
    const blend = smoothstep(200, 600, corridor);
    h = valleyFloor + (h - valleyFloor) * blend;
    // The river runs in a shallow dip.
    if (riverDistance(x, y) < 160) h = Math.min(h, 320);
    // Runway ground is flat. The strip's long axis points along its heading:
    // compass heading H means the screen direction (sin H, -cos H).
    for (const strip of [mission.home, mission.destination]) {
      const rad = (strip.heading * Math.PI) / 180;
      const dx = Math.sin(rad) * 260;
      const dy = -Math.cos(rad) * 260;
      const d = distToSegment(x, y, strip.x - dx, strip.y - dy, strip.x + dx, strip.y + dy);
      if (d < 90) h = 350;
    }
    return h;
  }

  function isWater(x, y) {
    if (riverDistance(x, y) < 52) return true;
    for (const lake of lakes) {
      const dx = (x - lake.x) / lake.rx;
      const dy = (y - lake.y) / lake.ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  // Patchwork fields where the ground is low and dry.
  const fields = [];
  for (let i = 0; i < 260; i += 1) {
    const x = rng() * WORLD;
    const y = rng() * WORLD;
    if (heightAt(x, y) > 1500 || isWater(x, y)) continue;
    if (corridorDistance(x, y) < 260) continue;
    const w = 140 + rng() * 320;
    const h = 110 + rng() * 260;
    fields.push({ x, y, w, h, colour: CROP_COLORS[Math.floor(rng() * CROP_COLORS.length)] });
  }

  // Forest blobs on the higher lowland.
  const forests = [];
  for (let i = 0; i < 46; i += 1) {
    const x = rng() * WORLD;
    const y = rng() * WORLD;
    const h = heightAt(x, y);
    if (h < 900 || h > 3200 || isWater(x, y)) continue;
    forests.push({ x, y, r: 90 + rng() * 160, seed: Math.floor(rng() * 100000) });
  }

  // Towns: one sits on the drop zone in the supply mission, the others are scenery.
  const towns = [];
  const townSpots = mission.dropZone
    ? [{ x: mission.dropZone.x, y: mission.dropZone.y, name: 'Alderford' }]
    : [];
  townSpots.push({ x: 1300 + rng() * 1200, y: 4200 + rng() * 1400, name: 'Marrowfield' });
  townSpots.push({ x: 4600 + rng() * 1200, y: 800 + rng() * 1200, name: 'Kestrel' });
  for (const spot of townSpots) {
    towns.push({ ...spot, r: 170 + rng() * 120 });
  }

  // Roads join the towns to the airfields.
  const roads = [];
  const stops = [...towns, { x: mission.home.x, y: mission.home.y }, { x: mission.destination.x, y: mission.destination.y }];
  for (let i = 0; i < stops.length - 1; i += 1) {
    roads.push({ ax: stops[i].x, ay: stops[i].y, bx: stops[i + 1].x, by: stops[i + 1].y });
  }

  const runways = [mission.home, mission.destination];

  /** The runway whose strip contains (x, y), or null. */
  function runwayAt(x, y) {
    for (const strip of runways) {
      const rad = (strip.heading * Math.PI) / 180;
      const dx = x - strip.x;
      const dy = y - strip.y;
      // Along the strip's axis (sin H, -cos H), across it (cos H, sin H).
      const along = dx * Math.sin(rad) - dy * Math.cos(rad);
      const across = dx * Math.cos(rad) + dy * Math.sin(rad);
      if (Math.abs(along) <= 260 && Math.abs(across) <= 34) return strip;
    }
    return null;
  }

  // ---- Tile painting -------------------------------------------------------
  const tiles = new Map();
  const TILE_LIMIT = 64;

  function paintTile(tx, ty) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    const ox = tx * TILE;
    const oy = ty * TILE;
    const CELL = 32;

    // Elevation tint with hill shading, one cell at a time.
    for (let cy = 0; cy < TILE; cy += CELL) {
      for (let cx = 0; cx < TILE; cx += CELL) {
        const wx = ox + cx + CELL / 2;
        const wy = oy + cy + CELL / 2;
        const h = heightAt(wx, wy);
        const gx = (heightAt(wx + 40, wy) - heightAt(wx - 40, wy)) / 80;
        const gy = (heightAt(wx, wy + 40) - heightAt(wx, wy - 40)) / 80;
        const light = clamp(1 + (gx - gy) * 0.0016, 0.62, 1.18);
        ctx.fillStyle = shade(groundColour(h), light);
        ctx.fillRect(cx, cy, CELL + 1, CELL + 1);
      }
    }

    // Water under everything else that sits on the ground.
    ctx.strokeStyle = '#4d8fc4';
    ctx.lineCap = 'round';
    ctx.lineWidth = 104;
    ctx.beginPath();
    river.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x - ox, p.y - oy) : ctx.lineTo(p.x - ox, p.y - oy)));
    ctx.stroke();
    ctx.strokeStyle = '#6aa8d4';
    ctx.lineWidth = 88;
    ctx.stroke();
    for (const lake of lakes) {
      ctx.fillStyle = '#5b9ccb';
      ctx.beginPath();
      ctx.ellipse(lake.x - ox, lake.y - oy, lake.rx, lake.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fields.
    for (const f of fields) {
      if (f.x > ox + TILE || f.x + f.w < ox || f.y > oy + TILE || f.y + f.h < oy) continue;
      ctx.fillStyle = f.colour;
      ctx.fillRect(f.x - ox, f.y - oy, f.w, f.h);
      ctx.strokeStyle = FIELD_BORDER;
      ctx.lineWidth = 3;
      ctx.strokeRect(f.x - ox, f.y - oy, f.w, f.h);
    }

    // Forests: clusters of dark crowns.
    for (const forest of forests) {
      if (forest.x + forest.r < ox || forest.x - forest.r > ox + TILE || forest.y + forest.r < oy || forest.y - forest.r > oy + TILE) continue;
      const frng = createRandom(forest.seed);
      for (let i = 0; i < 26; i += 1) {
        const a = frng() * Math.PI * 2;
        const d = Math.sqrt(frng()) * forest.r;
        const cx = forest.x + Math.cos(a) * d - ox;
        const cy = forest.y + Math.sin(a) * d - oy;
        ctx.fillStyle = frng() > 0.5 ? '#2f5d2e' : '#3a6b33';
        ctx.beginPath();
        ctx.arc(cx, cy, 12 + frng() * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Roads.
    ctx.strokeStyle = '#c8b18a';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (const road of roads) {
      ctx.beginPath();
      ctx.moveTo(road.ax - ox, road.ay - oy);
      ctx.lineTo(road.bx - ox, road.by - oy);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8a7a5e';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 14]);
    for (const road of roads) {
      ctx.beginPath();
      ctx.moveTo(road.ax - ox, road.ay - oy);
      ctx.lineTo(road.bx - ox, road.by - oy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Towns: street blocks and red roofs.
    for (const town of towns) {
      if (town.x + town.r < ox || town.x - town.r > ox + TILE || town.y + town.r < oy || town.y - town.r > oy + TILE) continue;
      const trng = createRandom(Math.floor(town.x + town.y));
      ctx.fillStyle = '#9a9a92';
      ctx.fillRect(town.x - town.r * 0.7 - ox, town.y - town.r * 0.55 - oy, town.r * 1.4, town.r * 1.1);
      for (let i = 0; i < 42; i += 1) {
        const bx = town.x + (trng() - 0.5) * town.r * 1.3 - ox;
        const by = town.y + (trng() - 0.5) * town.r * 1.0 - oy;
        ctx.fillStyle = trng() > 0.4 ? '#a8523c' : '#7d6a58';
        ctx.fillRect(bx, by, 10 + trng() * 14, 8 + trng() * 10);
      }
    }

    // Runways: asphalt, centreline dashes, threshold bars, numbers, windsock.
    for (const strip of runways) {
      // Heading is compass degrees (0 = north = up the screen). A canvas
      // rotation of (heading - 90) maps the strip's long axis onto that bearing.
      const rad = ((strip.heading - 90) * Math.PI) / 180;
      ctx.save();
      ctx.translate(strip.x - ox, strip.y - oy);
      ctx.rotate(rad);
      ctx.fillStyle = '#3f4448';
      ctx.fillRect(-260, -32, 520, 64);
      ctx.fillStyle = '#565c61';
      ctx.fillRect(-260, -32, 520, 6);
      ctx.fillStyle = '#f2f2ea';
      for (let d = -220; d <= 220; d += 60) ctx.fillRect(d, -3, 30, 6);
      for (const end of [-252, 222]) {
        for (let k = -2; k <= 2; k += 1) ctx.fillRect(end, k * 12 - 3, 26, 6);
      }
      ctx.fillStyle = '#f2f2ea';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const num = String(Math.round(strip.heading / 10) % 36).padStart(2, '0');
      const recip = String(Math.round(((strip.heading + 180) % 360) / 10) % 36).padStart(2, '0');
      ctx.fillText(num, -215, 0);
      // The far threshold is read from the reciprocal approach, upside down
      // from this side.
      ctx.save();
      ctx.translate(215, 0);
      ctx.rotate(Math.PI);
      ctx.fillText(recip, 0, 0);
      ctx.restore();
      ctx.restore();
      // Windsock, orange cone pointing downwind: the wind blows toward
      // (from + 180) on the compass, which is canvas angle (from + 90).
      const wrad = ((mission.wind.from + 90) * Math.PI) / 180;
      const sx = strip.x + 70 - ox;
      const sy = strip.y + 55 - oy;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - 26);
      ctx.stroke();
      ctx.fillStyle = '#e8641c';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 26);
      ctx.lineTo(sx + Math.cos(wrad) * 26, sy - 26 + Math.sin(wrad) * 26);
      ctx.lineTo(sx + Math.cos(wrad) * 20, sy - 20 + Math.sin(wrad) * 20);
      ctx.closePath();
      ctx.fill();
    }

    return canvas;
  }

  function tileAt(tx, ty) {
    const key = `${tx},${ty}`;
    let tile = tiles.get(key);
    if (!tile) {
      tile = paintTile(tx, ty);
      tiles.set(key, tile);
      if (tiles.size > TILE_LIMIT) {
        const first = tiles.keys().next().value;
        tiles.delete(first);
      }
    }
    return tile;
  }

  /** Paint every tile the camera sees. `view` is {x, y, width, height} in world pixels. */
  function draw(ctx, view) {
    const tx0 = Math.max(0, Math.floor(view.x / TILE));
    const ty0 = Math.max(0, Math.floor(view.y / TILE));
    const tx1 = Math.min(Math.ceil(WORLD / TILE) - 1, Math.floor((view.x + view.width) / TILE));
    const ty1 = Math.min(Math.ceil(WORLD / TILE) - 1, Math.floor((view.y + view.height) / TILE));
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        ctx.drawImage(tileAt(tx, ty), tx * TILE - view.x, ty * TILE - view.y);
      }
    }
  }

  return { heightAt, isWater, runwayAt, draw, towns, river, lakes, runways, route, worldSize: WORLD };
}
