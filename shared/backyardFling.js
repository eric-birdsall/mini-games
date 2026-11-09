// Backyard Fling: your critter's toy car rides a stunt track like Loop &
// Glide's (a big drop, then the loop), but after the loop the track opens
// out into a wide ramp. For the few seconds it takes to roll up the ramp
// you steer the car left and right (and a little faster or slower); off the
// end it flies, lands on a big picnic table and rolls on into structures
// built from wooden toy blocks. Knock every structure down to clear the
// yard. There's no losing: when you're out of cars the next yard comes
// anyway, and the score is just the blocks knocked down.
//
// Units are metres and seconds. The car drives toward +z, y is up, x is
// sideways. The track and ramp are scripted; from the lip of the ramp on,
// the car and the stacks are rigid bodies (cannon-es).

import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Plane,
  Sphere,
  Vec3,
  World,
} from "cannon-es";

export const STAGES_PER_ROUND = 3;
export const GRAVITY = 9.82;
export const RIDE_HEIGHT = 0.31; // the car's middle above the track surface
export const TRACK_WIDTH = 1.55;
const STEP = 1 / 120;

// --- The narrow track: a drop, the loop, then a short straight ----------
export const LOOP_END = 28;
export const TRACK_LENGTH = 32;

export function trackPoint(distance) {
  const d = Math.min(Math.max(distance, 0), TRACK_LENGTH);
  if (d < 12) {
    const t = d / 12;
    return { x: -2, y: 0.75 + 8 * (1 - t) ** 2, z: d - 26 };
  }
  if (d < LOOP_END) {
    const t = (d - 12) / 16;
    const angle = t * Math.PI * 2;
    return {
      x: -2 + 2 * t * t * (3 - 2 * t),
      y: 0.75 + 2.55 * (1 - Math.cos(angle)),
      z: -14 + 2.55 * Math.sin(angle),
    };
  }
  return { x: 0, y: 0.75, z: -14 + (d - LOOP_END) };
}

// How fast the car rides the track: quicker the further down it gets.
export const trackSpeed = (distance) => 4 + Math.min(distance, LOOP_END) * 0.35;

// --- The wide ramp ---------------------------------------------------------
// It starts where the track ends, flares out to its full width, and curves
// up to a lip at RAMP_END.
export const RAMP_START = trackPoint(TRACK_LENGTH).z; // -10
export const RAMP_END = 8;
export const RAMP_HALF_WIDTH = 4.2;
const RAMP_RISE = 2.2;
const FLARE = 3; // metres to open out to the full width
const RAMP_LENGTH = RAMP_END - RAMP_START;
const along = (z) => Math.min(Math.max((z - RAMP_START) / RAMP_LENGTH, 0), 1);

export const rampY = (z) => 0.75 + RAMP_RISE * along(z) ** 2;
export const rampSlope = (z) => (2 * RAMP_RISE * along(z)) / RAMP_LENGTH;
export function rampHalfWidth(z) {
  const t = Math.min(Math.max((z - RAMP_START) / FLARE, 0), 1);
  const s = t * t * (3 - 2 * t);
  return TRACK_WIDTH / 2 + (RAMP_HALF_WIDTH - TRACK_WIDTH / 2) * s;
}
export const CAR_HALF_WIDTH = 0.53;
export const CAR_HALF_HEIGHT = 0.2;
export const CAR_HALF_LENGTH = 0.9;
// How far the car's middle may go from the ramp's middle.
export const steerLimit = (z) =>
  Math.max(0, rampHalfWidth(z) - CAR_HALF_WIDTH - 0.08);

// Driving on the ramp. cruise: the speed you settle to with no throttle;
// the throttle (W / S) moves it between slow and fast.
export const DRIVE = {
  cruise: 5.6,
  slow: 4.2,
  fast: 7.2,
  steer: 4.6, // sideways speed at full lock (m/s)
  grip: 4, // how quickly the car answers the wheel (1/s)
  brake: 2.6, // how quickly it comes down to cruise after the loop (1/s)
};

