import * as THREE from "three";

export const SHUFFLEBOARD_ROOMS = {
  study: "Library Study",
  cabin: "Snowy Cabin",
  sunroom: "Rainy Sunroom",
};

function windowView(texture, snowy) {
  return texture(640, 480, (ctx) => {
    let seed = 87;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const sky = ctx.createLinearGradient(0, 0, 0, 480);
    sky.addColorStop(0, snowy ? "#344c77" : "#304f52");
    sky.addColorStop(1, snowy ? "#c7d8e7" : "#a5bcaa");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 640, 480);

    if (snowy) {
      ctx.fillStyle = "#e2e9f1";
      ctx.beginPath();
      ctx.arc(460, 94, 36, 0, Math.PI * 2);
      ctx.fill();
    }

    const hills = snowy
      ? ["#7b91af", "#546e8f", "#b7cbdc"]
      : ["#809588", "#4c6c5c", "#36564a"];
    hills.forEach((color, index) => {
      const horizon = 233 + index * 67;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= 640; x += 16) {
        ctx.lineTo(
          x,
          horizon +
            23 * Math.sin(x / (59 + index * 24) + index * 2) +
            random() * 9,
        );
      }
      ctx.lineTo(640, 480);
      ctx.lineTo(0, 480);
      ctx.fill();
    });

    for (let i = 0; i < 25; i++) {
      const x = random() * 670 - 15;
      const y = 350 + i * 4.3;
      const h = 28 + random() * 92 + i * 2;
      if (snowy) {
        const w = h * 0.25;
        for (let layer = 0; layer < 3; layer++) {
          const top = y - h + layer * h * 0.19;
          ctx.fillStyle = i < 12 ? "#405879" : "#293f54";
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + w * (0.6 + layer * 0.22), top + h * 0.49);
          ctx.lineTo(x - w * (0.6 + layer * 0.22), top + h * 0.49);
          ctx.fill();
          ctx.strokeStyle = "#afc6d8";
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "#273f37";
        ctx.fillRect(x - 2, y - h * 0.61, 4, h * 0.61);
        ctx.fillStyle = ["#426b58", "#5c7860", "#2f5148"][i % 3];
        ctx.beginPath();
        ctx.ellipse(
          x,
          y - h * 0.65,
          h * 0.27,
          h * 0.46,
          i % 2 ? 0.24 : -0.19,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  });
}

export function createShuffleboardRooms(texture) {
  const cabin = new THREE.Group();
  const sunroom = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const paneGeo = new THREE.PlaneGeometry(1, 1);
  const leafGeo = new THREE.SphereGeometry(1, 12, 6);
  const potGeo = new THREE.CylinderGeometry(0.48, 0.36, 1, 18);
  const mat = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const cedar = mat("#5b301d");
  const logs = ["#835435", "#99613a", "#805033"].map(mat);
  const ivory = mat("#b5b69b");
  const sage = mat("#4f6456");
  const linen = mat("#93674f");
  const quilt = mat("#963e3f");
  const clay = mat("#b57056");
  const soil = mat("#38271f");
  const foliage = ["#315c41", "#477550", "#667945"].map(mat);
  const snow = new THREE.MeshBasicMaterial({
    map: windowView(texture, true),
    toneMapped: false,
  });
  const rain = new THREE.MeshBasicMaterial({
    map: windowView(texture, false),
    toneMapped: false,
  });

  function weatherLayer(size, paint) {
    const map = texture(size, size, paint);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  }

  const snowLayers = [0, 1].map((layer) =>
    weatherLayer(256, (ctx) => {
      for (let i = 0; i < (layer ? 73 : 120); i++) {
        const x = (i * 71.293 + i * i * 2.317) % 256;
        const y = (i * 53.716 + i * i * 0.971) % 256;
        ctx.fillStyle = layer ? "#ffffffef" : "#e3edff9e";
        ctx.beginPath();
        ctx.arc(x, y, (layer ? 1.35 : 0.62) + (i % 4) * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );

  const fallingRain = weatherLayer(512, (ctx) => {
    for (let i = 0; i < 105; i++) {
      const x = 12 + ((i * 73.123 + i * i * 2.477) % 488);
      const y = 4 + ((i * 41.837 + i * i * 0.981) % 472);
      const streak = 10 + (i % 8) * 3.7;
      const fade = ctx.createLinearGradient(x, y, x + 5, y + streak);
      fade.addColorStop(0, "#d5ebf000");
      fade.addColorStop(1, i % 3 ? "#daf1f499" : "#d6eff1e0");
      ctx.strokeStyle = fade;
      ctx.lineWidth = i % 3 ? 1.3 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + streak * 0.19, y + streak);
      ctx.stroke();
    }
  });

  function paintDrop(ctx, x, y, size) {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.72, size, -0.16, 0, Math.PI * 2);
    ctx.fillStyle = "#ecfbfd24";
    ctx.fill();
    ctx.strokeStyle = "#152f3a9c";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(
      x - size * 0.2,
      y - size * 0.29,
      size * 0.2,
      size * 0.3,
      -0.55,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#e9fbfbdb";
    ctx.fill();
  }

  const windowBeads = weatherLayer(512, (ctx) => {
    for (let i = 0; i < 116; i++) {
      const x = 8 + ((i * 93.137 + i * i * 0.787) % 496);
      const y = 8 + ((i * 51.771 + i * i * 1.137) % 496);
      paintDrop(ctx, x, y, 1.2 + (i % 7) * 0.54);
    }
  });

  const windowRivulets = weatherLayer(512, (ctx) => {
    for (let i = 0; i < 16; i++) {
      const x = 8 + ((i * 81.171) % 496);
      const y = 65 + ((i * 71.775) % 435);
      const trail = 18 + (i % 6) * 7;
      const fade = ctx.createLinearGradient(x, y - trail, x, y);
      fade.addColorStop(0, "#e1f7ff00");
      fade.addColorStop(1, "#dff8ff85");
      ctx.lineWidth = 1.65;
      ctx.strokeStyle = fade;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - trail);
      ctx.bezierCurveTo(x + 2, y - trail * 0.65, x - 1, y - trail * 0.38, x, y);
      ctx.stroke();
      paintDrop(ctx, x, y, 2.7 + (i % 3) * 0.6);
    }
  });
  const rainLayers = [fallingRain, windowBeads, windowRivulets];

  function piece(parent, geometry, material, x, y, z, sx, sy, sz) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.scale.set(sx, sy, sz);
    parent.add(item);
    return item;
  }

  function block(parent, material, x, y, z, sx, sy, sz) {
    return piece(parent, box, material, x, y, z, sx, sy, sz);
  }

  function wall(room, x, z, angle) {
    const frame = new THREE.Group();
    frame.position.set(x, 0, z);
    frame.rotation.y = angle;
    room.add(frame);
    return frame;
  }

  function window(frame, exterior, wood, x, y, w, h, panes) {
    block(frame, wood, x, y, 0, w + 0.22, h + 0.25, 0.17);
    piece(frame, paneGeo, exterior, x, y, 0.09, w, h, 1);
    const layers = exterior === snow ? snowLayers : rainLayers;
    const glass = new THREE.PlaneGeometry(1, 1);
    const uv = glass.attributes.uv;
    // Scale and offset the weather per window so wide panes do not stretch the drops.
    const offset =
      (frame.position.x * 0.37 + frame.position.z * 0.74 + x * 0.28) % 1;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, offset + (uv.getX(i) * w) / h);
    }
    layers.forEach((layer, i) => {
      const overlay = piece(
        frame,
        glass,
        layer,
        x,
        y,
        0.098 + i * 0.002,
        w,
        h,
        1,
      );
      overlay.renderOrder = 1 + i;
    });
    for (let i = 1; i < panes; i++) {
      block(frame, wood, x - w / 2 + (i * w) / panes, y, 0.13, 0.075, h, 0.07);
    }
    block(frame, wood, x, y + h * 0.22, 0.13, w, 0.085, 0.07);
    block(frame, wood, x, y - h / 2 - 0.07, 0.21, w + 0.34, 0.1, 0.4);
  }

  function bench(frame, x) {
    for (const side of [-1, 1]) {
      block(frame, cedar, x + side * 0.83, 0.26, 0.48, 0.15, 0.52, 0.66);
    }
    block(frame, cedar, x, 0.51, 0.49, 1.95, 0.12, 0.81);
    block(frame, linen, x, 0.61, 0.49, 1.94, 0.15, 0.76);
    const pillow = block(frame, quilt, x - 0.61, 0.83, 0.3, 0.43, 0.42, 0.19);
    pillow.rotation.z = -0.22;
  }

  function plant(frame, x, z, height, base = 0) {
    piece(frame, potGeo, clay, x, base + 0.28, z, 0.62, 0.56, 0.62);
    piece(frame, potGeo, soil, x, base + 0.53, z, 0.55, 0.07, 0.55);
    for (let i = 0; i < 8; i++) {
      const wave = i * 2.4;
      const y = base + 0.64 + (i * height) / 10;
      const leaf = piece(
        frame,
        leafGeo,
        foliage[i % 3],
        x + Math.cos(wave) * 0.25,
        y,
        z + Math.sin(wave) * 0.23,
        0.15,
        0.045,
        0.35,
      );
      leaf.rotation.y = wave;
      leaf.rotation.x = -0.33 - 0.12 * (i % 3);
    }
    block(
      frame,
      foliage[0],
      x,
      base + 0.55 + height / 2,
      z,
      0.033,
      height,
      0.028,
    );
  }

  for (const side of [-1, 1]) {
    const angle = side === -1 ? 0 : Math.PI;
    const timber = wall(cabin, 4.9, side * 4.45, angle);
    for (let i = 0; i < 15; i++) {
      block(timber, logs[i % 3], 0, 0.16 + i * 0.3, -0.07, 15.1, 0.282, 0.23);
    }
    for (const x of [-4.65, 0, 4.65]) {
      window(timber, snow, cedar, x, 2.61, 2.35, 1.9, 2);
      bench(timber, x);
    }

    const glass = wall(sunroom, 4.9, side * 4.42, angle);
    block(glass, sage, 0, 0.48, 0, 15.1, 0.96, 0.17);
    block(glass, ivory, 0, 0.96, 0.08, 15.1, 0.12, 0.28);
    for (let bay = 0; bay < 5; bay++) {
      const x = (bay - 2) * 2.99;
      window(glass, rain, ivory, x, 2.62, 2.78, 3.12, 3);
      if (bay > 0) plant(glass, x + 1.04, 0.52, 0.99 + (bay % 2) * 0.61);
    }
  }

  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 2.67;
    block(cabin, cedar, x, 4.41, 0, 0.27, 0.34, 9.1);
    block(sunroom, sage, x, 4.45, 0, 0.105, 0.2, 9.1);
  }

  const cabinEnd = wall(cabin, 12.57, 2.44, -Math.PI / 2);
  window(cabinEnd, snow, cedar, 0, 2.57, 3.54, 2.38, 3);
  bench(cabinEnd, 0);
  const gardenEnd = wall(sunroom, 12.57, 0, -Math.PI / 2);
  window(gardenEnd, rain, ivory, 0, 2.58, 7.85, 3.15, 6);
  block(gardenEnd, sage, 0, 0.38, 0.46, 6.7, 0.76, 0.74);
  block(gardenEnd, ivory, 0, 0.79, 0.47, 6.85, 0.09, 0.79);
  for (const [x, height] of [
    [-2.65, 1.68],
    [-1.34, 1.28],
    [1.18, 1.63],
    [2.65, 1.92],
  ]) {
    plant(gardenEnd, x, 0.49, height * 0.71, 0.83);
  }

  const cabinHearth = wall(cabin, 12.12, -2.33, -Math.PI / 2);
  const stones = ["#a39381", "#8c7f74", "#786b63", "#9b8879"].map(mat);
  const soot = mat("#231a16");
  block(cabinHearth, soot, 0, 0.82, 0, 2.1, 1.61, 0.17);
  block(cabinHearth, stones[2], 0, 0.11, 0.51, 3.72, 0.22, 1.85);
  block(cabinHearth, stones[0], 0, 0.24, 0.54, 3.78, 0.085, 1.88);
  for (let row = 0; row < 11; row++) {
    const y = 0.4 + row * 0.37;
    const count = row < 4 ? 2 : 4;
    for (let slot = 0; slot < count; slot++) {
      const x = row < 4 ? (slot ? 1.41 : -1.41) : (slot - 1.5) * 0.79;
      const stone = block(
        cabinHearth,
        stones[(row * 3 + slot) % stones.length],
        x + (row % 2 ? 0.045 : -0.045),
        y,
        row < 5 ? 0.22 : 0.02,
        row < 4 ? 0.79 : 0.765,
        0.345,
        row < 5 ? 0.63 : 0.4,
      );
      stone.rotation.z = (((row + slot) % 3) - 1) * 0.018;
    }
  }
  block(cabinHearth, cedar, 0, 2.12, 0.28, 3.73, 0.24, 0.93);
  const cabinFire = new THREE.Group();
  cabinFire.scale.set(1.22, 1.12, 1.03);
  cabinHearth.add(cabinFire);

  const stove = wall(sunroom, 9.55, 2.88, -2.05);
  const iron = new THREE.MeshStandardMaterial({
    color: "#253033",
    roughness: 0.45,
    metalness: 0.45,
  });
  const wornIron = mat("#45524e");
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 36);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.33, 0.33]) {
      block(stove, iron, x, 0.21, z, 0.15, 0.42, 0.16);
    }
  }
  block(stove, stones[2], 0, 0.065, 0.05, 1.87, 0.128, 1.86);
  piece(stove, cylinder, iron, 0, 1.02, -0.11, 0.69, 1.34, 0.65);
  for (const y of [0.41, 1.68]) {
    piece(stove, cylinder, wornIron, 0, y, -0.11, 0.73, 0.09, 0.68);
  }
  piece(stove, cylinder, iron, 0, 3.08, -0.1, 0.18, 2.82, 0.18);
  const door = piece(stove, cylinder, soot, 0, 1.04, 0.51, 0.51, 0.16, 0.51);
  door.rotation.x = Math.PI / 2;
  piece(
    stove,
    new THREE.TorusGeometry(0.5, 0.048, 12, 32),
    wornIron,
    0,
    1.04,
    0.645,
    1,
    1,
    1,
  );
  block(stove, wornIron, 0.56, 1.06, 0.66, 0.155, 0.07, 0.09);
  const sunroomFire = new THREE.Group();
  sunroomFire.position.set(0, 0.55, 0.43);
  sunroomFire.scale.set(0.61, 0.62, 0.62);
  stove.add(sunroomFire);

  function updateSnow(now) {
    snowLayers.forEach(({ map }, i) => {
      map.offset.x = Math.sin(now * 0.00047 + i * 1.4) * (0.065 + i * 0.045);
      map.offset.y = (now * (0.00013 + i * 0.000067)) % 1;
    });
  }

  function updateRain(now) {
    // The view through the pane moves quickly. Runoff on the glass moves slowly.
    fallingRain.map.offset.set((-now * 0.00019) % 1, (now * 0.0008) % 1);
    windowRivulets.map.offset.y = (now * 0.000078) % 1;
  }

  return { cabin, sunroom, cabinFire, sunroomFire, updateSnow, updateRain };
}
