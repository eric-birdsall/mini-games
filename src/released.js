// Games released to the kids, one at a time. The normal page shows every
// game; open it with ?kids to show only these (no Work in Progress, no
// search). Add a game's id (its data-game) here to release it.
export const RELEASED_GAMES = ["bigbadburger"];

export const showAllGames = (search = location.search) =>
  !new URLSearchParams(search).has("kids");

// ?game=<id or name> opens that game straight away, e.g. ?game=bigbadburger
// or ?game=big-bad-burger. Matching ignores case, spaces and punctuation.
export const squashName = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export const directGame = (search = location.search) =>
  squashName(new URLSearchParams(search).get("game") || "");
