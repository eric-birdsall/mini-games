import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS } from "../shared/maps.js";
import { clearShot, raySurface } from "../shared/map.js";
import { throwPath } from "../shared/throwing.js";

function range() {
  const m = new Match("PIER", false, "seen", true, "docks");
  m.noBot = true;
  m.addPlayer("p", "attacker");
  m.phase = "active";
  m.time = 240;
  return m;
}
function advance(m) {
  for (let i = 0; i < 60; i++) m.tick(1 / 30);
}

test("Pier 9 hedges block players and water balloons at their visible bodies", () => {
  const m = range(),
    p = m.players.p;
  for (const w of MAPS.docks.walls.filter((w) => w.style === "hedge")) {
    Object.assign(p, {
      x: w.x,
      z: w.z + w.d / 2 + 0.6,
      y: 0,
      vy: 0,
      grounded: true,
      yaw: 0,
      pitch: 0,
      input: { forward: 1, yaw: 0 },
    });
    assert.equal(
      clearShot({ x: w.x, z: p.z, y: 1 }, { x: w.x, z: w.z - w.d, y: 1 }),
      false,
    );
    const path = throwPath(p, 10);
    assert.ok(path.landing.z > w.z, "balloon stays on near side of hedge");
    advance(m);
    assert.ok(p.z >= w.z + w.d / 2 + 0.3, "player stops outside hedge");
  }
});

test("Pier 9 house roofs support falling players across every ceiling strip", () => {
  const m = range(),
    p = m.players.p;
  for (const house of MAPS.docks.houses) {
    for (const offset of [-6, 0, 6]) {
      const z = house.z + offset;
      Object.assign(p, {
        x: house.x,
        z,
        y: 9,
        vy: -1,
        grounded: false,
        input: {},
        yaw: 0,
        pitch: -Math.PI / 2,
      });
      advance(m);
      assert.equal(p.y, house.singleStory ? 4.1 : 7.4, `${house.id} roof at z=${z}`);
      assert.equal(p.grounded, true);
      assert.equal(
        clearShot({ x: house.x, z, y: house.singleStory ? 3 : 6 }, { x: house.x, z, y: 9 }),
        false,
      );
      Object.assign(p, {
        x: house.x,
        z: house.z + 3,
        y: house.singleStory ? 0 : 3.9,
        pitch: Math.PI / 2,
      });
      assert.equal(
        raySurface(p).y,
        house.singleStory ? 3.8 : 7.1,
        "ceiling is a physical aiming surface",
      );
    }
  }
});

test("every Pier 9 house has stairs that can be walked up and down", () => {
  const m = range(),
    p = m.players.p;
  for (const h of MAPS.docks.houses.filter((h) => !h.singleStory)) {
    Object.assign(p, {
      x: h.stair.x,
      z: h.stair.z + 0.8,
      y: 0,
      vy: 0,
      grounded: true,
      yaw: 0,
      input: { forward: 1, yaw: 0 },
    });
    for (let i = 0; i < 65; i++) m.tick(1 / 30);
    assert.equal(p.y, 3.9, `${h.id}: reaches upstairs`);
    p.input = { forward: -1, yaw: 0 };
    for (let i = 0; i < 65; i++) m.tick(1 / 30);
    assert.equal(p.y, 0, `${h.id}: returns downstairs`);
  }
});


test("Pier 9 street stays clear of garden fences and has sparse solid car cover", () => {
  const map = MAPS.docks;
  const home = map.houses.find((h) => h.spawn);
  assert.equal(home.w, 50);
  assert.equal(home.singleStory, true);
  assert.equal(home.stair, undefined);
  for (const f of map.walls.filter((w) => w.style === "gardenFence")) {
    const overlapsRoad = f.x - f.w / 2 < 26 && f.x + f.w / 2 > -26 &&
      f.z - f.d / 2 < 32 && f.z + f.d / 2 > 27;
    assert.equal(overlapsRoad, false);
  }
  assert.equal(map.parkedCars.filter((c) => c.z > 27).length, 2);
  for (const c of map.parkedCars) {
    assert.equal(clearShot({ x: c.x - c.w, z: c.z, y: 0.8 },
      { x: c.x + c.w, z: c.z, y: 0.8 }), false);
  }
});


test("Pier 9 perimeter blocks escapes above fences and closes street exits with gates", () => {
  range();
  for (const x of [-28.5, 28.5]) {
    for (const z of [-45, 0, 45]) {
      assert.equal(clearShot({ x: x - 2, z, y: 10 }, { x: x + 2, z, y: 10 }), false);
    }
    for (const z of [-29.5, 29.5]) {
      const gate = MAPS.docks.walls.find((w) => w.x === x && w.z === z && w.style === "estateGate");
      assert.ok(gate && !gate.hidden && gate.h === 2.8);
      assert.equal(clearShot({ x: x - 2, z, y: 20 }, { x: x + 2, z, y: 20 }), false);
      assert.equal(clearShot({ x: x - 2, z, y: 10 }, { x: x + 2, z, y: 10 }), false);
    }
  }
  for (const z of [-58.5, 58.5])
    assert.equal(clearShot({ x: 0, z: z - 2, y: 10 }, { x: 0, z: z + 2, y: 10 }), false);
});


