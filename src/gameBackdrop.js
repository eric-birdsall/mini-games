// The character screen's backdrop: the picked game's menu screenshot, full
// screen behind the menu, with a gentle parallax. It drifts slowly on its
// own (so a touch screen sees it move too) and leans away from the pointer.
// Hidden on the other home screens, in games, and for games without a
// screenshot; still with prefers-reduced-motion.
export function installGameBackdrop(home) {
  const layer = document.createElement("div"),
    img = document.createElement("img");
  layer.id = "game-backdrop";
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  img.alt = "";
  img.draggable = false;
  layer.append(img);
  home.before(layer);

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let aim = { x: 0, y: 0 },
    at = { x: 0, y: 0 },
    running = false;
  addEventListener(
    "pointermove",
    (e) => {
      aim = {
        x: (e.clientX / innerWidth) * 2 - 1,
        y: (e.clientY / innerHeight) * 2 - 1,
      };
    },
    { passive: true },
  );
  const frame = (now) => {
    if (layer.hidden || still.matches) {
      running = false;
      img.style.transform = "";
      return;
    }
    // A standalone game's overlay covers it: wait without redrawing.
    if (document.querySelector("dialog[open]"))
      return requestAnimationFrame(frame);
    const t = now / 1000;
    at.x += (aim.x - at.x) * 0.05;
    at.y += (aim.y - at.y) * 0.05;
    // Percent of the image's own size; it's drawn 16% oversize, so up to
    // ±7% stays inside the screen.
    const x = -at.x * 4 + Math.sin(t * 0.21) * 2.5,
      y = -at.y * 3 + Math.cos(t * 0.17) * 2;
    img.style.transform = `translate(${x.toFixed(3)}%, ${y.toFixed(3)}%) scale(1.16)`;
    requestAnimationFrame(frame);
  };

  let last = [];
  // Call whenever the screen or game changes.
  function update(screen, gameEntry) {
    last = [screen, gameEntry];
    const src = gameEntry?.querySelector(".map-thumb img")?.src;
    const show = !home.hidden && screen === "character" && !!src;
    if (src && img.src !== src) img.src = src;
    layer.hidden = !show;
    if (show && !running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }
  // Leaving for a game hides #home; coming back shows it again.
  new MutationObserver(() => update(...last)).observe(home, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  return update;
}
