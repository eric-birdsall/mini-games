export const CONFIG = {
  tickRate: 30,
  credits: 1000,
  prepSeconds: 45,
  roundSeconds: 240,
  detectionSeconds: 3,
  captureDistance: 1.5, // Removed mode: automatic physical capture radius (meters).
  detectionRange: 24,
  detectionAngle: (12 * Math.PI) / 180,
  captureSeconds: 5,
  captureRadius: 2.5,
  // Maps with data terminals (three; extracting objectivesToWin of them
  // wins): hold to extract for terminalSeconds. Progress stays on the
  // terminal when you let go.
  // The sentinels hear which terminal is being worked terminalAlertDelay
  // seconds after someone starts, at most once per terminalAlertGap seconds.
  terminalSeconds: 8,
  terminalAlertDelay: 1.5,
  terminalAlertGap: 6,
  objectivesToWin: 2,
  // Plant & defend (objectiveMode "plant", from ?objective=plant): the
  // infiltrator holds plantSeconds at a terminal to plant an uplink, once a
  // round; the sentinels then have uplinkSeconds to hold defuseSeconds at it.
  // Both holds reset on release. "extract" is the usual game.
  objectiveMode: "extract",
  plantSeconds: 3,
  uplinkSeconds: 35,
  defuseSeconds: 6,
  walkSpeed: 3.5,
  sprintSpeed: 5.5,
  crouchSpeed: 1.8,
  proneSpeed: 0.65,
  proneEye: 0.3,
  proneHoldMs: 450,
  standingEye: 1.65,
  crouchEye: 0.8,
  playerRadius: 0.32,
  jumpSpeed: 5,
  clamberHeight: 2.6,
  // Vaulting a railing or half wall: the landing behind may be at most this
  // far below its top.
  vaultDrop: 1.2,
  clamberReach: 1,
  // Climbing speed on a builder ladder (m/s).
  ladderSpeed: 2.2,
  // How far a builder door opening or shutting is heard (m).
  doorNoiseRange: 9,
  clamberHoldSeconds: 0.2,
  // Sliding: crouch while sprinting forward. Starts at slideBoost × sprint
  // speed and eases out to walking pace over slideSeconds; then a short
  // cooldown.
  // Field of view. Holding aim (right mouse / LT) with a throwable shows its
  // arc; it doesn't zoom.
  // Splash (kid-friendly): water balloons fly about balloonRange on flat
  // ground; wherever one bursts (on someone or the ground) it soaks anyone
  // within splashRadius;
  // splashHits soak you out. A burst is heard splashHearing away, a throw
  // throwHearing away.
  balloonRange: 20,
  splashRadius: 2,
  splashHits: 3,
  splashHearing: 18,
  // A splashed bot runs away for this many seconds.
  splashFlee: 2.5,
  // Every splashGlowEvery seconds of the round, everyone glows through walls
  // to the other side for splashGlowSeconds, so finding someone is easy.
  splashGlowEvery: 12,
  splashGlowSeconds: 3,
  throwHearing: 8,
  fov: 68,
  // Wall running: sprint and jump beside a long, tall wall while moving
  // roughly along it (within wallRunAngle) and holding forward. You run
  // along it at wallRunSpeed for up to wallRunSeconds, carrying up to
  // wallRunRise of the jump's upward speed then sinking at up to
  // wallRunSink, and it's as loud as a sprint. Jump to kick off: up, away from
  // the wall and forward; that allows one more run on another wall before
  // you land. One run per jump otherwise.
  wallRunSpeed: 4.5,
  wallRunSeconds: 1.2,
  wallRunReach: 0.5,
  wallRunAngle: (35 * Math.PI) / 180,
  wallRunRise: 2.5,
  wallRunSink: 1.4,
  wallKickPush: 6,
  wallKickSeconds: 0.4,
  slideSeconds: 0.8,
  slideBoost: 1.25,
  slideCooldown: 1,
  clamberSeconds: 0.5,
  gravity: 15,
  trapSeconds: 5,
  scanSeconds: 1.5,
  scanRange: 12,
  disarmSeconds: 0.5,
  smokeSeconds: 8,
  smokeRadius: 4,
  jammerSeconds: 6,
  jammerRadius: 10,
  sensorRadius: 7,
  cameraRange: 28,
  // A viewer can pan a camera this far either side of where it's mounted;
  // panning whirs audibly for a moment after each move.
  cameraPanYaw: 1.05,
  cameraPanPitch: [-0.75, 0.3],
  cameraPanSound: 0.25,
  // Pings: a marked spot only your own side sees, for this many seconds.
  // Each player has one at a time; pinging next to it clears it.
  pingSeconds: 12,
  pingRange: 80,
  spawnProtection: 4,
  // Before the round (buy phase and preparation) a solid gate stands just
  // north of the infiltrators' staging line, so no one can see across, and
  // in preparation sentinels stay this far north of it.
  prepGap: 8,
  decoyMaxSteps: 12,
  decoyLifetime: 90,
  decoyMarkRange: 40,
  // Keeping an opponent's deployed device (real or decoy) in view, within
  // spotRange and near the centre of your view: sentinels destroy an
  // infiltrator's device after spotSeconds; infiltrators mark a sentinel's
  // device after markSeconds (only the disarming tool removes it).
  spotRange: 15,
  spotAngle: (10 * Math.PI) / 180,
  spotSeconds: 2,
  markSeconds: 1,
  // A flashbang blinds someone turned away from the burst for this share of
  // its blind time.
  flashAwayFactor: 0.4,
  // Watching a camera feed, keep an intruder in frame (within this half-angle
  // of where it points, in range and clear sight) for cameraTagSeconds to
  // outline them for your side for cameraRevealSeconds.
  cameraTagAngle: (28 * Math.PI) / 180,
  cameraTagSeconds: 1.5,
  cameraRevealSeconds: 4,
  // The highest wire (above your footing) a running jump clears; anything
  // higher can't be jumped (measured in tests). A wire that catches someone
  // outlines them for the sentinels for wireRevealSeconds.
  wireJumpHeight: 0.55,
  // A shutter lock's panel height above the floor it was placed from.
  shutterHeight: 2.8,
  wireRevealSeconds: 3,
  sensorPulseSeconds: 2,
  // A thrown pulse sensor sweeps this long after it lands.
  pulseDelay: 1,
  maxPlayers: 2,
  playersPerTeam: 1,
};
// Some gadgets come in types. Each type is its own item with its own price,
// stock and upgrades; `base` groups them into one row in the buy screen.
//   deployable: placed or thrown; opponents can spot and destroy it.
//   portable:   carried on you; can't be destroyed, so its stats are lower.
//   decoy:      a fake deployable, ~5% darker, with no effect.
export const GADGETS = {
  balloon: {
    name: "Water balloon",
    short: "BAL",
    team: "both",
    modeWeapon: true,
    cost: 0,
    // Never runs out: throwing doesn't use it up.
    limit: 1,
    cooldown: 0.7,
    description:
      "Unlimited water balloons, one every 0.7 s. Three splashes and they're soaked.",
  },
  // Hot Potato (shared/party.js): the smoke grenade in your hand, picked up
  // off the court, never bought. Fire throws it.
  potato: {
    name: "Hot Potato",
    short: "SPUD",
    team: "both",
    modeWeapon: true,
    cost: 0,
    limit: 1,
    cooldown: 0.2,
    description:
      "Walk over the potato to pick it up. Toss it across before it sneezes confetti!",
  },
  actorDecoy: {
    name: "Programmable decoy",
    short: "ACT",
    category: "Deception",
    team: "both",
    cost: 200,
    limit: 3,
    cooldown: 1,
    description:
      "Program actions in the buy phase. Aim at the ground and trigger to set its mark and run the sequence.",
  },
  smoke: {
    name: "Smoke Puff",
    short: "SMK",
    category: "Concealment",
    team: "both",
    cost: 250,
    limit: 3,
    duration: 8,
    cooldown: 1,
    description:
      "Throw it: a smoke screen where it lands. Breaks visual detection.",
  },
  scanner: {
    name: "Portable scanner",
    short: "SCN",
    category: "Reconnaissance",
    team: "attacker",
    cost: 300,
    limit: 1,
    duration: 1.5,
    cooldown: 4,
    reusable: true,
    description: "Sweep ahead for electronic signatures. Decoys read as real.",
  },
  disarm: {
    name: "Disarming tool",
    short: "DSR",
    category: "Countermeasure",
    team: "attacker",
    cost: 150,
    limit: 1,
    duration: 0.5,
    cooldown: 0,
    reusable: true,
    description:
      "The only way to remove a sentinel's device: hold E close to it to destroy it. Looking at a device only marks it.",
  },
  cloak: {
    name: "Cloak",
    short: "CLK",
    category: "Concealment",
    team: "attacker",
    cost: 350,
    limit: 1,
    cooldown: 0,
    reusable: true,
    description:
      "Shimmer nearly out of sight for a few seconds: sentinels take far longer to identify you. Sprinting, raising the flag or using a gadget drops it. Motion sensors still notice you.",
  },
  jammer: {
    name: "Signal jammer",
    short: "JAM",
    category: "Countermeasure",
    team: "attacker",
    base: "jammer",
    type: "deployable",
    cost: 300,
    limit: 2,
    duration: 6,
    cooldown: 1,
    description:
      "Throw it to jam cameras and sensors near where it lands. Can be spotted and destroyed.",
  },
  jammerPortable: {
    name: "Portable jammer",
    short: "PJM",
    category: "Countermeasure",
    team: "attacker",
    base: "jammer",
    type: "portable",
    cost: 300,
    limit: 1,
    cooldown: 0,
    reusable: true,
    description:
      "Worn. Jams devices close around you for a few seconds, then recharges. Can't be destroyed.",
  },
  shutter: {
    name: "Door Stopper",
    short: "SHT",
    category: "Trap",
    team: "both",
    cost: 250,
    limit: 2,
    cooldown: 0.5,
    description:
      "Pick a wall on each side of a doorway to close it for a little while. Wait for it to open, or splash it with a water balloon.",
  },
  noisemaker: {
    name: "Noisemaker",
    short: "NSM",
    category: "Deception",
    team: "attacker",
    cost: 100,
    limit: 3,
    cooldown: 1,
    description:
      "Throw it: where it lands, it makes running footsteps for a few seconds. A cheap lure that pulls attention away from you.",
  },
  flashbang: {
    name: "Glitter Popper",
    short: "FLS",
    category: "Countermeasure",
    team: "both",
    cost: 300,
    limit: 2,
    cooldown: 1,
    description:
      "Toss it for a bright glittery pop that briefly dazzles anyone looking at it. Everyone nearby can hear the pop.",
  },
  tripwire: {
    name: "Tripwire trap",
    short: "TRP",
    category: "Trap",
    team: "defender",
    base: "tripwire",
    type: "deployable",
    cost: 300,
    limit: 3,
    duration: 5,
    cooldown: 0.5,
    description:
      "Click one anchor, then a second in sight of it. Immobilizes an intruder who crosses.",
  },
  tripwireDecoy: {
    name: "Decoy tripwire",
    short: "DTW",
    category: "Deception",
    team: "defender",
    base: "tripwire",
    type: "decoy",
    cost: 100,
    limit: 4,
    cooldown: 0.5,
    description:
      "Anchored like a real tripwire, nearly identical. Restrains no one.",
  },
  camera: {
    name: "Surveillance camera",
    short: "CAM",
    category: "Reconnaissance",
    team: "defender",
    base: "camera",
    type: "deployable",
    cost: 350,
    limit: 2,
    cooldown: 0.5,
    description:
      "Place on a wall. Press B for the live feed. Infiltrators can mark it by sight, but only a disarming tool removes it.",
  },
  cameraPortable: {
    name: "Mirror pole",
    short: "MIR",
    category: "Reconnaissance",
    team: "both",
    base: "camera",
    type: "portable",
    cost: 150,
    limit: 1,
    cooldown: 0.3,
    reusable: true,
    description:
      "A mirror on an extension pole. Peek around corners while you stay behind cover.",
  },
  cameraDecoy: {
    name: "Decoy camera",
    short: "DCM",
    category: "Deception",
    team: "defender",
    base: "camera",
    type: "decoy",
    cost: 100,
    limit: 2,
    cooldown: 0.5,
    description: "Mounted like a real camera, nearly identical. No feed.",
  },
  sensor: {
    name: "Motion sensor",
    short: "SNS",
    category: "Surveillance",
    team: "defender",
    base: "sensor",
    type: "deployable",
    cost: 300,
    limit: 3,
    cooldown: 0.5,
    description:
      "A floor device. Movement in range sets it off and outlines intruders through walls.",
  },
  // Thrown motion sensor: one pulse a second after it lands. Both sides.
  pulse: {
    name: "Peek-a-Boo Ball",
    short: "PLS",
    category: "Reconnaissance",
    team: "both",
    cost: 250,
    limit: 2,
    cooldown: 1,
    description:
      "Throw it: a second after it lands it sends out one pulse. Anyone from the other side within its radius is outlined through walls for your side for a few seconds. They hear it and are told they were swept.",
  },
  sensorPortable: {
    name: "Worn motion sensor",
    short: "WSN",
    category: "Surveillance",
    team: "defender",
    base: "sensor",
    type: "portable",
    cost: 250,
    limit: 1,
    cooldown: 0,
    reusable: true,
    description:
      "Active while equipped: movement close around you outlines intruders. Can't be destroyed.",
  },
};
// Every game uses the same four backpack gadgets. Legacy definitions above
// remain for world obstacles and simulation compatibility, never for packing.
export const SPLASH_GADGETS = ["smoke", "flashbang", "pulse", "shutter"];
// Rules played with water balloons: Splash (kid-friendly, always training)
// and Soak (a real match, every gadget; Plant and the party games).
export const wetRule = (rule) => rule === "splash" || rule === "soak";
export const RULES = ["seen", "soak", "splash", "removed"];
// The old Shoot rule is gone: anything still asking for it gets Soak.
export const ruleOf = (rule) =>
  rule === "shoot" ? "soak" : RULES.includes(rule) ? rule : "seen";
