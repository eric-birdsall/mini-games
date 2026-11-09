import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG, GADGETS } from "../shared/config.js";
import { variantsOf, statKind } from "../shared/variants.js";
import { throwPath } from "../shared/throwing.js";
import { distance } from "../shared/map.js";
function match() {
  const m = new Match("TYPES");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  return m;
}
function active(m) {
  m.phase = "active";
  m.time = 240;
  return m;
}
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}

test("typed gadgets: each type is bought and stocked separately", () => {
  assert.deepEqual(variantsOf("jammer"), ["jammer", "jammerPortable"]);
  assert.deepEqual(variantsOf("tripwire"), ["tripwire", "tripwireDecoy"]);
  assert.equal(statKind("tripwireDecoy"), "tripwire");
  const m = match();
  m.action("d", { type: "buy", gadget: "tripwire" });
  m.action("d", { type: "buy", gadget: "tripwireDecoy" });
  m.action("d", { type: "buy", gadget: "tripwireDecoy" });
  assert.deepEqual(m.players.d.inventory, { tripwire: 1, tripwireDecoy: 2 });
  assert.equal(
    m.players.d.credits,
    CONFIG.credits - GADGETS.tripwire.cost - 2 * GADGETS.tripwireDecoy.cost,
  );
  m.action("d", { type: "selectType", gadget: "sensorPortable" });
  assert.equal(m.players.d.loadoutTypes.sensor, "sensorPortable");
  m.action("d", { type: "selectType", gadget: "jammerPortable" });
  assert.equal(m.players.d.loadoutTypes.jammer, undefined, "other role");
});

test("a flashbang blinds whoever can see the burst, and marks it for the other side", () => {
  const m = active(match()),
    a = m.players.a,
    d = m.players.d;
  // The sentinel faces the burst 4 m away; the thrower is turned away.
  Object.assign(d, { x: 0, z: -12, yaw: 0, pitch: 0 });
  Object.assign(a, { x: 0, z: -20, yaw: 0, pitch: 0 });
  m.gadgets.push({
    id: 60,
    kind: "camera",
    team: "defender",
    x: 2,
    y: 1.5,
    z: -14,
    active: true,
  });
  m.detonate({
    id: 61,
    kind: "flashbang",
    team: "attacker",
    landing: { x: 0, y: 0, z: -16 },
    radius: 8,
    duration: 3,
  });
  assert.equal(d.blind, 3, "facing it: the full blind time");
  assert.equal(a.blind, 3 * CONFIG.flashAwayFactor, "turned away: less");
  assert.equal(m.gadgets[0].flashed, 3, "the camera whites out");
  assert.ok(
    m.snapshot("d").pings.some((g) => g.z === -16),
    "spot marked",
  );
  assert.equal(m.snapshot("a").pings.length, 0, "not for the thrower's side");
  // Blinded, the sentinel can't identify the infiltrator in plain sight.
  Object.assign(a, { z: -15, yaw: Math.PI });
  advance(m, 2);
  assert.equal(m.pairs["d:a"] || 0, 0, "no detection while blind");
  advance(m, 1.5);
  assert.ok(m.pairs["d:a"] > 0, "detection resumes once it wears off");
  // Out of range or behind a wall: unaffected.
  const far = active(match());
  Object.assign(far.players.d, { x: 0, z: -30 });
  far.detonate({
    id: 62,
    kind: "flashbang",
    team: "attacker",
    landing: { x: 0, y: 0, z: -16 },
    radius: 8,
    duration: 3,
  });
  assert.ok(!far.players.d.blind);
});

test("decoy cameras never report", () => {
  const m = active(match());
  Object.assign(m.players.a, { x: 10, z: 10 });
  Object.assign(m.players.d, { x: -20, z: 20 });
  m.gadgets.push({
    id: 2,
    kind: "cameraDecoy",
    owner: "d",
    team: "defender",
    x: 10,
    y: 1,
    z: 12,
    active: true,
  });
  m.players.a.input = { forward: 1 };
  advance(m, 0.5);
  assert.deepEqual(m.snapshot("d").revealed, []);
  assert.ok(!m.events.some((e) => e.text.startsWith("Motion")));
  m.action("d", { type: "camera" });
  assert.equal(m.players.d.camera, null, "no feed from a decoy camera");
});