test("Pier 9 perimeter leaves wide passages around both team homes and outer lanes", () => {
  const map = MAPS.docks;
  assert.deepEqual(map.size, { x: 28, z: 58 });
  for (const house of map.houses) {
    assert.ok(map.size.x - Math.abs(house.x) - house.w / 2 >= 3,
      `${house.id}: at least three metres to the side perimeter`);
    if (house.spawn)
      assert.ok(map.size.z - Math.abs(house.z) - house.d / 2 >= 4,
        `${house.id}: four metres behind the house`);
  }
  const m = range(), p = m.players.p;
  for (const x of [-26.5, 26.5]) {
    Object.assign(p, { x, z: 49, y: 0, vy: 0, grounded: true,
      yaw: 0, input: { forward: 1, yaw: 0 } });
    advance(m);
    advance(m);
    assert.ok(p.z < 40, "outer passage is walkable beside the team house");
  }
});


test("Pier 9 side screens block corner-to-corner views across both outer passages", () => {
  range();
  for (const side of [-1, 1])
    for (const x of [25.5, 26, 26.5, 27, 27.5])
      for (const y of [1, 1.7])
        assert.equal(clearShot({ x: side * x, z: -57, y },
          { x: side * x, z: 57, y }), false);
});


test("Lane B deck stairs connect the backyard to the upstairs door", () => {
  const m = range(), p = m.players.p;
  Object.assign(p, { x: 3.5, z: -18, y: 0, vy: 0, grounded: true,
    yaw: Math.PI, input: { forward: 1, yaw: Math.PI } });
  for (let i = 0; i < 68; i++) m.tick(1 / 30);
  assert.equal(p.y, 3.9);
  Object.assign(p, { x: 2.5, z: -10, y: 3.9 });
  for (let i = 0; i < 25; i++) m.tick(1 / 30);
  assert.ok(p.z > -7.5, "walks through rear upstairs doorway");
  assert.equal(p.y, 3.9);
  p.input = { forward: -1, yaw: Math.PI };
  for (let i = 0; i < 25; i++) m.tick(1 / 30);
  assert.ok(p.z < -8.5, "returns to deck through doorway");
});

test("Lane A pool is enclosed on every side even above the tall fence", () => {
  const m = range(), p = m.players.p;
  for (const fence of MAPS.docks.walls.filter((w) => w.style === "poolFence")) {
    const alongX = fence.w > fence.d;
    const sign = (alongX ? fence.z < MAPS.docks.pool.z : fence.x < MAPS.docks.pool.x) ? -1 : 1;
    for (const y of [0, 4]) {
      const yaw = alongX ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      Object.assign(p, { x: fence.x + (alongX ? 0 : sign),
        z: fence.z + (alongX ? sign : 0), y, vy: 0, grounded: true,
        yaw, input: { forward: 1, yaw } });
      advance(m);
      assert.ok(alongX ? (p.z - fence.z) * sign > 0 : (p.x - fence.x) * sign > 0);
    }
  }
  assert.ok(!MAPS.docks.routeProfiles.some((r) => r.name.startsWith("A")));
});


test("deck treads leave a standing passage beneath the upper stairs", () => {
  const m = range(), p = m.players.p;
  Object.assign(p, { x: 1, z: -12.9, y: 0, vy: 0, grounded: true,
    yaw: -Math.PI / 2, input: { forward: 1, yaw: -Math.PI / 2 } });
  for (let i = 0; i < 40; i++) m.tick(1 / 30);
  assert.ok(p.x > 5, "crosses under the stair flight and both rails");
  assert.equal(p.y, 0);
});

test("expanded pool has no shrubs overlapping its enclosure", () => {
  const { x, z, w, d } = MAPS.docks.pool;
  assert.ok(w * d >= 60);
  assert.ok(!MAPS.docks.walls.some((p) => p.style === "hedge" &&
    Math.abs(p.x - x) < p.w / 2 + w / 2 + 0.9 &&
    Math.abs(p.z - z) < p.d / 2 + d / 2 + 0.9));
});


test("clambering onto the table beside the pool cannot enter its enclosure", () => {
  for (const start of [
    { x: -21.5, z: -24.4, y: 0 },
    { x: -21.5, z: -23, y: 1.1 },
    { x: -20.5, z: -23, y: 1.1 },
  ]) {
    const m = range(), p = m.players.p;
    Object.assign(p, start, { vy: 0, grounded: true, yaw: 0,
      input: { forward: 1, jump: true, yaw: 0 } });
    for (let i = 0; i < 150; i++) {
      m.tick(1 / 30);
      assert.ok(p.z <= -21.8 - 0.3, "stays outside the pool on every tick");
    }
  }
  assert.ok(MAPS.docks.walls.filter((w) => w.style === "poolFence")
    .every((w) => w.h === 1.35));
});
