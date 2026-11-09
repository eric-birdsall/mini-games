import { test } from "node:test";
import assert from "node:assert/strict";
import { partyNext } from "../server/party.js";
import { Match } from "../server/simulation.js";
import {
  SPRINKLER_SITES,
  sprinklerSchedule,
  sprinklerStage,
  sprinklerHits,
} from "../shared/sprinklers.js";
import { MAPS } from "../shared/maps.js";
import {
  sprinklersClamp,
  sprinklersActivate,
  sprinklersTick,
} from "../server/sprinklers.js";
import { PARTY, skipsBackpack } from "../shared/party.js";
import { parseLaunch } from "../src/launch.js";
function match() {
  const m = new Match("YARD", false, "soak", true, "docks");
  m.setParty("sprinklers", false);
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  sprinklersActivate(m, 42);
  return m;
}
test("seeded waves increase simultaneous heads and complete pop-up cycle", () => {
  const heads = sprinklerSchedule(42);
  assert.deepEqual(heads, sprinklerSchedule(42));
  assert.equal(heads.filter((h) => h.at === 2).length, 1);
  const later = heads.find((h) => h.at > 45);
  assert.ok(heads.filter((h) => h.at === later.at).length >= 4);
  const h = heads[0];
  assert.equal(sprinklerStage(h, h.at), "warning");
  assert.equal(sprinklerStage(h, h.at + PARTY.sprinklers.warnSeconds), "spray");
  assert.equal(sprinklerStage(h, h.end - 0.1), "retract");
  assert.equal(sprinklerStage(h, h.end), "hidden");
});
test("spray catches swept movement but not outside radius", () => {
  const h = { x: 0, z: 0 };
  assert.ok(sprinklerHits(h, { x: -8, z: 0 }, { x: 8, z: 0 }));
  assert.ok(!sprinklerHits(h, { x: -8, z: 5 }, { x: 8, z: 5 }));
});
test("dedicated map, third-person backpack policy, no equipment and URL launch", () => {
  const m = match();
  assert.equal(m.map, "yard");
  assert.ok(skipsBackpack("sprinklers"));
  assert.deepEqual(m.players.a.inventory, {});
  assert.equal(
    parseLaunch("?type=solo&objective=sprinklers").objective,
    "sprinklers",
  );
});
test("warnings do not soak, spray decides winner, rematch resets", () => {
  const m = match(),
    r = m.party.sprinklers;
  r.heads = [{ id: 1, x: -3, z: 4, at: 0, end: 5 }];
  sprinklersTick(m, 0.5);
  assert.equal(r.runners.a.wet, false);
  sprinklersTick(m, 1.2);
  assert.equal(r.runners.a.wet, true);
  assert.equal(m.phase, "active");
  sprinklersTick(m, 1.9);
  assert.equal(m.phase, "active");
  sprinklersTick(m, 0.11);
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "d");
  assert.equal(m.result.final, true);
  partyNext(m);
  assert.equal(m.party.half, 1);
  assert.equal(m.party.sprinklers, undefined);
  assert.equal(m.players.a.immobile, 0);
});
test("simultaneous soaking is a draw", () => {
  const m = match();
  m.players.d.x = -3;
  m.party.sprinklers.runners.d.last.x = -3;
  m.party.sprinklers.heads = [{ id: 1, x: -3, z: 4, at: 0, end: 5 }];
  sprinklersTick(m, 2);
  sprinklersTick(m, PARTY.sprinklers.soakSeconds);
  assert.equal(m.result.winnerId, null);
});
test("normal match lifecycle reaches active with serialized hazards", () => {
  const m = new Match("YARD", true, "soak", true, "docks");
  m.setParty("sprinklers", true);
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.action("a", { type: "ready" });
  for (let i = 0; i < 400 && m.phase !== "active"; i++) m.tick(1 / 30);
  assert.equal(m.phase, "active");
  for (let i = 0; i < 90 && m.phase === "active"; i++) m.tick(1 / 30);
  const view = m.snapshot("a");
  assert.ok(view.party.sprinklers);
  assert.ok(view.party.sprinklers.heads.length);
  assert.equal(view.party.sprinklers.wave, 1);
});

test("compact yard keeps hazards and movement inside its fences", () => {
  assert.deepEqual(MAPS.yard.size, { x: 5.5, z: 5.5 });
  for (const h of sprinklerSchedule(42)) {
    assert.ok(Math.abs(h.x) < 5.5);
    assert.ok(Math.abs(h.z) < 5.5);
  }
  const m = match(),
    p = m.players.a;
  p.x = 20;
  p.z = -20;
  sprinklersClamp(m, p);
  assert.equal(p.x, 5);
  assert.equal(p.z, -5);
});

test("screen directions turn the character without rotating movement", () => {
  const m = match(),
    p = m.players.a;
  for (const [forward, side, yaw] of [
    [1, 0, 0],
    [-1, 0, Math.PI],
    [0, 1, -Math.PI / 2],
    [0, -1, Math.PI / 2],
  ]) {
    p.input = { forward, side };
    sprinklersClamp(m, p);
    const body = m.snapshot("a").players.find((x) => x.id === "a");
    assert.ok(
      Math.abs(Math.atan2(Math.sin(body.yaw - yaw), Math.cos(body.yaw - yaw))) <
        0.001,
    );
  }
});