test("keeping an enemy device in view for 2 s destroys it; smoke stops it", () => {
  const m = active(match()),
    d = m.players.d;
  m.players.a.alive = false;
  Object.assign(d, { x: 0, z: -16, yaw: Math.PI, pitch: -0.05 });
  m.gadgets.push({
    id: 7,
    kind: "jammer",
    owner: "a",
    team: "attacker",
    x: 0,
    y: 0.1,
    z: -8,
    active: true,
  });
  advance(m, CONFIG.spotSeconds - 0.3);
  assert.equal(m.gadgets[0].active, true, "not yet");
  assert.ok(m.snapshot("d").me.spotting > 0.7);
  m.smokes.push({ id: 1, x: 0, y: 0, z: -12, radius: 2, remaining: 1 });
  advance(m, 0.5);
  assert.equal(
    m.gadgets[0].active,
    true,
    "smoke breaks the spot and resets it",
  );
  advance(m, 0.6 + CONFIG.spotSeconds);
  assert.equal(m.gadgets[0].active, false);
  assert.ok(m.events.some((e) => e.text === "Device spotted and destroyed."));
});

test("an infiltrator's look only marks a sentinel's device; the tool removes it", () => {
  const m = active(match()),
    a = m.players.a;
  m.players.d.alive = false;
  Object.assign(a, { x: 0, z: -10, yaw: 0, pitch: -0.12 });
  m.gadgets.push({
    id: 8,
    kind: "sensor",
    owner: "d",
    team: "defender",
    x: 0,
    y: 0.1,
    z: -16,
    active: true,
  });
  advance(m, CONFIG.markSeconds + 0.2);
  const g = m.gadgets[0];
  assert.equal(g.marked, true, "marked");
  assert.ok(m.snapshot("a").gadgets[0].marked, "the infiltrator sees the mark");
  assert.ok(!m.snapshot("d").gadgets[0].marked, "the sentinel isn't told");
  advance(m, CONFIG.spotSeconds * 3);
  assert.equal(g.active, true, "looking never destroys it");
  // Walk up with the disarming tool and hold E: gone.
  a.inventory.disarm = 1;
  a.equipped = "disarm";
  Object.assign(a, { z: -14.5, pitch: -0.9, input: { interact: true } });
  advance(m, 1.5);
  assert.equal(g.active, false, "the tool removes it");
});

test("a portable jammer jams nearby enemy electronics around the wearer", () => {
  const m = active(match()),
    a = m.players.a;
  m.players.d.alive = false;
  Object.assign(a, {
    x: 0,
    z: -8,
    equipped: "jammerPortable",
    inventory: { jammerPortable: 1 },
  });
  m.gadgets.push(
    {
      id: 1,
      kind: "sensor",
      team: "defender",
      x: 3,
      y: 0,
      z: -8,
      active: true,
    },
    {
      id: 2,
      kind: "sensor",
      team: "defender",
      x: 9,
      y: 0,
      z: -8,
      active: true,
    },
  );
  m.use(a);
  advance(m, 0.1);
  assert.equal(m.gadgets[0].jammed, true, "within 5 m");
  assert.equal(m.gadgets[1].jammed, false, "beyond 5 m");
  assert.equal(a.inventory.jammerPortable, 1, "reusable");
  advance(m, 4);
  assert.equal(m.gadgets[0].jammed, false, "4 s standard duration");
  assert.ok(a.cooldowns.jammerPortable > 0, "recharging");
});

test("the worn sensor outlines movers close to an equipped defender", () => {
  const m = active(match()),
    d = m.players.d;
  Object.assign(d, {
    x: 0,
    z: -16,
    equipped: "sensorPortable",
    inventory: { sensorPortable: 1 },
  });
  Object.assign(m.players.a, { x: 3, z: -16 });
  m.players.a.input = { side: 1 };
  advance(m, 0.2);
  assert.deepEqual(m.snapshot("d").revealed, ["a"]);
  d.equipped = null;
  assert.ok(d.sensorAlert > 0);
});

