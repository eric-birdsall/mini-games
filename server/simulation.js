import { PARTY } from "../shared/party.js";
import { playtestPoint } from "../shared/builderTools.js";
import { weaponBlockReason } from "../shared/combat.js";
import { findClamber, clamberPosition } from "../shared/clamber.js";
import {
  DEFAULT_DECOY_PROGRAM,
  validateProgram,
  freeDecoyPoint,
  decoyPath,
  stepDecoy,
} from "../shared/decoy.js";
import { eyeHeight, movementNoise } from "../shared/movement.js";
import { THROWABLE, throwPath, pathPosition } from "../shared/throwing.js";
import { placementCheck, wireInset, shutterBox } from "../shared/placement.js";
import {
  validateStats,
  statValue,
  activeBuilds,
  GADGET_STATS,
  UPGRADE_COST,
  UPGRADE_MAX,
  UPGRADE_TOTAL,
  upgradeCount,
  TUNING_MODES,
} from "../shared/gadgetStats.js";
import {
  CONFIG,
  GADGETS,
  SPAWNS,
  OBJECTIVE,
  OBJECTIVES,
  allowed,
  wetRule,
  ruleOf,
  objectivesNeeded,
} from "../shared/config.js";
import {
  useMap,
  useObjectives,
  MAPS,
  DEFAULT_MAP,
  preRoundLine,
} from "../shared/maps.js";
import {
  BOT_GADGETS,
  BOT_DEFAULT_LOADOUT,
  baseOf,
  isDecoy,
  isPortable,
  statKind,
  variantsOf,
  DECOY_TONE,
} from "../shared/variants.js";
import { applyDoors, doorNear } from "../shared/customMap.js";
import { soften } from "../shared/kidWords.js";
import { runBot, BOT_LEVELS } from "./bot.js";
import { breakoutSpeed, breakoutSteer } from "./breakout.js";
import {
  setParty,
  newParty,
  partyCanUse,
  partyShops,
  partyKit,
  partyPrepare,
  partyActivate,
  partyTick,
  partyCaught,
  partyCapture,
  partyHit,
  partyHalfOver,
  partyNext,
  partyView,
  partyThrow,
  partyClamp,
} from "./party.js";
import {
  distance,
  clearSight,
  clearShot,
  lowCeiling,
  movePlayer,
  overlapsFootprint,
  raySurface,
  pointSegmentDistance,
  segmentBox,
  WALLS,
  BOUNDS,
} from "../shared/map.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Each gadget's key, from its definition (canUse is handed the definition).
const KIND_OF = new Map(Object.entries(GADGETS).map(([k, g]) => [g, k]));
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// A water balloon's colour: any bright hue.
const balloonColor = () =>
  `hsl(${Math.floor(Math.random() * 360)}, 90%, ${55 + Math.floor(Math.random() * 10)}%)`;
