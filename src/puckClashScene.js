import {
  BOARD,
  LAUNCH_LIMIT,
  SIDE_RAIL,
  BUMPER_RADIUS,
  DIAMOND_TIP,
  traceClashShot,
} from "../shared/puckClash.js";

const colors = [
  ["#103e59", "#55dcff", "#c1f4ff"],
  ["#823616", "#ff9257", "#ffe1b9"],
];

const cameraDistance = 6.65;
const cameraHeight = 1.65;
const cameraPitchOffset = 0.15;

export function setupBoardPosition(width, height, team, left, top) {
  const direction = team === 0 ? 1 : -1;
  const { focal, center } = firstPersonView(width, height);
  // Invert the first-person projection at the surface of the board.
  const inverseDepth =
    ((top - center) / focal + cameraPitchOffset) / cameraHeight;
  if (!(inverseDepth > 0)) return null;
  const depth = 1 / inverseDepth;
  return {
    x: (direction * (left - width / 2) * depth) / focal,
    z: direction * (cameraDistance - depth),
  };
}

function firstPersonView(width, height) {
  return {
    focal: Math.min(width * 0.58, height * 0.63),
    center: height * (width / height < 0.85 ? 0.46 : 0.36),
  };
}

export function launchLinePointer(width, height, left, top, requireNearLine) {
  const { focal, center } = firstPersonView(width, height);
  const depth = cameraDistance - BOARD.launch;
  const scale = focal / depth;
  const lineY = center + (cameraHeight / depth - cameraPitchOffset) * focal;
  const x = (left - width / 2) / scale;
  if (
    requireNearLine &&
    (Math.abs(top - lineY) > Math.max(18, 0.17 * scale) ||
      Math.abs(x) > BOARD.halfWidth)
  )
    return null;
  return x;
}

