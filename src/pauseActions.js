const svg = (path) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const MUSIC_ON = svg(
  '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
);
const MUSIC_OFF = svg(
  '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="m2 2 20 20"/>',
);

// main.js connects these to the menu music and the game list (see
// `connectPauseActions`). Until then the buttons still render.
let pauseHost = { home: () => {}, muted: () => false, setMuted: () => {} };
const musicListeners = new Set();

export const musicMuted = () => pauseHost.muted();
// Games with their own soundtrack (Comet Dash, Pop Patrol) follow the pause
// bar's music button too. Returns an unsubscribe function.
export function onMusicChange(listener) {
  musicListeners.add(listener);
  return () => musicListeners.delete(listener);
}
function showMusic(button, muted) {
  button.innerHTML = muted ? MUSIC_OFF : MUSIC_ON;
  button.setAttribute("aria-pressed", String(!muted));
  button.setAttribute("aria-label", muted ? "Music off" : "Music on");
  button.title = muted ? "Turn music on" : "Turn music off";
}
// Refresh every pause bar's music button, and tell the games.
export function syncMusic() {
  const muted = musicMuted();
  document
    .querySelectorAll("[data-pause-music]")
    .forEach((button) => showMusic(button, muted));
  for (const listener of musicListeners) listener(muted);
}
export function setMusicMuted(muted) {
  pauseHost.setMuted(!!muted);
  syncMusic();
}

// Every pause bar's Home goes back to the game selector, and its music
// button toggles the music. Handled here once, so each game only closes
// its own dialog (its Home handler) and needs no other wiring.
export function connectPauseActions(host) {
  pauseHost = { ...pauseHost, ...host };
  document.addEventListener(
    "click",
    (event) => {
      const music = event.target.closest?.("[data-pause-music]");
      if (music) {
        event.preventDefault();
        event.stopPropagation();
        setMusicMuted(!musicMuted());
        return;
      }
      const home = event.target.closest?.("[data-pause-home]");
      if (!home || home.disabled) return;
      const dialog = home.closest("dialog");
      if (!dialog?.open) {
        setTimeout(() => pauseHost.home());
        return;
      }
      // Wait for the game to close (and clean up) its dialog first.
      const done = () => {
        clearTimeout(timer);
        setTimeout(() => pauseHost.home());
      };
      const timer = setTimeout(
        () => dialog.removeEventListener("close", done),
        2000,
      );
      dialog.addEventListener("close", done, { once: true });
    },
    true,
  );
  syncMusic();
}

export const pauseBar = (game) => {
  const muted = musicMuted();
  return `<div class="game-pause-bar">
  <div class="pause-actions">
    <button type="button" data-pause-home aria-label="Home" title="Back to the games">${svg('<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>')}</button>
    <button type="button" data-pause-restart aria-label="Restart" title="Restart">${svg('<path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6"/>')}</button>
    <button type="button" data-pause-music aria-pressed="${!muted}" aria-label="${muted ? "Music off" : "Music on"}" title="${muted ? "Turn music on" : "Turn music off"}">${muted ? MUSIC_OFF : MUSIC_ON}</button>
  </div>
  <span class="brand"><span class="brand-mark">M<span></span></span>MINI GAMES</span>
  <span class="game-pause-name">${game}</span>
</div>`;
};

// Standalone modes use the same card layout as the arena pause screen.
export const pauseScreen = (
  game,
  instructions,
  { showEyebrow = true } = {},
) => `
  <section class="game-pause" data-game-pause aria-label="${game} paused" hidden>
    ${pauseBar(game)}
    <div class="game-pause-card lock-card">
      ${showEyebrow ? '<div class="eyebrow">GAME ON</div>' : ""}
      <h2>Take your position.</h2>
      <p>Your game is paused.</p>
      <button type="button" class="primary" data-pause-resume>GO PLAY <span aria-hidden="true">→</span></button>
      <details><summary>VIEW HOW TO PLAY ↗</summary><p>${instructions}</p></details>
    </div>
  </section>`;

export function setPauseScreen(root, paused, focusOnResume) {
  const screen = root.querySelector("[data-game-pause]");
  screen.hidden = !paused;
  for (const child of root.children) {
    if (child !== screen) child.inert = paused;
  }
  if (paused) {
    screen.querySelector("details").open = false;
    screen.querySelector("[data-pause-resume]").focus({ preventScroll: true });
  } else {
    focusOnResume?.focus({ preventScroll: true });
  }
}

// Handle Escape before the arena's document shortcuts can cancel the
// browser's default dialog behavior. Keep cancel for native close requests.
export function bindDialogEscape(dialog, onEscape) {
  dialog.dataset.gameKeyboard = "";
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onEscape();
    },
    true,
  );
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    onEscape();
  });
}
