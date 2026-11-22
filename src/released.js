// Games released to the kids, a few at a time. A grown-up picks them on the
// Home Screen links page (play/, behind GROWN_UP_CODE); the list is kept in
// this device's localStorage. Until one is picked, only these are released.
// On an iPad each Home Screen icon has its own storage, so release games from
// inside the installed app (its HOME SCREEN LINKS button), not from Safari.
export const DEFAULT_RELEASED = ["bigbadburger"];
export const RELEASED_KEY = "minigames.released";
// Typed on the links page's keypad to show every game and change which are
// released. Not real security: just enough to keep a young child out.
export const GROWN_UP_CODE = "2580";

export function releasedGames() {
  try {
    const saved = JSON.parse(localStorage.getItem(RELEASED_KEY));
    if (Array.isArray(saved))
      return saved.filter((id) => typeof id === "string");
  } catch {}
  return [...DEFAULT_RELEASED];
}
export function saveReleasedGames(ids) {
  try {
    localStorage.setItem(RELEASED_KEY, JSON.stringify([...new Set(ids)]));
  } catch {}
}

// Set by the game list (play/) when a game is opened from it, so that game's
// Back and Mini Games logo return to the list instead of the full menu.
export const FROM_LIST_KEY = "minigames.fromList";

// The kids' menu shows only the released games (no Work in Progress, no
// search), on the dev server too. ?all shows every game; so does typing
// "all" on the kids' game screen, until the app or tab is closed
// (SHOW_ALL_KEY).
export const SHOW_ALL_KEY = "minigames.showAll";
export function showAllGames(search = location.search) {
  const params = new URLSearchParams(search);
  if (params.has("kids")) return false;
  if (params.has("all")) return true;
  try {
    return sessionStorage.getItem(SHOW_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

// Games still being built: they sit behind the menu's Work in Progress button
// and are tagged WIP on the Home Screen links page.
export const WIP_GAMES = [
  "splash",
  "hotpotato",
  "livewire",
  "toybox",
  "backyardairmail",
  "poolnoodle",
  "applecatch",
  "backyardfling",
  "paperplane",
  "pipecrane",
];

// Games with no touch controls (arena games with WASD + mouse look,
// Slipstream, Loop & Glide): greyed out on a phone or tablet, and tagged
// "Not for mobile" on the Home Screen links page.
export const NEEDS_KEYS = [
  "splash",
  "hotpotato",
  "breakout",
  "boulders",
  "sprinklers",
  "livewire",
  "slipstream",
  "backyardairmail",
];

// ?game=<id or name> opens that game straight away, e.g. ?game=bigbadburger
// or ?game=big-bad-burger. Matching ignores case, spaces and punctuation.
export const squashName = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export const directGame = (search = location.search) =>
  squashName(new URLSearchParams(search).get("game") || "");

// A game's Home Screen link (src/homeLinks.js) lands on the character screen
// with that game picked. Its page names the game in
// <meta name="mini-games-pick">; ?pick=<id or name> does the same anywhere.
export const pickedGame = (search = location.search) =>
  squashName(
    new URLSearchParams(search).get("pick") ||
      document.querySelector('meta[name="mini-games-pick"]')?.content ||
      "",
  );
