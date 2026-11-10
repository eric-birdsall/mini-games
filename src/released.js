// Games released to the kids, one at a time. The normal page shows only
// these; add a game's id (its data-game) here to release it.
// Open the page with ?all to see every game, including Work in Progress.
export const RELEASED_GAMES = ["bigbadburger"];

export const showAllGames = (search = location.search) =>
  new URLSearchParams(search).has("all");
