import { BAD_DRAW as C } from "../shared/badDraw.js";

/** Paint and retain actual ink points. The backing store can be rebuilt at
 * any display size without re-sampling drift or changing the geometry. */
export function createDrawingCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const strokes = [];
  let stroke, previous, drift, startTime;

  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function dot(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, C.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function segment(points, end) {
    const a = points[end - 2],
      b = points[end - 1],
      c = points[end];
    const from = a ? midpoint(a, b) : b,
      to = midpoint(b, c);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(b.x, b.y, to.x, to.y);
    ctx.stroke();
  }

  function tail(points) {
    if (points.length < 2) return;
    const last = points.at(-1),
      from = midpoint(points.at(-2), last);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, C.width, C.height);
    for (const points of strokes) {
      dot(points[0]);
      for (let i = 1; i < points.length; i++) segment(points, i);
      if (points !== stroke) tail(points);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr),
      height = Math.round(rect.height * dpr);
    if (
      !width ||
      !height ||
      (canvas.width === width && canvas.height === height)
    )
      return;
    canvas.width = width;
    canvas.height = height;
    style();
    redraw();
  }

  function style() {
    ctx.setTransform(
      canvas.width / C.width,
      0,
      0,
      canvas.height / C.height,
      0,
      0,
    );
    ctx.lineWidth = C.strokeWidth;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle = C.ink;
  }

  function point(x, y, at) {
    const offset = drift(Math.max(0, at - startTime));
    stroke.push({ x: x + offset.x, y: y + offset.y });
    if (stroke.length === 1) dot(stroke[0]);
    else segment(stroke, stroke.length - 1);
  }

  function advance(x, y, time) {
    if (!stroke) return;
    const at = Math.max(previous.at, time);
    const dx = x - previous.x,
      dy = y - previous.y,
      elapsed = at - previous.at;
    if (!dx && !dy && elapsed < C.sampleMs) return;
    const count = Math.min(
      400,
      Math.max(
        1,
        Math.ceil(elapsed / C.sampleMs),
        Math.ceil(Math.hypot(dx, dy) / C.sampleDistance),
      ),
    );
    for (let i = 1; i <= count; i++) {
      const f = i / count;
      point(previous.x + dx * f, previous.y + dy * f, at - elapsed * (1 - f));
    }
    previous = { x, y, at };
  }

  function end() {
    if (stroke) tail(stroke);
    stroke = previous = null;
  }

  style();
  return {
    resize,
    advance,
    end,
    get hasInk() {
      return strokes.length > 0;
    },
    reset(newDrift, now) {
      end();
      strokes.length = 0;
      drift = newDrift;
      startTime = now;
      redraw();
    },
    begin(x, y, at) {
      end();
      stroke = [];
      strokes.push(stroke);
      previous = { x, y, at };
      point(x, y, at);
    },
    undo() {
      end();
      strokes.pop();
      redraw();
    },
    clear() {
      end();
      strokes.length = 0;
      redraw();
    },
  };
}
