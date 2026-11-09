import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, mapIds, useMap } from "../shared/maps.js";
import { SPAWNS, OBJECTIVE } from "../shared/config.js";
import { WALLS, BOUNDS, clearSight } from "../shared/map.js";
import { freeDecoyPoint, decoyPath } from "../shared/decoy.js";
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}

test("every map has open spawns and a walkable route to the flag", () => {
  for (const id of mapIds) {
    useMap(id);
    for (const p of [SPAWNS.attacker, SPAWNS.defender, OBJECTIVE])
      assert.ok(freeDecoyPoint(p), `${id}: ${JSON.stringify(p)} is clear`);
    assert.ok(decoyPath(SPAWNS.attacker, OBJECTIVE), `${id}: spawn → flag`);
  }
  useMap("compound");
});

test("The Lanes: three covered hallways lead to the flag", () => {
  useMap("lanes");
  for (const [name, point] of [
    ["west hallway", { x: -14, z: 8 }],
    ["center trench", { x: 3.9, z: 8 }],
    ["east low path", { x: 10.75, z: 7 }],
  ]) {
    assert.ok(freeDecoyPoint(point), name);
    assert.ok(decoyPath(SPAWNS.attacker, point), `staging → ${name}`);
    assert.ok(decoyPath(point, OBJECTIVE), `${name} → flag`);
  }
  // Hallways are separated by solid blocks except where short halls cross.
  const sight = (z) => clearSight({ x: -14, y: 1, z }, { x: -3, y: 1, z });
  assert.equal(sight(8), false);
  assert.equal(sight(3.8), true, "west ↔ center hallway");
  // Slender cover preserves hiding choices without maximizing solid floor area.
  assert.ok(
    MAPS.lanes.walls.filter((w) => ["cover", "tank"].includes(w.kind)).length >=
      25,
  );
  assert.ok(MAPS.lanes.walls.some((w) => w.kind === "platform" && w.h >= 2));
  useMap("compound");
});

test("stairs lead onto high ground, and you drop off its edge", () => {
  const m = new Match("STAIRS", true, "seen", false, "lanes");
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  const a = m.players.a;
  // South end of the center ridge (top 2 m, z -2 to 12).
  Object.assign(a, { x: 0, z: 15.5, yaw: 0 });
  a.input = { forward: 1 };
  advance(m, 2.5);
  assert.equal(a.y, 2, "climbed the stairs onto the ridge");
  assert.ok(a.z < 12);
  // Its railing stops you walking east off the side...
  Object.assign(a, { x: 0, z: 6.5, yaw: -Math.PI / 2 });
  advance(m, 1.5);
  assert.ok(a.x < 1.5 && a.y === 2, "held by the railing");
  // ...except at its drop gap, into the trench.
  const drop = MAPS.lanes.drops.find((d) => d.x > 0 && d.x < 2);
  Object.assign(a, { x: 0.8, z: drop.z });
  advance(m, 1.5);
  assert.ok(a.x > 2.6);
  assert.equal(a.y, 0, "dropped back to low ground");
});

test("The Lanes: the scripted infiltrator completes its route to the flag", () => {
  const m = new Match("BOT", true, "seen", false, "lanes");
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  m.players.d.alive = false;
  m.phase = "active";
  m.time = 240;
  advance(m, 60);
  assert.equal(m.result?.winner, "attacker");
});

test("rooms on different maps each use their own walls", () => {
  const lanes = new Match("L", false, "seen", false, "lanes"),
    compound = new Match("C", false, "seen", false, "compound");
  for (const m of [lanes, compound]) {
    m.addPlayer("a", "attacker");
    m.addPlayer("d", "defender");
  }
  const a = { x: 4, y: 1, z: 0 },
    b = { x: 9, y: 1, z: 0 };
  lanes.tick(1 / 30);
  assert.equal(clearSight(a, b), false, "lanes: east divider in the way");
  compound.tick(1 / 30);
  assert.equal(clearSight(a, b), true, "compound: open yard");
  assert.equal(lanes.snapshot("a").map, "lanes");
  assert.equal(SPAWNS.defender.z, MAPS.lanes.spawns.defender.z);
  // Plus its spawn bunker's doors, shut before the round.
  assert.equal(
    WALLS.length,
    MAPS.lanes.walls.length + MAPS.lanes.spawnRoom.doors.length,
  );
  useMap("compound");
});