// Whether `target` lies within `angle` of the direction (yaw, pitch) looks
// from `origin`.
function facing(origin, yaw, pitch, target, angle) {
  const dx = target.x - origin.x,
    dy = target.y - origin.y,
    dz = target.z - origin.z,
    len = Math.hypot(dx, dy, dz) || 1;
  return (
    (-Math.sin(yaw) * Math.cos(pitch) * dx +
      Math.sin(pitch) * dy -
      Math.cos(yaw) * Math.cos(pitch) * dz) /
      len >
    Math.cos(angle)
  );
}
export class Match {
  constructor(
    code,
    solo = false,
    rule = "seen",
    training = false,
    map = DEFAULT_MAP,
  ) {
    this.code = code;
    this.map = MAPS[map] ? map : DEFAULT_MAP;
    // Soak is Plant's rule: water balloons in a real match.
    this.rule = ruleOf(rule);
    // Training is a solo range: every gadget from both roles, unlimited stock,
    // no timer and no eliminations. Splash is always played this way, so
    // nobody wins or loses.
    this.training = training || this.rule === "splash";
    this.solo = solo || this.training;
    // Splash is the kid-friendly game: water balloons, a short gadget list
    // (see allowed) and softer words everywhere (shared/kidWords.js).
    this.kid = this.rule === "splash";
    this.players = {};
    this.phase = "purchase";
    this.time = 0;
    this.gadgets = [];
    this.decoys = [];
    this.smokes = [];
    this.flashes = [];
    this.pulses = [];
    this.pulseQueue = [];
    this.noises = [];
    // Water balloons thrown and bursting (Splash): what people hear.
    this.splashes = [];
    this.camTags = {};
    this.projectiles = [];
    // Builder doors standing open (by piece index); all shut each round.
    this.openDoors = new Set();
    this.progress = {};
    this.extracted = [];
    this.lastAlert = {};
    this.alertQueue = [];
    this.botFocus = null;
    // Extract (the usual game) or plant & defend (see CONFIG.objectiveMode);
    // the uplink planted this round, if any: { site, remaining, defuse }.
    this.objectiveMode = CONFIG.objectiveMode;
    this.uplink = null;
    // How sharp the solo opponent is (see BOT_LEVELS).
    this.botLevel = "normal";
    this.pings = [];
    this.pairs = {};
    this.spots = {};
    this.reveals = { attacker: {}, defender: {} };
    this.events = [];
    this.nextId = 1;
    this.stats = { equipment: 0, detections: 0, captures: 0, traps: 0 };
    // Training: null lets each side's default apply (see botStill); Splash's
    // bots always move, so there's someone to chase.
    this.debug = this.training ? { stationary: this.kid ? false : null } : {};
    // Upgrades is the default; the solo dev panel can switch to 10-point builds.
    this.tuningMode = "upgrades";
    this.botLoadout = structuredClone(BOT_DEFAULT_LOADOUT);
    this.botQueue = [];
  }
  canUse(p, g) {
    if (this.party) return partyCanUse(this, p, g);
    return (
      !!g &&
      !g.modeWeapon &&
      allowed(this.rule, KIND_OF.get(g)) &&
      (this.training || g.team === p.team || g.team === "both")
    );
  }
  // In training, a gadget from the other role deploys for that role, so it
  // behaves exactly as an opponent's would (tripwires catch you, scanners and
  // disarming tools find it).
  deployTeam(p, g) {
    return this.training && g.team !== "both" ? g.team : p.team;
  }
  // The type chosen for a gadget row in the buy screen (default: the first).
  chosenType(p, base) {
    return (
      p.loadoutTypes[base] ||
      variantsOf(base).find((k) => this.canUse(p, GADGETS[k]))
    );
  }
  // Training keeps the chosen type of each gadget stocked at the count the
  // player picked (0 up to its limit; none until they pick).
  stock(p) {
    if (!this.training || p.bot) return;
    p.credits = 99999;
    for (const [k, g] of Object.entries(GADGETS).filter(
      ([, g]) => !g.modeWeapon,
    ))
      p.inventory[k] =
        this.chosenType(p, baseOf(k)) === k
          ? Math.min(g.limit, p.trainingStock?.[baseOf(k)] || 0)
          : 0;
    if (!p.inventory[p.equipped])
      p.equipped = Object.keys(p.inventory).find((k) => p.inventory[k]) || null;
  }
  setTrainingStock(p, kind, count) {
    const g = GADGETS[kind];
    if (!this.canUse(p, g)) return;
    p.trainingStock[baseOf(kind)] = Math.max(
      0,
      Math.min(g.limit, Math.round(count) || 0),
    );
  }
  // Take all: each gadget at the highest limit of any of its types (the
  // chosen type then caps it); clear all: none.
  fillStock(p, fill) {
    p.trainingStock = {};
    if (fill === "all")
      for (const [k, g] of Object.entries(GADGETS))
        if (this.canUse(p, g))
          p.trainingStock[baseOf(k)] = Math.max(
            p.trainingStock[baseOf(k)] || 0,
            g.limit,
          );
  }
  uncloak(p) {
    if (!(p.cloak > 0)) return;
    p.cloak = 0;
    this.notify("Cloak dropped.", p.team);
  }
  // Statistic for a gadget kind; decoys read their real counterpart's.
  stat(p, kind, key) {
    return statValue(this.builds(p), statKind(kind), key);
  }
  // Reveal an opponent's outline (through walls) to `team` for some seconds.
  reveal(team, target, seconds) {
    const map = this.reveals[team];
    map[target.id] = Math.max(map[target.id] || 0, seconds);
  }
  // Splash: every few seconds everyone glows through walls to the other
  // side for a moment, so it's easy to find someone to splash.
  glow(before) {
    const every = CONFIG.splashGlowEvery;
    if (Math.floor(this.activeTime / every) === Math.floor(before / every))
      return;
    for (const p of Object.values(this.players))
      if (p.alive)
        this.reveal(
          p.team === "attacker" ? "defender" : "attacker",
          p,
          CONFIG.splashGlowSeconds,
        );
    if (this.activeTime < 2 * every)
      this.notify("Glow time! Everyone shows through walls for a moment.");
  }
  // A party minigame (shared/party.js): "sweep" or "gauntlet".
  setParty(kind, solo) {
    setParty(this, kind, solo);
  }
  builds(p) {
    return activeBuilds(this.tuningMode, p.gadgetStats, p.upgrades);
  }
  addPlayer(id, team, bot = false) {
    this.useLevel();
    if (
      Object.values(this.players).filter((p) => p.team === team).length >=
      CONFIG.playersPerTeam
    )
      return false;
    const s = SPAWNS[team];
    this.players[id] = {
      id,
      team,
      bot,
      ...s,
      y: 0,
      vy: 0,
      grounded: true,
      clamber: null,
      jumpHeld: 0,
      clamberLatched: false,
      jumpOrigin: 0,
      yaw: s?.yaw ?? 0,
      pitch: 0,
      crouch: false,
      prone: false,
      noise: "silent",
      moveSpeed: 0,
      alive: true,
      credits: CONFIG.credits,
      inventory: {},
      decoyProgram: structuredClone(DEFAULT_DECOY_PROGRAM),
      gadgetStats: {},
      upgrades: {},
      loadoutTypes: {},
      input: {},
      equipped: null,
      cooldowns: {},
      capture: 0,
      site: null,
      disarm: 0,
      scan: 0,
      immobile: 0,
      used: 0,
      camera: null,
      ready: false,
      // Training: how many of each gadget (by base) to carry. Kept on restart.
      trainingStock: {},
    };
    // Splash skips the loadout: everyone carries every gadget it allows.
    if (this.kid) this.fillStock(this.players[id], "all");
    this.arm(this.players[id]);
    this.stock(this.players[id]);
    if (this.party) {
      this.party.first[id] ??= team;
      partyKit(this, this.players[id]);
    }
    return true;
  }
  arm(p) {
    p.hits = 0;
    p.slots = [];
    const weapon = wetRule(this.rule) ? "balloon" : null;
    // The balloon in your hand; each throw takes up a new one.
    if (weapon) p.balloonColor = balloonColor();
    if (weapon) {
      p.inventory[weapon] = GADGETS[weapon].limit;
      p.equipped = weapon;
      p.slots = [weapon];
    }
  }
  rememberSlots(p) {
    const carried = Object.keys(p.inventory).filter((k) => p.inventory[k] > 0);
    p.slots =
      this.phase === "purchase"
        ? carried
        : [...new Set([...(p.slots || []), ...carried])];
    return p.slots;
  }
  notify(text, team = null) {
    if (this.kid) text = soften(text);
    this.events.push({ id: this.nextId++, text, team });
    this.events = this.events.slice(-8);
  }
  reset() {
    this.useLevel();
    for (const p of Object.values(this.players)) {
      Object.assign(p, {
        ...SPAWNS[p.team],
        y: 0,
        vy: 0,
        grounded: true,
        clamber: null,
        jumpHeld: 0,
        clamberLatched: false,
        jumpOrigin: 0,
        prone: false,
        crouch: false,
        noise: "silent",
        moveSpeed: 0,
        yaw: SPAWNS[p.team]?.yaw ?? 0,
        blind: 0,
        slide: null,
        slideCooldown: 0,
        wallRun: null,
        wallRuns: 0,
        wallKicked: false,
        kick: null,
        pitch: 0,
        alive: true,
        credits: CONFIG.credits,
        inventory: {},
        upgrades: {},
        equipped: null,
        cooldowns: {},
        capture: 0,
        site: null,
        disarm: 0,
        scan: 0,
        immobile: 0,
        camera: null,
        mirror: null,
        jamming: 0,
        cloak: 0,
        sensorAlert: 0,
        ready: false,
        input: {},
        waypoint: 0,
        weaponTarget: null,
        weaponSightTime: 0,
        anchor: null,
        signatures: [],
        signatureTime: 0,
      });
      this.arm(p);
      this.stock(p);
      if (this.party) partyKit(this, p);
    }
    this.phase = "purchase";
    this.gadgets = [];
    this.decoys = [];
    this.smokes = [];
    this.flashes = [];
    this.pulses = [];
    this.pulseQueue = [];
    this.noises = [];
    this.splashes = [];
    this.camTags = {};
    this.projectiles = [];
    // Builder doors standing open (by piece index); all shut each round.
    this.openDoors = new Set();
    this.pings = [];
    this.pairs = {};
    this.spots = {};
    this.reveals = { attacker: {}, defender: {} };
    this.botQueue = [];
    // Per-objective capture progress, the terminals already extracted, and
    // terminal alerts waiting to go out.
    this.progress = {};
    this.extracted = [];
    this.lastAlert = {};
    this.alertQueue = [];
    this.botFocus = null;
    this.uplink = null;
    this.result = null;
    this.stats = { equipment: 0, detections: 0, captures: 0, traps: 0 };
    this.time = 0;
    this.notify(
      this.party?.kind === "livewire"
        ? "Back on the float! Get ready to dodge."
        : "New operation. Select your equipment.",
    );
  }
  action(id, msg) {
    this.useLevel();
    const p = this.players[id];
    if (!p || p.bot) return;
    if (msg.type === "input") {
      const q = msg.input || {};
      p.input = {
        forward: clamp(Number(q.forward) || 0, -1, 1),
        side: clamp(Number(q.side) || 0, -1, 1),
        sprint: this.party?.kind !== "sprinklers" && !!q.sprint,
        crouch: this.party?.kind !== "sprinklers" && !!q.crouch,
        prone: this.party?.kind !== "sprinklers" && !!q.prone,
        jump: !!q.jump,
        interact: !!q.interact,
        // A count of slides asked for; a new value starts one.
        slide: Number.isFinite(q.slide) ? q.slide : p.input?.slide || 0,
        // Likewise door presses, so a quick tap isn't missed between ticks.
        door: Number.isFinite(q.door) ? q.door : p.input?.door || 0,
      };
      p.paused = !!q.paused;
      if (Number.isFinite(q.yaw)) p.yaw = q.yaw % (Math.PI * 2);
      if (Number.isFinite(q.pitch)) p.pitch = clamp(q.pitch, -1.5, 1.5);
      if (
        Number.isSafeInteger(q.fire) &&
        q.fire >= 0 &&
        q.fire > (p.fireSeen || 0)
      ) {
        p.fireSeen = q.fire;
        if (GADGETS[p.equipped]?.modeWeapon) this.attack(p);
      }
      return;
    }
    if (msg.type === "decoyProgram" && this.phase === "purchase" && !p.ready) {
      const program = validateProgram(msg.program);
      if (program) {
        p.decoyProgram = program;
        this.notify("Decoy program saved.", p.team);
      } else
        this.notify("Invalid decoy program: check actions and values.", p.team);
      return;
    }
    if (
      msg.type === "gadgetStats" &&
      this.tuningMode === "free" &&
      this.phase === "purchase" &&
      !p.ready
    ) {
      const g = GADGETS[msg.gadget],
        stats = validateStats(msg.gadget, msg.stats);
      if (!this.canUse(p, g)) return;
      if (stats) {
        p.gadgetStats[msg.gadget] = stats;
        this.notify(`${g.name} tuning saved.`, p.team);
      } else
        this.notify("Invalid tuning: check levels and point total.", p.team);
      return;
    }
    if (
      ["upgrade", "downgrade"].includes(msg.type) &&
      this.tuningMode === "upgrades" &&
      this.phase === "purchase" &&
      !p.ready
    ) {
      const kind = msg.gadget,
        g = GADGETS[kind];
      if (!this.canUse(p, g) || !GADGET_STATS[kind]?.[msg.stat]) return;
      const owned = (p.upgrades[kind] ||= {}),
        n = owned[msg.stat] || 0;
      if (msg.type === "upgrade") {
        if (!p.inventory[kind]) {
          this.notify(`Buy a ${g.name} before upgrading it.`, p.team);
          return;
        }
        if (
          n >= UPGRADE_MAX ||
          upgradeCount(owned) >= UPGRADE_TOTAL ||
          p.credits < UPGRADE_COST
        ) {
          this.notify(
            `Insufficient credits, or this gadget has its ${UPGRADE_TOTAL} upgrades.`,
            p.team,
          );
          return;
        }
        owned[msg.stat] = n + 1;
        p.credits -= UPGRADE_COST;
      } else if (n > 0) {
        owned[msg.stat] = n - 1;
        p.credits += UPGRADE_COST;
      }
      return;
    }
    if (
      msg.type === "botLoadout" &&
      this.training &&
      this.phase === "purchase" &&
      !p.ready
    ) {
      this.setBotLoadout(msg.gadget, msg.count);
      return;
    }
    if (
      msg.type === "trainingStock" &&
      this.training &&
      this.phase === "purchase" &&
      !p.ready
    ) {
      if (msg.fill) this.fillStock(p, msg.fill);
      else this.setTrainingStock(p, msg.gadget, msg.count);
      this.stock(p);
      return;
    }
    if (msg.type === "selectType" && this.phase === "purchase" && !p.ready) {
      const g = GADGETS[msg.gadget];
      if (!this.canUse(p, g)) return;
      p.loadoutTypes[baseOf(msg.gadget)] = msg.gadget;
      this.stock(p);
      return;
    }
    if (msg.type === "mirror" && msg.close) {
      p.mirror = null;
      return;
    }
    if (msg.type === "buy" && this.phase === "purchase" && !p.ready) {
      const g = GADGETS[msg.gadget];
      if (!this.canUse(p, g) || this.training) return;
      if (this.party && !partyShops(this, p)) return;
      if (p.credits < g.cost || (p.inventory[msg.gadget] || 0) >= g.limit) {
        this.notify("Insufficient credits or inventory full.", p.team);
        return;
      }
      p.inventory[msg.gadget] = (p.inventory[msg.gadget] || 0) + 1;
      p.credits -= g.cost;
      p.equipped ||= msg.gadget;
      return;
    }
    if (
      msg.type === "refund" &&
      this.phase === "purchase" &&
      !p.ready &&
      !this.training &&
      !(this.party && !partyShops(this, p))
    ) {
      const g = GADGETS[msg.gadget];
      if (g && !g.modeWeapon && p.inventory[msg.gadget] > 0) {
        p.inventory[msg.gadget]--;
        p.credits += g.cost;
        // Upgrades belong to the gadget: selling the last unit sells them.
        if (!p.inventory[msg.gadget] && p.upgrades[msg.gadget]) {
          for (const n of Object.values(p.upgrades[msg.gadget]))
            p.credits += n * UPGRADE_COST;
          delete p.upgrades[msg.gadget];
        }
        if (!p.inventory[p.equipped])
          p.equipped =
            Object.keys(p.inventory).find((k) => p.inventory[k] > 0) || null;
      }
      return;
    }
    if (msg.type === "ready" && this.phase === "purchase") {
      p.ready = true;
      if (
        this.solo ||
        (Object.values(this.players).length === CONFIG.maxPlayers &&
          Object.values(this.players).every((x) => x.ready))
      ) {
        this.prepare();
        if (this.debug.fastStart || this.training) this.activate();
      }
      return;
    }
    // Drop a wire's or shutter's first anchor without placing anything.
    if (msg.type === "cancelAnchor") {
      if (p.anchor) {
        p.anchor = null;
        this.notify("Placement cancelled.", p.team);
      }
      return;
    }
    if (msg.type === "equip" && p.inventory[msg.gadget] > 0) {
      if (msg.gadget !== p.equipped) p.anchor = null;
      p.equipped = msg.gadget;
      p.scan = 0;
      return;
    }
    if (msg.type === "ping") {
      this.ping(p, msg);
      return;
    }
    if (msg.type === "cameraPan" && p.camera) {
      const g = this.gadgets.find(
        (x) => x.id === p.camera && x.active && x.kind === "camera",
      );
      if (!g || !Number.isFinite(msg.yaw) || !Number.isFinite(msg.pitch))
        return;
      g.baseYaw ??= g.yaw;
      const turn = Math.atan2(
          Math.sin(msg.yaw - g.baseYaw),
          Math.cos(msg.yaw - g.baseYaw),
        ),
        yaw =
          g.baseYaw + clamp(turn, -CONFIG.cameraPanYaw, CONFIG.cameraPanYaw),
        pitch = clamp(msg.pitch, ...CONFIG.cameraPanPitch);
      if (Math.abs(yaw - g.yaw) + Math.abs(pitch - g.pitch) > 0.003) {
        Object.assign(g, { yaw, pitch });
        g.panning = CONFIG.cameraPanSound;
      }
      return;
    }
    if (
      msg.type === "camera" &&
      (p.team === "defender" || this.training) &&
      ["prep", "active"].includes(this.phase)
    ) {
      if (msg.close) {
        p.camera = null;
        return;
      }
      const cameras = this.gadgets.filter(
        // Jammed cameras stay in the rotation: their feed just loops.
        (g) => g.kind === "camera" && g.owner === id && g.active,
      );
      if (!cameras.length) {
        this.notify("Deploy a camera first.", p.team);
        return;
      }
      const index = cameras.findIndex((g) => g.id === p.camera);
      p.camera = msg.close ? null : cameras[(index + 1) % cameras.length].id;
      return;
    }
    if (
      msg.type === "use" &&
      ["prep", "active"].includes(this.phase) &&
      p.alive &&
      !p.camera
    ) {
      this.use(p);
      return;
    }
    if (
      msg.type === "restart" &&
      (this.solo || id === Object.keys(this.players)[0])
    ) {
      // A party game goes on to its second half, or starts over.
      if (this.party) partyNext(this);
      else this.reset();
      return;
    }
    // Splash: the robot's difficulty can change mid-match, from the pause menu.
    if (msg.type === "botLevel" && this.kid && BOT_LEVELS[msg.level]) {
      this.botLevel = msg.level;
      return;
    }
    // Breakout solo: you're always the runner.
    if (msg.type === "switch" && this.solo && this.party?.kind === "breakout")
      return;
    if (msg.type === "switch" && this.solo) {
      p.team = p.team === "attacker" ? "defender" : "attacker";
      const bot = Object.values(this.players).find((q) => q.bot);
      if (bot) delete this.players[bot.id];
      if (this.noBot);
      else if (p.team === "attacker") this.addPlayer("bot", "defender", true);
      else this.addPlayer("bot", "attacker", true);
      if (this.party) this.party = newParty(this, this.party.kind);
      this.reset();
      return;
    }
    if (msg.type === "debug" && this.training && msg.key === "swapSides") {
      this.swapSides(p);
      return;
    }
    if (msg.type === "debug" && this.solo) {
      if (msg.key === "fastStart") this.debug.fastStart = !!msg.value;
      // Cycle the attacker bot's route: random, then each route in turn.
      if (msg.key === "botRoute") {
        const routes = MAPS[this.map].botRoutes,
          n = this.debug.botRoute;
        this.debug.botRoute =
          n === undefined ? 0 : n + 1 < routes.length ? n + 1 : undefined;
        const bot = Object.values(this.players).find(
          (q) => q.bot && q.team === "attacker",
        );
        if (bot)
          Object.assign(bot, {
            route: this.debug.botRoute,
            waypoint: 0,
            path: null,
          });
        this.notify(
          `Bot route: ${this.debug.botRoute === undefined ? "random each round" : routes[this.debug.botRoute].name}.`,
          p.team,
        );
      }
      if (
        msg.key === "tuningMode" &&
        msg.value in TUNING_MODES &&
        msg.value !== this.tuningMode
      ) {
        this.tuningMode = msg.value;
        this.reset();
        this.notify(`Gadget tuning: ${TUNING_MODES[msg.value]}.`);
      }
      if (msg.key === "decoyTest") {
        if (this.phase === "results") this.reset();
        p.alive = true;
        p.immobile = 0;
        p.camera = null;
        if (this.phase !== "active") {
          this.prepare();
          this.activate();
        }
        p.inventory.actorDecoy = 3;
        p.equipped = "actorDecoy";
        p.cooldowns.actorDecoy = 0;
        this.debug.stationary = true;
        this.notify(
          "Decoy sandbox ready. Aim at the ground, then trigger. Bot movement is paused.",
          p.team,
        );
      }
      const tested = GADGETS[msg.gadget];
      if (msg.key === "gadgetTest" && this.canUse(p, tested)) {
        if (this.phase === "results") this.reset();
        p.alive = true;
        p.immobile = 0;
        p.camera = null;
        if (this.phase !== "active") {
          this.prepare();
          this.activate();
        }
        p.inventory[msg.gadget] = tested.limit;
        p.equipped = msg.gadget;
        p.cooldowns[msg.gadget] = 0;
        this.debug.stationary = true;
        this.notify(
          `${tested.name} test ready with your tuning. Bot movement is paused.`,
          p.team,
        );
      }
      if (msg.key === "skip" && this.phase === "prep") this.activate();
      if (msg.key === "credits") p.credits = 99999;
      if (msg.key === "all")
        for (const [k, g] of Object.entries(GADGETS))
          if (this.canUse(p, g)) p.inventory[k] = g.limit;
      if (msg.key === "cooldowns")
        this.debug.noCooldown = !this.debug.noCooldown;
      if (msg.key === "time" && Number.isFinite(msg.value))
        this.time = clamp(msg.value, 10, 900);
      if (msg.key === "stationary")
        this.debug.stationary = !this.botStill(this.botPlayer);
    }
  }
  prepare() {
    this.phase = "prep";
    this.time = CONFIG.prepSeconds;
    if (this.party) partyPrepare(this);
    if (!this.training && !this.party)
      this.notify("Preparation underway. Defender: place your equipment.");
  }
  // Training: you and the bot trade roles mid-round. Everything stays put,
  // and device ownership swaps with the roles, so what you placed on one side
  // becomes the opponent's: you can spot, scan, disarm or trip over it.
  swapSides(p) {
    const bot = this.botPlayer,
      flip = (team) => (team === "attacker" ? "defender" : "attacker");
    p.team = flip(p.team);
    if (bot) {
      bot.team = flip(bot.team);
      Object.assign(bot, { waypoint: 0, path: null, brain: null });
    }
    for (const g of this.gadgets)
      if (g.owner === p.id) g.owner = bot?.id ?? "opponent";
      else if (bot && g.owner === bot.id) g.owner = p.id;
    for (const q of [p, bot])
      if (q) Object.assign(q, { camera: null, mirror: null, anchor: null });
    this.pairs = {};
    this.spots = {};
    this.notify(
      `Switched sides: you are now the ${p.team === "attacker" ? "Infiltrator" : "Sentinel"}. Your devices now belong to the other side.`,
    );
  }
  // Whether the scripted opponent holds still. By default in training, an
  // infiltrator bot waits for you, while a sentinel bot on a map with
  // terminals patrols them and answers alerts; the developer toggle
  // overrides either.
  botStill(p) {
    return (
      this.debug.stationary ??
      (this.training && !(p?.team === "defender" && OBJECTIVES[0]?.terminal))
    );
  }
  // Plant & defend, on a map with terminals.
  get plantMode() {
    return this.objectiveMode === "plant" && !!MAPS[this.map]?.terminals;
  }
  get botPlayer() {
    return Object.values(this.players).find((p) => p.bot);
  }
  // How many of a base gadget the map has spots for (wires share spots).
  botCapacity(base) {
    const spots = MAPS[this.map].botSpots[base];
    return spots ? spots.length : 1;
  }
  setBotLoadout(kind, count) {
    const bot = this.botPlayer;
    if (!bot || !BOT_GADGETS[bot.team].includes(kind)) return;
    if (!allowed(this.rule, kind)) return;
    const loadout = this.botLoadout[bot.team],
      base = baseOf(kind),
      others = BOT_GADGETS[bot.team]
        .filter((k) => k !== kind && baseOf(k) === base && !isPortable(k))
        .reduce((sum, k) => sum + (loadout[k] || 0), 0),
      max =
        isPortable(kind) || kind === "cloak"
          ? GADGETS[kind].limit
          : Math.min(GADGETS[kind].limit, this.botCapacity(base) - others);
    loadout[kind] = clamp(Math.round(Number(count) || 0), 0, max);
    if (!loadout[kind]) delete loadout[kind];
  }
  // At the start of the round the scripted opponent puts out its loadout,
  // one device every 0.6 s, at its map's spots for each gadget.
  queueBotGadgets() {
    const bot = this.botPlayer;
    this.botQueue = [];
    if (!bot) return;
    const spots = MAPS[this.map].botSpots,
      used = {},
      // A solo infiltrator bot always has smoke to break your line of sight.
      loadout = {
        ...(!this.training && bot.team === "attacker" ? { smoke: 2 } : {}),
        ...this.botLoadout[bot.team],
      };
    let at = 0.8;
    for (const [kind, count] of Object.entries(loadout)) {
      if (!allowed(this.rule, kind)) continue;
      // Out of training, smoke is carried and thrown when it's needed (see
      // server/bot.js); training puts it out at the map's spots to try.
      const carried =
        isPortable(kind) ||
        kind === "cloak" ||
        (kind === "smoke" && !this.training);
      if (carried) {
        bot.inventory[kind] = count;
        if (kind === "sensorPortable") bot.equipped = kind;
        continue;
      }
      const base = baseOf(kind);
      for (let i = 0; i < count; i++) {
        const spot = spots[base]?.[used[base] || 0];
        if (!spot) break;
        used[base] = (used[base] || 0) + 1;
        this.botQueue.push({ at, kind, spot, team: bot.team });
        at += 0.6;
      }
    }
  }
  placeBotGadget({ kind, spot, team }) {
    const base = baseOf(kind),
      device = { id: this.nextId++, kind, owner: "bot", team, active: true };
    if (base === "smoke")
      this.smokes.push({
        id: device.id,
        x: spot.x,
        y: 0,
        z: spot.z,
        radius: CONFIG.smokeRadius,
        remaining: CONFIG.smokeSeconds,
        total: CONFIG.smokeSeconds,
      });
    else if (base === "jammer")
      this.gadgets.push({
        ...device,
        x: spot.x,
        y: 0.1,
        z: spot.z,
        remaining: CONFIG.jammerSeconds,
        stats: isDecoy(kind) ? undefined : { radius: CONFIG.jammerRadius },
      });
    else if (base === "shutter")
      this.gadgets.push({
        ...device,
        ...structuredClone(spot),
        floor: 0,
        remaining: this.party?.kind === "sweep" ? 1e9 : 60,
      });
    else this.gadgets.push({ ...device, ...structuredClone(spot) });
  }
  setBuilderStart(id, point) {
    const p = this.players[id],
      def = MAPS[this.map]?.def;
    if (!this.training || !def || !p || p.bot) return false;
    const start = playtestPoint(def, point);
    if (!start) return false;
    p.builderStart = start;
    return true;
  }
  activate() {
    this.phase = "active";
    this.time = CONFIG.roundSeconds;
    this.activeTime = 0;
    if (this.solo && !this.party) this.queueBotGadgets();
    for (const p of Object.values(this.players))
      if (
        p.bot &&
        p.team === "attacker" &&
        ![
          "hotpotato",
          "breakout",
          "boulders",
          "livewire",
          "sprinklers",
        ].includes(this.party?.kind)
      ) {
        // Picked fresh each round and not announced: that would tell a
        // sentinel where to look.
        Object.assign(p, {
          route: this.debug.botRoute,
          goal: this.debug.botGoal,
          waypoint: 0,
          path: null,
          direct: false,
        });
        this.botPlan(p);
      }
    for (const p of Object.values(this.players)) {
      p.camera = null;
      if (p.bot) p.brain = null;
      if (this.training && p.builderStart)
        Object.assign(p, p.builderStart, { vy: 0, grounded: true, input: {} });
    }
    if (this.party) return partyActivate(this);
    this.notify(
      this.kid
        ? "Splash time! Every gadget refills after use."
        : this.training
          ? "Training range live. Every gadget refills after use."
          : this.plantMode
            ? `Infiltration authorized. Plant an uplink on ${OBJECTIVES.map((o) => o.name).join(" or ")}.`
            : OBJECTIVES[0].terminal
              ? objectivesNeeded() > 1
                ? `Infiltration authorized. Extract data from ${objectivesNeeded() === 2 ? "two" : objectivesNeeded()} of ${OBJECTIVES.length} terminals.`
                : `Infiltration authorized. Extract data from ${OBJECTIVES.map((o) => o.name).join(" or ")}.`
              : "Infiltration authorized. Raise the flag.",
    );
  }
  finish(winner, reason) {
    if (this.party) return partyHalfOver(this, reason);
    if (this.phase === "results") return;
    this.phase = "results";
    this.result = {
      winner,
      reason: this.kid ? soften(reason) : reason,
      remaining: Math.ceil(this.time),
      ...this.stats,
    };
    this.notify(
      `${winner === "attacker" ? "Infiltrators" : "Sentinels"} win. ${reason}`,
    );
  }
  doorNear(p, reach, anywhere) {
    useMap(this.map);
    return doorNear(p, reach, anywhere);
  }
  // Open or shut a door. It won't shut on someone standing in it. Either
  // way it's heard, like footsteps, by anyone near.
  toggleDoor(w, p) {
    const open = this.openDoors.has(w.pieceIndex);
    if (
      open &&
      Object.values(this.players).some(
        (q) =>
          q.alive &&
          q.y < w.h &&
          overlapsFootprint(w, q.x, q.z, CONFIG.playerRadius),
      )
    ) {
      if (!p.bot) this.notify("Someone's in the doorway.", p.team);
      return;
    }
    if (open) this.openDoors.delete(w.pieceIndex);
    else this.openDoors.add(w.pieceIndex);
    this.noises.push({
      id: this.nextId++,
      x: w.x,
      y: (w.bottom || 0) + 1,
      z: w.z,
      team: p.team,
      range: CONFIG.doorNoiseRange,
      remaining: 0.6,
      noise: "walk",
      moveSpeed: CONFIG.walkSpeed,
      alive: true,
    });
    this.useLevel();
  }
  // A door press (a new count from the client, or a fresh interact press)
  // opens or shuts the door you face, unless you're working a terminal or
  // disarming a device.
  useDoor(p, input) {
    const pressed =
      (input.door || 0) !== (p.doorSeen || 0) ||
      (!!input.interact && !p.interactWas);
    p.doorSeen = input.door || 0;
    p.interactWas = !!input.interact;
    if (!pressed || p.immobile || p.camera || p.mirror) return;
    if (OBJECTIVES.some((o) => distance(p, o) < CONFIG.captureRadius)) return;
    if (p.equipped === "disarm" && p.disarmTarget) return;
    const door = this.doorNear(p);
    if (door) this.toggleDoor(door, p);
  }
  // Holding interact at an objective. A flag resets when you let go; a
  // terminal keeps its progress. Starting work on a terminal alerts the
  // sentinels (after a delay) which one it is, not how far along it is.
  // A terminal that's been extracted is spent; the infiltrators win once
  // they've taken objectivesNeeded() of them.
  capture(p, input, dt) {
    if (this.party) return partyCapture(this, p, input, dt);
    if (this.plantMode) return this.plant(p, input, dt);
    const site = OBJECTIVES.find(
      (o) =>
        !this.extracted.includes(o.id) && distance(p, o) < CONFIG.captureRadius,
    );
    if (!(input.interact && site && p.y < 0.5 && !p.immobile)) {
      if (p.site && !OBJECTIVES.find((o) => o.id === p.site)?.terminal)
        this.progress[p.site] = 0;
      p.capture = 0;
      p.site = null;
      return;
    }
    if (site.terminal && p.site !== site.id) this.terminalActivity(site);
    p.site = site.id;
    const need = site.terminal ? CONFIG.terminalSeconds : CONFIG.captureSeconds;
    p.capture = this.progress[site.id] = (this.progress[site.id] || 0) + dt;
    if (p.capture < need) return;
    p.capture = 0;
    p.site = null;
    if (!site.terminal) {
      if (this.training) {
        this.progress[site.id] = 0;
        this.notify("Training: flag secured. The round continues.");
      } else this.finish("attacker", "Flag secured");
      return;
    }
    this.progress[site.id] = need;
    this.extracted.push(site.id);
    const taken = this.extracted.map(
        (id) => OBJECTIVES.find((o) => o.id === id).name,
      ),
      left = objectivesNeeded() - taken.length;
    if (left > 0) {
      // Both sides know: its screen shows it, and the sentinels lose it.
      this.notify(
        `Data extracted from ${site.name}. ${left} more terminal${left > 1 ? "s" : ""} to go.`,
        this.training ? null : "attacker",
      );
      if (!this.training)
        this.notify(
          `${site.name} lost: its data is gone. Guard the rest.`,
          "defender",
        );
      return;
    }
    if (this.training) {
      // Every terminal comes back for another go.
      this.progress = {};
      this.extracted = [];
      this.notify(
        `Training: data extracted from ${taken.join(" and ")}. The round continues.`,
      );
    } else
      this.finish("attacker", `Data extracted from ${taken.join(" and ")}`);
  }
  // Plant & defend: the infiltrator holds at a terminal to plant the
  // uplink (once a round); a sentinel holds at the planted one to pull it.
  // Either hold resets on release. Nothing is sent while planting; the
  // sentinels hear the moment it's in.
  plant(p, input, dt) {
    const attacker = p.team === "attacker",
      site = OBJECTIVES.find(
        (o) =>
          distance(p, o) < CONFIG.captureRadius &&
          (attacker ? !this.uplink : this.uplink?.site === o.id),
      );
    if (!(input.interact && site && p.y < 0.5 && !p.immobile)) {
      if (!attacker && this.uplink && p.capture > 0) this.uplink.defuse = 0;
      p.capture = 0;
      p.site = null;
      return;
    }
    if (p.site !== site.id) p.capture = 0;
    p.site = site.id;
    p.capture += dt;
    if (!attacker) this.uplink.defuse = p.capture;
    if (p.capture < (attacker ? CONFIG.plantSeconds : CONFIG.defuseSeconds))
      return;
    p.capture = 0;
    p.site = null;
    if (attacker) {
      this.uplink = {
        site: site.id,
        remaining: CONFIG.uplinkSeconds,
        defuse: 0,
      };
      this.notify(
        `Uplink planted at ${site.name}. Hold it for ${CONFIG.uplinkSeconds} s.`,
        this.training ? null : "attacker",
      );
      this.notify(
        `Uplink planted at ${site.name}! Pull it before it transmits.`,
        this.training ? null : "defender",
      );
      // The sentinel bot goes straight there, and stays on it.
      this.botFocus = { site: site.id, until: Infinity };
      return;
    }
    this.uplinkOver("defender");
  }
  // The uplink is pulled (sentinels) or has transmitted (infiltrators).
  // Training goes on, with the terminals ready for another plant.
  uplinkOver(winner) {
    const reason = winner === "defender" ? "Uplink pulled" : "Uplink complete";
    if (!this.training) return this.finish(winner, reason);
    this.uplink = null;
    this.botFocus = null;
    this.notify(`Training: ${reason.toLowerCase()}. The round continues.`);
  }
  // Someone started work on a terminal: tell the sentinels which, a moment
  // later, unless they were told about it moments ago.
  terminalActivity(site) {
    const now = this.clock || 0;
    if (now - (this.lastAlert[site.id] ?? -Infinity) < CONFIG.terminalAlertGap)
      return;
    this.lastAlert[site.id] = now;
    this.alertQueue.push({
      site: site.id,
      at: now + CONFIG.terminalAlertDelay,
    });
  }
  // Deliver due terminal alerts; the sentinel bot heads for the terminal.
  terminalAlerts() {
    const now = this.clock || 0;
    for (const a of this.alertQueue.filter((a) => a.at <= now)) {
      const site = OBJECTIVES.find((o) => o.id === a.site);
      if (!site) continue;
      this.notify(
        `${site.name}: activity detected.`,
        this.training ? null : "defender",
      );
      this.botFocus = { site: site.id, until: now + 20 };
    }
    this.alertQueue = this.alertQueue.filter((a) => a.at > now);
  }
  use(p) {
    this.rememberSlots(p);
    if (p.equipped === "balloon") return this.attack(p);
    const kind = p.equipped,
      g = GADGETS[kind];
    if (!g || !p.inventory[kind] || p.cooldowns[kind] > 0) return;
    if (this.phase === "prep" && p.team === "attacker") {
      this.notify("Hold in staging until infiltration.", p.team);
      return;
    }
    if (kind === "actorDecoy") {
      if (this.phase !== "active") {
        this.notify("Decoys launch during the active round.", p.team);
        return;
      }
      const mark = raySurface(p, CONFIG.decoyMarkRange);
      if (
        !mark ||
        mark.y > 0.1 ||
        mark.normal.y !== 1 ||
        !freeDecoyPoint(mark)
      ) {
        this.notify(
          "Aim at open ground within 40 m to set the decoy mark.",
          p.team,
        );
        return;
      }
      let spawn = null;
      for (const angle of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
        const candidate = {
          x: p.x - Math.sin(p.yaw + angle) * 0.9,
          z: p.z - Math.cos(p.yaw + angle) * 0.9,
        };
        if (
          freeDecoyPoint(candidate) &&
          clearShot({ ...candidate, y: 0.5 }, { x: p.x, y: 0.5, z: p.z }) &&
          decoyPath(candidate, mark)
        ) {
          spawn = candidate;
          break;
        }
      }
      if (!spawn) {
        this.notify("No clear launch position or route to this mark.", p.team);
        return;
      }
      this.decoys.push({
        id: "decoy-" + this.nextId++,
        owner: p.id,
        team: p.team,
        ...spawn,
        y: 0,
        yaw: p.yaw,
        pitch: 0,
        alive: true,
        active: true,
        grounded: true,
        crouch: false,
        prone: false,
        noise: "silent",
        program: structuredClone(p.decoyProgram),
        mark: { x: mark.x, z: mark.z },
        step: 0,
        cycle: 0,
        entered: -1,
        elapsed: 0,
        remaining: CONFIG.decoyLifetime,
        status: "Starting",
        moveSpeed: 0,
      });
      p.inventory[kind]--;
      p.cooldowns[kind] = this.debug.noCooldown ? 0 : g.cooldown;
      this.stats.equipment++;
      this.notify("Decoy triggered. Mark locked; program running.", p.team);
      return;
    }
    if (kind === "cloak") {
      p.cloak = this.stat(p, kind, "duration");
      p.cloakRate = this.stat(p, kind, "seen");
      p.cooldowns[kind] =
        p.cloak + (this.debug.noCooldown ? 0 : this.stat(p, kind, "recharge"));
      this.notify("Cloaked. Don't sprint.", p.team);
      return;
    }
    this.uncloak(p);
    if (kind === "disarm") {
      this.notify("Look at a device within 3 m and hold E.", p.team);
      return;
    }
    if (kind === "scanner") {
      p.scan = p.scanTotal = statValue(this.builds(p), kind, "sweep");
      p.cooldowns[kind] = p.scan + (this.debug.noCooldown ? 0 : g.cooldown);
      this.notify("Scanning forward sector…", p.team);
      return;
    }
    if (kind === "jammerPortable") {
      // Worn: jam around yourself, then recharge. Nothing to destroy.
      p.jamming = this.stat(p, kind, "duration");
      p.jamRadius = this.stat(p, kind, "radius");
      p.cooldowns[kind] =
        p.jamming +
        (this.debug.noCooldown ? 0 : this.stat(p, kind, "recharge"));
      this.notify("Portable jammer active around you.", p.team);
      return;
    }
    if (kind === "cameraPortable") {
      // Extend or retract the mirror pole along the current facing.
      p.mirror = p.mirror ? null : { yaw: p.yaw };
      p.cooldowns[kind] = this.debug.noCooldown ? 0 : g.cooldown;
      return;
    }
    if (kind === "sensorPortable") {
      this.notify("The worn sensor works while it is equipped.", p.team);
      return;
    }
    if (THROWABLE.includes(kind)) {
      // Thrown: fly the arc, then detonate where it lands (see tick).
      const path = throwPath(p, this.stat(p, kind, "throw"));
      this.projectiles.push({
        id: this.nextId++,
        kind,
        owner: p.id,
        team: this.deployTeam(p, g),
        points: path.points,
        landing: path.landing,
        time: path.time,
        elapsed: 0,
        ...pathPosition(path.points, 0),
        // Whichever of these the gadget has (radius, duration, range).
        ...Object.fromEntries(
          ["radius", "duration", "range"]
            .filter((key) => GADGET_STATS[statKind(kind)]?.[key])
            .map((key) => [key, this.stat(p, kind, key)]),
        ),
      });
    } else {
      // Same rules the aiming ghost shows (shared/placement.js).
      const check = placementCheck(p, kind, {
          gadgets: this.gadgets,
          team: this.deployTeam(p, g),
          anchor: p.anchor,
          span: ["tripwire", "shutter"].includes(baseOf(kind))
            ? this.stat(p, kind, "span")
            : undefined,
        }),
        hit = check.hit;
      if (!check.ok) {
        // A bad second anchor keeps the first; switching gadgets clears it.
        this.notify(check.reason, p.team);
        return;
      }
      if (["tripwire", "shutter"].includes(baseOf(kind))) {
        if (!p.anchor) {
          p.anchor = hit;
          this.notify(
            "First anchor set. Aim at a second wall in sight of it and click.",
            p.team,
          );
          return;
        }
        const a = p.anchor,
          inset = wireInset,
          shutter = baseOf(kind) === "shutter";
        // A shutter can't close on someone standing in the doorway.
        if (shutter) {
          const box = shutterBox({ ...inset(a), b: inset(hit), floor: p.y });
          if (
            Object.values(this.players).some(
              (q) => q.alive && overlapsFootprint(box, q.x, q.z, 0.35),
            )
          ) {
            this.notify("Someone's in the doorway.", p.team);
            return;
          }
        }
        p.anchor = null;
        this.gadgets.push({
          id: this.nextId++,
          kind,
          owner: p.id,
          team: this.deployTeam(p, g),
          ...inset(a),
          b: inset(hit),
          active: true,
          ...(shutter && {
            floor: p.y,
            remaining:
              this.party?.kind === "sweep"
                ? 1e9
                : this.stat(p, kind, "duration"),
          }),
          stats:
            kind === "tripwire"
              ? {
                  hold: this.stat(p, kind, "hold"),
                  width: this.stat(p, kind, "width"),
                }
              : shutter
                ? { toughness: this.stat(p, kind, "toughness") }
                : undefined,
        });
      } else {
        this.gadgets.push({
          id: this.nextId++,
          kind,
          owner: p.id,
          team: this.deployTeam(p, g),
          x: hit.x + hit.normal.x * 0.06,
          y: hit.y + 0.06,
          z: hit.z + hit.normal.z * 0.06,
          yaw: Math.atan2(-hit.normal.x, -hit.normal.z),
          pitch: -0.12,
          active: true,
          stats:
            kind === "sensor"
              ? {
                  radius: this.stat(p, kind, "radius"),
                  rearm: this.stat(p, kind, "rearm"),
                  reveal: this.stat(p, kind, "reveal"),
                }
              : undefined,
        });
      }
    }
    p.inventory[kind]--;
    p.cooldowns[kind] = this.debug.noCooldown ? 0 : g.cooldown;
    this.stats.equipment++;
    this.notify(
      `${g.name} ${THROWABLE.includes(kind) ? "thrown" : "deployed"}.`,
      p.team,
    );
  }
  // Splash and Soak: toss a water balloon along your aim.
  attack(p, quiet = false) {
    // Hot Potato: fire throws the grenade in hand.
    if (p.equipped === "potato" && this.party) return partyThrow(this, p);
    if (p.equipped === "balloon" && wetRule(this.rule))
      return this.toss(p, quiet);
  }
  // A splash on q from p's balloon: splashHits of them soak them out (a
  // decoy is just neutralized; training carries on).
  landHit(p, q) {
    if (this.party) return partyHit(this, p, q);
    const out = CONFIG.splashHits;
    q.hits = (q.hits || 0) + 1;
    // A splashed bot runs off for a moment before it carries on.
    q.fleeUntil = (this.clock || 0) + CONFIG.splashFlee;
    q.fleeFrom = { x: p.x, z: p.z };
    this.notify(`Splash! (${q.hits}/${out})`, p.team);
    this.notify(`You got splashed (${q.hits}/${out}).`, q.team);
    if (q.hits < out) return;
    if (this.decoys.includes(q)) {
      q.active = false;
      this.notify("Decoy neutralized.", p.team);
      return;
    }
    if (this.training) {
      q.hits = 0;
      this.notify("Soaked! Shake it off and keep playing.");
      return;
    }
    q.alive = false;
    q.camera = null;
    this.stats.detections++;
    // With an uplink live, the sentinels still have to pull it.
    if (
      !(q.team === "attacker" && this.uplink) &&
      Object.values(this.players)
        .filter((r) => r.team === q.team)
        .every((r) => !r.alive)
    )
      this.finish(p.team, "Opponent soaked");
  }
  // Splash: lob a water balloon along your aim. There's no end to them, but
  // only one every cooldown. It flies a throw's arc (see balloonHit).
  toss(p, quiet) {
    const blocked = weaponBlockReason(p, this.phase);
    if (blocked) {
      if (!quiet) this.notify(blocked, p.team);
      return;
    }
    if (p.cooldowns.balloon > 0) return;
    this.uncloak(p);
    p.cooldowns.balloon = this.debug.noCooldown ? 0 : GADGETS.balloon.cooldown;
    p.attackFlash = 0.15;
    const path = throwPath(p, CONFIG.balloonRange),
      color = p.balloonColor || balloonColor();
    p.balloonColor = balloonColor();
    this.projectiles.push({
      id: this.nextId++,
      kind: "balloon",
      color,
      owner: p.id,
      team: p.team,
      points: path.points,
      landing: path.landing,
      time: path.time,
      elapsed: 0,
      ...pathPosition(path.points, 0),
    });
    // A soft whoosh, heard close by.
    this.splashes.push({
      id: this.nextId++,
      kind: "throw",
      x: p.x,
      y: p.y + 1.4,
      z: p.z,
      team: p.team,
      range: CONFIG.throwHearing,
      remaining: 0.6,
    });
  }
  // A balloon in flight bursts on the first of the other side's people
  // (players or decoys) or placed devices it touches between `from` and
  // where it is now. True if it burst.
  balloonHit(t, from) {
    const people = [
        ...Object.values(this.players).filter((q) => q.alive),
        ...this.decoys.filter((d) => d.active),
      ].filter((q) => q.team !== t.team),
      devices = this.gadgets.filter((g) => g.active && g.team !== t.team);
    for (let i = 1; i <= 4; i++) {
      const f = i / 4,
        at = {
          x: from.x + (t.x - from.x) * f,
          y: from.y + (t.y - from.y) * f,
          z: from.z + (t.z - from.z) * f,
        };
      const person = people.find(
        (q) =>
          Math.hypot(q.x - at.x, q.z - at.z) < 0.4 &&
          at.y > q.y - 0.1 &&
          at.y < q.y + eyeHeight(q) + 0.25,
      );
      if (person) {
        this.burst(t, at, person);
        return true;
      }
      if (devices.some((g) => distance3(this.devicePoint(g), at) < 0.35)) {
        this.burst(t, at, null);
        return true;
      }
    }
    return false;
  }
  devicePoint(g) {
    return g.b
      ? { x: (g.x + g.b.x) / 2, y: (g.y + g.b.y) / 2, z: (g.z + g.b.z) / 2 }
      : { x: g.x, y: g.y, z: g.z };
  }
  // A balloon bursts at `at`, on a person, a device or the ground: it
  // splashes everyone on the other side within the splash radius (a direct
  // hit always counts), their devices in the splash fizzle out, and
  // everyone near hears it.
  burst(t, at, direct) {
    const thrower = this.players[t.owner] || { id: t.owner, team: t.team };
    this.splashes.push({
      id: this.nextId++,
      kind: "burst",
      color: t.color,
      x: at.x,
      y: at.y,
      z: at.z,
      team: t.team,
      range: CONFIG.splashHearing,
      remaining: 0.8,
    });
    const r = CONFIG.splashRadius,
      soaked = [
        ...Object.values(this.players).filter((q) => q.alive),
        ...this.decoys.filter((d) => d.active),
      ].filter(
        (q) =>
          q === direct ||
          (q.team !== t.team &&
            Math.hypot(q.x - at.x, q.z - at.z) < r &&
            at.y > q.y - 0.5 &&
            at.y < q.y + eyeHeight(q) + 0.5),
      );
    for (const g of this.gadgets) {
      if (!g.active || g.team === t.team) continue;
      if (distance3(this.devicePoint(g), at) > r) continue;
      g.active = false;
      const name = GADGETS[baseOf(g.kind)]?.name.toLowerCase();
      this.notify(`Splashed their ${name}. It fizzled out.`, t.team);
      this.notify(`Your ${name} got splashed and fizzled out.`, g.team);
    }
    for (const q of soaked) this.landHit(thrower, q);
  }

