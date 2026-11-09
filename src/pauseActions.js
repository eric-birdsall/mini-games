const svg = (path) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const pauseBar = (game) => `<div class="game-pause-bar">
  <div class="pause-actions">
    <button type="button" data-pause-home aria-label="Home" title="Return to Home">${svg('<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>')}</button>
    <button type="button" data-pause-restart aria-label="Restart" title="Restart">${svg('<path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6"/>')}</button>
  </div>
  <span class="brand"><span class="brand-mark">M<span></span></span>MINI GAMES</span>
  <span class="game-pause-name">${game}</span>
</div>`;

// Standalone modes use the same card layout as the arena pause screen.
export const pauseScreen = (game, instructions) => `
  <section class="game-pause" data-game-pause aria-label="${game} paused" hidden>
    ${pauseBar(game)}
    <div class="game-pause-card lock-card">
      <div class="eyebrow">GAME ON</div>
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
