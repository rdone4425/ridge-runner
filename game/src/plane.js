// Ridge Runner — the aeroplane.
// One job: the flight model (throttle, turn, climb, stall, fuel, wind) and the
// drawing of the aircraft itself. It knows nothing about missions or scoring.

import { FLIGHT, WORLD } from './config.js';

const KTS_TO_PX = 0.514; // 1 knot = 0.514 m/s, and 1 world pixel = 1 metre

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function normDeg(d) {
  let v = d % 360;
  if (v < 0) v += 360;
  return v;
}
/** Smallest signed difference from `from` to `to`, in degrees. */
export function headingDiff(from, to) {
  let d = normDeg(to - from);
  if (d > 180) d -= 360;
  return d;
}

export function createPlane(mission) {
  const startAlt = 350; // the runway sits at 350 ft
  return {
    x: mission.home.x,
    y: mission.home.y,
    heading: mission.home.heading, // degrees, 0 = north
    speed: 0, // knots
    altitude: startAlt, // feet
    vspeed: 0, // feet per minute
    throttle: 0,
    fuel: mission.fuel,
    damage: 0,
    bank: 0, // visual bank, degrees
    propAngle: 0,
    onGround: true,
    crashed: false,
    crashReason: '',
    time: 0,
  };
}

/**
 * Advance the plane one fixed step. Returns an event string when something
 * notable happens: 'takeoff', 'touchdown', 'crash-terrain', 'crash-water',
 * 'crash-stall' or ''. Landing quality is judged by the caller (missions),
 * which sees the state at touchdown.
 */
export function stepPlane(plane, input, terrain, wind, mission, dt) {
  if (plane.crashed) return '';
  plane.time += dt;

  // Throttle: wheel and keys nudge it; it moves at a fixed rate so it feels heavy.
  if (input.throttleDelta !== 0) {
    plane.throttle = clamp(plane.throttle + input.throttleDelta * dt * 1.4, 0, 1);
  }
  if (plane.fuel <= 0) plane.throttle = 0;

  if (plane.onGround) {
    // Rolling on the runway: heading is the runway's, speed builds with throttle.
    plane.speed += (plane.throttle * FLIGHT.accel * 1.4 - plane.speed * 0.06) * dt;
    plane.speed = clamp(plane.speed, 0, FLIGHT.maxSpeed);
    const rad = (plane.heading * Math.PI) / 180;
    plane.x += Math.sin(rad) * plane.speed * KTS_TO_PX * dt;
    plane.y += -Math.cos(rad) * plane.speed * KTS_TO_PX * dt;
    plane.altitude = terrain.heightAt(plane.x, plane.y);
    plane.vspeed = 0;
    if (plane.throttle > 0.55 && plane.speed > 62) {
      plane.onGround = false;
      // Lift off clear of the ground margin, so the first airborne step does
      // not read as a touchdown and the plane does not bounce down the strip.
      plane.altitude = terrain.heightAt(plane.x, plane.y) + 70;
      return 'takeoff';
    }
    // Roll off the end of the strip and the grass slows you down.
    if (!terrain.runwayAt(plane.x, plane.y) && plane.speed > 40) {
      plane.speed = Math.max(0, plane.speed - 30 * dt);
    }
    return '';
  }

  // In the air: turn, climb and speed trade against each other.
  const speedFactor = clamp(plane.speed / FLIGHT.cruiseSpeed, 0.4, 1.1);
  const turnRate = input.turn * FLIGHT.turnRate * speedFactor;
  plane.heading = normDeg(plane.heading + turnRate * dt);
  plane.bank += (input.turn * 32 - plane.bank) * Math.min(1, dt * 5);

  const thrust = plane.throttle * FLIGHT.accel;
  const drag = FLIGHT.drag * plane.speed;
  let speedChange = thrust - drag;
  // Climbing trades speed for height; descending gives it back.
  speedChange -= input.climb * 9;
  plane.speed = clamp(plane.speed + speedChange * dt, 0, FLIGHT.maxSpeed);

  let vspeed = input.climb * FLIGHT.climbRate * (0.35 + 0.65 * plane.throttle);
  vspeed -= (1 - plane.throttle) * FLIGHT.sinkRate * 0.5;
  if (plane.speed < FLIGHT.stallSpeed) {
    vspeed -= FLIGHT.stallSink * (1 - plane.speed / FLIGHT.stallSpeed);
  }
  plane.vspeed = vspeed;
  plane.altitude += (vspeed / 60) * dt;
  if (plane.altitude < 0) plane.altitude = 0;

  // Wind pushes the whole aircraft sideways.
  const windRad = ((wind.from + 180) * Math.PI) / 180; // wind blows TOWARD from+180
  plane.x += Math.cos(windRad) * wind.speed * KTS_TO_PX * dt;
  plane.y += Math.sin(windRad) * wind.speed * KTS_TO_PX * dt;

  const rad = (plane.heading * Math.PI) / 180;
  plane.x += Math.sin(rad) * plane.speed * KTS_TO_PX * dt;
  plane.y += -Math.cos(rad) * plane.speed * KTS_TO_PX * dt;

  // The chart has edges.
  plane.x = clamp(plane.x, 80, WORLD - 80);
  plane.y = clamp(plane.y, 80, WORLD - 80);

  // Fuel burns with the throttle.
  const burn =
    (FLIGHT.fuelIdle + plane.throttle * plane.throttle * (FLIGHT.fuelBurn - FLIGHT.fuelIdle)) *
    mission.fuelBurnScale;
  plane.fuel = Math.max(0, plane.fuel - burn * dt);

  plane.propAngle += (2 + plane.throttle * 26) * dt;

  // Ground and water.
  const ground = terrain.heightAt(plane.x, plane.y);
  if (plane.altitude <= ground + FLIGHT.terrainMargin) {
    const strip = terrain.runwayAt(plane.x, plane.y);
    // A strip is landed in either direction: the heading may match the
    // strip or its reciprocal.
    const aligned = strip
      ? Math.min(
          Math.abs(headingDiff(plane.heading, strip.heading)),
          Math.abs(headingDiff(plane.heading, (strip.heading + 180) % 360)),
        )
      : 999;
    if (strip && aligned <= FLIGHT.runwayHeadingTolerance && plane.speed <= 130) {
      plane.onGround = true;
      plane.altitude = ground;
      plane.heading = strip.heading;
      // Keep the sink rate at the moment of touchdown: the mission rules
      // judge a hard landing from it, and it is zeroed just below.
      plane.touchdownVspeed = plane.vspeed;
      plane.vspeed = 0;
      return 'touchdown';
    }
    if (terrain.isWater(plane.x, plane.y) && plane.altitude <= 120) {
      plane.crashed = true;
      plane.crashReason = 'ditched in the river';
      return 'crash-water';
    }
    plane.crashed = true;
    plane.crashReason = plane.speed < FLIGHT.stallSpeed ? 'stalled into the hillside' : 'flew into the terrain';
    return 'crash-terrain';
  }
  if (plane.altitude <= 0) {
    plane.crashed = true;
    plane.crashReason = 'hit the ground';
    return 'crash-terrain';
  }
  return '';
}

