import * as T from "three";

// Each character's own dance, shown only on the menu's character screen
// (the preview there dances instead of walking). Every critter shares one
// rig, so a dance is a pose function of the beat: it sets rotation offsets
// [x, y, z] (radians, from the rest pose) on the bones below and moves the
// whole figure with `y` (hop height, m), `spin` and `roll` (radians) and
// `squash` (vertical scale).
//
// Bone axes (the figure faces +z in its own space): +x on an arm or leg
// swings it backward (−x forward); +z raises arm_L / leg_L out to the side,
// −z raises arm_R / leg_R; head +x nods down, +y turns to its left, z tilts.
// The arms are short: raised much past level (about 1.7) they disappear
// behind the big Pop heads, so "arms up" stays around shoulder height.

const BPM = 112;
// Long enough for every dance to loop at least once (framing samples it).
export const DANCE_BEATS = 8;
const BONES = [
  "hips",
  "head",
  "arm_L",
  "arm_R",
  "leg_L",
  "leg_R",
  "ear_L",
  "ear_R",
  "tail",
];

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
// One full sine cycle per unit.
const wave = (x) => Math.sin(x * TAU);
// 0 → 1 → 0 once per unit, like a bounce.
const hop = (x) => Math.abs(Math.sin(x * Math.PI));
const smooth = (t) => t * t * (3 - 2 * t);
// Both arms out by `a` (positive = up and out on both sides).
const arms = (p, l, r = l) => {
  p.arm_L[2] = l;
  p.arm_R[2] = -r;
};