test("the mirror pole extends and retracts, holding the player still", () => {
  const m = active(match()),
    a = m.players.a;
  m.players.d.alive = false;
  Object.assign(a, {
    x: 0,
    z: 20,
    yaw: 0.4,
    equipped: "cameraPortable",
    inventory: { cameraPortable: 1 },
  });
  m.use(a);
  assert.deepEqual(a.mirror, { yaw: 0.4 });
  a.input = { forward: 1 };
  advance(m, 0.3);
  assert.equal(a.z, 20, "no walking while peeking");
  m.action("a", { type: "mirror", close: true });
  assert.equal(a.mirror, null);
  m.use(a);
  m.action("a", { type: "equip", gadget: "cameraPortable" });
  a.equipped = "scanner";
  advance(m, 0.05);
  assert.equal(a.mirror, null, "switching gadgets retracts it");
});

test("tripwire anchors must be within the span stat (6 m standard)", () => {
  const m = active(match()),
    d = m.players.d;
  m.players.a.alive = false;
  // First anchor on the warehouse wall (x -5.7); second on the east
  // perimeter wall (x 18.5): in sight of each other but 24 m apart.
  Object.assign(d, {
    x: 13.5,
    z: 5,
    yaw: -Math.PI / 2,
    pitch: -0.25,
    equipped: "tripwire",
    inventory: { tripwire: 1 },
  });
  d.anchor = {
    x: -5.7,
    y: 0.5,
    z: 5,
    wall: true,
    normal: { x: 1, y: 0, z: 0 },
  };
  m.use(d);
  assert.equal(m.gadgets.length, 0);
  assert.match(m.events.at(-1).text, /max 6 m/);
  assert.ok(d.anchor, "a bad second anchor keeps the first");
});

test("cancelling a first anchor drops it and keeps the gadget", () => {
  const m = active(match()),
    d = m.players.d;
  Object.assign(d, { equipped: "tripwire", inventory: { tripwire: 1 } });
  d.anchor = {
    x: -5.7,
    y: 0.5,
    z: 5,
    wall: true,
    normal: { x: 1, y: 0, z: 0 },
  };
  m.action("d", { type: "cancelAnchor" });
  assert.equal(d.anchor, null);
  assert.equal(d.inventory.tripwire, 1);
  assert.equal(m.gadgets.length, 0);
  assert.match(m.events.at(-1).text, /cancelled/);
});

test("the cloak slows the Seen bar and drops on sprint or using a gadget", () => {
  const m = active(match()),
    a = m.players.a,
    d = m.players.d;
  Object.assign(d, { x: 0, z: -16, yaw: Math.PI, pitch: 0 });
  Object.assign(a, {
    x: 0,
    z: -10,
    equipped: "cloak",
    inventory: { cloak: 1, smoke: 1 },
  });
  m.use(a);
  assert.equal(m.snapshot("d").players.find((p) => p.id === "a").cloaked, true);
  advance(m, 3);
  assert.equal(a.alive, true, "3 s of sight at 30% speed is not enough");
  assert.ok(Math.abs(m.pairs["d:a"] - 0.9) < 0.05);
  a.input = { sprint: true, forward: 1 };
  advance(m, 0.1);
  assert.equal(a.cloak, 0, "sprinting drops it");
  a.input = {};
  a.cooldowns.cloak = 0;
  m.use(a);
  a.equipped = "smoke";
  m.use(a);
  assert.equal(a.cloak, 0, "using another gadget drops it");
});

test("motion sensors still reveal a cloaked mover", () => {
  const m = active(match()),
    a = m.players.a;
  Object.assign(m.players.d, { x: -20, z: 20 });
  Object.assign(a, {
    x: 20,
    z: 20,
    equipped: "cloak",
    inventory: { cloak: 1 },
  });
  m.gadgets.push({
    id: 1,
    kind: "sensor",
    team: "defender",
    x: 20,
    y: 0,
    z: 16,
    active: true,
    stats: { radius: 7, rearm: 4, reveal: 3 },
  });
  m.use(a);
  a.input = { forward: 1 };
  advance(m, 0.2);
  assert.ok(a.cloak > 0);
  assert.deepEqual(m.snapshot("d").revealed, ["a"]);
});