/** True when the wing is not flying: speed below stall and sinking fast. */
export function isStalled(plane) {
  return !plane.onGround && plane.speed < FLIGHT.stallSpeed;
}

export function drawPlane(ctx, plane, screenX, screenY, time) {
  const altFactor = clamp(plane.altitude / 6000, 0, 1);
  // Shadow: offset and faded with height, so height reads at a glance.
  const shadowOff = 10 + altFactor * 46;
  ctx.save();
  ctx.translate(screenX + shadowOff, screenY + shadowOff * 0.7);
  ctx.rotate((plane.heading * Math.PI) / 180);
  ctx.fillStyle = `rgba(20, 25, 20, ${0.32 - altFactor * 0.2})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate((plane.heading * Math.PI) / 180);
  // Banking squashes the silhouette, as a banked wing looks from above.
  ctx.scale(Math.cos((plane.bank * Math.PI) / 180) * 0.35 + 0.65, 1);

  // Tail.
  ctx.fillStyle = '#c93a2e';
  ctx.beginPath();
  ctx.moveTo(-4, 20);
  ctx.lineTo(4, 20);
  ctx.lineTo(7, 30);
  ctx.lineTo(-7, 30);
  ctx.closePath();
  ctx.fill();
  // Wings.
  ctx.fillStyle = '#e8e4d8';
  ctx.beginPath();
  ctx.moveTo(-34, -2);
  ctx.lineTo(34, -2);
  ctx.lineTo(26, 8);
  ctx.lineTo(-26, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c93a2e';
  ctx.fillRect(-34, -2, 68, 3);
  // Fuselage.
  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c93a2e';
  ctx.fillRect(-7, -6, 14, 4);
  // Cockpit glass.
  ctx.fillStyle = '#20384a';
  ctx.beginPath();
  ctx.ellipse(0, -10, 4.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Propeller: blurred disc and two blades.
  ctx.fillStyle = 'rgba(40, 40, 40, 0.18)';
  ctx.beginPath();
  ctx.arc(0, -27, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -27);
  ctx.rotate(plane.propAngle);
  ctx.strokeStyle = 'rgba(30, 30, 30, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(0, 12);
  ctx.stroke();
  ctx.restore();
  // Navigation lights: left red, right green, tail white blinking.
  ctx.fillStyle = '#ff2e2e';
  ctx.beginPath();
  ctx.arc(-34, 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2eff5e';
  ctx.beginPath();
  ctx.arc(34, 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(time * 2) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 30, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
