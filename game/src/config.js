// Ridge Runner — configuration and the three missions.
// One job: every number the game tunes lives here, so a balance change is one edit.

export const STEP = 1 / 60; // fixed physics step, seconds
export const WORLD = 6400; // world is WORLD x WORLD pixels; 1 pixel = 1 metre
export const TILE = 512; // terrain is painted in TILE x TILE tiles, cached

// Flight model. Speeds in knots, altitudes in feet, angles in degrees.
export const FLIGHT = {
  minSpeed: 45, // below this the wing stops flying and the plane sinks
  stallSpeed: 55, // below this the STALL warning shows and sink grows
  cruiseSpeed: 120,
  maxSpeed: 175,
  climbRate: 1800, // feet per minute at full throttle, wings level
  sinkRate: 900, // feet per minute gliding at idle, wings level
  stallSink: 2200, // extra sink when stalled
  turnRate: 30, // degrees per second at cruise speed, full bank
  accel: 22, // knots per second at full throttle
  drag: 0.055, // knots per second lost per knot of speed
  fuelBurn: 0.24, // fuel units per second at full throttle
  fuelIdle: 0.05, // fuel units per second at idle
  runwayHeadingTolerance: 30, // degrees off the runway centreline allowed
  landingSpeedMax: 100, // knots; faster and the touchdown is hard
  landingSinkMax: 700, // feet per minute; steeper and the touchdown is hard
  hardDamage: 25, // damage from a hard landing
  terrainMargin: 40, // feet above the ground the plane must keep
};

// Scoring.
export const SCORE = {
  ring: 250,
  crate: 500,
  landing: 1000,
  timeParBonus: 500, // for beating the mission par time
  fuelBonusPerUnit: 6, // per fuel unit left at landing
  damagePenaltyPerPoint: 4, // per damage point at landing
};

export const RING_RADIUS = 130; // pixels; fly through the circle
export const RING_ALT_TOLERANCE = 450; // feet either side of the ring altitude
export const DROP_RADIUS = 170; // pixels; crates must land inside this

// Missions. Each names its world seed, wind, fuel, objectives and par time.
// The world generator reads the seed, so the same mission always flies the same valley.
export const MISSIONS = [
  {
    id: 'valley-rings',
    name: 'Valley Rings',
    tag: 'Learn the valley',
    difficulty: 'Easy',
    seed: 20261126,
    wind: { from: 270, speed: 6 }, // wind FROM the west, light
    fuel: 100,
    fuelBurnScale: 0.8,
    parSeconds: 150,
    brief:
      'Fly the valley and thread all six rings in order, then bring her home to the grass strip. ' +
      'Keep the speed above 55 knots and watch the fuel gauge.',
    rings: [
      { x: 1500, y: 900, alt: 1000 },
      { x: 2350, y: 1500, alt: 1300 },
      { x: 3100, y: 1150, alt: 1600 },
      { x: 3900, y: 1900, alt: 1500 },
      { x: 4700, y: 1500, alt: 1300 },
      { x: 5400, y: 2200, alt: 1100 },
    ],
    home: { x: 800, y: 800, heading: 90 }, // runway centre, heading degrees
    destination: { x: 800, y: 800, heading: 90 },
  },
  {
    id: 'supply-drop',
    name: 'Supply Drop',
    tag: 'Feed the village',
    difficulty: 'Medium',
    seed: 20261127,
    wind: { from: 315, speed: 14 },
    fuel: 100,
    fuelBurnScale: 1.0,
    parSeconds: 210,
    brief:
      'Two crates for the village of Alderford. Drop them inside the marked field — press Space ' +
      'over the cross — then land at the far strip at Marrowfield. Mind the crosswind.',
    rings: [
      { x: 1400, y: 2600, alt: 800 },
      { x: 2600, y: 3300, alt: 900 },
    ],
    dropZone: { x: 3800, y: 3600 },
    crates: 2,
    home: { x: 700, y: 900, heading: 45 },
    // Aligned with the approach from the drop zone (was 225: the approach
    // then met the strip at 60 degrees and the plane could never line up
    // in time to descend onto it).
    destination: { x: 5600, y: 4200, heading: 105 },
  },
  {
    id: 'storm-pass',
    name: 'Storm Pass',
    tag: 'Thread the needles',
    difficulty: 'Hard',
    seed: 20261128,
    wind: { from: 180, speed: 24 }, // strong wind from the south
    fuel: 100,
    fuelBurnScale: 1.15,
    parSeconds: 260,
    brief:
      'A storm is coming over the Grey Teeth. Thread four rings through the pass — the wind will ' +
      'shove you sideways the whole way — and set down on the mountain strip before the fuel runs dry.',
    rings: [
      { x: 1700, y: 1500, alt: 650 },
      { x: 2900, y: 2600, alt: 750 },
      { x: 4100, y: 2400, alt: 850 },
      { x: 5200, y: 3600, alt: 550 },
    ],
    home: { x: 750, y: 750, heading: 90 },
    // Aligned with the valley and the approach from the last ring (was 270:
    // the east-west strip met the diagonal valley approach at 60 degrees,
    // and the ground on the centreline west of the strip rises to 5700 ft).
    destination: { x: 5800, y: 4700, heading: 150 },
  },
];

export const BEST_KEY_PREFIX = 'ridge-runner-best-';