const DANCES = {
  // Low-gravity float: one slow, high drift up and down, arms out.
  astronaut(b, p) {
    const u = frac(b / 4);
    p.y = 0.3 * Math.sin(Math.PI * u);
    p.spin = 0.5 * wave(b / 8);
    arms(p, 1.2 + 0.25 * wave(b / 4), 1.2 - 0.25 * wave(b / 4));
    p.leg_L[0] = -0.5 * Math.sin(Math.PI * u);
    p.leg_R[0] = 0.35 * Math.sin(Math.PI * u);
    p.head[0] = -0.2;
  },
  // Gill wiggle: quick frond flaps over a lazy side-to-side sway.
  axolotl(b, p) {
    p.hips[2] = 0.22 * wave(b / 2);
    p.head[2] = -0.28 * wave(b / 2);
    p.ear_L[2] = 0.5 * wave(b * 2);
    p.ear_R[2] = -0.5 * wave(b * 2);
    arms(p, 0.6 + 0.3 * wave(b * 2));
    p.y = 0.03 * hop(b);
  },
  // Happy bounce: knees bob on every beat, arms flap up and down.
  baby(b, p) {
    p.squash = 1 - 0.08 * hop(b);
    const a = 0.9 + 0.7 * hop(b);
    arms(p, a);
    p.leg_L[2] = 0.25;
    p.leg_R[2] = -0.25;
    p.head[2] = 0.15 * wave(b / 2);
  },
  // Big bear hug: arms out in front, rocking heavily foot to foot.
  bear(b, p) {
    p.roll = 0.14 * wave(b / 4);
    p.arm_L[0] = p.arm_R[0] = -1.3;
    arms(p, 0.35 + 0.2 * wave(b / 2), 0.35 - 0.2 * wave(b / 2));
    p.head[2] = -0.2 * wave(b / 4);
    p.leg_L[2] = 0.3 * Math.max(0, wave(b / 4));
    p.leg_R[2] = -0.3 * Math.max(0, -wave(b / 4));
  },
  // Bunny hop: two springy hops, ears flopping, paws tucked.
  bunny(b, p) {
    const h = hop(b);
    p.y = 0.24 * h;
    p.ear_L[0] = p.ear_R[0] = 0.6 * h;
    p.arm_L[0] = p.arm_R[0] = -1.1;
    arms(p, -0.2);
    p.leg_L[0] = p.leg_R[0] = 0.5 * h;
    p.spin = 0.4 * wave(b / 8);
  },
  // Too cool to rush: a slow head nod and one lazy wave overhead.
  capybara(b, p) {
    p.head[0] = 0.14 * hop(b);
    p.arm_R[2] = -(1.55 + 0.3 * wave(b / 2));
    p.arm_L[2] = 0.1;
    p.roll = 0.05 * wave(b / 4);
  },
  // Paw swipes, left then right, with a swishing tail.
  cat(b, p) {
    const s = wave(b / 2);
    p.arm_L[0] = -1.5 * Math.max(0, s);
    p.arm_R[0] = -1.5 * Math.max(0, -s);
    p.arm_L[2] = -0.3 * Math.max(0, s);
    p.arm_R[2] = 0.3 * Math.max(0, -s);
    p.hips[1] = 0.35 * s;
    p.head[2] = 0.2 * s;
    p.tail[1] = 0.8 * wave(b);
  },
  // Elbow flaps and a peck on every beat.
  chick(b, p) {
    arms(p, 0.4 + 0.6 * Math.abs(wave(b * 2)));
    p.squash = 1 - 0.07 * hop(b);
    p.head[0] = 0.3 * hop(b);
    p.tail[0] = -0.4 * hop(b * 2);
  },
  // Chasing its tail: round and round, tail wagging hard.
  dog(b, p) {
    p.spin = (TAU * b) / 4;
    p.tail[1] = 1.0 * wave(b * 2);
    p.y = 0.05 * hop(b * 2);
    p.ear_L[2] = 0.3 * hop(b * 2);
    p.ear_R[2] = -0.3 * hop(b * 2);
    p.head[2] = 0.25;
  },
  // Monster stomp: knees up high, claws raised, a roar on the beat.
  dragon(b, p) {
    const s = wave(b / 2);
    p.leg_L[0] = -1.0 * Math.max(0, s);
    p.leg_R[0] = -1.0 * Math.max(0, -s);
    arms(p, 1.5);
    p.arm_L[0] = p.arm_R[0] = -0.6;
    p.head[0] = -0.35 * hop(b);
    p.roll = 0.1 * s;
    p.tail[1] = 0.6 * s;
  },
  // The floss: both arms swing across the body, hips the other way.
  fox(b, p) {
    const f = wave(b);
    p.arm_L[2] = p.arm_R[2] = 0.55 * f;
    p.arm_L[0] = 0.5 * wave(b + 0.25);
    p.arm_R[0] = -0.5 * wave(b + 0.25);
    p.hips[2] = -0.22 * f;
    p.tail[1] = 0.5 * f;
  },
  // Squat... and LEAP, legs kicked out, every two beats.
  frog(b, p) {
    const u = frac(b / 2);
    if (u < 0.5) {
      p.squash = 1 - 0.2 * Math.sin(Math.PI * u * 2);
      arms(p, 0.2);
    } else {
      const air = Math.sin(Math.PI * (u - 0.5) * 2);
      p.y = 0.5 * air;
      p.leg_L[2] = 0.9 * air;
      p.leg_R[2] = -0.9 * air;
      arms(p, 0.2 + 1.45 * air);
    }
  },
  // Neck roll: the head circles while the body sways.
  giraffe(b, p) {
    p.head[0] = 0.3 * Math.cos((TAU * b) / 2);
    p.head[2] = 0.3 * Math.sin((TAU * b) / 2);
    p.hips[2] = -0.1 * wave(b / 2);
    arms(p, 0.3 + 0.2 * wave(b));
  },
  // Head swivel: snap round to one side, then the other, wings flapping.
  owl(b, p) {
    p.head[1] = 1.3 * Math.tanh(4 * wave(b / 4));
    const flap = Math.abs(wave(b));
    arms(p, 0.3 + 0.9 * flap);
    p.y = 0.05 * flap;
  },
  // Roly-poly: rocking right over, side to side, paws waving.
  panda(b, p) {
    p.roll = 0.35 * wave(b / 4);
    arms(p, 1.4 + 0.3 * wave(b), 1.4 - 0.3 * wave(b));
    p.head[2] = -0.2 * wave(b / 4);
  },
  // Waddle: tip side to side, flippers out, slowly turning.
  penguin(b, p) {
    const s = wave(b / 2);
    p.roll = 0.16 * s;
    p.leg_L[2] = 0.25 * Math.max(0, -s);
    p.leg_R[2] = -0.25 * Math.max(0, s);
    arms(p, 0.7 + 0.3 * hop(b * 2));
    p.spin = 0.35 * wave(b / 8);
  },
  // The twist: hips one way, head the other, knees bending.
  pig(b, p) {
    const s = wave(b);
    p.hips[1] = 0.6 * s;
    p.head[1] = -0.5 * s;
    p.leg_L[1] = p.leg_R[1] = -0.4 * s;
    p.squash = 1 - 0.06 * hop(b);
    p.arm_L[0] = p.arm_R[0] = -0.9;
    arms(p, 0.5);
  },
  // Sneaky shimmy: rubbing its paws together, glancing about.
  raccoon(b, p) {
    p.arm_L[0] = p.arm_R[0] = -1.2;
    p.arm_L[2] = -0.35 + 0.15 * wave(b * 2);
    p.arm_R[2] = 0.35 + 0.15 * wave(b * 2);
    p.head[0] = 0.15;
    p.head[1] = 0.35 * wave(b / 4);
    p.hips[2] = 0.1 * wave(b * 2);
    p.tail[1] = 0.4 * wave(b);
  },
  // Surprise! A jump with both arms flung up high, every two beats.
  "red-panda"(b, p) {
    const u = frac(b / 2);
    const up = u < 0.5 ? smooth(u * 2) : smooth(2 - u * 2);
    arms(p, 0.3 + 1.4 * up);
    p.y = 0.16 * Math.sin(Math.PI * Math.min(1, u * 2));
    p.leg_L[2] = 0.3 * up;
    p.leg_R[2] = -0.3 * up;
    p.head[0] = -0.2 * up;
    p.tail[0] = -0.5 * up;
  },
  // Swim dance: fins out stiff and paddling, the body rolling like a wave.
  shark(b, p) {
    arms(p, 1.3);
    p.arm_L[0] = 0.6 * wave(b);
    p.arm_R[0] = -0.6 * wave(b);
    p.hips[2] = 0.25 * wave(b / 2);
    p.roll = 0.12 * wave(b / 2 + 0.25);
    p.head[2] = -0.3 * wave(b / 2);
    p.tail[1] = 0.5 * wave(b);
  },
  // Curious head tilts, a raised paw and a waggly bottom.
  shiba(b, p) {
    p.head[2] = 0.45 * Math.tanh(3 * wave(b / 2));
    p.hips[1] = 0.2 * wave(b * 2);
    p.tail[1] = 1.0 * wave(b * 2);
    p.arm_L[0] = -1.1 - 0.3 * hop(b);
    p.y = 0.03 * hop(b);
  },
  // A quick twirl, then a jittery tail flick, acorn held tight.
  squirrel(b, p) {
    const u = frac(b / 2);
    p.arm_L[0] = p.arm_R[0] = -1.1;
    p.arm_L[2] = -0.2;
    p.arm_R[2] = 0.2;
    if (u < 0.5) {
      p.spin = TAU * smooth(u * 2);
      p.y = 0.12 * Math.sin(Math.PI * u * 2);
    } else p.tail[0] = 0.4 * wave(b * 4);
  },
};

