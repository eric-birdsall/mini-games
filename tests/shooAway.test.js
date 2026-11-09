import test from "node:test";
import assert from "node:assert/strict";
import {
  ESCAPE_RADIUS,
  LEVELS,
  SNACKS,
  SPAWN_RADIUS,
  STOLEN_TO_LOSE,
  angleOf,
  at,
  createPicnic,
  inReach,
  REACH,
  pace,
  random,
  shoo,
  shooable,
  snacksLeft,
  spawnSquirrel,
  FOX_CHANCE,
  KINDS,
  turnBetween,
  update,
} from "../shared/shooAway.js";

const run = (picnic, seconds, rand, onEvent = () => {}, facing = 0) => {
  for (let t = 0; t < seconds && !picnic.over; t += 1 / 30)
    update(picnic, 1 / 30, facing, rand).forEach(onEvent);
};

test("angles and positions agree", () => {
  for (const a of [0, 0.7, -2, 3]) {
    const p = at(a, 5);
    assert.ok(Math.abs(turnBetween(a, angleOf(p.x, p.z))) < 1e-9);
  }
  assert.deepEqual(
    [at(0, 1).x, at(0, 1).z].map((n) => Math.round(n) + 0),
    [0, -1],
  );
  assert.ok(Math.abs(turnBetween(3, -3) - (2 * Math.PI - 6)) < 1e-9);
});

test("the snacks sit on the blanket all the way around", () => {
  const picnic = createPicnic();
  assert.equal(picnic.snacks.length, SNACKS.length);
  const angles = picnic.snacks.map((s) => s.angle).sort((a, b) => a - b);
  for (let i = 1; i < angles.length; i++)
    assert.ok(angles[i] - angles[i - 1] > 0.9);
});

test("the first squirrel comes from in front of you", () => {
  const picnic = createPicnic("hard");
  const s = spawnSquirrel(picnic, 1.2, random(3));
  assert.ok(Math.abs(turnBetween(1.2, angleOf(s.x, s.z))) < 0.3);
  assert.ok(Math.abs(Math.hypot(s.x, s.z) - SPAWN_RADIUS) < 1e-9);
});

test("left alone, squirrels steal three snacks and the picnic ends", () => {
  for (const level of Object.keys(LEVELS)) {
    const picnic = createPicnic(level);
    const events = [];
    run(picnic, 120, random(11), (e) => events.push(e.type));
    assert.ok(picnic.over, level);
    assert.equal(picnic.stolen, STOLEN_TO_LOSE);
    assert.equal(snacksLeft(picnic), SNACKS.length - STOLEN_TO_LOSE);
    assert.ok(events.includes("grab"));
    assert.equal(events.at(-1), "over");
  }
});

test("a squirrel takes a while to reach the blanket", () => {
  const picnic = createPicnic("hard");
  let grabbedAt = null;
  run(picnic, 60, random(5), (e) => {
    if (e.type === "grab" && grabbedAt == null) grabbedAt = picnic.t;
  });
  // From 13 m out at Hard's top speed, with sniffing stops.
  assert.ok(grabbedAt > 5, `grabbed at ${grabbedAt}`);
});

test("shooing a thief drops the snack and it hops back home", () => {
  const p = createPicnic("easy");
  const r = random(9);
  let caught = null;
  for (let i = 0; i < 4000 && !caught; i++)
    for (const e of update(p, 1 / 30, 0, r)) if (e.type === "grab") caught = e;
  const snack = shoo(p, caught.squirrel.id);
  assert.equal(snack, caught.snack);
  assert.equal(snack.state, "dropped");
  assert.equal(p.shooed, 1);
  assert.equal(shoo(p, caught.squirrel.id), false, "only once");
  for (let i = 0; i < 60; i++) update(p, 1 / 30, 0, () => 0.99);
  assert.equal(snack.state === "home" || snack.state === "carried", true);
});

test("a shooed squirrel runs away and leaves", () => {
  const picnic = createPicnic();
  const s = spawnSquirrel(picnic, 0, random(2));
  Object.assign(s, at(0, 2.5));
  const before = Math.hypot(s.x, s.z);
  shoo(picnic, s.id);
  assert.equal(shooable(picnic).includes(s), false);
  for (let i = 0; i < 15; i++) update(picnic, 1 / 30, 0, () => 0.99);
  assert.ok(Math.hypot(s.x, s.z) > before);
  for (let i = 0; i < 300; i++) update(picnic, 1 / 30, 0, () => 0.99);
  assert.equal(picnic.squirrels.includes(s), false);
});

test("a careful player who shoos everything never loses a snack", () => {
  for (const level of Object.keys(LEVELS)) {
    const picnic = createPicnic(level);
    const rand = random(21);
    for (let i = 0; i < 30 * 180; i++) {
      update(picnic, 1 / 30, 0, rand);
      for (const s of shooable(picnic)) if (inReach(s)) shoo(picnic, s.id);
    }
    assert.equal(picnic.stolen, 0, level);
    assert.ok(picnic.shooed > 30, `${level}: ${picnic.shooed}`);
  }
});

test("it gets busier and faster over time, up to a limit", () => {
  for (const level of Object.keys(LEVELS)) {
    const start = pace(level, 0);
    const later = pace(level, 200);
    assert.ok(later.speed > start.speed);
    assert.ok(later.spawn < start.spawn);
    assert.ok(later.crowd > start.crowd);
    assert.equal(pace(level, 10000).speed, LEVELS[level].top);
  }
  assert.ok(pace("easy", 0).speed < pace("hard", 0).speed);
});

