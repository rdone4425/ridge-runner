// Ridge Runner — the screenshot scenes behind ?shot=start|play|rings|land.
// Each one stages a real state of the real game and paints it twice, so the
// frame is what playing really looks like and the same seed always gives the
// same frame. The autopilot flies the real rules forward; the landing scene
// starts on a genuine final approach (rings already threaded) and flies the
// last seconds in.

import { MISSIONS } from './config.js';

/**
 * Stage a shot. `api` is what createGame returns. `name` is one of
 * start | play | rings | land.
 */
export function stageShot(api, name) {
  const { game, startMission, showScreen } = api;
  if (name === 'start') {
    showScreen('title');
    game.time = 40;
    return;
  }
  if (name === 'play') {
    startMission(0);
    api.stage(18);
    return;
  }
  if (name === 'rings') {
    startMission(2);
    api.stage(30);
    return;
  }
  if (name === 'land') {
    startMission(0);
    // The rings are threaded; the pilot is on final for the home strip.
    // Home's fix is the reciprocal one (east of the strip), so the approach
    // is westbound, heading 270, on the extended centreline. The spot 600 px
    // out is valley floor (about 400 ft); further east the centreline
    // crosses a hill, so the scene starts here, 800 ft up.
    for (const ring of game.mstate.rings) ring.passed = true;
    const strip = MISSIONS[0].home;
    const rad = (strip.heading * Math.PI) / 180;
    const plane = game.plane;
    plane.x = strip.x + Math.sin(rad) * 600;
    plane.y = strip.y - Math.cos(rad) * 600;
    plane.heading = (strip.heading + 180) % 360;
    plane.altitude = 800;
    plane.speed = 90;
    plane.throttle = 0.45;
    plane.onGround = false;
    api.stage(7);
    return;
  }
  showScreen('title');
}