test("yard camera includes all fences across wide and portrait screens", async () => {
  const { PerspectiveCamera, Vector3 } = await import("three");
  const { frameSprinklerYard } = await import("../src/sprinklerCamera.js");
  for (const aspect of [0.56, 1, 1.6, 1.83, 2.4]) {
    const camera = new PerspectiveCamera(70, aspect, 0.08, 140);
    frameSprinklerYard(camera, MAPS.yard);
    for (const x of [-6.5, 6.5])
      for (const z of [-6.2, 6.2])
        for (const y of [0, 1.4]) {
          const p = new Vector3(x, y, z).project(camera);
          assert.ok(
            Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.85,
            `Fence clipped at aspect ${aspect}: ${p.x}, ${p.y}`,
          );
        }
  }
});

test("sprinkler movement is fast without sprint and rejects low stances", () => {
  const m = match(),
    p = m.players.a;
  for (const sprint of [false, true]) {
    m.action("a", {
      type: "input",
      input: { forward: 1, sprint, crouch: true, prone: true },
    });
    assert.equal(p.input.sprint, false);
    assert.equal(p.input.crouch, false);
    assert.equal(p.input.prone, false);
    const old = { x: p.x, z: p.z };
    m.move(p, 0.1, old);
    assert.ok(
      Math.abs(
        Math.hypot(p.x - old.x, p.z - old.z) - PARTY.sprinklers.moveSpeed * 0.1,
      ) < 0.001,
    );
  }
});

test("wet runners freeze and the catching sprinkler keeps spraying during results delay", () => {
  const m = match(),
    p = m.players.a,
    r = m.party.sprinklers;
  r.heads = [{ id: 1, x: p.x, z: p.z, at: 0, end: 5 }];
  r.t = 4;
  sprinklersTick(m, 0.1);
  const old = { x: p.x, y: p.y, z: p.z };
  p.input = { forward: 1, jump: true, sprint: true };
  m.move(p, 0.1, old);
  assert.deepEqual({ x: p.x, y: p.y, z: p.z }, old);
  assert.equal(p.moveSpeed, 0);
  assert.equal(sprinklerStage(r.heads[0], r.t + 1.9), "spray");
});

test("sprinklers reuse exactly nine fixed sites in an evenly spaced 3 by 3 grid", () => {
  assert.equal(SPRINKLER_SITES.length, 9);
  const xs = [...new Set(SPRINKLER_SITES.map((p) => p.x))].sort(
    (a, b) => a - b,
  );
  const zs = [...new Set(SPRINKLER_SITES.map((p) => p.z))].sort(
    (a, b) => a - b,
  );
  assert.equal(xs.length, 3);
  assert.equal(zs.length, 3);
  // The grid reaches all sides of the yard, even when spray crosses fences.
  assert.deepEqual(
    xs.map((x) => Math.round(x * 10) / 10),
    [-4.5, 0, 4.5],
  );
  assert.deepEqual(
    zs.map((z) => Math.round(z * 10) / 10),
    [-4.5, 0, 4.5],
  );
  for (const axis of [xs, zs]) {
    assert.ok(Math.abs(axis[0] + axis[2]) < 1e-9);
    for (let i = 2; i < axis.length; i++)
      assert.ok(Math.abs(axis[i] - axis[i - 1] - (axis[1] - axis[0])) < 1e-9);
  }
  const fixed = new Set(SPRINKLER_SITES.map((p) => `${p.x},${p.z}`));
  for (const seed of [1, 42, 1234]) {
    const heads = sprinklerSchedule(seed);
    assert.deepEqual(new Set(heads.map((p) => `${p.x},${p.z}`)), fixed);
    for (const at of new Set(heads.map((h) => h.at))) {
      const wave = heads.filter((h) => h.at === at);
      assert.equal(new Set(wave.map((p) => `${p.x},${p.z}`)).size, wave.length);
    }
  }
});

test("sprinkler renderer handles countdown before run data exists", async () => {
  const { World } = await import("../src/world.js");
  const { Scene } = await import("three");
  const world = Object.create(World.prototype);
  world.scene = new Scene();
  const state = {
    phase: "prep",
    party: { kind: "sprinklers", sprinklers: null },
  };
  world.updateSprinklers(state);
  assert.equal(world.sprinklerMeshes.size, 9);
  assert.ok([...world.sprinklerMeshes.values()].every((head) => !head.visible));
  const site = SPRINKLER_SITES[0];
  state.phase = "active";
  state.party.sprinklers = { t: 2, heads: [{ ...site, at: 2, end: 7 }] };
  world.updateSprinklers(state);
  assert.equal(world.sprinklerMeshes.get(0).visible, true);
  // Rematches return to the countdown with no run data again.
  state.party.sprinklers = null;
  world.updateSprinklers(state);
  assert.ok([...world.sprinklerMeshes.values()].every((head) => !head.visible));
});
