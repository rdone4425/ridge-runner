// Ridge Runner — the game itself.
// One job: the loop, the camera, the screens and everything painted over the
// terrain. Physics lives in plane.js, rules in missions.js, dials in hud.js.

import { STEP, MISSIONS, BEST_KEY_PREFIX, WORLD, FLIGHT } from './config.js';
import { createTerrain } from './terrain.js';
import { createPlane, stepPlane, drawPlane, isStalled, headingDiff } from './plane.js';
import { createMissionState, stepMission, nextTarget, scoreBreakdown, routePointAt } from './missions.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { drawHUD } from './hud.js';
import { createRandom } from './random.js';

const SCREENS = ['title', 'select', 'paused', 'over'];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function readBest(id) {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY_PREFIX + id) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function writeBest(id, score) {
  try {
    window.localStorage.setItem(BEST_KEY_PREFIX + id, String(score));
  } catch {
    /* private mode: best scores simply do not persist */
  }
}

export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  const audio = createAudio();
  const screens = {};
  for (const name of SCREENS) screens[name] = document.getElementById(`screen-${name}`);
  const overTitle = document.getElementById('over-title');
  const overText = document.getElementById('over-text');
  const overScore = document.getElementById('over-score');
  const statusEl = document.getElementById('status');

  const game = {
    screen: 'title',
    missionIndex: 0,
    terrain: null,
    plane: null,
    mstate: null,
    wind: { from: 270, speed: 6 },
    time: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    particles: [],
    clouds: [],
    banner: null, // {text, ttl}
    overDelay: 0,
    frozen: false, // shot staging freezes the loop after staging
  };

  const input = createInput(canvas, {
    onGround: () => game.plane?.onGround ?? true,
    setThrottle: (value) => {
      if (game.plane) game.plane.throttle = value;
    },
  });

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function showScreen(name) {
    game.screen = name;
    for (const key of SCREENS) screens[key].classList.toggle('hidden', key !== name);
    if (name === 'select') renderMissionCards();
    if (name === 'title') {
      statusEl.textContent = 'Ridge Runner — a bush-plane game. Keyboard and mouse, no downloads, no network.';
    }
  }

  function renderMissionCards() {
    const list = document.getElementById('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((mission, index) => {
      const card = document.createElement('button');
      card.className = 'mission-card';
      card.type = 'button';
      const best = readBest(mission.id);
      card.innerHTML =
        `<strong>${mission.name}</strong><span class="difficulty">${mission.difficulty}</span>` +
        `<span class="tag">${mission.tag}</span><p>${mission.brief}</p>` +
        `<span class="best">${best > 0 ? `Best score: ${best}` : 'Not flown yet'}</span>`;
      card.addEventListener('click', () => {
        audio.ensure();
        startMission(index);
      });
      list.appendChild(card);
    });
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    game.missionIndex = index;
    game.terrain = createTerrain(mission.seed, mission);
    game.plane = createPlane(mission);
    game.mstate = createMissionState(mission);
    game.wind = mission.wind;
    game.time = 0;
    game.particles = [];
    game.banner = null;
    game.overDelay = 0;
    const crng = createRandom(mission.seed + 55);
    game.clouds = [];
    for (let i = 0; i < 26; i += 1) {
      game.clouds.push({
        x: crng() * 6400,
        y: crng() * 6400,
        rx: 120 + crng() * 180,
        ry: 50 + crng() * 60,
        speed: 0.3 + crng() * 0.4,
      });
    }
    showScreen('flying');
    statusEl.textContent = `${mission.name} — ${mission.brief}`;
  }

  function showOver(win) {
    const state = game.mstate;
    const plane = game.plane;
    const breakdown = scoreBreakdown(state, plane);
    if (win) {
      overTitle.textContent = 'Mission complete';
      overText.textContent = state.resultText;
      overScore.innerHTML =
        `Rings ${breakdown.rings} · Crates ${breakdown.crates} · Landing ${breakdown.landing}<br>` +
        `Time bonus ${breakdown.time} · Fuel bonus ${breakdown.fuel} · Damage ${breakdown.damage}<br>` +
        `<strong>Total ${state.score}</strong> — best ${Math.max(readBest(state.mission.id), state.score)}`;
      writeBest(state.mission.id, Math.max(readBest(state.mission.id), state.score));
      audio.win();
    } else {
      overTitle.textContent = 'Down';
      overText.textContent = state.resultText;
      overScore.innerHTML = `Score ${state.score} · Rings ${state.rings.filter((r) => r.passed).length}/${state.rings.length}<br>Press R or the button to fly it again.`;
      audio.crash();
    }
    showScreen('over');
  }

  function burst(x, y, colour, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed;
      game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: 0.6 + Math.random() * 0.9, colour, size: 2 + Math.random() * 4 });
    }
  }

  function step(dt) {
    game.time += dt;
    if (game.screen !== 'flying') return;
    const plane = game.plane;
    const frame = input.read();
    const event = stepPlane(plane, frame, game.terrain, game.wind, game.mstate.mission, dt);
    const missionEvent = stepMission(game.mstate, plane, frame, game.terrain, event, dt);
    audio.update(plane);

    if (event === 'takeoff') game.banner = { text: 'Airborne — gear up, flaps up', ttl: 2.5 };
    if (missionEvent === 'ring') {
      audio.ring();
      game.banner = { text: 'Ring!', ttl: 1.4 };
    }
    if (missionEvent === 'crate') audio.crate();
    if (event === 'touchdown') {
      audio.touchdown();
      burst(plane.x, plane.y, '#cbb98a', 14, 60);
      if (missionEvent === 'hard') {
        audio.hard();
        game.shake = 10;
      }
    }
    if (missionEvent === 'landed') game.banner = { text: 'Refuelled — throttle up to take off', ttl: 3 };
    if (plane.crashed && !game.mstate.result) {
      burst(plane.x, plane.y, '#e8641c', 40, 160);
      burst(plane.x, plane.y, '#333', 24, 90);
      game.shake = 16;
    }
    if (missionEvent === 'win' || missionEvent === 'lost') {
      game.overDelay = 1.2;
    }
    if (game.overDelay > 0) {
      game.overDelay -= dt;
      if (game.overDelay <= 0) showOver(missionEvent === 'win' || game.mstate.result === 'win');
    }

    // Smoke trail when the airframe is hurt.
    if (!plane.onGround && !plane.crashed && plane.damage > 30 && Math.random() < 0.5) {
      game.particles.push({ x: plane.x, y: plane.y + 10, vx: -8, vy: 4, ttl: 1.4, colour: '#555', size: 5 });
    }
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
    }
    game.particles = game.particles.filter((p) => p.ttl > 0);
    if (game.banner) {
      game.banner.ttl -= dt;
      if (game.banner.ttl <= 0) game.banner = null;
    }
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);
    // Clouds drift with the wind.
    for (const cloud of game.clouds) {
      cloud.x += Math.cos(((game.wind.from + 180) * Math.PI) / 180) * game.wind.speed * 0.514 * cloud.speed * dt;
      cloud.y += Math.sin(((game.wind.from + 180) * Math.PI) / 180) * game.wind.speed * 0.514 * cloud.speed * dt;
      if (cloud.x < -300) cloud.x += 7000;
      if (cloud.x > 6700) cloud.x -= 7000;
      if (cloud.y < -300) cloud.y += 7000;
      if (cloud.y > 6700) cloud.y -= 7000;
    }
  }

  function viewRect() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    return { width: w, height: h };
  }

  function render() {
    const { width, height } = viewRect();
    ctx.clearRect(0, 0, width, height);
    if (!game.plane) {
      // Title backdrop: the first mission's valley, slowly panning.
      if (!game.terrain) game.terrain = createTerrain(MISSIONS[0].seed, MISSIONS[0]);
      const t = game.time * 12;
      game.terrain.draw(ctx, { x: 400 + t, y: 400, width, height });
      return;
    }
    const plane = game.plane;
    // Camera follows the plane with a lead toward where it is going.
    const lead = 90;
    const rad = (plane.heading * Math.PI) / 180;
    const cx = plane.x + Math.sin(rad) * lead - width / 2;
    const cy = plane.y - Math.cos(rad) * lead - height / 2;
    const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    game.camera.x = clamp(cx, 0, 6400 - width);
    game.camera.y = clamp(cy, 0, 6400 - height);
    const view = { x: game.camera.x + shakeX, y: game.camera.y + shakeY, width, height };

    game.terrain.draw(ctx, view);

    ctx.save();
    ctx.translate(-view.x, -view.y);

    // Drop zone.
    const mission = game.mstate.mission;
    if (mission.dropZone) {
      const dz = mission.dropZone;
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.arc(dz.x, dz.y, 170, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(dz.x - 40, dz.y);
      ctx.lineTo(dz.x + 40, dz.y);
      ctx.moveTo(dz.x, dz.y - 40);
      ctx.lineTo(dz.x, dz.y + 40);
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DROP ZONE', dz.x, dz.y - 190);
    }

    // Rings.
    game.mstate.rings.forEach((ring, i) => {
      const next = game.mstate.rings.find((r) => !r.passed);
      const isNext = ring === next;
      const pulse = isNext ? 1 + Math.sin(game.time * 4) * 0.12 : 1;
      ctx.save();
      ctx.translate(ring.x, ring.y);
      ctx.strokeStyle = ring.passed ? '#5ee08a' : isNext ? '#ffb347' : '#7fd4ff';
      ctx.lineWidth = isNext ? 8 : 5;
      ctx.globalAlpha = ring.passed ? 0.7 : 1;
      ctx.beginPath();
      ctx.arc(0, 0, 130 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 130 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ring.passed ? '#5ee08a' : '#f2ede0';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ring.passed ? '✓' : String(i + 1), 0, 7);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`${ring.alt.toLocaleString()} ft`, 0, -148);
      ctx.restore();
    });

    // Crates: parachute while falling, a box once down.
    for (const crate of game.mstate.crates) {
      if (!crate.landed) {
        ctx.fillStyle = '#e8641c';
        ctx.beginPath();
        ctx.arc(crate.x, crate.y - 26, 20, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = '#e8641c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(crate.x - 18, crate.y - 26);
        ctx.lineTo(crate.x - 6, crate.y - 6);
        ctx.moveTo(crate.x + 18, crate.y - 26);
        ctx.lineTo(crate.x + 6, crate.y - 6);
        ctx.stroke();
      }
      ctx.fillStyle = '#8a6a3c';
      ctx.fillRect(crate.x - 7, crate.y - 7, 14, 14);
      ctx.strokeStyle = '#5e4526';
      ctx.strokeRect(crate.x - 7, crate.y - 7, 14, 14);
    }

    // Clouds drift above the ground, below the aircraft.
    for (const cloud of game.clouds) {
      if (cloud.x + cloud.rx < view.x || cloud.x - cloud.rx > view.x + width || cloud.y + cloud.ry < view.y || cloud.y - cloud.ry > view.y + height) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.ellipse(cloud.x, cloud.y, cloud.rx, cloud.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cloud.x - cloud.rx * 0.4, cloud.y + cloud.ry * 0.3, cloud.rx * 0.6, cloud.ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Score popups.
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const popup of game.mstate.popups) {
      ctx.globalAlpha = clamp(popup.ttl / 1.2, 0, 1);
      ctx.fillStyle = '#ffb347';
      ctx.fillText(popup.text, popup.x, popup.y - (2.2 - popup.ttl) * 30);
    }
    ctx.globalAlpha = 1;

    // Particles.
    for (const p of game.particles) {
      ctx.globalAlpha = clamp(p.ttl, 0, 1);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The aircraft (unless it is a wreck on the ground).
    if (!plane.crashed) {
      drawPlane(ctx, plane, plane.x, plane.y, game.time);
    } else {
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(plane.x, plane.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8641c';
      ctx.beginPath();
      ctx.arc(plane.x, plane.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Stall buffet: shake the whole frame a little.
    if (isStalled(plane) && game.screen === 'flying') {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      ctx.restore();
    }

    drawHUD(ctx, game, width, height);

    if (game.banner) {
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(game.banner.text, width / 2, 150);
    }
  }

  /** The autopilot that stages screenshots: it flies the real rules toward the next objective. */
  function autopilotInput() {
    const plane = game.plane;
    const target = nextTarget(game.mstate);
    // Aim point: rings and the drop zone are flown to directly. For a runway,
    // first fly to a fix 1300 px out on the extended centreline, then turn
    // onto the runway heading and descend — a real final approach.
    let aimX = target.x;
    let aimY = target.y;
    let wantAlt = target.kind === 'ring' ? target.alt : 2000;
    let onFinal = false;
    if (target.kind === 'runway') {
      // Final approach. The landing heading is the strip direction the
      // plane is already closest to, and the aim is a point 1000 px past
      // the strip along it — so the plane flies THROUGH the strip on the
      // centreline instead of steering at the strip's centre and swinging
      // away as it passes over it. The height follows a glide slope: 20 ft
      // over the strip, rising 0.24 ft per pixel past the near threshold —
      // low enough that the plane is under the touchdown height while still
      // over the strip.
      const dest = game.mstate.mission.destination;
      const stripHeading = dest.heading;
      const recip = (stripHeading + 180) % 360;
      // Landing direction: far out, land toward the strip from the side the
      // plane is on (east of it means a westbound landing); on final, keep
      // the direction the plane is already flying. A purely position-based
      // choice flips the moment the plane crosses the strip centre on
      // final and sends it into a 180-degree turn at 400 ft.
      const stripRad = (stripHeading * Math.PI) / 180;
      const alongStrip =
        (plane.x - target.x) * Math.sin(stripRad) + (plane.y - target.y) * -Math.cos(stripRad);
      const distRunway = Math.hypot(target.x - plane.x, target.y - plane.y);
      const landHeading =
        distRunway > 1000
          ? alongStrip > 0
            ? recip
            : stripHeading
          : Math.abs(headingDiff(plane.heading, stripHeading)) <=
              Math.abs(headingDiff(plane.heading, recip))
            ? stripHeading
            : recip;
      const landRad = (landHeading * Math.PI) / 180;
      const landX = Math.sin(landRad);
      const landY = -Math.cos(landRad);
      const toRunwayX = target.x - plane.x;
      const toRunwayY = target.y - plane.y;
      const bearingToRunway = ((Math.atan2(toRunwayX, -toRunwayY) * 180) / Math.PI + 360) % 360;
      const groundAtRunway = game.terrain.heightAt(target.x, target.y);
      // Along-track and cross-track of the plane against the extended
      // centreline, and the plane's projection onto that line.
      const along = (plane.x - target.x) * landX + (plane.y - target.y) * landY;
      const crossTrack = Math.abs(
        (plane.x - target.x) * Math.cos(landRad) + (plane.y - target.y) * Math.sin(landRad),
      );
      const projX = target.x + landX * along;
      const projY = target.y + landY * along;
      const groundHere = game.terrain.heightAt(plane.x, plane.y);
      const overRunway = Math.abs(along) <= 260 && crossTrack <= 45;
      // The glide slope is 20 ft over the strip, rising 0.24 ft per pixel
      // past the near threshold — but never below 150 ft over the ground
      // under the plane, or a slightly-off-centreline approach descends
      // into the higher ground beside the strip. Over the strip itself the
      // floor drops away and the slope is the aim. (The floor is from the
      // ground under the plane, not the centreline: the approach flies a
      // diagonal through the valley, and the centreline east of the strip
      // crosses high ground that would hold the plane up.)
      const slopeAlt = groundAtRunway + 20 + Math.max(0, distRunway - 260) * 0.24;
      const glideAlt = overRunway ? slopeAlt : Math.max(slopeAlt, groundHere + 150);
      const aligned = Math.abs(headingDiff(plane.heading, landHeading)) <= 30;
      // Intercept the centreline: when the plane is off it by more than
      // 30 px, aim at a point on the centreline ahead of the plane's own
      // projection onto it, so it crabs in instead of paralleling the strip
      // and running out of final. 30 px, not 50: the strip is only 45 px
      // half-wide, and a plane that stops intercepting at 49 px off flies
      // through 4 px outside the strip and into the grass beside it.
      const interceptAhead = Math.min(800, Math.max(150, distRunway * 0.5));
      let finalAimX, finalAimY;
      if (crossTrack > 30) {
        finalAimX = projX + landX * interceptAhead;
        finalAimY = projY + landY * interceptAhead;
      } else {
        finalAimX = target.x + landX * 1000;
        finalAimY = target.y + landY * 1000;
      }
      // If the direct line to the strip already runs along it (within 25
      // degrees) AND the plane is already near the extended centreline,
      // fly straight in — that is the valley itself in the first mission,
      // and a fix would only drag the plane cross-country over the hills.
      // A plane far off the centreline must join it at the fix first, or
      // the straight line to a point past the strip passes beside the
      // runway instead of over it.
      const direct =
        (Math.abs(headingDiff(bearingToRunway, stripHeading)) <= 25 ||
          Math.abs(headingDiff(bearingToRunway, recip)) <= 25) &&
        crossTrack < 250;
      if (direct) {
        aimX = finalAimX;
        aimY = finalAimY;
        wantAlt = Math.min(glideAlt, 1200);
        // On the approach: lined up and within 2500 px. The whole approach
        // counts, not just the last 1000 px — the hills past the strip
        // would otherwise keep tripping the terrain climb and the plane
        // would never get down.
        onFinal = distRunway < 2500 && aligned;
      } else {
        // Otherwise first fly to a fix 2000 px out along the mission route.
        // The fix sits on the route (in the valley), not on the runway's
        // extended centreline — the route diverges from the centreline as it
        // runs out, and the centreline east of the strip crosses high
        // ground that would hold the plane too high to ever land.
        const fix = routePointAt(game.mstate.mission, 2000);
        const fixX = fix.x;
        const fixY = fix.y;
        const distFix = Math.hypot(fixX - plane.x, fixY - plane.y);
        const hdx = Math.sin((plane.heading * Math.PI) / 180);
        const hdy = -Math.cos((plane.heading * Math.PI) / 180);
        const fixAhead = (fixX - plane.x) * hdx + (fixY - plane.y) * hdy;
        // The fix counts as reached when the plane gets close to it or flies
        // past it (abeam). Insisting it fly through a 150 px circle backfires:
        // a plane that passes abeam 200 px off turns around to re-fly the fix
        // and the go-around flies it into the hills. The abeam pass leaves it
        // near enough the centreline for the final to converge.
        if (distFix > 400 && fixAhead > 0) {
          aimX = fixX;
          aimY = fixY;
          // The fix sits on the glide slope, so the final is one steady
          // descent instead of a dive after a level cruise. Its altitude is
          // 400 ft over the destination strip — a fixed 850 ft is too low
          // when the strip itself sits high (the mountain strip), and the
          // plane cannot shed 350 ft in the short hop from the drop zone.
          wantAlt = Math.max(850, groundAtRunway + 400);
        } else {
          aimX = finalAimX;
          aimY = finalAimY;
          wantAlt = Math.min(glideAlt, 1200);
          // True final: close to the strip and lined up. Only then does
          // the descent override the terrain climb.
          onFinal = distRunway < 2500 && aligned;
        }
      }
    }
    const dx = aimX - plane.x;
    const dy = aimY - plane.y;
    const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const turnError = headingDiff(plane.heading, bearing);
    let turn = clamp(turnError / 25, -1, 1);
    // Terrain avoidance: if the ground ahead is high and one side is clearly
    // lower, steer around the high ground instead of climbing into it.
    // Never on final — the strip is the aim and the approach is lined up.
    const aheadRad = (plane.heading * Math.PI) / 180;
    const aheadX0 = plane.x + Math.sin(aheadRad) * 500;
    const aheadY0 = plane.y - Math.cos(aheadRad) * 500;
    const groundAhead0 = game.terrain.heightAt(aheadX0, aheadY0);
    if (!plane.onGround && !onFinal && groundAhead0 + 400 > plane.altitude) {
      const leftRad = ((plane.heading - 45) * Math.PI) / 180;
      const rightRad = ((plane.heading + 45) * Math.PI) / 180;
      const groundLeft = game.terrain.heightAt(plane.x + Math.sin(leftRad) * 500, plane.y - Math.cos(leftRad) * 500);
      const groundRight = game.terrain.heightAt(plane.x + Math.sin(rightRad) * 500, plane.y - Math.cos(rightRad) * 500);
      if (groundLeft < groundAhead0 - 300 && groundLeft <= groundRight) turn = -1;
      else if (groundRight < groundAhead0 - 300) turn = 1;
    }
    let climb = 0;
    if (plane.onGround) return { turn: 0, climb: 0, throttleDelta: 2, dropPressed: false };
    // Climb if the ground ahead is high, or the next ring is above us.
    // On final the ground-ahead climb does not apply: the strip is in the
    // valley and the approach is a descent, not a climb over the hills.
    // The margin is 350 ft — enough to stay clear, low enough that the
    // plane can cruise the valley at 800 ft instead of riding 900 ft over
    // every field and arriving at the strip too high to land.
    const aheadX = plane.x + Math.sin((plane.heading * Math.PI) / 180) * 500;
    const aheadY = plane.y - Math.cos((plane.heading * Math.PI) / 180) * 500;
    const groundAhead = game.terrain.heightAt(aheadX, aheadY);
    if (groundAhead + 350 > plane.altitude && !onFinal) climb = 1;
    else if (onFinal) climb = clamp((wantAlt - plane.altitude) / 150, -1, 1);
    else if (plane.altitude < wantAlt - 300) climb = 0.6;
    else if (plane.altitude > wantAlt + 500) climb = -0.6;
    // Descending adds speed — a steep descent at idle still accelerates
    // the plane, so level off to bleed speed rather than arriving at the
    // strip at 160 knots. The throttle formula below can only hold the
    // target speed in level flight.
    const targetSpeed = target.kind === 'runway' ? 85 : 125;
    if (plane.speed > targetSpeed + 12 && climb < 0) climb = 0;
    // Throttle is a speed controller, not a fixed setting: at a steady speed
    // thrust balances drag plus the cost of climbing, so the throttle that
    // holds 125 knots level is about 0.31 and the one that holds it in a
    // full climb is about 0.72. A fixed 0.55-0.75 just pins the dial at the
    // 175-knot stop whenever the wing is level.
    const wantThrottle = clamp(
      (FLIGHT.drag * targetSpeed + climb * 9) / FLIGHT.accel,
      0.15,
      1,
    );
    const throttleDelta = clamp((wantThrottle - plane.throttle) * 3, -1, 1);
    const dropPressed = target.kind === 'drop' && Math.hypot(dx, dy) < 120 && game.mstate.cratesLeft > 0;
    return { turn, climb, throttleDelta, dropPressed };
  }

  /** Play the real rules forward with the autopilot for `seconds`, then freeze. */
  function stage(seconds) {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
      const frame = autopilotInput();
      const event = stepPlane(game.plane, frame, game.terrain, game.wind, game.mstate.mission, STEP);
      stepMission(game.mstate, game.plane, frame, game.terrain, event, STEP);
      game.time += STEP;
    }
    game.frozen = true;
    render();
    render();
  }

  function loop(now) {
    if (game.frozen) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - (loop.last ?? now)) / 1000 || 0);
    loop.last = now;
    if (game.screen === 'flying' || game.screen === 'paused') {
      let remaining = dt;
      while (remaining > 0) {
        const stepDt = Math.min(STEP, remaining);
        if (game.screen === 'flying') step(stepDt);
        remaining -= stepDt;
      }
    } else {
      game.time += dt;
    }
    for (const action of input.takeActions()) {
      if (action === ACTION_PAUSE) {
        if (game.screen === 'flying') showScreen('paused');
        else if (game.screen === 'paused') showScreen('flying');
      } else if (action === ACTION_MUTE) {
        audio.ensure();
        const muted = audio.toggleMute();
        document.getElementById('mute-btn').textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
      } else if (action === ACTION_RESTART) {
        if (game.screen === 'flying' || game.screen === 'paused' || game.screen === 'over') startMission(game.missionIndex);
      } else if (action === ACTION_CONFIRM) {
        if (game.screen === 'title') showScreen('select');
        else if (game.screen === 'over') showScreen('select');
      }
    }
    render();
  }

  // Wire the DOM buttons.
  document.getElementById('fly-btn').addEventListener('click', () => {
    audio.ensure();
    showScreen('select');
  });
  document.getElementById('how-btn').addEventListener('click', () => {
    document.getElementById('howto').classList.toggle('hidden');
  });
  document.getElementById('resume-btn').addEventListener('click', () => showScreen('flying'));
  document.getElementById('restart-btn').addEventListener('click', () => startMission(game.missionIndex));
  document.getElementById('quit-btn').addEventListener('click', () => showScreen('title'));
  document.getElementById('again-btn').addEventListener('click', () => startMission(game.missionIndex));
  document.getElementById('missions-btn').addEventListener('click', () => showScreen('select'));
  document.getElementById('mute-btn').addEventListener('click', () => {
    audio.ensure();
    const muted = audio.toggleMute();
    document.getElementById('mute-btn').textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
  });

  showScreen('title');
  requestAnimationFrame(loop);

  return { game, startMission, showScreen, stage, autopilotInput, audio };
}
