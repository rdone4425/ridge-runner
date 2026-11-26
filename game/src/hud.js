// Ridge Runner — the instruments.
// One job: paint every dial, tape and bar the pilot reads, lit amber on dark glass.
// The world itself is painted elsewhere; this module only reads the state.

import { FLIGHT } from './config.js';
import { nextTarget, checklist } from './missions.js';
import { headingDiff } from './plane.js';

export const THROTTLE_RECT = { x: 0, y: 0, w: 0, h: 0 }; // set when drawn; input drags it

const PANEL = 'rgba(12, 18, 24, 0.72)';
const AMBER = '#ffb347';
const CYAN = '#7fd4ff';
const RED = '#ff5a4e';
const GREEN = '#5ee08a';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function dial(ctx, cx, cy, r, value, min, max, label, unit, accent) {
  panel(ctx, cx - r - 8, cy - r - 8, r * 2 + 16, r * 2 + 16, 12);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const start = Math.PI * 0.75;
  const end = start + frac * Math.PI * 1.5;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, start, end);
  ctx.stroke();
  // Ticks.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const a = start + (i / 6) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
    ctx.stroke();
  }
  ctx.fillStyle = '#f2ede0';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(value)), 0, -2);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 237, 224, 0.65)';
  ctx.fillText(`${label} · ${unit}`, 0, r - 22);
  ctx.restore();
}

function compassTape(ctx, heading, w, h) {
  const x0 = (ctx.canvas.width - w) / 2;
  const y0 = 12;
  panel(ctx, x0, y0, w, h, 10);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 10);
  ctx.clip();
  const pxPerDeg = w / 120;
  const centre = w / 2;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = -60; d <= 60; d += 5) {
    const hdg = Math.round((heading + d) / 5) * 5;
    const norm = ((hdg % 360) + 360) % 360;
    const x = x0 + centre + (d - ((heading + d - hdg) % 5)) * pxPerDeg;
    if (x < x0 + 8 || x > x0 + w - 8) continue;
    const major = norm % 45 === 0;
    ctx.strokeStyle = major ? AMBER : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 8);
    ctx.lineTo(x, y0 + (major ? 22 : 15));
    ctx.stroke();
    if (major) {
      const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm).padStart(3, '0');
      ctx.fillStyle = '#f2ede0';
      ctx.fillText(label, x, y0 + h - 12);
    }
  }
  // Centre caret and digital heading.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x0 + centre - 7, y0 + 2);
  ctx.lineTo(x0 + centre + 7, y0 + 2);
  ctx.lineTo(x0 + centre, y0 + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f2ede0';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, x0 + centre, y0 + h + 14);
}

function bar(ctx, x, y, w, h, frac, colour, label, text) {
  panel(ctx, x - 6, y - 18, w + 12, h + 26, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, frac))), h, 4);
  ctx.fill();
  ctx.fillStyle = '#f2ede0';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y - 6);
  ctx.textAlign = 'right';
  ctx.fillText(text, x + w, y - 6);
}

/** Paint the whole HUD. `game` carries plane, mission state, terrain and camera. */
export function drawHUD(ctx, game, width, height) {
  const { plane, mstate, terrain } = game;
  const time = game.time;

  // Top-left: mission and the checklist.
  const items = checklist(mstate);
  panel(ctx, 12, 12, 268, 30 + items.length * 20, 10);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(mstate.mission.name, 24, 34);
  ctx.font = '11px system-ui, sans-serif';
  items.forEach((item, i) => {
    ctx.fillStyle = item.done ? GREEN : '#f2ede0';
    ctx.fillText(`${item.done ? '✓' : '○'}  ${item.text}`, 24, 56 + i * 20);
  });

  // Top-centre: compass.
  compassTape(ctx, plane.heading, 340, 40);

  // Top-right: score, time, wind.
  panel(ctx, width - 220, 12, 208, 66, 10);
  ctx.fillStyle = '#f2ede0';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${mstate.score}`, width - 24, 36);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 237, 224, 0.65)';
  ctx.fillText('SCORE', width - 24, 52);
  ctx.textAlign = 'left';
  const mins = Math.floor(mstate.elapsed / 60);
  const secs = Math.floor(mstate.elapsed % 60);
  ctx.fillText(`TIME ${mins}:${String(secs).padStart(2, '0')}`, width - 208, 72);
  ctx.fillText(`WIND ${Math.round(game.wind.speed)} kt from ${game.wind.from}°`, width - 208, 52);

  // Bottom-left: airspeed dial.
  dial(ctx, 92, height - 92, 58, plane.speed, 0, 200, 'AIRSPEED', 'kt', plane.speed < FLIGHT.stallSpeed ? RED : CYAN);

  // Bottom-centre: throttle lever (draggable) and fuel / damage bars.
  const tx = width / 2 - 90;
  const ty = height - 150;
  panel(ctx, tx - 8, ty - 8, 196, 116, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(tx + 22, ty + 12, 10, 84);
  ctx.fillStyle = AMBER;
  ctx.fillRect(tx + 22, ty + 12 + (1 - plane.throttle) * 84 - 4, 10, 8);
  ctx.fillStyle = '#f2ede0';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', tx + 44, ty + 24);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(`${Math.round(plane.throttle * 100)}%`, tx + 44, ty + 48);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 237, 224, 0.65)';
  ctx.fillText('wheel or drag', tx + 44, ty + 66);
  THROTTLE_RECT.x = tx + 14;
  THROTTLE_RECT.y = ty + 4;
  THROTTLE_RECT.w = 26;
  THROTTLE_RECT.h = 100;

  bar(ctx, tx, ty + 84, 180, 10, plane.fuel / 100, plane.fuel < 25 ? RED : GREEN, 'FUEL', `${Math.round(plane.fuel)}`);
  bar(ctx, tx, ty + 108, 180, 10, 1 - plane.damage / 100, plane.damage > 60 ? RED : CYAN, 'DAMAGE', `${Math.round(plane.damage)}`);

  // Bottom-right: altimeter and vertical speed.
  dial(ctx, width - 92, height - 92, 58, plane.altitude, 0, 9000, 'ALTITUDE', 'ft', CYAN);
  const vs = plane.vspeed;
  ctx.fillStyle = vs < -700 ? RED : '#f2ede0';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs)} fpm`, width - 92, height - 18);

  // Warnings, centre-top, flashing.
  const warnings = [];
  if (!plane.onGround && plane.speed < FLIGHT.stallSpeed) warnings.push('STALL');
  const ground = terrain.heightAt(plane.x, plane.y);
  if (!plane.onGround && plane.altitude - ground < 300) warnings.push('TERRAIN');
  if (plane.fuel < 25) warnings.push('LOW FUEL');
  if (plane.fuel <= 0) warnings.push('ENGINE OUT');
  if (warnings.length > 0 && Math.floor(time * 3) % 2 === 0) {
    ctx.fillStyle = RED;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(warnings.join('  ·  '), width / 2, 110);
  }

  // Edge arrow to the next objective.
  if (!plane.onGround && !mstate.result) {
    const target = nextTarget(mstate);
    const dx = target.x - plane.x;
    const dy = target.y - plane.y;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 70;
    const ax = cx + Math.cos(angle) * radius;
    const ay = cy + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = target.kind === 'runway' ? GREEN : AMBER;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f2ede0';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${target.label} · ${Math.round(dist / 100) / 10} km`, ax, ay + 26);
  }

  // Refuelled banner.
  if (mstate.refuelled && plane.onGround && !mstate.result) {
    ctx.fillStyle = GREEN;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Refuelled — throttle up to take off', width / 2, height - 170);
  }
}