// cars: per yard; marker: show where the car will land while you steer.
export const FLING_LEVELS = {
  easy: { cars: 5, marker: true },
  normal: { cars: 4, marker: true },
  hard: { cars: 3, marker: false },
};
export const flingLevel = (level) => FLING_LEVELS[level] || FLING_LEVELS.normal;

// --- The picnic table and the block structures ------------------------------
// Each yard has one big picnic table (solid: it doesn't move) standing in
// the landing zone past the lip, with two or three structures of wooden toy
// blocks on it. The car flies off the lip, lands on the table top (or the
// grass beside it) and rolls on into the blocks.
export const CAR_MASS = 420;
export const BLOCK_DENSITY = 520; // kg/m³: wood
export const TABLE = {
  x: 0,
  near: 11, // z of the end nearest the ramp
  far: 18.6,
  halfWidth: 3.3,
  top: 0.8, // height of the table top's upper surface
  thick: 0.14,
  bench: { gap: 0.55, width: 0.62, top: 0.46, thick: 0.1 },
};
const TOP = TABLE.top;
const benchX = (side) =>
  TABLE.x + side * (TABLE.halfWidth + TABLE.bench.gap + TABLE.bench.width / 2);

// How high the solid surface is under (x, z): the table top, a bench, or
// the grass.
export function surfaceY(x, z) {
  const along = z >= TABLE.near && z <= TABLE.far;
  if (!along) return 0;
  if (Math.abs(x - TABLE.x) <= TABLE.halfWidth) return TOP;
  for (const side of [-1, 1])
    if (Math.abs(x - benchX(side)) <= TABLE.bench.width / 2)
      return TABLE.bench.top;
  return 0;
}

// Block sizes: [w, h, d], full sizes. S scales every block (and the
// spacing inside a structure) so they read well next to the car.
const S = 1.3;
const size = (w, h, d) => [w * S, h * S, d * S];
const CUBE = size(0.44, 0.44, 0.44);
const PILLAR = size(0.26, 0.9, 0.26);
const SHORT_PILLAR = size(0.26, 0.62, 0.26);
const BRICK = size(0.9, 0.3, 0.42);
const HALF_BRICK = size(0.44, 0.3, 0.42);
const BEAM_H = 0.2 * S;
const beam = (w) => size(w, 0.2, 0.44);
const ROOF = size(0.5, 0.28, 0.5);

// A block sitting on `under` (the height of whatever it rests on).
const block = (x, under, z, [w, h, d], tone = 0) => ({
  kind: "block",
  x,
  y: under + h / 2,
  z,
  w,
  h,
  d,
  tone,
});

// A tall tower of cubes, with a little roof block on top.
function tower(x, z, floors = 5) {
  const parts = [];
  for (let i = 0; i < floors; i++)
    parts.push(block(x, TOP + i * CUBE[1], z, CUBE, i % 3));
  parts.push(block(x, TOP + floors * CUBE[1], z, ROOF, 3));
  return { name: "tower", parts };
}

// Cubes stacked three, two, one.
function pyramid(x, z) {
  const parts = [];
  const step = CUBE[0] + 0.02;
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++)
      parts.push(
        block(
          x + (i - (2 - row) / 2) * step,
          TOP + row * CUBE[1],
          z,
          CUBE,
          (row + i) % 3,
        ),
      );
  return { name: "pyramid", parts };
}

// Two floors of pillars and beams, too narrow for the car to drive
// through, with a cube on top.
function gate(x, z) {
  const floor1 = TOP + PILLAR[1];
  const deck = floor1 + BEAM_H;
  const floor2 = deck + SHORT_PILLAR[1];
  const roof = floor2 + BEAM_H;
  return {
    name: "gate",
    parts: [
      block(x - 0.42 * S, TOP, z, PILLAR, 1),
      block(x + 0.42 * S, TOP, z, PILLAR, 1),
      block(x, floor1, z, beam(1.2), 0),
      block(x - 0.3 * S, deck, z, SHORT_PILLAR, 2),
      block(x + 0.3 * S, deck, z, SHORT_PILLAR, 2),
      block(x, floor2, z, beam(0.9), 0),
      block(x, roof, z, CUBE, 3),
    ],
  };
}