test("no map lets either team see the other from its spawn area", () => {
  // Every standing and crouching eye position within 2.5 m of each spawn.
  const area = (s) => {
    const points = [];
    for (let dx = -2.5; dx <= 2.5; dx += 0.5)
      for (let dz = -2.5; dz <= 2.5; dz += 0.5) {
        const p = { x: s.x + dx, z: s.z + dz };
        if (
          Math.hypot(dx, dz) <= 2.5 &&
          !WALLS.some(
            (w) =>
              Math.abs(p.x - w.x) < w.w / 2 + 0.3 &&
              Math.abs(p.z - w.z) < w.d / 2 + 0.3,
          )
        )
          for (const y of [1.65, 0.8]) points.push({ ...p, y });
      }
    return points;
  };
  for (const id of mapIds) {
    useMap(id);
    const attackers = area(SPAWNS.attacker),
      defenders = area(SPAWNS.defender);
    for (const a of attackers)
      for (const d of defenders)
        assert.equal(
          clearSight(a, d),
          false,
          `${id}: ${JSON.stringify(a)} sees ${JSON.stringify(d)}`,
        );
  }
  useMap("compound");
});

test("The Quad: four lanes to the flag retain their original inner shortcut", () => {
  useMap("quad");
  const lanes = MAPS.quad.routeProfiles.map((r) => r.low);
  for (const p of lanes) {
    assert.ok(decoyPath(SPAWNS.attacker, p), `staging → ${p.x}`);
    assert.ok(decoyPath(p, OBJECTIVE), `${p.x} → flag`);
  }
  const sight = (a, b, z) => clearSight({ x: a, y: 1, z }, { x: b, y: 1, z });
  assert.equal(sight(-5, 5, 7), true, "shortcut between the inner lanes");
  assert.equal(sight(-5, 5, 12), false);
  assert.equal(sight(-14, -5, 7), false, "west lanes are separate");
  assert.equal(sight(5, 14, 7), false, "east lanes are separate");
  // The shortcut saves the trip back out through staging or the plaza.
  const via = (a, b) => {
    const route = decoyPath(a, b);
    let total = 0,
      at = a;
    for (const p of route) {
      total += Math.hypot(p.x - at.x, p.z - at.z);
      at = p;
    }
    return total;
  };
  assert.ok(via({ x: -5, z: 7 }, { x: 5, z: 7 }) < 11);
  assert.ok(via({ x: -14, z: 7 }, { x: 12.8, z: 6.5 }) > 30);
  useMap("compound");
});

test("The Quad: the scripted infiltrator completes its route", () => {
  const m = new Match("QUAD", true, "seen", false, "quad");
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  m.players.d.alive = false;
  m.phase = "active";
  m.time = 240;
  advance(m, 60);
  assert.equal(m.result?.winner, "attacker");
});

test("The Monolith: a larger arena with gallery flanks and a scripted route", () => {
  useMap("monolith");
  assert.ok(BOUNDS.x > 20 && BOUNDS.z > 30, "bigger than the other maps");
  // Both flank corridors behind the galleries connect staging to the flag.
  for (const x of [-24.5, 24.5])
    for (const z of [20, -20]) {
      const p = { x, z };
      assert.ok(freeDecoyPoint(p), `flank ${x},${z} clear`);
      assert.ok(decoyPath(SPAWNS.attacker, p) && decoyPath(p, OBJECTIVE));
    }
  useMap("compound");
  const m = new Match("MONO", true, "seen", false, "monolith");
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  m.players.d.alive = false;
  m.phase = "active";
  m.time = 240;
  advance(m, 60);
  assert.equal(m.result?.winner, "attacker");
  useMap("compound");
});

