// The size properties each kind of piece shows in the 2D and 3D editors:
// round pieces a radius, window walls their opening, the rest a block's
// length, width and height. Base elevation and looks are edited apart.
import { PIECE_TYPES, CUSTOM_SIZES } from "./customMap.js";
import { windowOpening, clampWindow, MIN_WINDOW } from "./pieceShapes.js";

export function propKind(p) {
  const shape = PIECE_TYPES[p.t]?.shape;
  return shape === "cyl" ? "round" : shape === "window" ? "window" : "block";
}
const alongX = (p) => p.x1 - p.x0 >= p.z1 - p.z0;
const round = (v, step) => Math.round(v / step) * step;
const HEIGHT = {
  key: "height",
  label: "Height (m)",
  min: 0.1,
  max: 12,
  step: 0.1,
};

// [{ key, label, value, min, max, step }] for the panel, in order.
export function pieceFields(p) {
  const type = PIECE_TYPES[p.t],
    h = p.h ?? type.h,
    w = p.x1 - p.x0,
    d = p.z1 - p.z0,
    fields = [];
  switch (propKind(p)) {
    case "round":
      fields.push(
        {
          key: "radius",
          label: "Radius (m)",
          value: Math.min(w, d) / 2,
          min: 0.25,
          max: 20,
          step: 0.25,
        },
        { ...HEIGHT, value: h },
      );
      break;
    case "window": {
      const o = windowOpening(p, type) || { x0: 0, x1: 0, y0: 0, y1: 0 },
        x = alongX(p);
      fields.push(
        {
          key: "length",
          label: "Wall length (m)",
          value: x ? w : d,
          min: 0.5,
          max: 76,
          step: 0.5,
        },
        {
          key: "width",
          label: "Thickness (m)",
          value: x ? d : w,
          min: 0.5,
          max: 76,
          step: 0.5,
        },
        { ...HEIGHT, value: h, full: true },
        {
          key: "winX0",
          label: "Window X start (m)",
          value: o.x0,
          min: 0,
          step: 0.1,
        },
        {
          key: "winY0",
          label: "Window Y start (m)",
          value: o.y0,
          min: 0,
          step: 0.1,
        },
        {
          key: "winX1",
          label: "Window X end (m)",
          value: o.x1,
          min: 0,
          step: 0.1,
        },
        {
          key: "winY1",
          label: "Window Y end (m)",
          value: o.y1,
          min: 0,
          step: 0.1,
        },
      );
      break;
    }
    default:
      fields.push(
        {
          key: "length",
          label: "Length · x (m)",
          value: w,
          min: 0.5,
          max: 76,
          step: 0.5,
        },
        {
          key: "width",
          label: "Width · z (m)",
          value: d,
          min: 0.5,
          max: 76,
          step: 0.5,
        },
        { ...HEIGHT, value: h },
      );
  }
  return fields.map((f) => ({ ...f, value: Math.round(f.value * 100) / 100 }));
}
export const WINDOW_NOTE =
  "Window X runs along the wall from its start end; Y rises from the wall's base. Setting them gives the wall one opening.";

// Apply the changed fields (by key) to piece p in place, keeping its centre.
// Keys p's kind doesn't have are skipped. Returns an error, or nothing.
export function setPieceFields(p, values, size) {
  const kind = propKind(p),
    type = PIECE_TYPES[p.t],
    has = (k) => values[k] !== undefined,
    bad = Object.values(values).some((v) => !Number.isFinite(v));
  if (bad) return "Enter a number in every field.";
  const cx = (p.x0 + p.x1) / 2,
    cz = (p.z0 + p.z1) / 2,
    // Edges stay on the 0.5 m grid; the centre moves at most 0.25 m.
    span = (c, extent) => {
      const a = round(c - extent / 2, 0.5);
      return [a, a + round(extent, 0.5)];
    };
  if (has("height")) {
    if (values.height < 0.1 || values.height > 12)
      return "Height must be 0.1–12 m.";
    p.h = Math.round(values.height * 10) / 10;
  }
  if (kind === "round" && has("radius")) {
    if (values.radius < 0.25) return "Radius must be at least 0.25 m.";
    [p.x0, p.x1] = span(cx, values.radius * 2);
    [p.z0, p.z1] = span(cz, values.radius * 2);
  }
  if (kind !== "round") {
    // A window wall's length runs along it; a block's along x.
    const x = kind === "block" || alongX(p),
      length = values.length,
      width = values.width;
    if ((has("length") && length < 0.5) || (has("width") && width < 0.5))
      return "Length and width must be at least 0.5 m.";
    if (has(x ? "length" : "width"))
      [p.x0, p.x1] = span(cx, x ? length : width);
    if (has(x ? "width" : "length"))
      [p.z0, p.z1] = span(cz, x ? width : length);
  }
  if (kind === "window") {
    const keys = { winX0: "x0", winY0: "y0", winX1: "x1", winY1: "y1" };
    if (Object.keys(keys).some(has)) {
      const now = windowOpening(p, type) || { x0: 0, y0: 0, x1: 0, y1: 0 },
        win = Object.fromEntries(
          Object.entries(keys).map(([k, w]) => [
            w,
            Math.round((has(k) ? values[k] : now[w]) * 10) / 10,
          ]),
        ),
        length = alongX(p) ? p.x1 - p.x0 : p.z1 - p.z0,
        h = p.h ?? type.h;
      if (
        win.x0 < 0 ||
        win.y0 < 0 ||
        win.x1 > length ||
        win.y1 > h ||
        win.x1 - win.x0 < MIN_WINDOW ||
        win.y1 - win.y0 < MIN_WINDOW
      )
        return `The window must fit the wall (0–${length} m along, 0–${h} m up) and be at least ${MIN_WINDOW} m each way, end past start.`;
      if (!clampWindow(win, length, h))
        return "The window can't take up the whole wall.";
      p.win = win;
    }
  }
  const s = size && CUSTOM_SIZES[size];
  if (s && (p.x0 < -s.x || p.x1 > s.x || p.z0 < -s.z || p.z1 > s.z))
    return "That size exceeds the map boundary.";
}

// The fields as number inputs (both editors), read back with readFields.
export const fieldInputs = (fields) =>
  fields
    .map(
      (f) =>
        `<label${f.full ? ' class="prop-full"' : ""}>${f.label}<input type="number" data-prop="${f.key}" value="${f.value}" min="${f.min}"${f.max === undefined ? "" : ` max="${f.max}"`} step="${f.step}"></label>`,
    )
    .join("");
export const readFields = (root) =>
  Object.fromEntries(
    [...root.querySelectorAll("[data-prop]")].map((i) => [
      i.dataset.prop,
      // An empty field is no number, not 0.
      i.value.trim() === "" ? NaN : Number(i.value),
    ]),
  );
