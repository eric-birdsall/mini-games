import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS, useMap, openContainer } from "../shared/maps.js";
import { clearSight, raySurface } from "../shared/map.js";
import { decoyPath, freeDecoyPoint } from "../shared/decoy.js";
import { Match } from "../server/simulation.js";
import { eyeHeight } from "../shared/movement.js";

test("all new underpasses are traversable standing and have solid roofs", () => {
  for (const [id, map] of Object.entries(MAPS)) {
    for (const p of map.passages.filter((p) => !p.bay && !p.vent)) {
      const alongX = p.axis === "x",
        length = alongX ? p.w : p.d,
        start = {
          x: p.x - (alongX ? length / 2 + 0.4 : 0),
          z: p.z - (alongX ? 0 : length / 2 + 0.4),
        },
        end = {
          x: p.x + (alongX ? length / 2 + 0.4 : 0),
          z: p.z + (alongX ? 0 : length / 2 + 0.4),
        };
      useMap(id);
      assert.ok(
        freeDecoyPoint(start) && freeDecoyPoint(end),
        `${id}: ${p.name} open ends`,
      );
      assert.ok(decoyPath(start, end), p.name);
      assert.ok(
        clearSight({ ...start, y: 1.65 }, { ...end, y: 1.65 }),
        `${p.name}: open at eye level`,
      );
      assert.equal(
        clearSight(
          { x: p.x, y: 1, z: p.z },
          { x: p.x, y: p.clearance + 0.1, z: p.z },
        ),
        false,
        `${p.name}: roof occludes`,
      );
      const m = new Match("TUNNEL", false, "seen", false, id);
      m.addPlayer("a", "attacker");
      m.phase = "active";
      m.time = 240;
      Object.assign(m.players.a, start, {
        yaw: alongX ? -Math.PI / 2 : Math.PI,
        input: { forward: 1 },
      });
      const frames = Math.ceil(((length + 0.9) / 3.5) * 30);
      for (let i = 0; i < frames; i++) m.tick(1 / 30);
      const a = m.players.a;
      assert.ok(
        (alongX ? a.x : a.z) > (alongX ? p.x : p.z) + length / 2,
        `${p.name}: player reaches other side`,
      );
      assert.equal(a.y, 0, `${p.name}: stays below roof`);
    }
  }
  useMap("compound");
});

test("vents are crawled through crouched, block standing, and keep you down", () => {
  let vents = 0;
  for (const [id, map] of Object.entries(MAPS)) {
    for (const p of map.passages.filter((p) => p.vent)) {
      vents++;
      const alongX = p.axis === "x",
        length = alongX ? p.w : p.d,
        start = {
          x: p.x - (alongX ? length / 2 + 0.5 : 0),
          z: p.z - (alongX ? 0 : length / 2 + 0.5),
        },
        yaw = alongX ? -Math.PI / 2 : Math.PI,
        run = (input) => {
          const m = new Match("VENT", false, "seen", false, id);
          m.addPlayer("a", "attacker");
          m.phase = "active";
          m.time = 240;
          Object.assign(m.players.a, start, { yaw, input });
          const frames = Math.ceil(((length + 1.2) / 1.8) * 30);
          let stood = false;
          for (let i = 0; i < frames; i++) {
            m.tick(1 / 30);
            const a = m.players.a,
              along = alongX ? a.x - p.x : a.z - p.z;
            // Let go of crouch halfway: you stay crouched under the lid.
            if (Math.abs(along) < 0.3) a.input = { ...a.input, crouch: false };
            if (Math.abs(along) < length / 2 - 0.4 && !a.crouch) stood = true;
          }
          return { a: m.players.a, stood };
        };
      useMap(id);
      assert.equal(
        clearSight(
          { x: p.x, y: 0.6, z: p.z },
          { x: p.x, y: p.clearance + 0.1, z: p.z },
        ),
        false,
        `${id}: ${p.name} has a lid`,
      );
      const crawl = run({ forward: 1, crouch: true });
      assert.ok(
        (alongX ? crawl.a.x : crawl.a.z) > (alongX ? p.x : p.z) + length / 2,
        `${id}: ${p.name} crawled through`,
      );
      assert.ok(!crawl.stood, `${id}: ${p.name} keeps you crouched`);
      const walk = run({ forward: 1 });
      assert.ok(
        (alongX ? walk.a.x : walk.a.z) < (alongX ? p.x : p.z) - length / 2,
        `${id}: ${p.name} stops someone standing`,
      );
    }
  }
  assert.ok(vents >= 5);
  useMap("compound");
});

test("map railings stop you but not your view", () => {
  for (const [id, map] of Object.entries(MAPS)) {
    useMap(id);
    for (const w of map.walls.filter((w) => w.railing)) {
      const y = w.h - 0.3,
        alongX = w.w > w.d,
        a = { x: w.x - (alongX ? 0 : 0.5), y, z: w.z - (alongX ? 0.5 : 0) },
        b = { x: w.x + (alongX ? 0 : 0.5), y, z: w.z + (alongX ? 0.5 : 0) };
      assert.ok(clearSight(a, b), `${id}: see over the railing`);
      assert.ok(w.see && w.h - (w.bottom || 0) >= 0.9, `${id}: railing`);
    }
  }
  useMap("compound");
});

test("hide bays connect to staging and the objective instead of trapping players", () => {
  for (const [id, map] of Object.entries(MAPS)) {
    useMap(id);
    // Hand-placed maps use large designed pieces instead of crate chains.
    if (!map.handPlaced)
      assert.ok(
        // (Fewer since the terminals' pads were cleared; the plant sites'
        // walls stand in for the crates they replaced.)
        map.walls.filter((w) => w.stealthCover || w.plantSite).length >= 8,
        `${id}: substantial extra cover`,
      );
    for (const p of map.passages.filter((p) => p.bay)) {
      assert.ok(decoyPath(map.spawns.attacker, p), `${id}: enter ${p.name}`);
      assert.ok(decoyPath(p, map.objective), `${id}: leave ${p.name}`);
    }
  }
  useMap("compound");
});

test("a tunnel ceiling stops jumping and reports its underside to aiming rays", () => {
  const m = new Match("CEILING", false, "seen", false, "compound");
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  const p = m.players.a;
  Object.assign(p, {
    x: 13,
    z: 0,
    y: 0,
    pitch: Math.PI / 2,
    input: { jump: true },
  });
  const hit = raySurface(p);
  assert.equal(hit.normal.y, -1);
  assert.equal(hit.y, 2.1);
  for (let i = 0; i < 60; i++) {
    m.tick(1 / 30);
    assert.ok(
      p.y + eyeHeight(p) + 0.15 <= 2.1 + 0.001,
      "head stays under roof",
    );
  }
});

test("open containers: two side walls and a roof, registered as walk-throughs", () => {
  const [a, b, roof] = openContainer(4, -2, { axis: "x", length: 6 });
  assert.deepEqual(
    [a.w, a.d, b.w, b.d],
    [6, 0.15, 6, 0.15],
    "sides run along x",
  );
  assert.equal(Math.abs(a.z - b.z), 2.6 - 0.15);
  assert.deepEqual([roof.w, roof.d, roof.bottom], [6, 2.6, 2.45]);
  assert.ok(roof.bottom > 1.8, "standing headroom");
  for (const name of ["WEST CONTAINER", "EAST CONTAINER"])
    assert.ok(
      MAPS.monolith.passages.some((p) => p.container && p.name === name),
      `${name} is a passage (walked through by the underpass test above)`,
    );
});
