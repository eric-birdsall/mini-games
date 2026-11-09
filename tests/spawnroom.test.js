import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { decoyPath } from "../shared/decoy.js";

const map = MAPS.docks,
  room = map.spawnRoom;
test("Sneakers spawn in a single-story house spanning all three lanes", () => {
  const house = map.houses.find((h) => h.spawn),
    zone = room.zone[0];
  assert.equal(house.x, map.houses.find((h) => h.id === "B").x);
  assert.ok(map.spawns.attacker.z > zone.z0 && map.spawns.attacker.z < zone.z1);
  assert.equal(house.singleStory, true);
  assert.equal(house.w, 50);
  assert.equal(house.upperFloor, undefined);
  useMap("docks");
  assert.ok(decoyPath(map.spawns.attacker, { x: 0, z: 35 }));
  assert.ok(decoyPath({ x: 0, z: 35 }, { x: 0, z: 8 }));
});
test("front, garage and side exits stay closed in preparation and open during play", () => {
  for (const [i, exit] of room.exits.entries()) {
    const m = new Match("HOME", true, "seen", false, "docks");
    m.noBot = true;
    m.addPlayer("a", "attacker");
    const p = m.players.a,
      side = i === 2;
    m.phase = "prep";
    m.time = 45;
    const walk = () => {
      Object.assign(p, {
        x: side ? 24 : exit.x,
        z: side ? 46 : 39,
        y: 0,
        vy: 0,
        grounded: true,
        yaw: side ? -Math.PI / 2 : 0,
      });
      p.input = { forward: 1, yaw: p.yaw };
      for (let t = 0; t < 30; t++) m.tick(1 / 30);
    };
    walk();
    assert.ok(side ? p.x < 25 : p.z > 38, `${exit.name} closed`);
    m.activate();
    walk();
    assert.ok(side ? p.x > 25.5 : p.z < 37.5, `${exit.name} opens`);
  }
});
test("sentinels cannot enter Sneakers' house", () => {
  const m = new Match("HOME", true, "seen", false, "docks");
  m.addPlayer("d", "defender");
  assert.equal(m.offLimits(m.players.d, map.spawns.attacker), true);
  assert.equal(m.offLimits(m.players.d, { x: 0, z: 29.5 }), false);
});
test("team homes mirror each other with connected garages opposite Lane A", () => {
  useMap("compound");
  useMap("docks");
  const homes = map.houses.filter((h) => h.spawn);
  assert.equal(homes.length, 2);
  assert.equal(homes[0].w, homes[1].w);
  assert.equal(homes[0].z, -homes[1].z);
  for (const side of [-1, 1]) {
    assert.ok(decoyPath({ x: 0, z: 48 * side }, { x: -18, z: 46 * side }), "interior garage door reachable");
    assert.ok(decoyPath({ x: -18, z: 46 * side }, { x: -18, z: 30.5 * side }), "open garage leads across lawn to street");
  }
});
