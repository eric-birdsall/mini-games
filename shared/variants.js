// Helpers for gadget types (see GADGETS in config.js).
import { GADGETS } from "./config.js";

export const TYPE_LABELS = {
  deployable: "Deployable",
  portable: "Portable",
  decoy: "Decoy",
};
// Your own side's decoys render this much darker, so you know which are
// fake. Opponents see them exactly like the real device.
export const DECOY_TONE = 0.95;

export const baseOf = (kind) => GADGETS[kind]?.base || kind;
export const typeOf = (kind) => GADGETS[kind]?.type || null;
export const isDecoy = (kind) => typeOf(kind) === "decoy";
export const isPortable = (kind) => typeOf(kind) === "portable";
export const variantsOf = (base) =>
  Object.keys(GADGETS).filter((k) => baseOf(k) === base);
// Placed on a surface by aiming (as opposed to thrown or carried).
export const isPlaced = (kind) =>
  ["tripwire", "shutter", "camera", "sensor"].includes(baseOf(kind)) &&
  !isPortable(kind);
// Decoys use the real deployable's stats, so their reach, timing and pulse
// never give them away.
export const statKind = (kind) =>
  isDecoy(kind)
    ? variantsOf(baseOf(kind)).find((k) => typeOf(k) === "deployable")
    : kind;

// Gadgets the scripted opponent knows how to use, by its role. Placed and
// thrown ones go to its map's spots at the start of the round; portable ones
// it wears or uses whenever ready.
export const BOT_GADGETS = {
  defender: ["smoke"],
  attacker: ["smoke"],
};
// Bots throw smoke when needed; other backpack gadgets are player controlled.
export const BOT_DEFAULT_LOADOUT = {
  defender: {},
  attacker: {},
};
