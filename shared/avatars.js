// The picker shows the "Pop" collectible-vinyl-figure characters
// (tools/make_pops.mjs) and the Dog, which is already Pop-shaped. The
// original pack critters are kept as hidden "classic-" characters.
export const CHARACTERS = {
  frog: { name: "Frog" },
  chick: { name: "Chick" },
  axolotl: { name: "Axolotl" },
  bear: { name: "Bear" },
  bunny: { name: "Bunny" },
  capybara: { name: "Capybara" },
  cat: { name: "Cat" },
  dragon: { name: "Dragon" },
  fox: { name: "Fox" },
  owl: { name: "Owl" },
  panda: { name: "Panda" },
  penguin: { name: "Penguin" },
  pig: { name: "Pig" },
  raccoon: { name: "Raccoon" },
  "red-panda": { name: "Red Panda" },
  shiba: { name: "Shiba" },
  squirrel: { name: "Squirrel" },
  giraffe: { name: "Giraffe" },
  astronaut: { name: "Astronaut" },
  baby: { name: "Baby" },
  shark: { name: "Shark" },
  dog: { name: "Dog" },
  "classic-frog": { name: "Frog", hidden: true },
  "classic-chick": { name: "Chick", hidden: true },
  "classic-axolotl": { name: "Axolotl", hidden: true },
  "classic-bear": { name: "Bear", hidden: true },
  "classic-bunny": { name: "Bunny", hidden: true },
  "classic-capybara": { name: "Capybara", hidden: true },
  "classic-cat": { name: "Cat", hidden: true },
  "classic-dragon": { name: "Dragon", hidden: true },
  "classic-fox": { name: "Fox", hidden: true },
  "classic-owl": { name: "Owl", hidden: true },
  "classic-panda": { name: "Panda", hidden: true },
  "classic-penguin": { name: "Penguin", hidden: true },
  "classic-pig": { name: "Pig", hidden: true },
  "classic-raccoon": { name: "Raccoon", hidden: true },
  "classic-red-panda": { name: "Red Panda", hidden: true },
  "classic-shiba": { name: "Shiba", hidden: true },
  "classic-squirrel": { name: "Squirrel", hidden: true },
  "classic-giraffe": { name: "Giraffe", hidden: true },
  "classic-astronaut": { name: "Astronaut", hidden: true },
  "classic-baby": { name: "Baby", hidden: true },
  "classic-shark": { name: "Shark", hidden: true },
};
/** Every character, hidden ones included. */
export const ALL_CHARACTERS = Object.keys(CHARACTERS);
/** The characters players can pick. */
export const AVATARS = ALL_CHARACTERS.filter((id) => !CHARACTERS[id].hidden);

export const COLORS = {
  sunshine: "#ffb347",
  sky: "#5cc8ff",
  rose: "#ef8db5",
  mint: "#80d5ad",
  violet: "#aa94e8",
};

export function avatarChoice(value) {
  return {
    character: AVATARS.includes(value?.character)
      ? value.character
      : AVATARS[0],
    color: Object.hasOwn(COLORS, value?.color) ? value.color : "sunshine",
  };
}
