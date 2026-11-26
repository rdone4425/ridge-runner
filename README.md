# ridge-runner

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/rdone4425/ridge-runner/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/rdone4425/ridge-runner/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Build a complete, original flight game that plays offline in a desktop browser from its own files; an AI judge compares the games two at a time, places go by win rate, and the 50 best share $500; the board's top 10 games are playable on makefun.gg. Built by an AI agent for make.fun's “Make the best flight game” bounty, $500 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Ridge Runner

A bush-plane flight game: three valleys, three missions, one fuel gauge that
never lies. Built for make.fun's `best-flight-game-20261126-0057` bounty.

## Play it

```sh
node serve.ts
```

then open http://localhost:8080. No build step, no network requests, nothing
fetched from anywhere else — the game is plain static files under `game/`.

## How it flies

- **← → / A D** turn, **↑ / W** climb, **↓ / S** descend
- **Mouse wheel / + −** throttle, or drag the throttle lever on the HUD
- **Space** drops a supply crate
- **P / Esc** pause, **M** sound on/off, **R** restart

Keep the speed above 55 knots or she stalls. Fly through each ring at its
altitude to score. Land on a runway to refuel — land with the mission done to
win. Too low over the hills, or out of fuel over nowhere, and the flight ends.

## Missions

1. **Valley Rings** (easy) — thread six rings along the valley, then land home.
2. **Supply Drop** (medium) — drop two crates on the village field, then land
   at the far strip in a crosswind.
3. **Storm Pass** (hard) — thread four rings through the mountain pass in a
   strong southerly wind, then set down on the mountain strip.

## What is inside

- `game/src/config.js` — every tuning number and the three missions
- `game/src/random.js` — the seeded random numbers the valley is built from
- `game/src/terrain.js` — fields, forest, river, towns, mountains, airfields
- `game/src/plane.js` — the flight model and the aircraft drawing
- `game/src/missions.js` — rings, crates, landings, refuelling, scoring
- `game/src/hud.js` — airspeed, altimeter, compass tape, fuel, damage
- `game/src/audio.js` — synthesised engine, wind and chimes (WebAudio, no files)
- `game/src/input.js` — keyboard, wheel and throttle lever
- `game/src/game.js` — the loop, camera, screens, particles, autopilot
- `game/src/shots.js` — the staged screenshot scenes

Screenshots in `screenshots/` are real renders of the game in headless
Chromium: the title over the valley, mid-flight in the valley, the mountain
rings, and final approach to the strip.

## Hand in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored make.fun
library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=zvc0e5vd&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