  // Whether a device or worn sensor of `team` at `pos` is being jammed, by a
  // thrown jammer or an opponent's active portable jammer.
  jammedAt(pos, team) {
    return (
      this.gadgets.some(
        (j) =>
          j.active &&
          j.kind === "jammer" &&
          j.team !== team &&
          distance(j, pos) < (j.stats?.radius ?? CONFIG.jammerRadius),
      ) ||
      Object.values(this.players).some(
        (q) =>
          q.alive &&
          q.team !== team &&
          q.jamming > 0 &&
          distance(q, pos) < q.jamRadius,
      )
    );
  }
  detonate(t) {
    const { x, y, z } = t.landing;
    if (t.kind === "balloon") return this.burst(t, t.landing, null);
    if (t.kind === "flashbang") return this.flash(t);
    if (t.kind === "pulse")
      return this.pulseQueue.push({
        x,
        y: y + 0.1,
        z,
        team: t.team,
        radius: t.radius,
        duration: t.duration,
        at: (this.clock || 0) + CONFIG.pulseDelay,
      });
    if (t.kind === "noisemaker")
      // Running footsteps from the landing spot, heard like a player's.
      return this.noises.push({
        id: this.nextId++,
        x,
        y,
        z,
        team: t.team,
        range: t.range,
        remaining: t.duration,
        noise: "sprint",
        moveSpeed: CONFIG.sprintSpeed,
        alive: true,
      });
    if (t.kind === "smoke")
      this.smokes.push({
        id: this.nextId++,
        x,
        y,
        z,
        radius: t.radius,
        remaining: t.duration,
        total: t.duration,
        color: this.rule === "seen" ? this.smokeColor() : undefined,
      });
    else
      this.gadgets.push({
        id: this.nextId++,
        kind: t.kind,
        x,
        y: y + 0.1,
        z,
        owner: t.owner,
        team: t.team,
        active: true,
        remaining: t.duration,
        stats: isDecoy(t.kind) ? undefined : { radius: t.radius },
      });
  }
  // Seen rules: each smoke is a random colour, its hue at least 60° from
  // the last one's so throws look different. (Shared by every client.)
  smokeColor() {
    let hue;
    do hue = Math.random() * 360;
    while (
      this.lastSmokeHue !== undefined &&
      Math.abs(((hue - this.lastSmokeHue + 540) % 360) - 180) < 60
    );
    this.lastSmokeHue = hue;
    const l = 0.6,
      a = 0.65 * Math.min(l, 1 - l),
      channel = (n) => {
        const k = (n + hue / 30) % 12;
        return Math.round(
          255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        )
          .toString(16)
          .padStart(2, "0");
      };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  }
  // Where you work on a device to disarm it: the device itself (a wire's
  // first anchor), or for a shutter lock the middle of the panel, on your
  // side of it.
  disarmPoint(g, p) {
    if (baseOf(g.kind) !== "shutter") return { x: g.x, y: g.y + 0.1, z: g.z };
    const box = shutterBox(g),
      alongX = box.w > box.d,
      side = (alongX ? p.z > box.z : p.x > box.x) ? 1 : -1;
    return {
      x: box.x + (alongX ? 0 : side * 0.15),
      y: (g.floor || 0) + 1.2,
      z: box.z + (alongX ? side * 0.15 : 0),
    };
  }
  // Make this match's map the active one, with its active shutter locks
  // solid: they join the shared walls (dropping any another match left).
  useLevel() {
    useMap(this.map);
    useObjectives(this.plantMode ? "plant" : "extract");
    for (let i = WALLS.length - 1; i >= 0; i--)
      if (WALLS[i].shutter) WALLS.splice(i, 1);
    for (const g of this.gadgets)
      if (g.active && baseOf(g.kind) === "shutter") WALLS.push(shutterBox(g));
    // A spawn room's doors stay shut until infiltration starts.
    for (let i = WALLS.length - 1; i >= 0; i--)
      if (WALLS[i].kind === "door") WALLS.splice(i, 1);
    if (this.preRound()) WALLS.push(...(MAPS[this.map].spawnRoom?.doors || []));
    applyDoors(this.openDoors);
  }
  // Due pulse sensors sweep: every opponent within the radius (through
  // walls) is outlined for the thrower's side. Those caught are told.
  sendPulses(dt) {
    for (const g of this.pulses) g.remaining -= dt;
    this.pulses = this.pulses.filter((g) => g.remaining > 0);
    const now = this.clock || 0;
    for (const q of this.pulseQueue.filter((q) => q.at <= now)) {
      this.pulses.push({ id: this.nextId++, ...q, remaining: 0.8 });
      const caught = Object.values(this.players).filter(
        (p) =>
          p.alive &&
          p.team !== q.team &&
          Math.hypot(p.x - q.x, p.y + 1 - q.y, p.z - q.z) <= q.radius,
      );
      for (const p of caught) this.reveal(q.team, p, q.duration);
      this.notify(
        caught.length
          ? `Pulse: ${caught.length} contact${caught.length > 1 ? "s" : ""} outlined.`
          : "Pulse: no contacts.",
        q.team,
      );
      if (caught.length)
        this.notify(
          "A pulse sensor swept you: you're outlined for a moment.",
          q.team === "attacker" ? "defender" : "attacker",
        );
    }
    this.pulseQueue = this.pulseQueue.filter((q) => q.at > now);
  }
  // A flashbang bursts where it lands. Anyone (either side, the thrower too)
  // within its radius with a clear view of the burst is blinded: fully if
  // they're facing it, less if they're turned away. Cameras that can see it
  // white out. The bang marks the spot for the other side.
  flash(t) {
    const burst = { ...t.landing, y: t.landing.y + 0.3 };
    for (const p of Object.values(this.players)) {
      if (!p.alive || distance(p, burst) > t.radius) continue;
      if (!clearSight(this.eye(p), burst, this.smokes, p.team)) continue;
      const facing = this.inCone(p, burst, Math.PI / 2);
      p.blind = Math.max(
        p.blind || 0,
        t.duration * (facing ? 1 : CONFIG.flashAwayFactor),
      );
    }
    for (const g of this.gadgets)
      if (
        g.active &&
        baseOf(g.kind) === "camera" &&
        distance(g, burst) < t.radius &&
        clearSight({ x: g.x, y: g.y, z: g.z }, burst, this.smokes, g.team)
      )
        g.flashed = t.duration;
    this.flashes.push({ id: this.nextId++, ...burst, remaining: 0.4 });
    const other = t.team === "attacker" ? "defender" : "attacker";
    this.pings.push({
      id: this.nextId++,
      owner: "flash:" + t.id,
      team: other,
      x: burst.x,
      y: t.landing.y,
      z: burst.z,
      remaining: CONFIG.pingSeconds,
    });
    this.notify("Flashbang! The bang marks where it went off.", other);
  }
  // Sliding: press crouch while sprinting forward (the client sends it as a
  // slide request, so it doesn't toggle crouch). You drop low and keep going
  // the way you were running: a burst a bit faster than a sprint that eases
  // out to walking pace, then you're back on your feet. Jumping, going prone,
  // hitting a wall or leaving the ground ends it early. It scrapes (walking
  // loudness).
  slide(p, dt, free) {
    const input = p.input,
      pressed = (input.slide || 0) !== (p.slideSeen || 0);
    p.slideSeen = input.slide || 0;
    if (p.slideCooldown > 0)
      p.slideCooldown = Math.max(0, p.slideCooldown - dt);
    if (
      !p.slide &&
      pressed &&
      free &&
      p.grounded &&
      !p.prone &&
      input.sprint &&
      (input.forward || 0) > 0 &&
      p.moveSpeed > CONFIG.walkSpeed + 0.2 &&
      !(p.slideCooldown > 0)
    ) {
      const f = input.forward || 0,
        s = input.side || 0,
        length = Math.hypot(f, s) || 1;
      p.slide = {
        elapsed: 0,
        x: (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) / length,
        z: (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) / length,
      };
    }
    if (!p.slide) return;
    const slide = p.slide,
      t = slide.elapsed / CONFIG.slideSeconds,
      // Fast at first, easing out: no sudden stop at the end.
      start = CONFIG.sprintSpeed * CONFIG.slideBoost,
      speed = CONFIG.walkSpeed + (start - CONFIG.walkSpeed) * (1 - t) ** 2,
      before = { x: p.x, z: p.z };
    if (free && !input.jump && !p.prone && p.grounded && t < 1) {
      p.crouch = true;
      movePlayer(p, slide.x * speed * dt, slide.z * speed * dt);
      if (this.behindLineOnly(p) && this.pastLine(p)) p.z = before.z;
      slide.elapsed += dt;
      // Stopped short by a wall: the slide is over.
      if (distance(p, before) > speed * dt * 0.4) return;
    }
    p.slide = null;
    p.slideCooldown = CONFIG.slideCooldown;
  }
  // A wall you could run along on side (1 right, -1 left): long and tall
  // enough, flat (not a tank, rail, ramp or console), within reach, and
  // you're facing roughly along it. Returns the wall, the direction to run
  // and its normal (pointing back toward you).
  wallBeside(p, side) {
    const fx = -Math.sin(p.yaw),
      fz = -Math.cos(p.yaw),
      rx = -fz * side,
      rz = fx * side,
      a = { x: p.x, y: p.y + 1, z: p.z },
      b = {
        x: p.x + rx * (CONFIG.playerRadius + CONFIG.wallRunReach),
        y: a.y,
        z: p.z + rz * (CONFIG.playerRadius + CONFIG.wallRunReach),
      };
    let best = null;
    for (const w of WALLS) {
      if (
        w.hidden ||
        w.shape ||
        ["terminal", "ramp", "rampRail", "crane"].includes(w.kind) ||
        w.style === "halfwall" ||
        (w.bottom || 0) > p.y + 0.5 ||
        w.h < p.y + 1.6 ||
        Math.max(w.w, w.d) < 1.5
      )
        continue;
      const t = segmentBox(a, b, w);
      if (t !== null && (!best || t < best.t)) best = { w, t };
    }
    if (!best) return null;
    const { w, t } = best,
      hx = a.x + (b.x - a.x) * t,
      hz = a.z + (b.z - a.z) * t,
      onX =
        Math.min(
          Math.abs(hx - (w.x - w.w / 2)),
          Math.abs(hx - (w.x + w.w / 2)),
        ) <
        Math.min(
          Math.abs(hz - (w.z - w.d / 2)),
          Math.abs(hz - (w.z + w.d / 2)),
        ),
      normal = onX
        ? { x: -Math.sign(rx) || 1, z: 0 }
        : { x: 0, z: -Math.sign(rz) || 1 },
      along = fx * normal.x + fz * normal.z;
    if (Math.abs(along) > Math.sin(CONFIG.wallRunAngle)) return null;
    const tx = fx - normal.x * along,
      tz = fz - normal.z * along,
      len = Math.hypot(tx, tz) || 1;
    return { w, side, normal, dir: { x: tx / len, z: tz / len } };
  }
  // Wall running: start it, carry it on, end it, or kick off the wall.
  wallRun(p, dt, free) {
    const input = p.input,
      jumpPressed = input.jump && p.jumpHeld <= dt + 1e-6;
    if (p.wallRun) {
      const run = p.wallRun;
      run.elapsed += dt;
      if (jumpPressed && !p.wallKicked) {
        // Kick off: up, away from the wall and on along it.
        p.wallRun = null;
        p.wallKicked = true;
        p.vy = CONFIG.jumpSpeed * 0.85;
        p.kick = {
          x: run.normal.x * CONFIG.wallKickPush + run.dir.x * CONFIG.walkSpeed,
          z: run.normal.z * CONFIG.wallKickPush + run.dir.z * CONFIG.walkSpeed,
          time: CONFIG.wallKickSeconds,
        };
        return;
      }
      const still = this.wallBeside(p, run.side);
      if (
        !free ||
        p.prone ||
        p.grounded ||
        run.elapsed >= CONFIG.wallRunSeconds ||
        !((input.forward || 0) > 0) ||
        !still ||
        still.normal.x !== run.normal.x ||
        still.normal.z !== run.normal.z
      ) {
        p.wallRun = null;
        return;
      }
      const step = CONFIG.wallRunSpeed * dt,
        from = { x: p.x, z: p.z };
      movePlayer(p, run.dir.x * step, run.dir.z * step);
      if (Math.hypot(p.x - from.x, p.z - from.z) < step * 0.5) {
        p.wallRun = null; // Ran into something.
        return;
      }
      // Carry some of the jump up, then sink: set vy so that after gravity
      // this tick it is the run's own vertical speed.
      const k = run.elapsed / CONFIG.wallRunSeconds;
      p.vy = run.vy0 - (run.vy0 + CONFIG.wallRunSink) * k + CONFIG.gravity * dt;
      return;
    }
    if (
      !free ||
      p.grounded ||
      p.slide ||
      p.prone ||
      p.crouch ||
      !input.sprint ||
      !((input.forward || 0) > 0) ||
      p.vy < -4 ||
      !(p.wallRuns === 0 || (p.wallRuns === 1 && p.wallKicked))
    )
      return;
    const wall = this.wallBeside(p, 1) || this.wallBeside(p, -1);
    // A second run (after a kick) has to be on a different wall.
    if (!wall || WALLS.indexOf(wall.w) === p.lastWall) return;
    const { side, normal, dir } = wall;
    p.wallRun = {
      side,
      normal,
      dir,
      elapsed: 0,
      vy0: Math.min(Math.max(p.vy, 0), CONFIG.wallRunRise),
    };
    p.lastWall = WALLS.indexOf(wall.w);
    p.wallRuns++;
    p.kick = null;
    this.uncloak(p);
  }
  // Ladders: push forward while facing one to climb it, back to climb down.
  // You hang on it in between and step off at the top; jump lets go.
  // Returns whether the player is on a ladder this tick (no gravity).
  climbLadder(p, input, dt, canClimb) {
    if (!canClimb || input.jump || p.slide || p.wallRun)
      return (p.onLadder = false);
    const r = CONFIG.playerRadius + 0.1,
      ladder = WALLS.find(
        (w) =>
          w.ladder &&
          p.y < w.h - 0.02 &&
          p.y >= (w.bottom || 0) - 0.05 &&
          overlapsFootprint(w, p.x, p.z, r),
      );
    if (!ladder) return (p.onLadder = false);
    const forward = input.forward || 0,
      facing =
        -Math.sin(p.yaw) * (ladder.x - p.x) -
          Math.cos(p.yaw) * (ladder.z - p.z) >
        0;
    // Walking past (or away from) a ladder doesn't grab it; once on, you
    // hold on until you let go, reach the top, or step off at the bottom.
    if (!p.onLadder && p.grounded && !(forward > 0 && facing)) return false;
    const climb = forward > 0 && facing ? 1 : forward < 0 ? -1 : 0;
    p.y = Math.min(
      ladder.h,
      Math.max(0, p.y + climb * CONFIG.ladderSpeed * dt),
    );
    // Not grounded: that would snap you back to the floor. Near the top,
    // forward walks you over the ladder's top onto what's behind it.
    p.vy = 0;
    p.grounded = false;
    return (p.onLadder = true);
  }
  // Walking, jumping, gravity and landing for one player this tick.
  move(p, dt, old) {
    // Breakout: auto run, and left or right picks a lane.
    const breakout = this.party?.kind === "breakout";
    if (breakout) breakoutSteer(this, p);
    const running =
      breakout && this.phase === "active" && p.team === "attacker";
    const input = p.input;
    if (this.party?.kind === "boulders") {
      p.prone = p.crouch = false;
      p.slide = null;
      input.sprint = false;
    }
    if (this.party?.kind === "sprinklers") {
      p.prone = p.crouch = false;
      input.sprint = false;
      if (this.party.sprinklers?.runners[p.id]?.wet) {
        p.vy = p.moveSpeed = 0;
        return;
      }
    }
    if (p.grounded) p.jumpOrigin = p.y;
    if (!input.jump) {
      p.jumpHeld = 0;
      p.clamberLatched = false;
    } else p.jumpHeld = (p.jumpHeld || 0) + dt;
    // Livewire: no pulling yourself back up out of the lava.
    const canClimb =
      !p.prone &&
      !p.immobile &&
      !p.camera &&
      !p.mirror &&
      !input.interact &&
      this.party?.kind !== "livewire" &&
      !running;
    if (p.clamber && !canClimb) p.clamber = null;
    // On the ground, hold jump to clamber (a tap stays a jump). In the air,
    // pushing forward into a reachable ledge pulls you up whether or not
    // jump is still held, so a jump that falls just short still makes it.
    const mantle = !p.grounded && !p.onLadder && (input.forward || 0) > 0;
    if (
      !p.clamber &&
      canClimb &&
      !p.clamberLatched &&
      ((input.jump && p.jumpHeld >= CONFIG.clamberHoldSeconds) || mantle)
    ) {
      const target = p.grounded
        ? findClamber(p)
        : findClamber(p, p.jumpOrigin ?? p.y, p.y);
      if (
        target &&
        !(this.behindLineOnly(p) && this.pastLine({ ...p, ...target })) &&
        !this.offLimits(p, target)
      ) {
        p.clamber = {
          from: { x: p.x, y: p.y, z: p.z },
          to: target,
          elapsed: 0,
        };
        p.clamberLatched = true;
        p.vy = 0;
        p.wallRun = null;
        p.kick = null;
        this.uncloak(p);
      }
    }
    if (p.clamber) {
      const climb = p.clamber;
      climb.elapsed += dt;
      Object.assign(
        p,
        clamberPosition(climb, climb.elapsed / CONFIG.clamberSeconds),
      );
      p.vy = 0;
      p.grounded = false;
      p.moveSpeed = 0;
      p.noise = "silent";
      if (climb.elapsed >= CONFIG.clamberSeconds) {
        Object.assign(p, { x: climb.to.x, y: climb.to.y, z: climb.to.z });
        p.grounded = true;
        p.clamber = null;
      }
      return;
    }
    const free = !(p.immobile > 0 || p.camera || p.mirror || input.interact);
    this.slide(p, dt, free);
    this.wallRun(p, dt, free);
    if (p.kick && !p.wallRun) {
      // A wall kick carries you away from the wall for a moment.
      p.kick.time -= dt;
      movePlayer(p, p.kick.x * dt, p.kick.z * dt);
      if (p.kick.time <= 0) p.kick = null;
    } else if (free && !p.slide && !p.wallRun) {
      const speed = running
        ? breakoutSpeed(this)
        : this.party?.kind === "boulders"
          ? PARTY.boulders.moveSpeed
          : this.party?.kind === "sprinklers"
            ? PARTY.sprinklers.moveSpeed
            : p.prone
              ? CONFIG.proneSpeed
              : p.crouch
                ? CONFIG.crouchSpeed
                : input.sprint
                  ? CONFIG.sprintSpeed
                  : CONFIG.walkSpeed;
      const length = Math.hypot(input.forward || 0, input.side || 0) || 1;
      let dx =
        ((-Math.sin(p.yaw) * (input.forward || 0) +
          Math.cos(p.yaw) * (input.side || 0)) /
          Math.max(1, length)) *
        speed *
        dt;
      let dz =
        ((-Math.cos(p.yaw) * (input.forward || 0) -
          Math.sin(p.yaw) * (input.side || 0)) /
          Math.max(1, length)) *
        speed *
        dt;
      // At late-run speeds a full tick can skip a thin obstacle.
      const steps = running ? Math.max(1, Math.ceil(Math.abs(dz) / 0.15)) : 1;
      for (let i = 0; i < steps; i++) movePlayer(p, dx / steps, dz / steps);
      // Before the round, each team stays on its side of its map's line.
      if (this.behindLineOnly(p) && this.pastLine(p)) p.z = old.z;
    }
    if ((p.wallRun || p.kick) && this.behindLineOnly(p) && this.pastLine(p)) {
      p.z = old.z;
      p.wallRun = null;
    }
    const climbing = this.climbLadder(p, input, dt, canClimb);
    if (
      input.jump &&
      !p.clamberLatched &&
      !p.prone &&
      p.grounded &&
      !p.immobile &&
      !p.camera &&
      !p.mirror &&
      !input.interact
    ) {
      p.jumpOrigin = p.y;
      p.vy = CONFIG.jumpSpeed;
    }
    const previousY = p.y;
    if (!climbing) {
      p.grounded = false;
      p.vy -= CONFIG.gravity * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.vy > 0)
        for (const w of WALLS) {
          const head = eyeHeight(p) + 0.15;
          if (
            !w.soft &&
            w.bottom &&
            previousY + head <= w.bottom &&
            p.y + head > w.bottom &&
            overlapsFootprint(w, p.x, p.z, CONFIG.playerRadius)
          ) {
            p.y = w.bottom - head;
            p.vy = 0;
          }
        }
      if (p.vy < 0)
        for (const w of WALLS) {
          if (
            !w.soft &&
            previousY >= w.h &&
            p.y < w.h &&
            overlapsFootprint(w, p.x, p.z, CONFIG.playerRadius)
          ) {
            p.y = w.h;
            p.vy = 0;
            p.grounded = true;
          }
        }
      if (p.y === 0) {
        p.vy = 0;
        p.grounded = true;
      }
    }
    if (this.party) partyClamp(this, p, old, dt);
    p.moveSpeed = distance(p, old) / dt;
    if (this.offLimits(p)) {
      p.x = old.x;
      p.z = old.z;
      p.wallRun = null;
      p.kick = null;
    }
    if (p.grounded) {
      p.wallRuns = 0;
      p.wallKicked = false;
      p.kick = null;
      p.lastWall = null;
    }
    p.noise = p.slide
      ? "walk"
      : p.wallRun
        ? "sprint"
        : movementNoise(p, p.moveSpeed);
  }
  // Before the round each side stays behind a line (see preRoundLine):
  // infiltrators in staging; sentinels behind theirs while buying, then
  // short of the staging gate while they set up.
  behindLineOnly(p) {
    return preRoundLine(MAPS[this.map], p.team, this.phase) !== null;
  }
  pastLine(p) {
    const line = preRoundLine(MAPS[this.map], p.team, this.phase);
    return p.team === "attacker" ? p.z < line : p.z > line;
  }
  // Sentinels never enter the infiltrators' spawn room or its hallways, and
  // in preparation stay prepGap from each hallway's exit.
  offLimits(p, at = p) {
    const room = MAPS[this.map].spawnRoom;
    if (!room || p.team !== "defender") return false;
    const r = CONFIG.playerRadius;
    if (
      room.zone.some(
        (z) =>
          at.x > z.x0 - r &&
          at.x < z.x1 + r &&
          at.z > z.z0 - r &&
          at.z < z.z1 + r,
      )
    )
      return true;
    return (
      this.phase === "prep" &&
      room.exits.some((e) => distance(at, e) < CONFIG.prepGap)
    );
  }
  // No one sees (or hears) the other side before the round.
  preRound() {
    return this.phase === "purchase" || this.phase === "prep";
  }
  tick(dt) {
    this.useLevel();
    this.clock = (this.clock || 0) + dt;
    for (const g of this.pings) g.remaining -= dt;
    this.pings = this.pings.filter((g) => g.remaining > 0);
    if (this.phase === "purchase") {
      // Walk around the staging side while buying.
      for (const p of Object.values(this.players)) {
        if (!p.alive) continue;
        p.attackFlash = Math.max(0, (p.attackFlash || 0) - dt);
        p.prone = !!p.input.prone;
        p.crouch = !p.prone && (!!p.input.crouch || lowCeiling(p));
        this.move(p, dt, { x: p.x, z: p.z });
      }
      return;
    }
    if (!["prep", "active"].includes(this.phase)) return;
    // Solo: your pause screen stops the clock, the bot and everything else.
    if (
      this.solo &&
      Object.values(this.players).some((p) => !p.bot && p.paused)
    )
      return;
    // A planted uplink's countdown stands in for the round clock.
    if (this.uplink && this.phase === "active") {
      this.uplink.remaining -= dt;
      if (this.uplink.remaining <= 0) {
        this.uplinkOver("attacker");
        if (this.phase === "results") return;
      }
    } else if (!this.training) this.time -= dt;
    if (this.time <= 0) {
      if (this.phase === "prep") this.activate();
      else this.finish("defender", "Time expired");
      return;
    }
    if (this.party) {
      partyTick(this, dt);
      if (this.phase === "results") return;
    }
    if (this.phase === "active") {
      const before = this.activeTime || 0;
      this.activeTime = before + dt;
      if (this.kid) this.glow(before);
      while (this.botQueue?.length && this.botQueue[0].at <= this.activeTime)
        this.placeBotGadget(this.botQueue.shift());
    }
    for (const t of this.projectiles) {
      const from = { x: t.x, y: t.y, z: t.z };
      t.elapsed += dt;
      Object.assign(t, pathPosition(t.points, t.elapsed));
      if (t.kind === "balloon" && this.balloonHit(t, from)) t.burst = true;
      else if (t.elapsed >= t.time) this.detonate(t);
    }
    this.projectiles = this.projectiles.filter(
      (t) => !t.burst && t.elapsed < t.time,
    );
    for (const t of this.splashes) t.remaining -= dt;
    this.splashes = this.splashes.filter((t) => t.remaining > 0);
    for (const s of this.smokes) s.remaining -= dt;
    this.smokes = this.smokes.filter((s) => s.remaining > 0);
    for (const n of this.noises) n.remaining -= dt;
    this.noises = this.noises.filter((n) => n.remaining > 0);
    for (const f of this.flashes) f.remaining -= dt;
    this.flashes = this.flashes.filter((f) => f.remaining > 0);
    this.sendPulses(dt);
    for (const p of Object.values(this.players))
      if (p.blind > 0) p.blind = Math.max(0, p.blind - dt);
    for (const g of this.gadgets)
      if (g.flashed > 0) g.flashed = Math.max(0, g.flashed - dt);
    for (const g of this.gadgets) {
      if (g.remaining !== undefined) {
        g.remaining -= dt;
        if (g.remaining <= 0) g.active = false;
      }
      // Only electronics jam; wires are mechanical.
      g.jammed =
        g.active &&
        ["camera", "sensor"].includes(baseOf(g.kind)) &&
        this.jammedAt(g, g.team);
    }
    for (const team of ["attacker", "defender"])
      for (const id in this.reveals[team]) {
        this.reveals[team][id] -= dt;
        if (this.reveals[team][id] <= 0) delete this.reveals[team][id];
      }
    for (const d of this.decoys) stepDecoy(d, dt);
    for (const p of Object.values(this.players)) {
      if (!p.alive) continue;
      p.attackFlash = Math.max(0, (p.attackFlash || 0) - dt);
      if (p.camera && !this.gadgets.some((g) => g.id === p.camera && g.active))
        p.camera = null;
      p.immobile = Math.max(0, p.immobile - dt);
      for (const key in p.cooldowns)
        p.cooldowns[key] = Math.max(0, p.cooldowns[key] - dt);
      if (p.bot) this.bot(p, dt);
      this.stock(p);
      const input = p.input;
      p.prone = !!input.prone;
      p.crouch = !p.prone && (!!input.crouch || lowCeiling(p));
      const old = { x: p.x, y: p.y, z: p.z, grounded: p.grounded };
      p.jamming = Math.max(0, (p.jamming || 0) - dt);
      if (p.cloak > 0) {
        p.cloak = Math.max(0, p.cloak - dt);
        const moving = Math.hypot(input.forward || 0, input.side || 0) > 0;
        if ((input.sprint && moving) || p.capture > 0 || p.disarm > 0)
          this.uncloak(p);
      }
      p.sensorAlert = Math.max(0, (p.sensorAlert || 0) - dt);
      if (p.mirror && p.equipped !== "cameraPortable") p.mirror = null;
      this.move(p, dt, old);
      if (p.scan > 0) {
        p.scan -= dt;
        if (p.scan <= 0) {
          p.signatures = this.gadgets
            .filter(
              (g) =>
                g.active &&
                g.team !== p.team &&
                distance(p, g) <
                  statValue(this.builds(p), "scanner", "range") &&
                this.inCone(
                  p,
                  g,
                  statValue(this.builds(p), "scanner", "width"),
                ),
            )
            .map((g) => ({ x: g.x, z: g.z }));
          p.signatureTime = 4;
          this.notify(
            `${p.signatures.length} possible device signature${p.signatures.length === 1 ? "" : "s"} in forward sector.`,
            p.team,
          );
        }
      }
      p.signatureTime = Math.max(0, (p.signatureTime || 0) - dt);
      const target = this.gadgets.find((g) => {
        if (!g.active || g.team === p.team) return false;
        const point = this.disarmPoint(g, p);
        return (
          distance(p, point) < statValue(this.builds(p), "disarm", "reach") &&
          this.inCone(
            p,
            point,
            statValue(this.builds(p), "disarm", "tolerance"),
          ) &&
          clearShot(this.eye(p), point, this.smokes)
        );
      });
      p.disarmTarget = target?.id || null;
      if (
        input.interact &&
        p.equipped === "disarm" &&
        p.inventory.disarm &&
        target &&
        this.phase === "active"
      ) {
        if (p.disarmingId !== target.id) p.disarm = 0;
        p.disarmingId = target.id;
        p.disarm += dt;
        // A shutter lock may take a little longer to get through.
        if (
          p.disarm >=
          statValue(this.builds(p), "disarm", "speed") +
            (target.stats?.toughness || 0)
        ) {
          target.active = false;
          p.disarm = 0;
          this.notify("Device disabled.", p.team);
        }
      } else {
        p.disarm = 0;
        p.disarmingId = null;
      }
      if (this.phase !== "active") continue;
      if (p.team === "attacker") {
        for (const g of this.gadgets) {
          // Your own wires, and your side's, never catch you.
          if (!g.active || g.team === p.team || g.owner === p.id) continue;
          if (
            g.b &&
            baseOf(g.kind) === "tripwire" &&
            pointSegmentDistance(p, g, g.b) < (g.stats?.width ?? 0.4) &&
            p.y < Math.max(g.y, g.b.y) + 0.15
          ) {
            g.active = false;
            this.stats.traps++;
            if (!isDecoy(g.kind)) {
              p.immobile = g.stats?.hold ?? CONFIG.trapSeconds;
              if (this.party) partyCaught(this);
              this.notify(
                `Tripwire triggered. Immobilized for ${p.immobile} seconds.`,
                p.team,
              );
              // Show the sentinels where, and who: a marker at the wire and
              // the intruder outlined for a few seconds.
              this.reveal("defender", p, CONFIG.wireRevealSeconds);
              this.pings.push({
                id: this.nextId++,
                owner: "wire:" + g.id,
                team: "defender",
                x: (g.x + g.b.x) / 2,
                y: Math.min(g.y, g.b.y) - 0.3,
                z: (g.z + g.b.z) / 2,
                remaining: CONFIG.pingSeconds,
              });
              this.notify(
                "Tripwire triggered — intruder outlined, position marked.",
                "defender",
              );
            } else this.notify("Wire crossed. No restraint activated.", p.team);
          }
        }
        this.useDoor(p, input);
        this.capture(p, input, dt);
      } else if (this.plantMode) this.capture(p, input, dt);
    }
    for (const g of this.gadgets) {
      if (g.lastAlert > 0) g.lastAlert -= dt;
      if (g.panning > 0) g.panning = Math.max(0, g.panning - dt);
    }
    if (this.phase === "active") {
      this.terminalAlerts();
      this.senseMotion();
      this.spotDevices(dt);
      this.cameraTags(dt);
    }
    if (this.phase === "active")
      for (const lure of this.decoys.filter((d) => d.active)) {
        for (const defender of Object.values(this.players).filter(
          (p) => p.team === "defender" && p.team !== lure.team,
        )) {
          const key = defender.id + ":" + lure.id,
            visible = this.rule === "seen" && this.canDetect(defender, lure);
          this.pairs[key] = visible ? (this.pairs[key] || 0) + dt : 0;
          if (
            this.pairs[key] >= CONFIG.detectionSeconds ||
            (this.rule === "removed" && this.canCapture(defender, lure))
          ) {
            lure.active = false;
            lure.alive = false;
            this.pairs[key] = 0;
            this.notify(
              "Decoy neutralized. No real attacker eliminated.",
              defender.team,
            );
          }
        }
      }
    if (this.phase === "active") {
      for (const d of Object.values(this.players).filter(
        (p) => p.team === "defender",
      ))
        for (const a of Object.values(this.players).filter(
          (p) => p.team === "attacker",
        )) {
          const key = `${d.id}:${a.id}`;
          const visible = this.rule === "seen" && this.canDetect(d, a);
          // A cloak slows identification; it doesn't stop close capture.
          this.pairs[key] = visible
            ? (this.pairs[key] || 0) + dt * (a.cloak > 0 ? a.cloakRate : 1)
            : 0;
          const captured = this.rule === "removed" && this.canCapture(d, a);
          if (
            this.training &&
            (captured || this.pairs[key] >= CONFIG.detectionSeconds)
          ) {
            this.pairs[key] = 0;
            this.notify(
              `Training: ${captured ? "captured" : "identified"} — no elimination.`,
            );
          } else if (captured || this.pairs[key] >= CONFIG.detectionSeconds) {
            a.alive = false;
            if (captured) this.stats.captures++;
            else this.stats.detections++;
            if (
              !this.uplink &&
              Object.values(this.players)
                .filter((p) => p.team === "attacker")
                .every((p) => !p.alive)
            )
              this.finish(
                "defender",
                captured
                  ? "Intruder captured at close range"
                  : "Intruder visually identified",
              );
          }
        }
    }
  }
  // Opponents (players and character decoys) moving within `radius` of pos.
  movers(pos, team, radius) {
    return [
      ...Object.values(this.players).filter((q) => q.alive),
      ...this.decoys.filter((d) => d.active),
    ].filter(
      (q) => q.team !== team && q.moveSpeed > 0.05 && distance(q, pos) < radius,
    );
  }
  // Motion sensors (placed and worn) report movement and outline the movers
  // through walls for their reveal time. Decoy sensors never fire.
  senseMotion() {
    const where = MAPS[this.map].region;
    for (const g of this.gadgets) {
      if (!g.active || g.kind !== "sensor" || g.jammed || g.lastAlert > 0)
        continue;
      const movers = this.movers(
        g,
        g.team,
        g.stats?.radius ?? CONFIG.sensorRadius,
      );
      if (!movers.length) continue;
      g.lastAlert = g.stats?.rearm ?? 4;
      for (const q of movers) this.reveal(g.team, q, g.stats?.reveal ?? 3);
      this.notify(`Motion detected: ${where(g.x, g.z)}.`, g.team);
    }
    for (const p of Object.values(this.players)) {
      if (
        !p.alive ||
        p.equipped !== "sensorPortable" ||
        !p.inventory.sensorPortable ||
        p.sensorAlert > 0 ||
        this.jammedAt(p, p.team)
      )
        continue;
      const movers = this.movers(
        p,
        p.team,
        this.stat(p, "sensorPortable", "radius"),
      );
      if (!movers.length) continue;
      p.sensorAlert = this.stat(p, "sensorPortable", "rearm");
      for (const q of movers)
        this.reveal(p.team, q, this.stat(p, "sensorPortable", "reveal"));
      this.notify("Worn sensor: movement close by.", p.team);
    }
  }
  // Keeping an opponent's deployed device (real or decoy) in view: a
  // sentinel destroys it; an infiltrator only marks it for their team (the
  // disarming tool is how infiltrators remove one). Portable gadgets are
  // carried, so there is nothing to spot.
  spotDevices(dt) {
    for (const p of Object.values(this.players)) {
      if (!p.alive || p.camera || p.blind > 0) continue;
      for (const g of this.gadgets) {
        // Never your own device, even one placed for the other side in training.
        if (!g.active || g.team === p.team || g.owner === p.id) continue;
        const marks = p.team === "attacker";
        if (marks && g.marked) continue;
        const key = p.id + ":" + g.id,
          point = g.b
            ? {
                x: (g.x + g.b.x) / 2,
                y: (g.y + g.b.y) / 2,
                z: (g.z + g.b.z) / 2,
              }
            : { x: g.x, y: g.y + 0.1, z: g.z },
          seen =
            distance(p, point) < CONFIG.spotRange &&
            this.inCone(p, point, CONFIG.spotAngle) &&
            clearSight(this.eye(p), point, this.smokes, p.team);
        this.spots[key] = seen ? (this.spots[key] || 0) + dt : 0;
        if (this.spots[key] < (marks ? CONFIG.markSeconds : CONFIG.spotSeconds))
          continue;
        delete this.spots[key];
        if (marks) {
          g.marked = true;
          this.notify(
            `${GADGETS[baseOf(g.kind)].name} marked. Disarm it, or go around.`,
            p.team,
          );
          continue;
        }
        g.active = false;
        this.notify("Device spotted and destroyed.", p.team);
        this.notify(
          `Your ${GADGETS[baseOf(g.kind)].name.toLowerCase()} was spotted and destroyed.`,
          g.team,
        );
      }
    }
  }
  // A sentinel watching a camera feed tags an intruder kept in frame:
  // outlined for their side for a few seconds. Jammed or flashed cameras
  // can't; a cloak slows it like it slows detection.
  cameraTags(dt) {
    for (const p of Object.values(this.players)) {
      const g =
        p.alive &&
        p.camera &&
        this.gadgets.find((x) => x.id === p.camera && x.active);
      for (const a of Object.values(this.players)) {
        if (a.team === p.team) continue;
        const key = `${p.id}:${a.id}`;
        const lens = g && {
            x: g.x - Math.sin(g.yaw) * Math.cos(g.pitch || 0) * 0.3,
            y: g.y + Math.sin(g.pitch || 0) * 0.3,
            z: g.z - Math.cos(g.yaw) * Math.cos(g.pitch || 0) * 0.3,
          },
          inFrame =
            g &&
            a.alive &&
            !g.jammed &&
            !(g.flashed > 0) &&
            distance(lens, a) < CONFIG.cameraRange &&
            // Any part of them in frame and in clear sight.
            this.bodyPoints(a).some(
              (t) =>
                facing(lens, g.yaw, g.pitch || 0, t, CONFIG.cameraTagAngle) &&
                clearSight(lens, t, this.smokes, g.team),
            );
        this.camTags[key] = inFrame
          ? (this.camTags[key] || 0) + dt * (a.cloak > 0 ? a.cloakRate : 1)
          : 0;
        if (this.camTags[key] < CONFIG.cameraTagSeconds) continue;
        this.camTags[key] = 0;
        this.reveal(p.team, a, CONFIG.cameraRevealSeconds);
        this.notify("Camera tagged the intruder.", p.team);
      }
    }
  }
  eye(p) {
    return {
      x: p.x,
      y: p.y + eyeHeight(p),
      z: p.z,
    };
  }
  inCone(p, t, angle = CONFIG.detectionAngle) {
    const a = this.eye(p),
      dx = t.x - a.x,
      dy = (t.y ?? 1) - a.y,
      dz = t.z - a.z,
      len = Math.hypot(dx, dy, dz) || 1;
    return (
      (-Math.sin(p.yaw) * Math.cos(p.pitch) * dx +
        Math.sin(p.pitch) * dy -
        Math.cos(p.yaw) * Math.cos(p.pitch) * dz) /
        len >
      Math.cos(angle)
    );
  }
  canCapture(d, a) {
    if (!d.alive || !a.alive || d.camera) return false;
    if (Math.hypot(d.x - a.x, d.y - a.y, d.z - a.z) > CONFIG.captureDistance)
      return false;
    // Physical capture requires a clear path, but smoke does not prevent contact.
    return clearShot(
      { x: d.x, y: d.y + 0.5, z: d.z },
      { x: a.x, y: a.y + 0.5, z: a.z },
    );
  }
  canDetect(d, a) {
    if (
      !d.alive ||
      !a.alive ||
      d.camera ||
      d.blind > 0 ||
      distance(d, a) > CONFIG.detectionRange
    )
      return false;
    // Any part of them counts, not just the head: near the centre of your
    // view and in clear sight.
    const eye = this.eye(d);
    return this.bodyPoints(a).some(
      (t) => this.inCone(d, t) && clearSight(eye, t, this.smokes, d.team),
    );
  }
  // Points down a player's body, head to knees, for their current stance.
  // What a shot can hit: an upright cylinder a little wider than the
  // collision radius (arms, and a little slack for the view lagging the
  // server), from the floor to just over the head.
  bodyShape(p) {
    return {
      shape: "cylinder",
      x: p.x,
      z: p.z,
      w: (CONFIG.playerRadius + 0.08) * 2,
      bottom: p.y,
      h: p.y + eyeHeight(p) + 0.2,
    };
  }
  bodyPoints(p) {
    const top = eyeHeight(p);
    return [1, 0.72, 0.45, 0.2].map((f) => ({
      x: p.x,
      y: p.y + top * f,
      z: p.z,
    }));
  }
  // The scripted opponent: see server/bot.js.
  bot(p, dt) {
    runBot(this, p, dt);
  }
  // Mark a spot for your side. The client aims (its view is the truth for
  // where you're looking); the server keeps it in the arena, one per player.
  ping(p, { x, y, z }) {
    if (![x, y, z].every(Number.isFinite) || !p.alive) return;
    if (this.phase === "results") return;
    const now = this.clock || 0;
    if (now - (p.lastPing ?? -1) < 0.25) return;
    p.lastPing = now;
    this.useLevel();
    const spot = {
        x: clamp(x, -BOUNDS.x, BOUNDS.x),
        y: clamp(y, 0, 12),
        z: clamp(z, -BOUNDS.z, BOUNDS.z),
      },
      mine = this.pings.find((g) => g.owner === p.id);
    this.pings = this.pings.filter((g) => g.owner !== p.id);
    // Pinging your own marker again clears it.
    if (mine && distance(mine, spot) < 1.5) return;
    this.pings.push({
      id: this.nextId++,
      owner: p.id,
      team: p.team,
      ...spot,
      remaining: CONFIG.pingSeconds,
    });
  }
  // The route this bot takes this round (picked at random when it starts).
  // On a map with terminals, it also picks one of them at random.
  botPlan(p) {
    const routes = MAPS[this.map].botRoutes;
    p.route ??= Math.floor(Math.random() * routes.length);
    p.goal ??= Math.floor(Math.random() * OBJECTIVES.length);
    const r = routes[p.route % routes.length],
      site = OBJECTIVES[p.goal % OBJECTIVES.length],
      first = (r.points || r.vias)[0],
      // From a spawn room, leave by the hallway toward the route's lane.
      exit = MAPS[this.map].spawnRoom?.exits.reduce((best, e) =>
        Math.abs(e.x - first.x) < Math.abs(best.x - first.x) ? e : best,
      );
    return {
      name: r.name,
      vias: !!r.vias,
      site,
      // A terminal is a solid console: stop on its near (south) side.
      points: [
        ...(exit ? [{ x: exit.x, z: exit.z }] : []),
        ...(r.points || r.vias),
        site.terminal ? { x: site.x, z: site.z + 1.2 } : site,
      ],
    };
  }
  // Toward a via point: a walled-around path, replanned from where the bot
  // stands every second so a clipped corner never strands it.
  botStep(p, goal, dt) {
    p.pathAge = (p.pathAge || 0) + dt;
    const moved = !p.pathGoal || distance(p.pathGoal, goal) > 0.5;
    if (!p.path?.length || p.pathAge > 1 || moved) {
      p.pathGoal = { x: goal.x, z: goal.z };
      // Pressed against a wall, no path starts here: keep the last one.
      p.path = decoyPath(p, goal) || p.path || [goal];
      p.pathAge = 0;
    }
    while (p.path.length > 1 && distance(p, p.path[0]) < 0.2) p.path.shift();
    return p.path[0];
  }
  snapshot(id) {
    this.useLevel();
    const me = this.players[id];
    if (me) this.rememberSlots(me);
    return {
      code: this.code,
      solo: this.solo,
      canRestart: this.solo || id === Object.keys(this.players)[0],
      training: this.training,
      noBot: !!this.noBot,
      rule: this.rule,
      botLevel: this.botLevel,
      map: this.map,
      // Where to capture, and how many it takes. Both sides know which
      // terminals are spent; only the infiltrators (and training) see how
      // far along each of the others is.
      needed: objectivesNeeded(),
      objectiveMode: this.plantMode ? "plant" : "extract",
      // A party minigame: its half, results so far and progress.
      party: this.party ? partyView(this, me) : null,
      // A planted uplink: both sides know where, and how long it has left.
      uplink: this.uplink,
      objectives: OBJECTIVES.map((o) => ({
        id: o.id,
        name: o.name,
        terminal: !!o.terminal,
        // In a party game, every terminal but the Gauntlet's one is out.
        done: this.party
          ? o.id !== this.party.site
          : this.extracted.includes(o.id),
        progress:
          me?.team === "attacker" || this.training
            ? this.progress[o.id] || 0
            : undefined,
      })),
      // Training: what the scripted opponent will carry (yours to choose).
      botLoadout: this.training
        ? this.botLoadout[this.botPlayer?.team] || {}
        : undefined,
      phase: this.phase,
      time: this.time,
      result: this.result,
      stats: this.stats,
      debug: this.debug,
      tuningMode: this.tuningMode,
      me: me
        ? {
            ...me,
            input: undefined,
            spotting: Math.max(
              0,
              ...Object.entries(this.spots)
                .filter(([k]) => k.startsWith(me.id + ":"))
                .map(
                  ([, v]) =>
                    v /
                    (me.team === "attacker"
                      ? CONFIG.markSeconds
                      : CONFIG.spotSeconds),
                ),
            ),
            cameraTag: Math.max(
              0,
              ...Object.entries(this.camTags)
                .filter(([k]) => k.startsWith(me.id + ":"))
                .map(([, v]) => v / CONFIG.cameraTagSeconds),
            ),
          }
        : null,
      // Opponents currently outlined for this player's team. Training shows
      // both sides' reveals, like its alerts (not Splash, where everyone glows).
      revealed: Object.keys({
        ...this.reveals[me?.team],
        ...(this.training && !this.kid ? this.reveals.attacker : {}),
        ...(this.training && !this.kid ? this.reveals.defender : {}),
      }),
      // Before the round, only your own side, plus (on a map with a spawn
      // room) anyone in clear sight of you: infiltrators look out through
      // its one-way glass; sentinels can't see in.
      players: Object.values(this.players)
        .filter(
          (p) =>
            !this.preRound() ||
            !me ||
            p.team === me.team ||
            (!!MAPS[this.map].spawnRoom &&
              clearSight(this.eye(me), this.eye(p), [], me.team)),
        )
        .map((p) => ({
          id: p.id,
          team: p.team,
          avatar: p.avatar,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw:
            this.party?.kind === "sprinklers" ? (p.sprinklerFace ?? 0) : p.yaw,
          pitch: p.pitch,
          crouch: p.crouch,
          prone: p.prone,
          noise: p.noise,
          moveSpeed: p.moveSpeed,
          grounded: p.grounded,
          onLadder: p.onLadder,
          alive: p.alive,
          cloaked: p.cloak > 0,
          bot: p.bot,
          // How many hits they've taken (the droplets over them in Splash).
          hits: p.hits || 0,
          // A splashed bot running away (Splash).
          fleeing: p.bot && p.fleeUntil > (this.clock || 0),
          // A bot's "?" (something caught its eye) or "!" (it's seen you).
          alert: p.bot ? p.brain?.alert || null : undefined,
          equipped: p.equipped,
          ready: p.ready,
        })),
      gadgets: this.gadgets.map((g) => {
        // Your side's decoys are drawn a shade darker so you know which are
        // fake; to opponents they look exactly like the real thing.
        const item = {
          ...g,
          tone:
            isDecoy(g.kind) && (g.team === me?.team || this.training)
              ? DECOY_TONE
              : 1,
        };
        // Only the side that marked a device (infiltrators) sees the mark.
        if (me?.team === "defender" && !this.training) delete item.marked;
        if (g.team !== me?.team && !this.training) {
          // Tuning is private: opponents only see what the device looks like.
          delete item.owner;
          delete item.stats;
          if (isDecoy(item.kind))
            item.kind = variantsOf(baseOf(item.kind)).find(
              (k) => !isDecoy(k) && !isPortable(k),
            );
        }
        return item;
      }),
      decoys: this.decoys
        .filter((d) => d.active)
        .map((d) => {
          const { program, path, ...actor } = d;
          if (d.owner !== id) {
            delete actor.mark;
            delete actor.step;
            delete actor.cycle;
            delete actor.status;
            delete actor.owner;
          }
          return actor;
        }),
      smokes: this.smokes,
      flashes: this.flashes,
      pulses: this.pulses,
      noises: this.noises,
      openDoors: [...this.openDoors],
      splashes: this.splashes,
      kid: this.kid,
      // Pings are for your own side only.
      pings: this.pings.filter((g) => g.team === me?.team),
      // Thrown gadgets are visible to everyone while in flight.
      // In flight a decoy looks exactly like the real thing.
      projectiles: this.projectiles.map(({ id, kind, x, y, z, color }) => ({
        id,
        kind: baseOf(kind),
        x,
        y,
        z,
        // A water balloon's colour.
        color,
      })),
      pairs: this.pairs,
      // Training shows both sides' alerts, e.g. your own sensor's motion report.
      events: this.events.filter(
        (e) => this.training || !e.team || e.team === me?.team,
      ),
    };
  }
}