// A brick wall, four rows high, with the joints staggered.
function wall(x, z) {
  const parts = [];
  const h = BRICK[1];
  const b = BRICK[0] + 0.01;
  const rows = [
    [-0.5, 0.5].map((i) => [i * b, BRICK]),
    [
      [-b + HALF_BRICK[0] / 2 + 0.005, HALF_BRICK],
      [0, BRICK],
      [b - HALF_BRICK[0] / 2 - 0.005, HALF_BRICK],
    ],
    [-0.5, 0.5].map((i) => [i * b, BRICK]),
    [[0, BRICK]],
  ];
  rows.forEach((row, r) =>
    row.forEach(([dx, size], i) =>
      parts.push(block(x + dx, TOP + r * h, z, size, (r + i) % 3)),
    ),
  );
  return { name: "wall", parts };
}

// Three yards, in order, each with its structures spread across the table
// so where you steer on the ramp matters.
export const STAGES = [
  { name: "Block towers", structures: [tower(-1.5, 15.2), pyramid(1.4, 16.4)] },
  {
    name: "Block castle",
    structures: [tower(-2.3, 14.8, 4), gate(0, 16.2), tower(2.3, 17.2, 4)],
  },
  {
    name: "Block town",
    structures: [gate(-1.8, 15), wall(1.6, 16), pyramid(-0.3, 17.6)],
  },
];
// Every block in a yard, each knowing which structure it belongs to.
for (const stage of STAGES)
  stage.pieces = stage.structures.flatMap((s, group) =>
    s.parts.map((p) => ({ ...p, group })),
  );

export const structuresIn = (stage) => STAGES[stage].structures.length;
export const blocksIn = (stage) => STAGES[stage].pieces.length;