test("a stolen snack only counts once it's off the lawn", () => {
  const picnic = createPicnic("normal");
  const rand = random(4);
  let grab = null;
  for (let i = 0; i < 4000 && !grab; i++)
    for (const e of update(picnic, 1 / 30, 0, rand))
      if (e.type === "grab") grab = e;
  assert.equal(picnic.stolen, 0);
  let stolen = null;
  for (let i = 0; i < 4000 && !stolen; i++)
    for (const e of update(picnic, 1 / 30, 0, rand))
      if (e.type === "stolen" && e.snack === grab.snack) stolen = e;
  assert.ok(Math.hypot(grab.snack.x, grab.snack.z) >= ESCAPE_RADIUS - 0.1);
  assert.equal(grab.snack.state, "gone");
});

test("a squirrel out of reach can't be shooed", () => {
  const picnic = createPicnic();
  const s = spawnSquirrel(picnic, 0, random(2));
  assert.equal(inReach(s), false);
  assert.equal(shoo(picnic, s.id), false);
  assert.equal(picnic.shooed, 0);
  Object.assign(s, at(0, REACH - 0.1));
  assert.equal(shoo(picnic, s.id), null);
  assert.equal(picnic.shooed, 1);
});

test("squirrels freeze while you watch them, even mid-grab or mid-getaway", () => {
  const picnic = createPicnic("normal");
  const rand = random(8);
  const s = spawnSquirrel(picnic, 0, rand);
  const watchAll = () => true;
  const start = { x: s.x, z: s.z };
  for (let i = 0; i < 300; i++) update(picnic, 1 / 30, 0, rand, watchAll);
  assert.deepEqual({ x: s.x, z: s.z }, start);
  assert.equal(s.frozen, true);
  // Let it get to a snack, then watch it while it's running off with it.
  let grab = null;
  for (let i = 0; i < 3000 && !grab; i++)
    for (const e of update(picnic, 1 / 30, 0, rand, (q) => q !== s))
      if (e.type === "grab" && e.squirrel === s) grab = e;
  assert.ok(grab);
  const held = { x: s.x, z: s.z };
  for (let i = 0; i < 300; i++) update(picnic, 1 / 30, 0, rand, (q) => q === s);
  assert.deepEqual({ x: s.x, z: s.z }, held);
  assert.equal(grab.snack.state, "carried");
  // Watched, it's still in reach, so it can be shooed and the snack saved.
  assert.equal(shoo(picnic, s.id), grab.snack);
});

test("a shooed squirrel keeps running even while watched", () => {
  const picnic = createPicnic();
  const s = spawnSquirrel(picnic, 0, random(2));
  Object.assign(s, at(0, 2));
  shoo(picnic, s.id);
  for (let i = 0; i < 15; i++)
    update(
      picnic,
      1 / 30,
      0,
      () => 0.99,
      () => true,
    );
  assert.ok(Math.hypot(s.x, s.z) > 2.5);
});

test("squirrels always face the blanket, coming, going or shooed", () => {
  const picnic = createPicnic("hard");
  const rand = random(13);
  const faces = (s) => {
    // heading is the model's yaw: 0 faces +z, so it looks along
    // (sin, cos); that should point back at the middle of the blanket.
    const d = Math.hypot(s.x, s.z);
    const dot = (Math.sin(s.heading) * -s.x + Math.cos(s.heading) * -s.z) / d;
    return dot > 0.999;
  };
  let checked = 0;
  let shooedOne = false;
  for (let i = 0; i < 30 * 60 && !picnic.over; i++) {
    update(picnic, 1 / 30, 0, rand);
    if (i === 30 * 4 && picnic.squirrels[0]) {
      const s = picnic.squirrels[0];
      Object.assign(s, at(Math.atan2(-s.x, -s.z), 2.5));
      assert.notEqual(shoo(picnic, s.id), false);
      shooedOne = true;
    }
    for (const s of picnic.squirrels)
      if (Math.hypot(s.x, s.z) > 0.05) {
        assert.ok(faces(s), `${s.state} squirrel facing away`);
        checked++;
      }
  }
  assert.ok(checked > 100);
  assert.ok(shooedOne);
});

test("foxes are a fifth as common as squirrels, and the first is a squirrel", () => {
  const picnic = createPicnic("normal");
  const rand = random(31);
  assert.equal(spawnSquirrel(picnic, 0, rand).kind, "squirrel");
  const count = { squirrel: 0, fox: 0 };
  for (let i = 0; i < 3000; i++) count[spawnSquirrel(picnic, 0, rand).kind]++;
  const ratio = count.fox / count.squirrel;
  assert.ok(Math.abs(ratio - 0.2) < 0.03, `fox:squirrel ${ratio}`);
  assert.ok(Math.abs(FOX_CHANCE - 1 / 6) < 1e-9);
});

test("a fox runs 25% faster than a squirrel", () => {
  assert.equal(KINDS.fox.speed / KINDS.squirrel.speed, 1.25);
  const ran = (kind) => {
    const picnic = createPicnic("normal");
    picnic.spawnIn = Infinity;
    const s = spawnSquirrel(picnic, 0, () => 0.5);
    Object.assign(s, { kind, speed: KINDS[kind].speed, timer: 99 });
    Object.assign(s, at(0, 9));
    const before = Math.hypot(s.x, s.z);
    for (let i = 0; i < 15; i++) update(picnic, 1 / 30, Math.PI, () => 0.5);
    return before - Math.hypot(s.x, s.z);
  };
  const fox = ran("fox");
  const squirrel = ran("squirrel");
  assert.ok(Math.abs(fox / squirrel - 1.25) < 0.02, `${fox / squirrel}`);
});
