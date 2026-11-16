const palettes = [
  [
    "#252748",
    "#a25f75",
    "#ffcf9b",
    "#695373",
    "#454261",
    "#292f4b",
    "#acd683",
    "#426b65",
    "#273d50",
  ],
  [
    "#202545",
    "#686293",
    "#ffd5ac",
    "#555984",
    "#3a496e",
    "#283654",
    "#89d2ae",
    "#35696b",
    "#243d52",
  ],
  [
    "#171b38",
    "#544976",
    "#ffe1bd",
    "#4c496d",
    "#3e3d65",
    "#282d50",
    "#a7b8ed",
    "#525e92",
    "#303653",
  ],
];

function polygon(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const [i, [x, y]] of points.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function box(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function lantern(ctx, x, y, lit, goal) {
  const size = goal ? 1.6 : 1;
  ctx.save();
  ctx.translate(Math.round(x), y);
  ctx.scale(size, size);
  if (lit) {
    const glow = ctx.createRadialGradient(0, -39, 1, 0, -39, 41);
    glow.addColorStop(0, "#ffd17b80");
    glow.addColorStop(1, "#ffd17b00");
    box(ctx, glow, -42, -81, 84, 84);
  }
  box(ctx, "#292239", -3, -49, 6, 49);
  box(ctx, "#624257", -1, -48, 2, 45);
  box(ctx, "#292239", -10, -48, 20, 19);
  box(ctx, "#292239", -6, -52, 12, 4);
  box(ctx, lit ? "#ffbb61" : "#676887", -7, -45, 14, 13);
  box(ctx, lit ? "#fff5bd" : "#9494ac", -3, -44, 6, 9);
  ctx.restore();
}

function drawRunner(ctx, p, time) {
  const stride =
    p.grounded && Math.abs(p.vx) > 10 ? Math.sin(time * 32) * 3 : 0;
  ctx.save();
  ctx.translate(Math.round(p.x + p.w / 2), Math.round(p.y));
  ctx.scale(p.facing, 1);
  polygon(
    ctx,
    [
      [-5, 16],
      [-15, 16],
      [-22, 11],
      [-21, 23],
      [-12, 25],
      [-4, 21],
    ],
    "#f28362",
  );
  box(ctx, "#ffbb79", -21, 15, 5, 6);
  box(ctx, "#27233f", -10, 19, 21, 10);
  box(ctx, "#de6c54", -8, 19, 16, 7);
  box(ctx, "#29233f", -9, 26, 7, 6 + stride);
  box(ctx, "#29233f", 3, 26, 8, 6 - stride);
  box(ctx, "#27233f", -10, 2, 5, 10);
  box(ctx, "#27233f", 4, 0, 5, 9);
  box(ctx, "#ec8b5e", -8, 4, 3, 7);
  box(ctx, "#ec8b5e", 5, 2, 3, 7);
  box(ctx, "#27233f", -11, 7, 23, 14);
  box(ctx, "#f59a60", -9, 8, 18, 10);
  box(ctx, "#ffe1a3", 0, 13, 12, 7);
  box(ctx, "#27233f", 5, 10, 3, 4);
  box(ctx, "#27233f", 10, 14, 3, 3);
  box(ctx, "#71d6c2", -9, 20, 17, 4);
  box(ctx, "#71d6c2", -14, 22, 7, 3);
  ctx.restore();
}

export function trailSceneScale(canvas) {
  return Math.min(canvas.height / 464, canvas.width / 320);
}

export function drawLanternTrail(canvas, run, index, camera) {
  const ctx = canvas.getContext("2d");
  const scale = trailSceneScale(canvas);
  const fullHeight = canvas.height / scale;
  const top = -Math.round((fullHeight - 464) * 0.72);
  const height = fullHeight + top;
  const width = canvas.width / scale;
  const [sky, mist, moon, far, mid, trees, grass, stone, earth] =
    palettes[index];
  ctx.setTransform(scale, 0, 0, scale, 0, -top * scale);
  const gradient = ctx.createLinearGradient(0, top, 0, 350);
  gradient.addColorStop(0, sky);
  gradient.addColorStop(1, mist);
  box(ctx, gradient, 0, top, Math.ceil(width), Math.ceil(fullHeight));

  for (let i = 0; i < (width - top) / 18; i++) {
    const x = i * 37 + ((i * 19) % 23);
    const y = 20 + ((i * 47) % 205);
    box(ctx, i % 4 ? "#ffe7cb59" : "#fff0cebc", x, y, i % 4 ? 2 : 3, 2);
  }
  const moonX = width * 0.73;
  const halo = ctx.createRadialGradient(moonX, 105, 16, moonX, 105, 77);
  halo.addColorStop(0, "#ffce9c48");
  halo.addColorStop(1, "#ffce9c00");
  box(ctx, halo, moonX - 77, 28, 154, 154);
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(moonX, 105, 31, 0, Math.PI * 2);
  ctx.fill();
  box(ctx, "#a36d8a38", moonX - 17, 97, 13, 4);
  box(ctx, "#a36d8a38", moonX + 6, 112, 17, 4);

  for (const [layer, color, spacing, baseline, parallax] of [
    [0, far, 258, 287, 0.17],
    [1, mid, 180, 321, 0.33],
    [2, trees, 98, 383, 0.55],
  ]) {
    const offset = camera * parallax;
    const start = Math.floor(offset / spacing) - 1;
    for (let i = start; i * spacing - offset < width; i++) {
      const x = i * spacing - offset;
      const peak = baseline - 73 - Math.abs((i * 47 + layer * 21) % 69);
      if (layer < 2) {
        polygon(
          ctx,
          [
            [x, height],
            [x, baseline],
            [x + spacing * 0.42, peak],
            [x + spacing * 0.75, peak + 42],
            [x + spacing + 1, baseline],
            [x + spacing + 1, height],
          ],
          color,
        );
      } else {
        const cx = x + spacing / 2;
        box(ctx, color, cx - 4, peak + 30, 8, height - peak);
        for (let j = 0; j < 3; j++) {
          const y = peak + j * 23;
          polygon(
            ctx,
            [
              [cx, y],
              [cx + 22 + j * 6, y + 43],
              [cx - 22 - j * 6, y + 43],
            ],
            color,
          );
        }
      }
    }
  }
  box(ctx, "#282743", 0, 414, Math.ceil(width), height - 414);
  for (let i = Math.floor(camera / 84); i * 84 < camera + width; i++) {
    box(ctx, "#766183", i * 84 - camera, 425 + ((i * 11) % 32), 46, 2);
  }

  ctx.translate(-Math.round(camera), 0);
  for (const { x, y, w, h } of run.level.solids) {
    box(ctx, earth, x, y, w, h > 40 ? Math.max(h, height - y) : h);
    box(ctx, stone, x, y + 7, w, Math.min(h - 7, 19));
    box(ctx, grass, x, y, w, 7);
    for (let i = 10; i < w - 4; i += 18) {
      box(ctx, grass, x + i, y + 6, 4, 3 + (i % 6));
      if (h > 40) {
        box(ctx, stone, x + i, y + 35 + ((i * 7) % 60), 8, 3);
        if (i % 5 === 0) {
          box(ctx, grass, x + i, y - 7, 2, 8);
          box(ctx, "#ffbf87", x + i - 2, y - 9, 6, 3);
        }
      }
    }
  }

  lantern(ctx, run.level.checkpoint, 350, run.checkpoint, false);
  lantern(ctx, run.level.goal, 350, true, true);
  for (const [i, coin] of run.level.coins.entries()) {
    if (run.coins.has(i)) continue;
    const y = coin.y + Math.sin(run.time * 5 + i * 0.6) * 3;
    const x = coin.x;
    polygon(
      ctx,
      [
        [x, y - 10],
        [x + 7, y],
        [x, y + 10],
        [x - 7, y],
      ],
      "#ffbc62",
    );
    polygon(
      ctx,
      [
        [x, y - 8],
        [x + 3, y],
        [x, y + 5],
        [x - 3, y],
      ],
      "#fff3ba",
    );
  }

  for (const bug of run.patrols) {
    if (bug.defeated) continue;
    const { x, y } = bug;
    const feet = (Math.floor(run.time * 15) % 2) * 3;
    box(ctx, "#201b34", x + 3, y + 4, 22, 15);
    box(ctx, "#201b34", x, y + 8, 28, 11);
    box(ctx, "#dd728f", x + 4, y + 4, 20, 10);
    box(ctx, "#ffadc0", x + 8, y + 4, 9, 4);
    box(ctx, "#fff2ce", x + (bug.speed > 0 ? 21 : 4), y + 12, 4, 3);
    box(ctx, "#201b34", x + 4 + feet, y + 18, 5, 4);
    box(ctx, "#201b34", x + 19 - feet, y + 18, 5, 4);
  }
  drawRunner(ctx, run.player, run.time);
}