test("during the buy phase players walk around but stop at their side's line", () => {
  for (const id of mapIds) {
    const m = new Match("BUY", false, "seen", false, id),
      lines = MAPS[id].buyLines;
    m.addPlayer("a", "attacker");
    m.addPlayer("d", "defender");
    assert.equal(m.phase, "purchase");
    const a = m.players.a,
      d = m.players.d;
    // Start each just behind its line, in open floor, and walk at it.
    Object.assign(a, { x: 0, z: lines.attacker + 0.6, yaw: 0, input: {} });
    Object.assign(d, {
      x: 0,
      z: lines.defender - 0.6,
      yaw: Math.PI,
      input: {},
    });
    useMap(id);
    const open = (p) =>
      !WALLS.some(
        (w) =>
          Math.abs(p.x - w.x) < w.w / 2 + 0.4 &&
          Math.abs(p.z - w.z) < w.d / 2 + 0.4,
      );
    // A spawn room's doors hold its infiltrators (tests/spawnroom.test.js).
    const room = !!MAPS[id].spawnRoom;
    // Pick a spot with open floor on both sides of the line.
    for (const p of room ? [d] : [a, d]) {
      const ahead = (x) => ({
        x,
        z: p.team === "attacker" ? lines.attacker - 1.5 : lines.defender + 1.5,
      });
      for (let x = 0; (!open(p) || !open(ahead(p.x))) && x < 18; x += 0.5)
        p.x = x;
      assert.ok(open(p), `${id}: open floor behind the ${p.team} line`);
    }
    a.input = d.input = { forward: 1 };
    advance(m, 2);
    if (!room)
      assert.ok(
        a.z >= lines.attacker && a.z < lines.attacker + 0.6,
        `${id} attacker held at ${a.z}`,
      );
    assert.ok(
      d.z <= lines.defender && d.z > lines.defender - 0.6,
      `${id} defender held at ${d.z}`,
    );
    // Infiltrators still hold behind the line during preparation; sentinels don't.
    m.prepare();
    advance(m, 2);
    if (!room) assert.ok(a.z >= lines.attacker);
    assert.ok(d.z > lines.defender, `${id}: sentinels set up past it`);
  }
  useMap("compound");
});

