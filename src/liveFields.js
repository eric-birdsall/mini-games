// A properties panel that applies as you edit (the 2D planner's and the 3D
// editor's): number fields after a short pause, or at once on Enter, blur or
// the spinner; sliders, colors and checkboxes once a frame. A change that
// can't apply marks its fields invalid and waits; it's retried with the next
// edit, so coupled fields (a window's start and end) can be typed in any
// order. Fields are found by data-prop or data-live = their key.
const PAUSE = 250;

// `read()` gives the panel's values by key; `apply(changes)` returns an error
// or nothing; `onError(text)` / `onApplied()` report; `onDone()` runs when
// focus leaves the panel (the end of one undoable edit).
export function liveFields(panel, { read, apply, onError, onApplied, onDone }) {
  let baseline = {},
    timer = 0,
    frame = 0;
  const field = (key) =>
      panel.querySelector(`[data-prop="${key}"], [data-live="${key}"]`),
    mark = (keys) => {
      for (const el of panel.querySelectorAll("[aria-invalid]"))
        if (!keys.includes(el.dataset.prop ?? el.dataset.live))
          el.removeAttribute("aria-invalid");
      for (const key of keys) field(key)?.setAttribute("aria-invalid", "true");
    };
  function run() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = 0;
    const now = read(),
      changes = Object.fromEntries(
        Object.entries(now).filter(([k, v]) => !Object.is(v, baseline[k])),
      );
    if (!Object.keys(changes).length) return mark([]);
    const error = apply(changes);
    if (error) {
      mark(Object.keys(changes));
      onError(error);
      return;
    }
    baseline = now;
    mark([]);
    onApplied?.();
  }
  const isNumber = (el) => el.type === "number";
  panel.addEventListener("input", (e) => {
    if (!e.target.matches("[data-prop], [data-live]")) return;
    if (isNumber(e.target)) {
      clearTimeout(timer);
      // Half-typed ("3.", "-"): wait for the rest, or Enter / blur.
      if (e.target.validity.badInput) return;
      timer = setTimeout(run, PAUSE);
    } else if (!frame) frame = requestAnimationFrame(run);
  });
  panel.addEventListener("change", (e) => {
    if (e.target.matches("[data-prop], [data-live]")) run();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-prop], [data-live]")) {
      e.preventDefault();
      run();
    }
  });
  panel.addEventListener("focusout", (e) => {
    if (panel.contains(e.relatedTarget)) return;
    if (timer || frame) run();
    onDone?.();
  });
  return {
    // The panel was refilled from the pieces: these values are applied.
    reset() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      timer = frame = 0;
      baseline = read();
      mark([]);
    },
    // Edits are waiting to apply (or couldn't).
    pending: () => !!(timer || frame || panel.querySelector("[aria-invalid]")),
  };
}