// --- A yard: the lawn, the table and the blocks -----------------------------
export function createYard(stage) {
  const world = new World({ gravity: new Vec3(0, -GRAVITY, 0) });
  world.allowSleep = true;
  world.solver.iterations = 20;
  const groundMat = new Material("ground");
  const tableMat = new Material("table");
  const stuffMat = new Material("stuff");
  const carMat = new Material("car");
  const pair = (a, b, friction, restitution) =>
    world.addContactMaterial(
      new ContactMaterial(a, b, { friction, restitution }),
    );
  pair(groundMat, stuffMat, 0.6, 0.05);
  pair(tableMat, stuffMat, 0.5, 0.05);
  pair(stuffMat, stuffMat, 0.55, 0.05);
  // The car skids along the grass and the table and doesn't bounce much.
  pair(groundMat, carMat, 0.28, 0.12);
  pair(tableMat, carMat, 0.22, 0.1);
  pair(stuffMat, carMat, 0.3, 0.15);
  const ground = new Body({ mass: 0, material: groundMat });
  ground.addShape(new Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  // The table top and the two benches are solid and never move.
  const length = TABLE.far - TABLE.near;
  const middle = (TABLE.near + TABLE.far) / 2;
  const slab = (x, top, halfWidth, thick) => {
    const body = new Body({
      mass: 0,
      material: tableMat,
      position: new Vec3(x, top - thick / 2, middle),
    });
    body.addShape(new Box(new Vec3(halfWidth, thick / 2, length / 2)));
    body.isTable = true;
    world.addBody(body);
  };
  slab(TABLE.x, TOP, TABLE.halfWidth, TABLE.thick);
  const { bench } = TABLE;
  for (const side of [-1, 1])
    slab(benchX(side), bench.top, bench.width / 2, bench.thick);

  const structures = STAGES[stage].structures.map(({ name }) => ({
    name,
    blocks: [],
    down: false,
  }));
  const yard = { world, carMat, pieces: [], structures, impacts: [], acc: 0 };
  for (const spec of STAGES[stage].pieces) {
    const body = new Body({
      mass: BLOCK_DENSITY * spec.w * spec.h * spec.d,
      material: stuffMat,
      position: new Vec3(spec.x, spec.y, spec.z),
      linearDamping: 0.05,
      angularDamping: 0.08,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.4,
    });
    body.addShape(new Box(new Vec3(spec.w / 2, spec.h / 2, spec.d / 2)));
    const p = { ...spec, body, down: false, start: null };
    body.piece = p;
    body.addEventListener("collide", (event) => {
      const strength = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (strength < 0.8) return;
      const other = event.body.piece
        ? "block"
        : event.body.isCar
          ? "car"
          : event.body.isTable
            ? "table"
            : "ground";
      yard.impacts.push({ strength, kinds: [p.kind, other] });
    });
    world.addBody(body);
    yard.pieces.push(p);
    structures[spec.group].blocks.push(p);
  }
  // Let everything settle onto its supports before play.
  for (let i = 0; i < 240; i++) world.step(STEP);
  yard.impacts.length = 0;
  for (const p of yard.pieces) {
    const { x, y, z } = p.body.position;
    p.start = { x, y, z };
  }
  return yard;
}

// --- A car's run ---------------------------------------------------------------
export function newRun() {
  const start = trackPoint(0);
  return {
    phase: "track", // track | drive | air | done
    distance: 0,
    x: start.x,
    y: start.y + RIDE_HEIGHT,
    z: start.z,
    vx: 0,
    vz: trackSpeed(0),
    pitch: 0,
    driveTime: 0,
    flight: 0,
    body: null,
  };
}

const up = new Vec3(0, 1, 0);
const scratch = new Vec3();

/**
 * Move the run and the yard on by dt. input: { steer: -1..1 (+ is +x),
 * throttle: -1..1 }. Returns the blocks and structures that just went down, the bumps since
 * last time (for sounds), and whether the car just left the lip.
 */
export function stepRun(yard, run, dt, input = {}) {
  yard.acc += Math.min(dt, 0.1);
  let launched = false;
  while (yard.acc >= STEP) {
    yard.acc -= STEP;
    if (run.phase === "track") rideTrack(run, STEP);
    else if (run.phase === "drive") {
      if (drive(run, STEP, input)) {
        launch(yard, run);
        launched = true;
      }
    } else if (run.phase === "air") run.flight += STEP;
    yard.world.step(STEP);
  }
  if (run.body) {
    const { x, y, z } = run.body.position;
    const v = run.body.velocity;
    Object.assign(run, { x, y, z, vx: v.x, vy: v.y, vz: v.z });
  }
  const downs = [];
  for (const p of yard.pieces)
    if (!p.down && isDown(p)) {
      p.down = true;
      downs.push(p);
    }
  const toppled = [];
  for (const s of yard.structures)
    if (!s.down && structureDown(s)) {
      s.down = true;
      toppled.push(s);
    }
  return { downs, toppled, impacts: yard.impacts.splice(0), launched };
}

function rideTrack(run, dt) {
  run.vz = trackSpeed(run.distance);
  run.distance = Math.min(TRACK_LENGTH, run.distance + run.vz * dt);
  const p = trackPoint(run.distance);
  run.x = p.x;
  run.y = p.y + RIDE_HEIGHT;
  run.z = p.z;
  if (run.distance >= TRACK_LENGTH) {
    run.phase = "drive";
    run.vx = 0;
  }
}

// Returns true when the car goes off the lip.
function drive(run, dt, { steer = 0, throttle = 0 }) {
  run.driveTime += dt;
  const t = Math.max(-1, Math.min(1, throttle));
  const target =
    t > 0
      ? DRIVE.cruise + (DRIVE.fast - DRIVE.cruise) * t
      : DRIVE.cruise + (DRIVE.cruise - DRIVE.slow) * t;
  run.vz += (target - run.vz) * (1 - Math.exp(-DRIVE.brake * dt));
  run.vx +=
    (Math.max(-1, Math.min(1, steer)) * DRIVE.steer - run.vx) *
    (1 - Math.exp(-DRIVE.grip * dt));
  run.z += run.vz * dt;
  run.x += run.vx * dt;
  const limit = steerLimit(run.z);
  if (Math.abs(run.x) > limit) {
    run.x = Math.sign(run.x) * limit;
    run.vx = 0; // bumped the rail
  }
  run.y = rampY(run.z) + RIDE_HEIGHT;
  run.pitch = Math.atan(rampSlope(run.z));
  return run.z >= RAMP_END;
}

// Off the lip the car's body is a ball: it lands, keeps rolling and
// coasts on across the grass instead of digging a corner in. The scene
// points the car model the way it's going.
export const CAR_RADIUS = 0.5;
const COAST_DAMPING = 0.08; // how quickly the roll dies away

function launch(yard, run) {
  const slope = rampSlope(RAMP_END);
  const body = new Body({
    mass: CAR_MASS,
    material: yard.carMat,
    position: new Vec3(run.x, rampY(RAMP_END) + CAR_RADIUS, RAMP_END),
    velocity: new Vec3(run.vx, run.vz * slope, run.vz),
    angularDamping: COAST_DAMPING,
    linearDamping: 0.02,
    allowSleep: false,
  });
  body.addShape(new Sphere(CAR_RADIUS));
  // Already spinning like a wheel, so it lands rolling rather than skidding.
  body.angularVelocity.set(run.vz / CAR_RADIUS, 0, -run.vx / CAR_RADIUS);
  body.isCar = true;
  yard.world.addBody(body);
  run.body = body;
  run.phase = "air";
  run.flight = 0;
}

/**
 * Where the car would touch down if it kept its current speed and steering
 * to the lip and beyond (for the landing marker): on the table top if it
 * comes down over the table, otherwise on the grass.
 */
export function landingSpot(run) {
  const slope = rampSlope(RAMP_END);
  const y0 = rampY(RAMP_END);
  const vy = run.vz * slope;
  const toLip = Math.max(0, (RAMP_END - run.z) / Math.max(run.vz, 0.1));
  const limit = steerLimit(RAMP_END);
  const lipX = Math.max(-limit, Math.min(limit, run.x + run.vx * toLip));
  const at = (drop) => {
    const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
    return { x: lipX + run.vx * t, z: RAMP_END + run.vz * t };
  };
  const onTable = at(y0 - TOP);
  if (surfaceY(onTable.x, onTable.z) === TOP) return { ...onTable, y: TOP };
  return { ...at(y0), y: 0 };
}

/** Is this block knocked down: tipped over, dropped, or pushed away? */
export function isDown(p) {
  const pos = p.body.position;
  p.body.quaternion.vmult(up, scratch);
  return (
    Math.abs(scratch.y) < Math.cos(0.6) ||
    pos.y < p.start.y - 0.25 ||
    Math.hypot(pos.x - p.start.x, pos.z - p.start.z) > 0.5
  );
}

/** A structure is down once at least half its blocks are. */
export const structureDown = (s) =>
  s.blocks.filter((p) => p.down).length * 2 >= s.blocks.length;

export const blocksDown = (yard) => yard.pieces.filter((p) => p.down).length;
export const structuresLeft = (yard) =>
  yard.structures.filter((s) => !s.down).length;

const MAX_FLIGHT = 7;
/**
 * Has the car's run finished: everything still, or the car gone? Waiting
 * gets less fussy the longer it goes, so a gently rocking box doesn't keep
 * a little one waiting for the next car.
 */
export function settled(yard, run) {
  if (run.phase !== "air") return false;
  if (run.flight > MAX_FLIGHT) return true;
  if (run.flight < 1) return false;
  const easing = run.flight > 3.5 ? 4 : 1;
  const still = (body) =>
    body.sleepState === Body.SLEEPING ||
    (body.velocity.length() < 0.15 * easing &&
      body.angularVelocity.length() < 0.4 * easing);
  // Rolled on past every stack (or out of the yard): nothing left to hit.
  const past = Math.max(...yard.pieces.map((p) => p.start.z)) + 2.5;
  const gone = run.z > past || Math.abs(run.x) > 20 || run.y < -5;
  if (!gone && !still(run.body)) return false;
  return yard.pieces.every((p) => still(p.body) || p.body.position.y < -5);
}

/** Take the spent car out of the yard. */
export function clearRun(yard, run) {
  if (run.body) yard.world.removeBody(run.body);
  run.body = null;
  run.phase = "done";
}
