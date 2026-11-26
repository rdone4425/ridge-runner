// Ridge Runner — what counts as winning.
// One job: the mission rules. Rings, supply crates, landings, refuelling and the
// score. It never draws the world and never flies the plane; it watches them.

import { FLIGHT, SCORE, RING_RADIUS, RING_ALT_TOLERANCE, DROP_RADIUS } from './config.js';
import { headingDiff } from './plane.js';

export function createMissionState(mission) {
  return {
    mission,
    rings: mission.rings.map((r) => ({ ...r, passed: false })),
    cratesLeft: mission.crates ?? 0,
    cratesOnTarget: 0,
    crates: [], // falling or landed crates: {x, y, alt, vy, landed, onTarget}
    score: 0,
    popups: [], // {x, y, text, ttl}
    landings: 0,
    result: null, // 'win' | 'lost'
    resultText: '',
    startTime: 0,
    elapsed: 0,
    refuelled: false,
  };
}

function addPopup(state, x, y, text) {
  state.popups.push({ x, y, text, ttl: 2.2 });
  if (state.popups.length > 8) state.popups.shift();
}

/**
 * The point `dist` pixels along the mission route from the destination,
 * walking destination -> ring 1 -> ring 2 -> ... . The route is where the
 * valley is carved, so a fix on it sits over low ground; a fix on the
 * runway's extended centreline does not — the route diverges from the
 * centreline as it runs out, and the centreline east of the strip crosses
 * the valley's northern slope, where the ground is high enough to hold the
 * plane too high to ever land.
 */
export function routePointAt(mission, dist) {
  const pts = [{ x: mission.destination.x, y: mission.destination.y }, ...mission.rings];
  let remaining = dist;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const seg = Math.hypot(dx, dy);
    if (remaining <= seg) {
      const t = seg === 0 ? 0 : remaining / seg;
      return { x: pts[i].x + dx * t, y: pts[i].y + dy * t };
    }
    remaining -= seg;
  }
  // Past the end of the route: extend along the last segment.
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] ?? last;
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const seg = Math.hypot(dx, dy) || 1;
  return { x: last.x + (dx / seg) * remaining, y: last.y + (dy / seg) * remaining };
}

/** The next thing the pilot should fly to: a ring, the drop zone, or the runway. */
export function nextTarget(state) {
  for (const ring of state.rings) {
    if (!ring.passed) return { kind: 'ring', x: ring.x, y: ring.y, alt: ring.alt, label: 'Next ring' };
  }
  if (state.mission.dropZone && state.cratesLeft > 0) {
    return { kind: 'drop', x: state.mission.dropZone.x, y: state.mission.dropZone.y, label: 'Drop zone' };
  }
  return {
    kind: 'runway',
    x: state.mission.destination.x,
    y: state.mission.destination.y,
    label: 'Land at the strip',
  };
}

export function objectiveDone(state) {
  if (state.rings.some((r) => !r.passed)) return false;
  if (state.mission.dropZone && state.cratesOnTarget < (state.mission.crates ?? 0)) return false;
  return true;
}

export function checklist(state) {
  const lines = [];
  const passed = state.rings.filter((r) => r.passed).length;
  lines.push({ text: `Rings ${passed}/${state.rings.length}`, done: passed === state.rings.length });
  if (state.mission.dropZone) {
    lines.push({
      text: `Crates on target ${state.cratesOnTarget}/${state.mission.crates}`,
      done: state.cratesOnTarget >= (state.mission.crates ?? 0),
    });
  }
  lines.push({ text: 'Land at the strip', done: state.result === 'win' });
  return lines;
}

/**
 * Run the mission rules for one step. `events` carries what the plane just did
 * ('takeoff', 'touchdown', 'crash-*') and `input` the pilot's drop press.
 * Returns an event string for sound and banners: 'ring', 'crate', 'landed',
 * 'hard', 'win', 'lost' or ''.
 */
