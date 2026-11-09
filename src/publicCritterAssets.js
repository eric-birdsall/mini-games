import { AVATARS } from "../shared/avatars.js";

export const CRITTER_ASSETS = Object.fromEntries(
  AVATARS.map((id) => [id, `${import.meta.env.BASE_URL}pops/${id}.glb`]),
);