test("every route retains a connected low bypass and has a distinct raised position", () => {
  for (const id of mapIds) {
    useMap(id);
    const profiles = MAPS[id].routeProfiles;
    assert.ok(
      new Set(profiles.map((r) => r.height)).size >= (id === "docks" ? 2 : 3),
      `${id}: distinct elevation tiers`,
    );
    for (const r of profiles) {
      assert.ok(freeDecoyPoint(r.low), `${id} ${r.name}: low point clear`);
      assert.ok(
        decoyPath(SPAWNS.attacker, r.low),
        `${id} ${r.name}: reachable from staging`,
      );
      assert.ok(
        decoyPath(r.low, OBJECTIVE),
        `${id} ${r.name}: connects to flag`,
      );
      assert.ok(
        WALLS.some(
          (w) =>
            w.kind === "platform" &&
            w.h === r.height &&
            Math.abs(r.high.x - w.x) < w.w / 2 &&
            Math.abs(r.high.z - w.z) < w.d / 2,
        ),
        `${id} ${r.name}: actual elevated surface`,
      );
    }
  }
  useMap("compound");
});
test("ground and elevated routes break long standing and crouched sightlines", () => {
  const samples = {
    compound: [
      { x: 3.7, from: 17, to: -10, h: 0 },
      { x: 17, from: 19, to: -11, h: 0 },
      { x: -17, from: 1, to: 12, h: 0.8 },
      { x: -3.8, from: 12, to: -10, h: 1.6 },
      { x: 16, from: -7, to: 12, h: 2.4 },
    ],
    lanes: [
      { x: -14, from: 18, to: -5, h: 0 },
      { x: 3.9, from: 18, to: -6, h: 0 },
      { x: 10.75, from: 17, to: -5, h: 0 },
      { x: 0, from: 11, to: -1, h: 2 },
      { x: 14.5, from: 14, to: -3, h: 2.4 },
    ],
    quad: [
      { x: -14, from: 17, to: -5, h: 0 },
      { x: -3.8, from: 17, to: -5, h: 0 },
      { x: 5.6, from: 17, to: -5, h: 0 },
      { x: 12.8, from: 17, to: -5, h: 0 },
      { x: -5.2, from: 13, to: -5, h: 1.6 },
      { x: 3.8, from: 12, to: -4, h: 0.8 },
      { x: 15.5, from: 13, to: 6, h: 2.4 },
    ],
    monolith: [
      { x: 5.8, from: 26, to: -14, h: 0 },
      { x: -5.8, from: 26, to: -14, h: 0 },
      { x: 12.5, from: 26, to: -14, h: 0 },
      { x: -12.5, from: 26, to: -14, h: 0 },
      { x: -24.5, from: 26, to: -30, h: 0 },
      { x: 19.5, from: 14, to: -14, h: 2.4 },
      { x: -17.2, from: 14, to: -14, h: 2.4 },
      { x: 21.8, from: 14, to: -14, h: 2.4 },
    ],
  };
  for (const [id, views] of Object.entries(samples)) {
    useMap(id);
    for (const s of views)
      for (const eye of [1.65, 0.8])
        assert.equal(
          clearSight(
            { x: s.x, y: s.h + eye, z: s.from },
            { x: s.x, y: s.h + eye, z: s.to },
          ),
          false,
          `${id}: x=${s.x}, height=${s.h} breaks view`,
        );
  }
  useMap("compound");
});
test("new terrace staircases are actually climbable without jumping", () => {
  const climbs = [
    ["compound", -17, 4, 0, 1, 0.8],
    ["compound", -3.8, 16.2, 0, 1.6, 1.6],
    ["compound", 11, -8, -Math.PI / 2, 1.45, 2.4],
    ["lanes", -14.9, 16.3, 0, 1, 1.2],
    ["lanes", 14.5, 18.8, 0, 1.6, 2.4],
    ["quad", -15.1, 16, 0, 1, 1.2],
    ["quad", -5.8, 17, 0, 1.1, 1.6],
    ["quad", 3.8, 15, 0, 0.75, 0.8],
    ["quad", 14.8, 18, 0, 1.6, 2.4],
    ["monolith", -19.5, 18, 0, 2, 2.4],
    ["monolith", 12, -13, -Math.PI / 2, 2, 2.4],
    ["monolith", 0.5, 6.5, 0, 1.2, 1.2],
  ];
  for (const [map, x, z, yaw, seconds, height] of climbs) {
    const m = new Match("CLIMB", true, "seen", false, map);
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    Object.assign(m.players.a, { x, z, yaw, input: { forward: 1 } });
    advance(m, seconds);
    assert.equal(
      m.players.a.y,
      height,
      `${map}: staircase at ${x},${z} reaches ${height} m, ended ${m.players.a.x},${m.players.a.z}`,
    );
  }
  useMap("compound");
});

test("wires can be anchored above elevated footing, not just above ground zero", () => {
  const m = new Match("HIGH-WIRE", true, "seen", false, "lanes");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.d, {
    x: 0,
    y: 2,
    z: 5,
    yaw: -Math.PI / 2,
    pitch: -0.2,
    inventory: { tripwire: 1 },
    equipped: "tripwire",
  });
  m.use(m.players.d);
  assert.ok(m.players.d.anchor, "first wall anchor accepted");
  assert.ok(m.players.d.anchor.y > 2.1 && m.players.d.anchor.y < 3.5);
  useMap("compound");
});

test("the infiltrator bot can take every route on every map", () => {
  for (const id of mapIds) {
    const routes = MAPS[id].botRoutes;
    assert.ok(routes.length >= 3, `${id}: several routes`);
    routes.forEach((route, r) => {
      const m = new Match("ROUTE", true, "seen", false, id);
      m.addPlayer("d", "defender");
      m.addPlayer("bot", "attacker", true);
      m.debug.botRoute = r;
      m.activate();
      m.players.d.alive = false;
      advance(m, 90);
      assert.equal(m.result?.winner, "attacker", `${id}: ${route.name}`);
    });
  }
  useMap("compound");
});

test("the developer panel cycles the bot's route; by default it's random", () => {
  const m = new Match("CYCLE", true, "seen", false, "monolith");
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  const names = MAPS.monolith.botRoutes.map((r) => r.name);
  const seen = [];
  for (let i = 0; i <= names.length; i++) {
    m.action("d", { type: "debug", key: "botRoute" });
    seen.push(m.debug.botRoute);
  }
  assert.deepEqual(seen, [...names.keys(), undefined]);
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    m.activate();
    picks.add(m.players.bot.route);
  }
  assert.ok(picks.size > 1, "random routes vary between rounds");
  useMap("compound");
});

