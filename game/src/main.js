// Ridge Runner — boot.
// One job: read the URL, start the game, and stage a screenshot scene when
// asked. ?shot=start|play|rings|land stages that scene and sets
// window.__shotReady for a screenshot; ?seed=N shifts the world seeds.
// Without a shot, the game simply starts on its title screen.

import { createGame } from './game.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const canvas = document.getElementById('game');
const api = createGame(canvas);

// Buttons the game loop does not own: back to the title, and the pause button
// in the status bar (the P key does the same).
document.getElementById('title-btn').addEventListener('click', () => api.showScreen('title'));
document.getElementById('pause-btn').addEventListener('click', () => {
  if (api.game.screen === 'flying') api.showScreen('paused');
  else if (api.game.screen === 'paused') api.showScreen('flying');
});

// For playtesting from the console and from the shot script.
window.__game = api;

if (shot) {
  // Let the first frame paint, then stage the scene deterministically.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        stageShot(api, shot);
        window.__shotReady = true;
      } catch (error) {
        window.__shotError = String(error);
      }
    });
  });
}
