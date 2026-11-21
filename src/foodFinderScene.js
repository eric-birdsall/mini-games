import { OBJECTS, rng, sceneLayout } from "../shared/lookAndFind.js";
const urls = import.meta.glob("./assets/look-and-find/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
export const objectImage = (id) => {
  const item = OBJECTS.find((item) => item.id === id);
  return urls[`./assets/look-and-find/${item?.image}`];
};

export function createFoodFinderScene(canvas) {
  let g = canvas.getContext("2d");
  let scenery = null;
  const images = new Map();
  const ready = Promise.all(
    OBJECTS.map(
      ({ id }) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            images.set(id, image);
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load ${id}`));
          image.src = objectImage(id);
        }),
    ),
  );
  let theme = "woodland",
    slots = [],
    spots = [],
    top = 150,
    bottom = 90;
  let width = 1,
    height = 1,
    hint = -1,
    cursor = -1,
    time = 0;
  // The whole area always fits on screen: no panning or scrolling.
  let viewWidth = 1,
    viewHeight = 1;
  function resize() {
    scenery = null;
    viewWidth = canvas.clientWidth || 1;
    viewHeight = canvas.clientHeight || 1;
    width = viewWidth;
    height = viewHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewWidth * ratio);
    canvas.height = Math.round(viewHeight * ratio);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    spots = sceneLayout(
      slots.length,
      width - 28,
      Math.max(80, height - top - bottom),
      rng(71),
    );
    spots.forEach((p) => {
      p.x += 14;
      p.y += top;
    });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const ellipse = (x, y, rx, ry, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const rect = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  function background() {
    const sky = g.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(
      0,
      theme === "space"
        ? "#272457"
        : theme === "playroom"
          ? "#f8e4c8"
          : "#bfe7e5",
    );
    sky.addColorStop(
      1,
      theme === "space"
        ? "#625180"
        : theme === "playroom"
          ? "#f6c79d"
          : "#bdd493",
    );
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);
    if (theme === "woodland") {
      ellipse(width * 0.8, 100, 48, 48, "#ffe5a2");
      ellipse(
        width * 0.2,
        height * 0.7,
        width * 0.75,
        height * 0.49,
        "#a1c98c",
      );
      ellipse(
        width * 0.85,
        height * 0.93,
        width * 0.8,
        height * 0.48,
        "#8eb77a",
      );
      g.strokeStyle = "#e8d4aa";
      g.lineWidth = width * 0.15;
      g.beginPath();
      g.moveTo(width * 0.56, height);
      g.bezierCurveTo(
        width * 0.1,
        height * 0.7,
        width * 0.86,
        height * 0.55,
        width * 0.48,
        top * 0.8,
      );
      g.stroke();
      for (const x of [width * 0.02, width * 0.95]) {
        rect(x - 10, top * 0.55, 20, height * 0.65, "#aa8260");
        ellipse(x, top * 0.7, 75, 95, "#679c70");
        ellipse(x - 35, top * 0.8, 60, 70, "#7dab79");
      }
      const r = rng(31);
      for (let i = 0; i < 65; i++) {
        const x = r() * width,
          y = top + r() * (height - top);
        ellipse(x, y, 2, 4, i % 3 ? "#739c63" : "#f5e3ad");
      }
    } else if (theme === "playroom") {
      for (let x = 20; x < width; x += 70) rect(x, 0, 2, height, "#efd2b2");
      rect(0, height * 0.52, width, height * 0.48, "#d79e78");
      for (let y = height * 0.52; y < height; y += 60)
        rect(0, y, width, 2, "#be896544");
      rect(
        width * 0.07,
        top * 0.3,
        width * 0.22,
        Math.max(50, top * 0.6),
        "#fff8e5",
      );
      rect(
        width * 0.08,
        top * 0.34,
        width * 0.2,
        Math.max(40, top * 0.52),
        "#a7d8e6",
      );
      rect(width * 0.175, top * 0.3, 5, top * 0.6, "#fff8e5");
      ellipse(
        width * 0.52,
        height * 0.68,
        width * 0.44,
        height * 0.27,
        "#b5c5be",
      );
      ellipse(
        width * 0.52,
        height * 0.68,
        width * 0.39,
        height * 0.23,
        "#cad6cd",
      );
      rect(width * 0.75, top * 0.5, width * 0.2, 90, "#bd8d69");
      rect(width * 0.75, top * 0.5 + 38, width * 0.2, 6, "#f4d9b6");
    } else {
      const r = rng(81);
      for (let i = 0; i < 110; i++)
        ellipse(
          r() * width,
          r() * height,
          i % 5 ? 1 : 2,
          i % 5 ? 1 : 2,
          "#eee2be88",
        );
      ellipse(width * 0.86, top * 0.8, 62, 62, "#c3b6c8");
      ellipse(width * 0.84, top * 0.7, 15, 12, "#afa0bc");
      ellipse(
        width * 0.19,
        height * 0.95,
        width * 0.8,
        height * 0.3,
        "#a998ad",
      );
      ellipse(width * 0.85, height * 1.1, width * 0.6, height * 0.4, "#827c9e");
      for (let i = 0; i < 7; i++)
        ellipse(
          ((i * 0.17) % 1) * width,
          height * (0.85 + (i % 3) * 0.06),
          20 + i * 4,
          7 + i,
          "#77708e55",
        );
      g.strokeStyle = "#e2c6a3";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(width * 0.04, height * 0.72);
      g.lineTo(width * 0.1, height * 0.56);
      g.lineTo(width * 0.16, height * 0.72);
      g.stroke();
    }
  }
  // Scenery provides the visual clutter of a hidden-picture page. It is drawn
  // behind the objects and never duplicates a clue illustration.
  function details() {
    const r = rng(theme === "woodland" ? 40 : theme === "playroom" ? 50 : 60);
    const clear = (x, y, size) =>
      spots.every(
        (p) => Math.hypot(p.x - x, p.y - y) > p.size * 0.72 + size * 0.55,
      );
    for (let i = 0; i < 220; i++) {
      const x = r() * width,
        y = top + r() * Math.max(20, height - top - bottom),
        s = 18 + r() * 40;
      if (!clear(x, y, s)) continue;
      g.save();
      g.translate(x, y);
      if (theme === "woodland") {
        if (i % 3 === 0) {
          rect(-s * 0.1, -s * 0.1, s * 0.2, s * 0.7, "#9a7657");
          ellipse(0, -s * 0.35, s * 0.55, s * 0.65, "#538a68");
          ellipse(-s * 0.25, -s * 0.15, s * 0.4, s * 0.4, "#6f9f6c");
          g.strokeStyle = "#47795a";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(0, s * 0.25);
          g.lineTo(0, -s * 0.65);
          g.stroke();
        } else if (i % 3 === 1) {
          ellipse(0, 0, s * 0.55, s * 0.3, "#71957f");
          ellipse(-s * 0.1, -s * 0.08, s * 0.36, s * 0.25, "#87aa92");
          g.strokeStyle = "#537d66";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(-s * 0.45, s * 0.1);
          g.lineTo(s * 0.45, s * 0.1);
          g.stroke();
        } else {
          for (let j = 0; j < 5; j++) {
            ellipse(
              (j - 2) * 7,
              -Math.sin(j) * 7,
              7,
              10,
              j % 2 ? "#769c60" : "#648955",
            );
          }
        }
      } else if (theme === "playroom") {
        if (i % 3 === 0) {
          rect(-s * 0.55, -s * 0.3, s * 1.1, s * 0.7, "#bb8869");
          rect(-s * 0.5, -s * 0.25, s, 0.12 * s, "#efd2aa");
          for (let j = 0; j < 4; j++)
            rect(
              -s * 0.38 + j * s * 0.2,
              -s * 0.15,
              s * 0.12,
              s * 0.48,
              ["#ca7180", "#88afa6", "#e3be6b", "#859bb4"][j],
            );
        } else if (i % 3 === 1) {
          g.strokeStyle = "#ba826277";
          g.lineWidth = 3;
          g.beginPath();
          g.arc(0, 0, s * 0.45, 0.2, 5.8);
          g.stroke();
          for (let j = 0; j < 6; j++) {
            g.save();
            g.rotate(j);
            rect(s * 0.35, -2, s * 0.2, 4, "#ba826277");
            g.restore();
          }
        } else {
          rect(-s * 0.5, -s * 0.3, s, s * 0.65, "#d5ac7d");
          rect(-s * 0.5, -s * 0.3, s, 0.08 * s, "#edcda2");
          rect(-s * 0.15, -s * 0.3, s * 0.3, s * 0.65, "#f1d9b1");
        }
      } else {
        if (i % 3 === 0) {
          ellipse(0, 0, s * 0.55, s * 0.3, "#857b9c");
          ellipse(0, -s * 0.05, s * 0.4, s * 0.2, "#716b8e");
        } else if (i % 3 === 1) {
          g.strokeStyle = "#cec0bc99";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(-s * 0.4, s * 0.3);
          g.lineTo(0, -s * 0.4);
          g.lineTo(s * 0.5, 0);
          g.stroke();
          for (const [a, b] of [
            [-s * 0.4, s * 0.3],
            [0, -s * 0.4],
            [s * 0.5, 0],
          ])
            ellipse(a, b, 3, 3, "#f4e3b4");
        } else {
          rect(-s * 0.3, -s * 0.45, s * 0.6, s * 0.7, "#b3b6c7");
          rect(-s * 0.22, -s * 0.36, s * 0.44, s * 0.3, "#7099b1");
          ellipse(0, s * 0.14, 3, 3, "#f3c177");
          rect(-s * 0.45, s * 0.25, s * 0.9, s * 0.1, "#7b799b");
        }
      }
      g.restore();
    }
  }
  function draw(dt) {
    time += dt;
    g.clearRect(0, 0, viewWidth, viewHeight);
    g.fillStyle =
      theme === "space"
        ? "#272457"
        : theme === "playroom"
          ? "#f8e4c8"
          : "#bfe7e5";
    g.fillRect(0, 0, viewWidth, viewHeight);
    if (!scenery) {
      scenery = document.createElement("canvas");
      scenery.width = Math.ceil(width);
      scenery.height = Math.ceil(height);
      const live = g;
      g = scenery.getContext("2d");
      background();
      details();
      g = live;
    }
    g.drawImage(scenery, 0, 0);
    g.save();
    g.beginPath();
    g.rect(0, top, viewWidth, Math.max(1, viewHeight - top - bottom));
    g.clip();
    slots.forEach((slot, i) => {
      const p = spots[i];
      if (!slot || !p) return;
      const image = images.get(slot.id);
      if (!image) return;
      const selected = i === cursor,
        helping = i === hint && !slot.found;
      if (selected || helping) {
        g.strokeStyle = selected ? "#1672c4" : "#f7bd31";
        g.lineWidth = 5;
        g.beginPath();
        g.arc(
          p.x,
          p.y,
          p.size * 0.6 + (helping ? Math.sin(time * 4) * 4 : 0),
          0,
          Math.PI * 2,
        );
        g.stroke();
      }
      g.save();
      g.translate(p.x, p.y + (helping ? Math.sin(time * 4) * 3 : 0));
      g.rotate(p.angle);
      g.globalAlpha = slot.found ? 0.32 : 1;
      g.drawImage(image, -p.size / 2, -p.size / 2, p.size, p.size);
      g.restore();
      if (slot.found) {
        ellipse(p.x + p.size * 0.3, p.y - p.size * 0.3, 13, 13, "#388369");
        g.fillStyle = "white";
        g.font = "bold 18px sans-serif";
        g.fillText("✓", p.x + p.size * 0.3 - 7, p.y - p.size * 0.3 + 6);
      }
      if (slot.cheer > 0) {
        slot.cheer = Math.max(0, slot.cheer - dt);
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const d = (1 - slot.cheer) * 75 + 15;
          ellipse(
            p.x + Math.cos(a) * d,
            p.y + Math.sin(a) * d,
            3,
            3,
            k % 2 ? "#f7bd31" : "#f38b93",
          );
        }
      }
    });
    g.restore();
  }
  return {
    ready,
    draw,
    thumbnail: objectImage,
    layout(count, random, nextTheme) {
      theme = nextTheme;
      slots = Array(count).fill(null);
      hint = cursor = -1;
      resize();
    },
    place(i, id) {
      slots[i] = { id, found: false, cheer: 0 };
    },
    found(i) {
      if (slots[i]) {
        slots[i].found = true;
        slots[i].cheer = 1;
      }
      hint = -1;
    },
    hint(i) {
      hint = i;
    },
    cursor(i) {
      cursor = i;
    },
    wiggle(i) {
      if (slots[i]) slots[i].cheer = 0.3;
    },
    get slotCount() {
      return slots.length;
    },
    slotFood(i) {
      return slots[i]?.found ? null : slots[i]?.id;
    },
    screenOf(i) {
      const p = spots[i];
      return slots[i] && !slots[i].found && p ? { ...p } : null;
    },
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      x -= r.left;
      y -= r.top;
      if (y < top || y > viewHeight - bottom) return -1;
      let best = -1,
        distance = Infinity;
      spots.forEach((p, i) => {
        const d = Math.hypot(x - p.x, y - p.y);
        if (
          !slots[i]?.found &&
          d <= Math.max(23, p.size * 0.6) &&
          d < distance
        ) {
          best = i;
          distance = d;
        }
      });
      return best;
    },
    setInsets(a, b) {
      top = a;
      bottom = b;
      resize();
    },
    dispose() {
      observer.disconnect();
      images.clear();
      scenery = null;
    },
  };
}