export function drawPuckClash(
  canvas,
  width,
  height,
  team,
  pucks,
  guide,
  bumpers = [],
  placement = null,
  overhead = 0,
  knockouts = [],
  opponent = null,
) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  const { halfWidth: w, halfLength: l, radius } = BOARD;
  const facing = team === 0 ? 1 : -1;
  const { focal, center } = firstPersonView(width, height);
  // Keep the whole table in view with room for the HUD above it.
  const overheadScale = Math.min(
    Math.max(1, height - 144) / 10.5,
    width * 0.23,
  );
  const project = ([x, y, z]) => {
    const depth = Math.max(0.25, cameraDistance - z * facing);
    const firstX = width / 2 + (x * facing * focal) / depth;
    const firstY =
      center + ((cameraHeight - y) / depth - cameraPitchOffset) * focal;
    const topX = width / 2 + x * facing * overheadScale;
    const topY = (height + 68) / 2 + z * facing * overheadScale - y * 10;
    return [
      firstX + (topX - firstX) * overhead,
      firstY + (topY - firstY) * overhead,
    ];
  };
  function shape(points, fill, stroke) {
    ctx.beginPath();
    points
      .map(project)
      .forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (fill) {
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function slab(x0, x1, z0, z1, y, fill) {
    shape(
      [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
      ],
      fill,
    );
  }
  function wall(z, depth) {
    shape(
      [
        [-w, 0, z],
        [w, 0, z],
        [w, 0.28, z],
        [-w, 0.28, z],
      ],
      "#193445",
    );
    slab(-w, w, z, z + depth, 0.28, "#33596c");
    slab(-w, w, z, z + depth * 0.25, 0.282, "#69a7b8");
  }
  function drawSideRails(end) {
    const { x, start, end: tail, radius } = SIDE_RAIL;
    const near = Math.min(start * end, tail * end);
    const far = Math.max(start * end, tail * end);
    const height = 0.28;
    for (const center of [-x, x]) {
      const left = center - radius;
      const right = center + radius;
      for (const side of [left, right]) {
        shape(
          [
            [side, 0, near],
            [side, 0, far],
            [side, height, far],
            [side, height, near],
          ],
          "#193445",
        );
      }
      for (const z of [near, far]) {
        for (let y = 0.022; y < height; y += 0.026)
          disk(center, y, z, radius, "#193445");
        disk(center, height, z, radius, "#33596c");
      }
      slab(left, right, near, far, height, "#33596c");
      slab(
        center - 0.018,
        center + 0.018,
        near,
        far,
        height + 0.002,
        "#69a7b8",
      );
    }
  }
  function disk(x, y, z, r, fill) {
    const points = Array.from({ length: 28 }, (_, i) => {
      const angle = (i * Math.PI) / 14;
      return [x + Math.cos(angle) * r, y, z + Math.sin(angle) * r];
    });
    shape(points, fill);
  }
  function puck(p) {
    const [side, top, stripe] = colors[p.team];
    const y = p.fall === null ? 0 : -4.8 * p.fall ** 2;
    if (p.fall === null)
      disk(p.x + 0.03, 0.005, p.z + 0.025, radius * 1.1, "#53382675");
    for (const rise of [0.028, 0.055, 0.08])
      disk(p.x, y + rise, p.z, radius, side);
    disk(p.x, y + 0.102, p.z, radius, top);
    disk(p.x, y + 0.103, p.z, radius * 0.69, side);
    disk(p.x, y + 0.105, p.z, radius * 0.45, stripe);
  }

  const backdrop = ctx.createRadialGradient(
    width / 2,
    center,
    0,
    width / 2,
    center,
    Math.max(width, height) * 0.7,
  );
  backdrop.addColorStop(0, "#23404b");
  backdrop.addColorStop(0.46, "#121e2b");
  backdrop.addColorStop(1, "#090e16");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  if (opponent && overhead < 1) {
    ctx.globalAlpha = 1 - overhead;
    const [x, y] = project([0, 0, -(l + 0.35) * facing]);
    drawOpponent(
      ctx,
      x,
      y,
      focal / (cameraDistance + l + 0.35),
      opponent,
      colors[1 - team][1],
    );
    ctx.globalAlpha = 1;
  }

  for (const x of [-w, w]) {
    shape(
      [
        [x, -0.22, -l],
        [x, 0, -l],
        [x, 0, l],
        [x, -0.22, l],
      ],
      "#885137",
    );
  }
  shape(
    [
      [-w, -0.27, l * facing],
      [w, -0.27, l * facing],
      [w, 0, l * facing],
      [-w, 0, l * facing],
    ],
    "#6a4030",
  );
  const wood = ["#dca26e", "#eab782", "#e1ab75", "#efbc88"];
  for (let i = 0; i < 12; i++) {
    const x = -w + (i * w) / 6;
    slab(x, x + w / 6 + 0.002, -l, l, 0, wood[i % wood.length]);
    shape(
      [
        [x + 0.08, 0, -l],
        [x + 0.06, 0, -1],
        [x + 0.1, 0, 2],
        [x + 0.07, 0, l],
      ],
      null,
      "#83492328",
    );
  }
  for (const x of [-w + 0.045, w - 0.045]) {
    slab(x - 0.02, x + 0.02, -l, l, 0.002, "#9b4938");
  }
  for (const z of [-BOARD.launch, 0, BOARD.launch]) {
    slab(-w, w, z - 0.012, z + 0.012, 0.003, "#7956428f");
  }
  if (placement) {
    slab(-w, w, 0, -l * facing, 0.004, "#16253260");
  }
  disk(0, 0.005, 0, 0.59, "#a9765766");
  disk(0, 0.007, 0, 0.53, "#e9b57d");
  disk(0, 0.009, 0, 0.075, "#8e624b");

  wall(-l * facing, -0.16 * facing);
  drawSideRails(-facing);
  const launch = guide?.origin ?? { x: 0, z: BOARD.launch * facing };
  if (guide && Math.abs(launch.z) === BOARD.launch) {
    slab(
      -LAUNCH_LIMIT,
      LAUNCH_LIMIT,
      launch.z - 0.016,
      launch.z + 0.016,
      0.012,
      "#fff0ca",
    );
  }
  if (guide?.blocked) {
    disk(launch.x, 0.11, launch.z, radius * 0.74, "#da4e37b5");
  } else if (guide) {
    for (const { x, z } of traceClashShot(
      team,
      guide,
      launch,
      pucks,
      bumpers,
    )) {
      disk(x, 0.012, z, 0.025, "#233641b5");
    }
  }

  function drawDiamond() {
    const points = [
      [0, -DIAMOND_TIP],
      [DIAMOND_TIP, 0],
      [0, DIAMOND_TIP],
      [-DIAMOND_TIP, 0],
    ];
    const top = points.map(([x, z]) => [x, 0.145, z]);
    for (const index of team === 0 ? [1, 2] : [0, 3]) {
      const next = (index + 1) % points.length;
      const [x, z] = points[index];
      const [otherX, otherZ] = points[next];
      shape([[x, 0, z], [otherX, 0, otherZ], top[next], top[index]], "#8b542d");
    }
    shape(top, "#ffd386", "#9f6439");
    shape(
      top.map(([x, y, z]) => [x * 0.64, y + 0.002, z * 0.64]),
      "#cf9050",
    );
  }

  function drawBumper({ x, z, team }) {
    const [side, top, stripe] = colors[team];
    disk(x, 0.006, z, BUMPER_RADIUS + 0.037, "#71523a70");
    for (let y = 0.016; y < 0.25; y += 0.022) {
      disk(x, y, z, BUMPER_RADIUS, side);
    }
    disk(x, 0.25, z, BUMPER_RADIUS, top);
    disk(x, 0.251, z, BUMPER_RADIUS * 0.71, side);
    disk(x, 0.252, z, BUMPER_RADIUS * 0.31, stripe);
  }

  [
    ...pucks,
    ...bumpers.map((bumper) => ({ z: bumper.z, bumper })),
    ...(placement?.valid
      ? [{ z: placement.z, bumper: { ...placement, team } }]
      : []),
    { z: 0, diamond: true },
    ...(guide && !guide.blocked ? [{ team, ...launch, fall: null }] : []),
  ]
    .filter(({ fall }) => fall == null || fall < 0.7)
    .sort((a, b) => (a.z - b.z) * facing)
    .forEach((piece) => {
      if (piece.diamond) drawDiamond();
      else if (piece.bumper) drawBumper(piece.bumper);
      else puck(piece);
    });
  for (const { x, z, source, team, age } of knockouts) {
    const [, color, shine] = colors[team];
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age * 0.72);
    const ring = (left, depth, height, size, stroke) => {
      const outline = Array.from({ length: 32 }, (_, i) => {
        const angle = (i * Math.PI) / 16;
        return [
          left + Math.cos(angle) * size,
          height,
          depth + Math.sin(angle) * size,
        ];
      });
      outline.push(outline[0]);
      shape(outline, null, stroke);
    };
    ring(x, 0.035, z, 0.27 + age * 0.24, color);
    ring(x, 0.035, z, 0.18 + age * 0.16, shine);
    if (source?.fall === null) {
      ring(source.x, 0.12, source.z, radius + 0.085, shine);
      ring(source.x, 0.12, source.z, radius + 0.13, color);
    }
    ctx.restore();
  }
  drawSideRails(facing);
  wall(l * facing, 0.16 * facing);
  if (placement && !placement.valid) {
    disk(placement.x, 0.26, placement.z, BUMPER_RADIUS, "#d85049");
  }
}

// The rival critter stands behind the far end, rendered full body by
// headshots.js. The portrait frames the figure with ~12% padding, so its
// feet sit a little above the image's bottom edge.
function drawOpponent(ctx, x, y, scale, image, glow) {
  if (!image.complete || !image.naturalWidth) return;
  const size = 2.75 * scale;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    x,
    y - 0.05 * scale,
    0.85 * scale,
    0.2 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = `${glow}55`;
  ctx.fill();
  ctx.drawImage(image, x - size / 2, y - size * 0.95, size, size);
  ctx.restore();
}