export const allowed = (rule, kind) =>
  !!GADGETS[kind]?.modeWeapon || SPLASH_GADGETS.includes(kind);
export const SPAWNS = { attacker: { x: 0, z: 23 }, defender: { x: 0, z: -18 } };
export const OBJECTIVE = { x: 0, z: -12 };
// What the infiltrator can capture on the active map: its terminals, or
// otherwise its one flag (at OBJECTIVE). Set by useMap.
export const OBJECTIVES = [{ id: "flag", name: "Flag", x: 0, z: -12 }];
// How many objectives the infiltrators must take to win: two of three, or
// one where a map has fewer (a flag, or an older two-terminal custom map).
export const objectivesNeeded = () =>
  OBJECTIVES.length >= 3 ? CONFIG.objectivesToWin : 1;

// Deliberately audible audition gains. Stationary prone is always silent.
export const MOVEMENT_AUDIO = {
  master: 0.8,
  // Footsteps at about a third of their old (audition) levels.
  crawl: { gain: 0.05, interval: 0.7, duration: 0.32, cutoff: 800 },
  crouch: { gain: 0.08, interval: 0.62, duration: 0.18, cutoff: 1100 },
  walk: { gain: 0.14, interval: 0.46, duration: 0.14, cutoff: 1600 },
  sprint: { gain: 0.22, interval: 0.3, duration: 0.13, cutoff: 2400 },
};