test("every map has its own briefing and ways in", () => {
  for (const id of mapIds) {
    assert.ok(MAPS[id].brief, `${id}: brief`);
    assert.ok(MAPS[id].approaches.length >= 3, `${id}: approaches`);
  }
});
test("players spawn facing open ground, not their spawn screen", () => {
  for (const id of mapIds) {
    const m = new Match("FACE", true, "seen", false, id);
    m.addPlayer("a", "attacker");
    m.addPlayer("d", "defender");
    for (const p of Object.values(m.players)) {
      // A spawn room is closed before the round; it faces its centre door.
      if (p.team === "attacker" && MAPS[id].spawnRoom) {
        assert.equal(p.yaw, 0, `${id} faces the centre door`);
        continue;
      }
      const eye = { x: p.x, y: 1.65, z: p.z };
      assert.ok(
        clearSight(eye, {
          x: p.x - Math.sin(p.yaw) * 10,
          y: 1.65,
          z: p.z - Math.cos(p.yaw) * 10,
        }),
        `${id} ${p.team} sees 10 m ahead from spawn`,
      );
    }
    m.reset();
    for (const p of Object.values(m.players))
      assert.equal(p.yaw, MAPS[id].spawnYaw[p.team], `${id} reset facing`);
  }
  useMap("compound");
});
test("a ramp climbs smoothly to the plaza overlook and back down", () => {
  const walk = (start, yaw, until) => {
    const m = new Match("RAMP", true, "seen", false, "monolith");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    const p = m.players.a;
    Object.assign(p, start, { yaw, input: { forward: 1 } });
    let airborne = 0;
    for (let i = 0; i < 30 * 6 && !until(p); i++) {
      m.tick(1 / 30);
      if (!p.grounded) airborne++;
    }
    return { p, airborne };
  };
  // Up the west overlook's ramp (1.6 m), climbing -z.
  const { p } = walk({ x: -21.5, z: -22.5, y: 0 }, 0, (p) => p.z < -29);
  assert.equal(p.y, 1.6, `overlook reached, ended ${p.x},${p.z},${p.y}`);
  // And back down: grounded the whole way, never hopping between columns.
  const down = walk(
    { x: -21.5, z: -28.6, y: 1.6 },
    Math.PI,
    (p) => p.z > -22.5,
  );
  assert.equal(down.p.y, 0, "back on the ground");
  assert.equal(down.airborne, 0, "stays on the ramp walking down");
  // The west gallery's south end is a ramp up to its 2.4 m top.
  const up = walk({ x: -19.5, z: -22, y: 0 }, Math.PI, (p) => p.z > -13);
  assert.equal(up.p.y, 2.4, `gallery reached, ended ${up.p.x},${up.p.z}`);
});
test("The Monolith: a few large pieces, several separate ways to the flag", async () => {
  const { structureGroups } = await import("../src/structure.js");
  useMap("monolith");
  // (Railings are drawn on their own, not as structure pieces.)
  const structures = new Set(structureGroups(WALLS.filter((w) => !w.railing)))
    .size;
  // (Its spawn bunker, two lane walls and their vents added a few.)
  assert.ok(structures <= 66, `${structures} structures (was 105)`);
  // Each approach reaches the flag on foot from staging.
  for (const [name, via] of [
    ["west flank", { x: -24.5, z: 0 }],
    ["west lane", { x: -12.5, z: 0 }],
    ["courtyard west", { x: -6, z: 0 }],
    ["courtyard east", { x: 6, z: 0 }],
    ["east lane", { x: 12.5, z: 0 }],
    ["east flank", { x: 24.5, z: 0 }],
  ]) {
    assert.ok(freeDecoyPoint(via), `${name} is open`);
    assert.ok(decoyPath(SPAWNS.attacker, via), `${name} from staging`);
    assert.ok(decoyPath(via, OBJECTIVE), `${name} to the flag`);
  }
  // High framing walls, three large towers, and no skybridge.
  assert.ok(WALLS.filter((w) => w.kind === "wall").every((w) => w.h >= 14));
  const towers = WALLS.filter((w) => w.tower);
  assert.ok(towers.length >= 3 && towers.every((w) => w.h >= 15 && w.w >= 4));
  assert.ok(
    !WALLS.some((w) => w.bottom > 4),
    "nothing overhead at bridge height",
  );
  // North and south halves differ: apart from the spawn screens, the
  // altar's stairs and the railings that follow them, no piece has an exact
  // north/south mirror.
  const mirrored = WALLS.filter(
    (w) =>
      w.kind !== "wall" &&
      !w.railing &&
      Math.abs(w.z) > 0.5 &&
      Math.abs(w.z) < 30 &&
      Math.abs(w.x) > 0.01 &&
      WALLS.some(
        (o) =>
          o !== w &&
          Math.abs(o.x - w.x) < 0.05 &&
          Math.abs(o.z + w.z) < 0.05 &&
          Math.abs(o.w - w.w) < 0.05 &&
          Math.abs(o.d - w.d) < 0.05 &&
          Math.abs(o.h - w.h) < 0.05,
      ),
  );
  assert.deepEqual(
    mirrored.map((w) => `${w.kind} ${w.x},${w.z}`),
    [],
  );
  // The plaza fence has three gaps: around each end and through the middle.
  for (const x of [-9.8, 0, 9.8])
    assert.ok(freeDecoyPoint({ x, z: -19.8 }), `plaza gap at x ${x}`);
  useMap("compound");
});
test("Pier 9: three homes have connected yards and open garden gates", () => {
  useMap("docks");
  const map = MAPS.docks;
  assert.equal(map.houses.length, 5);
  for (const house of map.houses.filter((h) => !h.spawn)) {
    for (const point of [
      { x: house.x, z: 12 },
      { x: house.x, z: -18 },
    ]) {
      assert.ok(freeDecoyPoint(point), `${house.id} garden clear`);
      assert.ok(
        decoyPath(SPAWNS.attacker, point),
        `${house.id} garden reachable`,
      );
      assert.ok(
        decoyPath(point, OBJECTIVE),
        `${house.id} garden joins back lane`,
      );
    }
    assert.equal(
      clearSight(
        { x: house.x, y: 1.65, z: 12 },
        { x: house.x, y: 1.65, z: -18 },
      ),
      false,
      "indoor partition breaks sightline",
    );
  }
  for (const { x, z } of map.gardenGates) {
    const a = { x: x - 1, z },
      b = { x: x + 1, z };
    assert.ok(decoyPath(a, b));
    assert.equal(clearSight({ ...a, y: 1.65 }, { ...b, y: 1.65 }), true);
    assert.equal(
      clearSight({ x: x - 1, z: 14, y: 1.65 }, { x: x + 1, z: 14, y: 1.65 }),
      false,
      "privacy fence screens side yards",
    );
  }
  assert.ok(
    !map.walls.some((w) => ["container", "crane", "tank"].includes(w.kind)),
  );
  useMap("compound");
});
test("Pier 9: no two overlapping pieces share a visible face (no flicker)", () => {
  const box = (w) => ({
    x: [w.x - w.w / 2, w.x + w.w / 2],
    y: [w.bottom || 0, w.h],
    z: [w.z - w.d / 2, w.z + w.d / 2],
  });
  const walls = MAPS.docks.walls.filter(
      (w) => !w.hidden && !w.shape && !w.ramp,
    ),
    clashes = [];
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = box(walls[i]),
        b = box(walls[j]);
      for (const k of ["x", "y", "z"])
        for (const s of [0, 1]) {
          // Bottom faces sit on (or under) the floor, out of sight.
          if (k === "y" && s === 0) continue;
          if (Math.abs(a[k][s] - b[k][s]) > 0.003) continue;
          const [u, v] = ["x", "y", "z"].filter((q) => q !== k),
            overlap = (q) =>
              Math.min(a[q][1], b[q][1]) - Math.max(a[q][0], b[q][0]);
          if (overlap(u) > 0.02 && overlap(v) > 0.02)
            clashes.push(
              `${walls[i].kind} ${walls[i].x},${walls[i].z} / ${walls[j].kind} ${walls[j].x},${walls[j].z} (${s ? "+" : "-"}${k})`,
            );
        }
    }
  assert.deepEqual(clashes, []);
});