test("a jammed camera stays in the feed rotation, so jamming isn't announced", () => {
  const m = active(match()),
    d = m.players.d;
  m.players.a.alive = false;
  m.gadgets.push(
    {
      id: 1,
      kind: "camera",
      owner: "d",
      team: "defender",
      x: 0,
      y: 1,
      z: 0,
      active: true,
    },
    {
      id: 2,
      kind: "jammer",
      team: "attacker",
      x: 1,
      y: 0.1,
      z: 0,
      active: true,
      remaining: 6,
      stats: { radius: 10 },
    },
  );
  m.tick(1 / 30);
  assert.equal(m.gadgets[0].jammed, true);
  m.action("d", { type: "camera" });
  assert.equal(d.camera, 1);
  assert.ok(!m.events.some((e) => /jam|disrupt/i.test(e.text)));
});

test("a viewer pans their camera within its limits, and the pan is audible", () => {
  const m = active(match()),
    d = m.players.d;
  m.players.a.alive = false;
  m.gadgets.push({
    id: 61,
    kind: "camera",
    owner: "d",
    team: "defender",
    x: 0,
    y: 2,
    z: -10,
    yaw: 0,
    pitch: -0.12,
    active: true,
  });
  m.action("d", { type: "cameraPan", yaw: 0.5, pitch: 0 });
  assert.equal(m.gadgets[0].yaw, 0, "only while viewing it");
  m.action("d", { type: "camera" });
  assert.equal(d.camera, 61);
  m.action("d", { type: "cameraPan", yaw: 0.5, pitch: -0.3 });
  assert.equal(m.gadgets[0].yaw, 0.5);
  assert.ok(m.gadgets[0].panning > 0);
  const seen = m.snapshot("a").gadgets.find((g) => g.id === 61);
  assert.ok(
    seen.panning > 0 && seen.yaw === 0.5,
    "the opponent sees and hears it",
  );
  m.action("d", { type: "cameraPan", yaw: 3, pitch: -2 });
  assert.ok(
    Math.abs(m.gadgets[0].yaw - CONFIG.cameraPanYaw) < 1e-9,
    "yaw limit",
  );
  assert.equal(m.gadgets[0].pitch, CONFIG.cameraPanPitch[0], "tilt limit");
  advance(m, 0.5);
  assert.equal(m.gadgets[0].panning, 0, "the whir stops when it stops moving");
});

// Cross a wire at `height` with a running jump; true if it stays untripped.
function jumpOver(height) {
  for (let lead = 0.3; lead <= 2; lead += 0.05) {
    const m = active(match()),
      a = m.players.a;
    m.players.d.alive = false;
    m.gadgets = [];
    Object.assign(a, {
      x: 0,
      z: 5,
      y: 0,
      yaw: 0,
      input: { forward: 1, sprint: true },
    });
    const wire = {
      id: 1,
      kind: "tripwire",
      team: "defender",
      owner: "d",
      x: -1,
      y: height,
      z: 4.6 - lead,
      b: { x: 1, y: height, z: 4.6 - lead },
      active: true,
    };
    m.gadgets.push(wire);
    let jumped = false;
    for (let i = 0; i < 60; i++) {
      a.input.jump = !jumped && a.z <= 4.6;
      if (a.input.jump) jumped = true;
      m.tick(1 / 30);
    }
    if (wire.active && a.z < wire.z - 1) return true;
  }
  return false;
}
test("wires up to the jump height can be jumped; higher ones can't", () => {
  assert.ok(jumpOver(0.32), "a low wire");
  assert.ok(jumpOver(CONFIG.wireJumpHeight), "at the jump height");
  assert.equal(jumpOver(CONFIG.wireJumpHeight + 0.05), false, "just above");
  assert.equal(jumpOver(1), false, "waist height");
});

