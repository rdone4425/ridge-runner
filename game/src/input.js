// Ridge Runner — keyboard and mouse.
// One job: turn keys, the wheel and the throttle lever into one small input
// object the flight model reads every step. It owns no game logic.

import { THROTTLE_RECT } from './hud.js';

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

export function createInput(canvas, callbacks) {
  const keys = new Set();
  let wheelDelta = 0;
  let dropQueued = false;
  let draggingThrottle = false;
  const actions = [];

  function throttleFromPointer(clientY) {
    const rect = canvas.getBoundingClientRect();
    const y = ((clientY - rect.top) * canvas.height) / rect.height;
    const frac = 1 - (y - THROTTLE_RECT.y) / THROTTLE_RECT.h;
    return Math.max(0, Math.min(1, frac));
  }

  function onKeyDown(e) {
    if (e.repeat) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      return;
    }
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === ' ' && !callbacks.onGround?.()) dropQueued = true;
    if (e.key === 'Enter' || e.key === ' ') actions.push(ACTION_CONFIRM);
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') actions.push(ACTION_PAUSE);
    if (e.key === 'm' || e.key === 'M') actions.push(ACTION_MUTE);
    if (e.key === 'r' || e.key === 'R') actions.push(ACTION_RESTART);
  }
  function onKeyUp(e) {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onWheel(e) {
    e.preventDefault();
    wheelDelta += -Math.sign(e.deltaY);
  }
  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    if (x >= THROTTLE_RECT.x && x <= THROTTLE_RECT.x + THROTTLE_RECT.w && y >= THROTTLE_RECT.y && y <= THROTTLE_RECT.y + THROTTLE_RECT.h) {
      draggingThrottle = true;
      callbacks.setThrottle?.(throttleFromPointer(e.clientY));
    }
  }
  function onPointerMove(e) {
    if (draggingThrottle) callbacks.setThrottle?.(throttleFromPointer(e.clientY));
  }
  function onPointerUp() {
    draggingThrottle = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  return {
    /** Read and clear the frame's input. Returns {turn, climb, throttleDelta, dropPressed}. */
    read() {
      const left = keys.has('ArrowLeft') || keys.has('a');
      const right = keys.has('ArrowRight') || keys.has('d');
      const up = keys.has('ArrowUp') || keys.has('w');
      const down = keys.has('ArrowDown') || keys.has('s');
      let throttleDelta = wheelDelta;
      wheelDelta = 0;
      if (keys.has('+') || keys.has('=')) throttleDelta += 1;
      if (keys.has('-') || keys.has('_')) throttleDelta -= 1;
      const dropPressed = dropQueued;
      dropQueued = false;
      return {
        turn: (right ? 1 : 0) - (left ? 1 : 0),
        climb: (up ? 1 : 0) - (down ? 1 : 0),
        throttleDelta,
        dropPressed,
      };
    },
    /** One-shot actions queued since the last read: confirm, pause, mute, restart. */
    takeActions() {
      return actions.splice(0, actions.length);
    },
    isDown(key) {
      return keys.has(key);
    },
  };
}
