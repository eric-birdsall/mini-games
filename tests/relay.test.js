import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap, useObjectives } from "../shared/maps.js";
import { clearSight, distance } from "../shared/map.js";
import { decoyPath, freeDecoyPoint } from "../shared/decoy.js";
import {
  CONFIG,
  OBJECTIVES,
  SPAWNS,
  objectivesNeeded,
} from "../shared/config.js";
// Relay Station: a two-site map built for plant & defend.
const hold = { interact: true };

test("Relay Station: two sites, both kept in plant mode", () => {
  useMap("relay");
  useObjectives("plant");
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "B"],
  );
  useObjectives("extract");
  assert.equal(OBJECTIVES.length, 2);
  assert.equal(objectivesNeeded(), 1, "extract: one terminal wins");
  useMap("compound");
});

test("Relay Station: each site has three ways in (lane, hall, road)", () => {
  useMap("relay");
  const ways = {
    // Just outside the main door, the hall side door and the back gap.
    A: [
      { x: -15, z: -6.5 },
      { x: -7.5, z: -13 },
      { x: -13, z: -25.5 },
    ],
    B: [
      { x: 15, z: -6.5 },
      { x: 7.5, z: -19 },
      { x: 11.75, z: -25.5 },
    ],
  };
  for (const t of MAPS.relay.terminals) {
    const pad = { x: t.x, z: t.z + 1.2 };
    assert.ok(freeDecoyPoint(pad), `${t.id}: open in front of the terminal`);
    for (const w of ways[t.id]) {
      assert.ok(freeDecoyPoint(w), `${t.id}: ${JSON.stringify(w)} is open`);
      assert.ok(decoyPath(w, pad), `${t.id}: in from ${JSON.stringify(w)}`);
    }
    assert.ok(decoyPath(SPAWNS.attacker, pad), `${t.id}: from the bunker`);
    assert.ok(decoyPath(SPAWNS.defender, pad), `${t.id}: from the road`);
  }
  // The hall's racks break the view from one side door to the other.
  assert.equal(
    clearSight({ x: -8, y: 1.65, z: -13 }, { x: 8, y: 1.65, z: -19 }),
    false,
  );
  useMap("compound");
});

test("Relay Station: each site's raised lookout sees its terminal", () => {
  useMap("relay");
  for (const [id, spot, h] of [
    ["A", { x: -20.5, z: -17 }, 1.6],
    ["B", { x: 17, z: -20.8 }, 2.4],
  ]) {
    const t = MAPS.relay.terminals.find((t) => t.id === id);
    assert.ok(distance(spot, t) < 8, `${id}: lookout close by`);
    // Standing and crouched, over its railing, at the console's top.
    for (const eye of [1.65, 1.1])
      assert.ok(
        clearSight({ ...spot, y: h + eye }, { x: t.x, y: 1.3, z: t.z }),
        `${id}: lookout at eye ${eye} sees the terminal`,
      );
  }
  useMap("compound");
});

test("Relay Station: the sentinel bot pulls a plant on either site", () => {
  for (const site of ["A", "B"]) {
    const m = new Match("PULL", true, "seen", false, "relay");
    m.objectiveMode = "plant";
    m.addPlayer("a", "attacker");
    m.addPlayer("bot", "defender", true);
    m.phase = "active";
    m.time = 240;
    m.useLevel();
    // The bot starts on the other site: the worst case.
    const far = OBJECTIVES.find((o) => o.id !== site),
      t = OBJECTIVES.find((o) => o.id === site);
    Object.assign(m.players.bot, { x: far.x, z: far.z + 2, yaw: 0 });
    Object.assign(m.players.a, { x: t.x, z: t.z + 1.4, y: 0, yaw: 0 });
    for (let i = 0; i < (CONFIG.plantSeconds + 0.1) * 30; i++) {
      m.players.a.input = hold;
      m.tick(1 / 30);
    }
    assert.equal(m.uplink?.site, site);
    m.players.a.alive = false;
    for (let i = 0; i < CONFIG.uplinkSeconds * 30 && !m.result; i++)
      m.tick(1 / 30);
    assert.equal(m.result?.reason, "Uplink pulled", site);
    assert.ok(
      m.uplink.remaining > 10,
      `${site}: pulled with ${m.uplink.remaining.toFixed(1)} s to spare`,
    );
  }
  useMap("compound");
});

test("Relay Station: the infiltrator bot plants on every route, then holds a lookout", () => {
  for (const rule of ["seen", "soak"])
    MAPS.relay.botRoutes.forEach((route, r) =>
      [0, 1].forEach((goal) => {
        const m = new Match("PLNT", true, rule, false, "relay");
        m.objectiveMode = "plant";
        m.addPlayer("d", "defender");
        m.addPlayer("bot", "attacker", true);
        m.debug.botRoute = r;
        m.debug.botGoal = goal;
        m.useLevel();
        const site = OBJECTIVES[goal];
        m.activate();
        m.players.d.alive = false;
        for (let i = 0; i < 150 * 30 && !m.uplink; i++) m.tick(1 / 30);
        const name = `${rule}: ${route.name} → ${site.name}`;
        assert.equal(m.uplink?.site, site.id, name);
        for (let i = 0; i < 15 * 30; i++) m.tick(1 / 30);
        const bot = m.players.bot,
          d = distance(bot, site);
        assert.ok(d > 3 && d < 13.5, `${name}: ${d.toFixed(1)} m off`);
        assert.ok(bot.crouch, `${name}: holding low`);
      }),
    );
  useMap("compound");
});

test("Relay Station: no two overlapping pieces share a visible face", () => {
  const box = (w) => ({
    x: [w.x - w.w / 2, w.x + w.w / 2],
    y: [w.bottom || 0, w.h],
    z: [w.z - w.d / 2, w.z + w.d / 2],
  });
  const walls = MAPS.relay.walls.filter(
      (w) => !w.hidden && !w.shape && !w.ramp,
    ),
    clashes = [];
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = box(walls[i]),
        b = box(walls[j]);
      for (const k of ["x", "y", "z"])
        for (const s of [0, 1]) {
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