test("a tripped wire outlines the intruder and marks the spot for sentinels", () => {
  const m = active(match()),
    a = m.players.a;
  m.gadgets.push({
    id: 5,
    kind: "tripwire",
    team: "defender",
    owner: "d",
    x: -1,
    y: 1,
    z: -12,
    b: { x: 1, y: 1, z: -12 },
    active: true,
  });
  Object.assign(a, { x: 0, z: -11.7 });
  m.tick(1 / 30);
  assert.ok(a.immobile > 0, "caught");
  const sentinel = m.snapshot("d");
  assert.ok(sentinel.revealed.includes("a"), "intruder outlined");
  assert.ok(
    sentinel.pings.some((g) => Math.abs(g.z + 12) < 0.01 && g.x === 0),
    "position marked",
  );
  assert.equal(m.snapshot("a").pings.length, 0, "the intruder isn't told");
  advance(m, CONFIG.wireRevealSeconds + 0.2);
  assert.ok(!m.snapshot("d").revealed.includes("a"), "the outline fades");
});

test("your own wires, and your side's, never catch you", () => {
  const m = active(match()),
    a = m.players.a;
  m.players.d.alive = false;
  const wire = (id, team, owner) => ({
    id,
    kind: "tripwire",
    team,
    owner,
    x: -1,
    y: 0.3,
    z: -12,
    b: { x: 1, y: 0.3, z: -12 },
    active: true,
  });
  // One the infiltrator placed for the other side (as in training), and
  // one belonging to their own team.
  m.gadgets.push(wire(1, "defender", "a"), wire(2, "attacker", "x"));
  Object.assign(a, { x: 0, z: -11.7 });
  m.tick(1 / 30);
  assert.ok(!a.immobile, "not caught");
  assert.ok(
    m.gadgets.every((g) => g.active),
    "neither wire trips",
  );
  // A sentinel's wire still catches them.
  m.gadgets.push(wire(3, "defender", "d"));
  m.tick(1 / 30);
  assert.ok(a.immobile > 0, "the enemy wire catches");
});

test("the aiming arc always has two points, even for a throw that lands at once", async () => {
  const { arcPoints } = await import("../shared/throwing.js");
  // Crouched or prone aiming straight down: the throw lands almost at once,
  // with fewer points than the arc normally skips (this crashed the game).
  for (const stance of [{ crouch: true }, { prone: true }]) {
    const path = throwPath(
      { x: 0, y: 0, z: 0, yaw: 0, pitch: -1.5, ...stance },
      16,
    );
    assert.ok(path.points.length <= 6, "a very short throw");
    assert.ok(arcPoints(path).length >= 2, `${path.points.length} points`);
  }
  for (const short of [
    { points: [], landing: { x: 1, y: 0, z: 2 } },
    { points: [{ x: 1, y: 1, z: 2 }], landing: { x: 1, y: 0, z: 2 } },
  ])
    assert.equal(arcPoints(short).length, 2);
  // A normal throw still skips the first few points.
  const long = throwPath(
    { x: 0, y: 0, z: 0, yaw: 0, pitch: 0.2, crouch: false, prone: false },
    16,
  );
  assert.equal(arcPoints(long)[0], long.points[6]);
});

test("watching a camera feed tags an intruder kept in frame", () => {
  const m = active(match()),
    a = m.players.a,
    d = m.players.d;
  // A camera at (0, 2, -16) turned to face +z, toward the intruder.
  m.gadgets.push({
    id: 70,
    kind: "camera",
    owner: "d",
    team: "defender",
    x: 0,
    y: 2,
    z: -16,
    yaw: Math.PI,
    pitch: -0.1,
    active: true,
  });
  Object.assign(d, { x: -20, z: -24 });
  Object.assign(a, { x: 0, z: -8 });
  d.camera = 70;
  advance(m, CONFIG.cameraTagSeconds - 0.4);
  assert.ok(m.snapshot("d").me.cameraTag > 0.5, "building");
  assert.ok(!m.snapshot("d").revealed.includes("a"), "not yet");
  advance(m, 0.6);
  assert.ok(m.snapshot("d").revealed.includes("a"), "tagged: outlined");
  // A jammed camera can't tag.
  m.reveals.defender = {};
  m.camTags = {};
  m.gadgets.push({
    id: 71,
    kind: "jammer",
    team: "attacker",
    owner: "a",
    x: 0,
    y: 0.1,
    z: -12,
    active: true,
    remaining: 10,
  });
  advance(m, CONFIG.cameraTagSeconds + 0.5);
  assert.ok(!m.snapshot("d").revealed.includes("a"), "jammed: no tag");
});