const euler = new T.Euler(),
  offset = new T.Quaternion();

/**
 * Pose `root` (a createAvatar figure) `seconds` into its character's dance.
 * Returns false while the figure is still loading (or has no dance).
 */
export function danceAvatar(root, character, seconds) {
  const rig = root.userData.critter;
  const dance = DANCES[character];
  if (!rig || !dance) return false;
  if (!rig.dance) {
    // Take over from the clips: the rest pose is the starting point.
    rig.mixer.stopAllAction();
    const bones = {};
    rig.model.traverse((node) => {
      if (node.isBone && BONES.includes(node.name) && !bones[node.name])
        bones[node.name] = { node, rest: node.quaternion.clone() };
    });
    rig.dance = bones;
  }
  const pose = { y: 0, spin: 0, roll: 0, squash: 1 };
  for (const name of BONES) pose[name] = [0, 0, 0];
  dance((seconds * BPM) / 60, pose);
  for (const name of BONES) {
    const bone = rig.dance[name];
    if (!bone) continue;
    const [x, y, z] = pose[name];
    bone.node.quaternion
      .copy(bone.rest)
      .multiply(offset.setFromEuler(euler.set(x, y, z)));
  }
  rig.pivot.position.y = pose.y;
  rig.pivot.rotation.set(0, pose.spin, pose.roll);
  // Squash and stretch keep the volume roughly the same.
  const wide = 1 + (1 - pose.squash) * 0.5;
  rig.pivot.scale.set(wide, pose.squash, wide);
  return true;
}

/** Seconds per full loop of the longest dance. */
export const DANCE_SECONDS = (DANCE_BEATS * 60) / BPM;