export function stepMission(state, plane, input, terrain, event, dt) {
  if (state.result) return '';
  state.elapsed += dt;
  for (const popup of state.popups) popup.ttl -= dt;
  state.popups = state.popups.filter((p) => p.ttl > 0);

  // Rings: fly through the circle at the ring's altitude.
  for (const ring of state.rings) {
    if (ring.passed || plane.onGround) continue;
    const d = Math.hypot(plane.x - ring.x, plane.y - ring.y);
    if (d < RING_RADIUS && Math.abs(plane.altitude - ring.alt) <= RING_ALT_TOLERANCE) {
      ring.passed = true;
      state.score += SCORE.ring;
      addPopup(state, ring.x, ring.y, `+${SCORE.ring} ring`);
      return 'ring';
    }
  }

  // Dropping a crate: Space over the drop zone, in the air.
  if (input.dropPressed && state.cratesLeft > 0 && !plane.onGround && !plane.crashed) {
    state.cratesLeft -= 1;
    state.crates.push({ x: plane.x, y: plane.y, alt: plane.altitude, vy: 0, landed: false, onTarget: false });
    return 'crate';
  }

  // Crates fall with a parachute, drift with the wind, and land.
  for (const crate of state.crates) {
    if (crate.landed) continue;
    crate.vy = Math.min(crate.vy + 900 * dt, 900); // feet per minute, terminal
    crate.alt -= (crate.vy / 60) * dt;
    const ground = terrain.heightAt(crate.x, crate.y);
    if (crate.alt <= ground + 10) {
      crate.alt = ground + 10;
      crate.landed = true;
      if (state.mission.dropZone) {
        const d = Math.hypot(crate.x - state.mission.dropZone.x, crate.y - state.mission.dropZone.y);
        if (d < DROP_RADIUS) {
          crate.onTarget = true;
          state.cratesOnTarget += 1;
          state.score += SCORE.crate;
          addPopup(state, crate.x, crate.y, `+${SCORE.crate} on target`);
          // The crates can land after the plane is already down: the plane
          // touches down before the last crate lands, so the touchdown
          // found the job unfinished and only refuelled. If the plane is
          // sitting on the ground with the job now done, that is the win.
          if (objectiveDone(state) && plane.onGround && !plane.crashed) {
            const timeBonus = state.elapsed < state.mission.parSeconds ? SCORE.timeParBonus : 0;
            const fuelBonus = Math.round(plane.fuel * SCORE.fuelBonusPerUnit);
            const damagePenalty = Math.round(plane.damage * SCORE.damagePenaltyPerPoint);
            state.score += SCORE.landing + timeBonus + fuelBonus - damagePenalty;
            state.result = 'win';
            state.resultText = `Landed safe. Time bonus ${timeBonus}, fuel bonus ${fuelBonus}.`;
            return 'win';
          }
          return 'crate';
        }
      }
      addPopup(state, crate.x, crate.y, 'crate down — off target');
    }
  }

  if (event === 'touchdown') {
    state.landings += 1;
    const sink = plane.touchdownVspeed ?? plane.vspeed;
    const hard = plane.speed > FLIGHT.landingSpeedMax || sink < -FLIGHT.landingSinkMax;
    if (hard) {
      plane.damage += FLIGHT.hardDamage;
      addPopup(state, plane.x, plane.y, 'Hard landing!');
      if (plane.damage >= 100) {
        plane.crashed = true;
        plane.crashReason = 'the hard landing broke the undercarriage';
        state.result = 'lost';
        state.resultText = 'The hard landing broke the undercarriage.';
        return 'lost';
      }
    }
    if (objectiveDone(state)) {
      // Landing bonus, a time bonus for beating par, and what is left in the tanks.
      // A hard landing still wins — the damage is already on the bill as a
      // penalty — it just does not get the clean-landing treatment. Returning
      // 'hard' here instead would strand the plane on the strip with the job
      // done and no result at all.
      const timeBonus = state.elapsed < state.mission.parSeconds ? SCORE.timeParBonus : 0;
      const fuelBonus = Math.round(plane.fuel * SCORE.fuelBonusPerUnit);
      const damagePenalty = Math.round(plane.damage * SCORE.damagePenaltyPerPoint);
      state.score += SCORE.landing + timeBonus + fuelBonus - damagePenalty;
      state.result = 'win';
      state.resultText = `Landed safe. Time bonus ${timeBonus}, fuel bonus ${fuelBonus}.`;
      return 'win';
    }
    if (hard) return 'hard';
    // A stop at any strip refuels the tanks; take off and finish the job.
    plane.fuel = state.mission.fuel;
    state.refuelled = true;
    addPopup(state, plane.x, plane.y, 'Refuelled — throttle up to take off');
    return 'landed';
  }

  if (event === 'crash-terrain' || event === 'crash-water') {
    state.result = 'lost';
    state.resultText = `Crashed — ${plane.crashReason}.`;
    return 'lost';
  }

  if (plane.fuel <= 0 && plane.onGround) {
    // Ran dry on the strip: the ground crew tops the tanks up.
    plane.fuel = state.mission.fuel;
  }

  return '';
}

/** Score shown on the win screen, broken down for the pilot. */
export function scoreBreakdown(state, plane) {
  return {
    rings: state.rings.filter((r) => r.passed).length * SCORE.ring,
    crates: state.cratesOnTarget * SCORE.crate,
    landing: state.result === 'win' ? SCORE.landing : 0,
    time: state.result === 'win' && state.elapsed < state.mission.parSeconds ? SCORE.timeParBonus : 0,
    fuel: state.result === 'win' ? Math.round(plane.fuel * SCORE.fuelBonusPerUnit) : 0,
    damage: state.result === 'win' ? -Math.round(plane.damage * SCORE.damagePenaltyPerPoint) : 0,
  };
}

export { headingDiff };