test("a noisemaker makes running footsteps and draws a sentinel bot over", () => {
  const m = new Match("NOISE", true);
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  active(m);
  const a = m.players.a,
    bot = m.players.bot;
  // The intruder hides far off; the noise lands near the bot.
  Object.assign(a, { x: 15, z: 22 });
  Object.assign(bot, { x: 0, z: -16, yaw: Math.PI });
  m.detonate({
    id: 80,
    kind: "noisemaker",
    team: "attacker",
    landing: { x: -6, y: 0, z: -12 },
    duration: 6,
    range: 20,
  });
  const heard = m.snapshot("bot").noises;
  assert.equal(heard.length, 1);
  assert.equal(heard[0].noise, "sprint", "sounds like someone running");
  const start = distance(bot, { x: -6, z: -12 });
  advance(m, 1.5);
  assert.ok(distance(bot, { x: -6, z: -12 }) < start - 1, "goes to look");
  advance(m, 5);
  assert.equal(m.noises.length, 0, "falls silent after its duration");
});

test("a shutter lock seals a gap until it expires or is disarmed", async () => {
  const { clearSight, WALLS } = await import("../shared/map.js");
  const shutter = (extra = {}) => ({
    id: 90,
    kind: "shutter",
    team: "defender",
    owner: "d",
    x: -1.5,
    y: 1,
    z: -10,
    b: { x: 1.5, y: 1, z: -10 },
    floor: 0,
    active: true,
    remaining: 60,
    stats: { toughness: 1 },
    ...extra,
  });
  const m = active(match()),
    a = m.players.a;
  m.players.d.alive = false;
  m.gadgets.push(shutter());
  // Walking at it from the north: stopped at the panel.
  Object.assign(a, { x: 0, z: -8, yaw: 0, input: { forward: 1 } });
  advance(m, 1.5);
  assert.ok(a.z > -10, `held at the shutter, ended at ${a.z}`);
  assert.equal(
    clearSight({ x: 0, y: 1.6, z: -8 }, { x: 0, y: 1.6, z: -12 }),
    false,
    "blocks sight",
  );
  // Another match on the same map doesn't inherit it.
  const other = active(match());
  other.tick(1 / 30);
  assert.ok(!WALLS.some((w) => w.shutter), "no leak between matches");
  // The disarming tool needs its normal time plus the shutter's extra.
  m.tick(1 / 30);
  Object.assign(a, {
    x: 0,
    z: -9.3,
    yaw: 0,
    pitch: -0.4,
    equipped: "disarm",
    inventory: { disarm: 1 },
    input: { interact: true },
  });
  advance(m, 1.2);
  assert.equal(m.gadgets[0].active, true, "toughness slows the disarm");
  advance(m, 0.6);
  assert.equal(m.gadgets[0].active, false, "disarmed");
  m.tick(1 / 30);
  assert.ok(!WALLS.some((w) => w.shutter), "gone from the walls");
  // Left alone, it opens when its time runs out.
  const timed = active(match());
  timed.players.d.alive = false;
  timed.gadgets.push(shutter({ remaining: 0.5 }));
  timed.tick(1 / 30);
  assert.ok(WALLS.some((w) => w.shutter));
  advance(timed, 0.6);
  assert.ok(!WALLS.some((w) => w.shutter), "expired");
});

test("shutter anchors must line up across a doorway", async () => {
  const { placementCheck } = await import("../shared/placement.js");
  const { useMap } = await import("../shared/maps.js");
  useMap("compound");
  // Facing the east perimeter wall from 3 m (as in the placement tests).
  const atWall = { x: 15.5, y: 0, z: 12, yaw: -Math.PI / 2, pitch: -0.3 };
  assert.equal(placementCheck(atWall, "shutter").ok, true);
  const skew = placementCheck(atWall, "shutter", {
    anchor: { x: 17, y: 0.7, z: 9, normal: { x: 0, y: 0, z: 1 } },
    span: 6,
  });
  assert.match(skew.reason, /straight across/);
});
