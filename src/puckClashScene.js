import {
  BOARD,
  CLASH_HOLES,
  HOLE_RADIUS,
  SIDE_RAIL,
  sideRailContact,
  BUMPER_RADIUS,
  bumperBlocks,
  DIAMOND_TIP,
  diamondContact,
} from "../shared/puckClash.js";

const colors = [
  ["#103e59", "#55dcff", "#c1f4ff"],
  ["#823616", "#ff9257", "#ffe1b9"],
];

function setupScale(width, height) {
  return [Math.min(width * 0.23, 105), Math.min(height * 0.056, 50)];
}

export function setupBoardPosition(width, height, team, left, top) {
  const direction = team === 0 ? 1 : -1;
  const [scaleX, scaleZ] = setupScale(width, height);
  return {
    x: (direction * (left - width / 2)) / scaleX,
    z: (direction * (top - height / 2)) / scaleZ,
  };
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
) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  const { halfWidth: w, halfLength: l, radius } = BOARD;
  const facing = team === 0 ? 1 : -1;
  const focal = Math.min(width * 0.58, height * 0.63);
  const center = height * (width / height < 0.85 ? 0.46 : 0.36);
  const [setupX, setupZ] = setupScale(width, height);
  // Keep the whole table in view with room for the HUD above it.
  const overheadScale = Math.min(
    Math.max(1, height - 144) / 10.5,
    width * 0.23,
  );
  const project = ([x, y, z]) => {
    if (placement) {
      return [
        width / 2 + x * facing * setupX,
        height / 2 + z * facing * setupZ - y * 10,
      ];
    }
    const depth = Math.max(0.25, 6.65 - z * facing);
    const firstX = width / 2 + (x * facing * focal) / depth;
    const firstY = center + ((1.65 - y) / depth - 0.15) * focal;
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

  if (!placement && overhead < 1) {
    ctx.globalAlpha = 1 - overhead;
    const [x, y] = project([0, 0, -(l + 0.35) * facing]);
    drawRaccoon(ctx, x, y, focal / (6.65 + l + 0.35), colors[1 - team][1]);
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

  for (const { x, z } of CLASH_HOLES) {
    disk(x, 0.01, z, HOLE_RADIUS * 1.25, "#935e42");
    disk(x, 0.012, z, HOLE_RADIUS, "#35271f");
  }
  wall(-l * facing, -0.16 * facing);
  drawSideRails(-facing);
  const launch = guide?.origin ?? { x: 0, z: BOARD.launch * facing };
  if (guide) {
    const travel = (1.5 + 6.2 * guide.power) ** 2 / 4.6;
    for (let t = 0.36; t < travel; t += 0.25) {
      const x = launch.x + Math.sin(guide.aim) * t * facing;
      const z = launch.z - Math.cos(guide.aim) * t * facing;
      if (
        diamondContact(x, z) ||
        Math.abs(x) >= w ||
        Math.abs(z) >= l - radius ||
        sideRailContact(x, z) ||
        bumperBlocks(x, z, bumpers)
      )
        break;
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
    { z: 0, diamond: true },
    ...(guide ? [{ team, ...launch, fall: null }] : []),
  ]
    .filter(({ fall }) => fall == null || fall < 0.7)
    .sort((a, b) => (a.z - b.z) * facing)
    .forEach((piece) => {
      if (piece.diamond) drawDiamond();
      else if (piece.bumper) drawBumper(piece.bumper);
      else puck(piece);
    });
  drawSideRails(facing);
  wall(l * facing, 0.16 * facing);
  if (placement) {
    if (placement.valid) drawBumper({ ...placement, team });
    else disk(placement.x, 0.26, placement.z, BUMPER_RADIUS, "#d85049");
  }
}

function drawRaccoon(ctx, x, y, scale, scarf) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const oval = (cx, cy, rx, ry, fill, tilt = 0) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const fur = "#a5afac";
  const pale = "#e0ded0";
  const dark = "#34434b";
  oval(0.87, -0.54, 0.69, 0.25, dark, -0.59);
  for (const [tx, ty] of [
    [0.64, -0.36],
    [0.94, -0.57],
    [1.21, -0.77],
  ]) {
    oval(tx, ty, 0.12, 0.22, fur, -0.59);
  }
  oval(0, -0.53, 0.65, 0.75, dark);
  oval(0, -0.53, 0.43, 0.52, fur);
  oval(0, -1.0, 0.59, 0.16, scarf);
  oval(0.44, -0.84, 0.13, 0.28, scarf, -0.46);
  for (const side of [-1, 1]) {
    oval(side * 0.48, -2.03, 0.27, 0.31, dark, side * 0.22);
    oval(side * 0.48, -2.03, 0.15, 0.19, "#b38c82", side * 0.22);
  }
  oval(0, -1.64, 0.76, 0.53, fur);
  oval(0, -1.79, 0.15, 0.32, pale);
  for (const side of [-1, 1]) {
    oval(side * 0.33, -1.62, 0.34, 0.23, dark, side * -0.29);
    oval(side * 0.28, -1.64, 0.083, 0.1, "#111e25");
    oval(side * 0.28 - 0.025, -1.68, 0.026, 0.035, "#fff6db");
    oval(side * 0.42, -0.2, 0.2, 0.16, dark);
  }
  oval(0, -1.38, 0.35, 0.2, pale);
  oval(0, -1.45, 0.13, 0.085, "#222d33");
  ctx.restore();
}
