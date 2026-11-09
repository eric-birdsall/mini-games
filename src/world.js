import { frameSprinklerYard } from "./sprinklerCamera.js";
import { SPRINKLER_SITES, sprinklerStage } from "../shared/sprinklers.js";
import { dressBreakoutOrchard, isFarmFence } from "./breakoutOrchard.js";
import { skipsBackpack } from "../shared/party.js";
import {
  animateAvatar,
  createAvatar,
  disposeAvatar,
  releaseAvatar,
} from "./avatars.js";
import { createGuest } from "./guests.js";
import { avatarChoice } from "../shared/avatars.js";
import { createRobot, animateRobot } from "./robot.js";
import { eyeHeight } from "../shared/movement.js";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  WALLS,
  BOUNDS,
  raySurface,
  segmentBox,
  clearSight,
} from "../shared/map.js";
import {
  OBJECTIVE,
  OBJECTIVES,
  CONFIG,
  GADGETS,
  wetRule,
} from "../shared/config.js";
import {
  activeBuilds,
  statValue,
  GADGET_STATS,
} from "../shared/gadgetStats.js";
import {
  THROWABLE,
  throwPath,
  potatoPath,
  arcPoints,
} from "../shared/throwing.js";
import { PARTY } from "../shared/party.js";
import { HALF, HURDLE_H, LANE } from "../shared/breakout.js";
import {
  WIDTH as CHANNEL,
  DEPTH as NOOK_DEPTH,
  NOOK,
  zOf,
  groundAt,
} from "../shared/boulders.js";
import {
  PLAT,
  ARENA,
  PLAT_H,
  BALL_R,
  BALL_Y,
  HIT_HALF,
  wireAt,
  onPlatform,
} from "../shared/livewire.js";
import {
  MAPS,
  useMap,
  useObjectives,
  preRoundLine,
  stagingGate,
} from "../shared/maps.js";
import { baseOf, isPlaced, statKind } from "../shared/variants.js";
import { placementCheck, wireInset, shutterBox } from "../shared/placement.js";
import { freeDecoyPoint } from "../shared/decoy.js";
import { areaColor, colorZones, mapTheme } from "./mapColors.js";
import { structureGroups, structureEdges } from "./structure.js";
import { partsGeometry } from "./builderGeometry.js";
import { PIECE_TYPES, applyDoors, SLIM_INSET } from "../shared/customMap.js";
import { slimPart } from "../shared/pieceShapes.js";
import { TYPE_COLORS } from "../shared/pieceCatalog.js";
const RED = "#ff6f4f";
// A slim piece's box, SLIM_INSET in from each side and below its top (and
// above its bottom when it's off the ground).
function slimWall(w) {
  const bottom = w.bottom || 0,
    i = Math.min(SLIM_INSET, w.w / 4, w.d / 4, (w.h - bottom) / 4);
  return {
    ...w,
    w: w.w - i * 2,
    d: w.d - i * 2,
    h: w.h - i,
    ...(bottom ? { bottom: bottom + i } : {}),
  };
}
// A slim ramp: narrower, shorter at both ends, and its top lowered.
function slimRamp(r) {
  const [fx, fz] = { "+z": [0, 1], "-z": [0, -1], "+x": [1, 0], "-x": [-1, 0] }[
      r.toward
    ],
    i = Math.min(SLIM_INSET, r.width / 4, r.length / 4);
  return {
    ...r,
    x: r.x + fx * i,
    z: r.z + fz * i,
    width: r.width - i * 2,
    length: r.length - i * 2,
    top: r.top - i,
  };
}
export class World {
  constructor(container) {
    this.scene = new T.Scene();
    // Backyard: a clear blue summer sky, warm sun and soft bright fill.
    this.scene.background = new T.Color("#8fd3ff");
    this.scene.fog = new T.Fog("#8fd3ff", 30, 90);
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.append(this.renderer.domElement);
    this.camera = new T.PerspectiveCamera(CONFIG.fov, 1, 0.08, 140);
    this.camera.rotation.order = "YXZ";
    // Held tools live in camera space and use the same selected slot as gadgets.
    this.scene.add(this.camera);
    this.heldWeapons = new T.Group();
    this.camera.add(this.heldWeapons);
    // The water balloon (Splash and Soak), held up in the right hand.
    const balloon = this.balloonMesh();
    balloon.scale.setScalar(1.1);
    balloon.position.set(0.04, -0.1, -0.1);
    this.weaponModels = { balloon };
    this.heldWeapons.add(balloon);
    this.heldWeapons.position.set(0.24, -0.24, -0.48);
    this.dynamic = new T.Group();
    this.scene.add(this.dynamic);
    this.cache = new Map();
    this.materials = {};
    this.clock = 0;
    this.build();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  material(color, metalness = 0, roughness = 0.85) {
    return new T.MeshStandardMaterial({ color, metalness, roughness });
  }
  // One shared material per color, opacity (and base finish) for the level.
  paint(color, base = null, opacity = 1) {
    const hex = "#" + new T.Color(color).getHexString(),
      key = hex + (base?.uuid || "") + (opacity < 1 ? `@${opacity}` : "");
    let m = this.paints.get(key);
    if (!m) {
      m = base ? base.clone() : this.material(hex);
      m.color.set(hex);
      if (opacity < 1)
        Object.assign(m, { transparent: true, opacity, depthWrite: false });
      this.paints.set(key, m);
    }
    return m;
  }
  // Small static trim (painted bands, crate battens) is queued here and merged
  // into one mesh per color by flushTrim, instead of a mesh per piece.
  trim(x, y, z, w, h, d, color, shadow = false) {
    const key = `${new T.Color(color).getHexString()}|${shadow}`;
    if (!this.trimQueue.has(key)) this.trimQueue.set(key, []);
    this.trimQueue.get(key).push(new T.BoxGeometry(w, h, d).translate(x, y, z));
  }
  flushTrim() {
    for (const [key, geometries] of this.trimQueue) {
      const [hex, shadow] = key.split("|"),
        mesh = new T.Mesh(
          mergeGeometries(geometries),
          this.paint("#" + hex, this.trimBase),
        );
      for (const g of geometries) g.dispose();
      mesh.castShadow = shadow === "true";
      mesh.receiveShadow = true;
      this.level.add(mesh);
    }
    this.trimQueue.clear();
  }
  // The level never moves, so merge its plain meshes into one per material
  // and shadow setting: hundreds of draw calls become a few dozen. Labels
  // (groups), lights and the animated flag are left alone.
  mergeStatic() {
    const groups = new Map();
    for (const c of this.level.children) {
      if (
        !c.isMesh ||
        c.isInstancedMesh ||
        c.isLineSegments2 ||
        c === this.flag ||
        Array.isArray(c.material)
      )
        continue;
      // Authored pieces must retain their own geometry and identity for editor
      // raycasting and selection highlighting, even when they share a material.
      if (Number.isInteger(c.userData.pieceIndex)) continue;
      if (this.terminalBars?.some((b) => b.mesh === c)) continue;
      if (c.children.length || c.geometry.isInstancedBufferGeometry) continue;
      if (!c.geometry.index) continue;
      const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}|${c.renderOrder}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = new T.Mesh(
        mergeGeometries(geometries),
        meshes[0].material,
      );
      if (!merged.geometry) continue;
      Object.assign(merged, {
        castShadow: meshes[0].castShadow,
        receiveShadow: meshes[0].receiveShadow,
        renderOrder: meshes[0].renderOrder,
      });
      for (const g of geometries) g.dispose();
      for (const m of meshes) {
        this.level.remove(m);
        m.geometry.dispose();
      }
      this.level.add(merged);
    }
  }
  // An open-ended container: corrugation ribs down both outer sides, a door
  // frame (corner posts, header and sill) at each open end, and a cap rail.
  dressShell({ x, z, axis, length, width, height }, dark, ribColor) {
    const alongZ = axis === "z",
      // Local (u along the container, v across it) to world x/z sizes.
      at = (u, v) => (alongZ ? [x + v, z + u] : [x + u, z + v]),
      size = (du, dv) => (alongZ ? [dv, du] : [du, dv]),
      rib = (u, v) => {
        const [px, pz] = at(u, v),
          [sw, sd] = size(0.07, 0.035);
        this.trim(px, height / 2 - 0.05, pz, sw, height - 0.2, sd, ribColor);
      };
    for (let u = -length / 2 + 0.2; u < length / 2 - 0.1; u += 0.35)
      for (const v of [-width / 2 - 0.015, width / 2 + 0.015]) rib(u, v);
    for (const end of [-1, 1]) {
      const u = end * (length / 2 - 0.06);
      for (const v of [-1, 1]) {
        const [px, pz] = at(u, v * (width / 2 - 0.05)),
          [sw, sd] = size(0.14, 0.14);
        this.box(px, height / 2, pz, sw, height + 0.02, sd, dark);
      }
      for (const y of [height - 0.08, 0.04]) {
        const [px, pz] = at(u, 0),
          [sw, sd] = size(0.14, width + 0.02);
        this.box(px, y, pz, sw, y > 1 ? 0.18 : 0.08, sd, dark);
      }
    }
    const [sw, sd] = size(length + 0.08, width + 0.08);
    this.box(x, height + 0.03, z, sw, 0.06, sd, dark);
  }
  // A ramp: a box whose top slopes from `base` to `top`, with painted edge
  // lines up both sides. Returns its outline segments.
  dressRamp(
    { x, z, toward, length, width, base, top, slab },
    mat,
    line,
    editorPiece = null,
  ) {
    const [fx, fz] = {
        "+z": [0, 1],
        "-z": [0, -1],
        "+x": [1, 0],
        "-x": [-1, 0],
      }[toward],
      // Right-handed: across = up × along.
      [sx, sz] = [fz, -fx],
      floor = (s) => (slab ? height(s) - slab : base ? base - 0.01 : 0),
      at = (u, s, y) => [x + u * sx + s * fx, y, z + u * sz + s * fz],
      height = (s) => base + ((top - base) * s) / length,
      geometry = new T.BoxGeometry(1, 1, 1),
      position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i) * width,
        s = (position.getZ(i) + 0.5) * length;
      position.setXYZ(
        i,
        ...at(u, s, position.getY(i) > 0 ? height(s) : floor(s)),
      );
    }
    geometry.computeVertexNormals();
    const turf = this.level?.userData.id === "docks" && this.pierGrass;
    if (turf) {
      const uv = geometry.attributes.uv;
      for (let i = 8; i < 12; i++)
        uv.setXY(i, (uv.getX(i) * width) / 3, (uv.getY(i) * length) / 3);
    }
    const body = new T.Mesh(
      geometry,
      turf ? [mat, mat, turf, mat, mat, mat] : mat,
    );
    body.castShadow = !mat.transparent;
    body.receiveShadow = true;
    if (editorPiece) Object.assign(body.userData, editorPiece);
    this.level.add(body);
    if (!slab)
      for (const side of [-1, 1]) {
        const u = side * (width / 2 - 0.12),
          [x0, y0, z0] = at(u, 0, height(0) + 0.012),
          [x1, y1, z1] = at(u, length, height(length) + 0.012),
          stripe = new T.Mesh(new T.BoxGeometry(0.08, 0.01, 1), line);
        stripe.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        stripe.scale.z = Math.hypot(length, top - base);
        stripe.lookAt(x1, y1, z1);
        stripe.castShadow = false;
        this.level.add(stripe);
      }
    // Outline: the sloped top's edges, its ends, and the low end's lip.
    const out = [],
      seg = (a, b) => out.push(...a, ...b);
    for (const side of [-1, 1]) {
      const u = (side * width) / 2;
      seg(at(u, 0, height(0) + 0.006), at(u, length, height(length) + 0.006));
      seg(at(u, length, floor(length)), at(u, length, height(length) + 0.006));
      seg(at(u, 0, floor(0)), at(u, 0, height(0) + 0.006));
    }
    for (const s of [0, length])
      seg(
        at(-width / 2, s, height(s) + 0.006),
        at(width / 2, s, height(s) + 0.006),
      );
    return out;
  }
  box(x, y, z, w, h, d, mat, parent = this.level || this.scene) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // Breakout's low obstacle: a log lying across its lane(s), its top at the
  // hurdle's height, with pale cut ends.
  log(w) {
    const r = w.h / 2,
      len = w.w - 0.06,
      bark = this.paint("#6e4a2a"),
      cut = this.paint("#dcb57e"),
      ring = this.paint("#b98a55"),
      body = new T.Mesh(new T.CylinderGeometry(r, r * 1.04, len, 16), bark);
    body.rotation.z = Math.PI / 2;
    body.position.set(w.x, r, w.z);
    body.castShadow = body.receiveShadow = true;
    this.level.add(body);
    for (const side of [-1, 1]) {
      const x = w.x + side * (len / 2 + 0.005);
      for (const [rad, mat] of [
        [r * 0.96, cut],
        [r * 0.62, ring],
        [r * 0.48, cut],
        [r * 0.14, ring],
      ]) {
        const face = new T.Mesh(new T.CircleGeometry(rad, 16), mat);
        face.rotation.y = (side * Math.PI) / 2;
        face.position.set(x + side * (0.96 - rad / r) * 0.004, r, w.z);
        this.level.add(face);
      }
    }
    // A few knots and bark ridges along it.
    for (let i = 0; i < Math.round(len * 2); i++) {
      const knot = new T.Mesh(
        new T.SphereGeometry(0.05, 8, 6),
        this.paint("#57391f"),
      );
      const a = i * 2.3,
        x = w.x - len / 2 + 0.25 + ((i * 0.53) % (len - 0.5));
      knot.position.set(x, r + Math.cos(a) * r, w.z + Math.sin(a) * r);
      knot.scale.set(1.4, 0.6, 0.6);
      this.level.add(knot);
    }
  }
  // Breakout's tall obstacle: hay bales stacked three high across its
  // lane(s). The front face sits on the hurdle's; the bales run deeper
  // behind it.
  hayStack(w) {
    const rows = 3,
      bh = w.h / rows,
      depth = 0.9,
      per = Math.max(2, Math.round(w.w / 0.85)),
      bw = w.w / per,
      front = w.z + w.d / 2,
      twine = this.paint("#8a5a2b"),
      tones = ["#e3c25c", "#d8b54e", "#ebcd6c"];
    let n = 0;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < per; i++, n++) {
        const x = w.x - w.w / 2 + bw * (i + 0.5),
          y = bh * (row + 0.5),
          z = front - depth / 2,
          bale = new T.Group();
        bale.position.set(x, y, z);
        bale.rotation.y = (((n * 37) % 7) - 3) * 0.012;
        this.box(
          0,
          0,
          0,
          bw - 0.03,
          bh - 0.02,
          depth,
          this.paint(tones[(n * 5 + row) % 3]),
          bale,
        );
        // Straw tufts poking out, and two bands of twine round it.
        this.box(
          0,
          bh / 2 - 0.02,
          0,
          bw - 0.1,
          0.03,
          depth - 0.08,
          this.paint("#f2dc8a"),
          bale,
        ).castShadow = false;
        for (const t of [-0.28, 0.28])
          this.box(
            t * bw,
            0,
            0,
            0.035,
            bh - 0.008,
            depth + 0.012,
            twine,
            bale,
          ).castShadow = false;
        this.level.add(bale);
      }
  }
  // Splash: three droplets over a player, filled blue for each splash
  // they've taken. Sits just under a bot's "?" / "!".
  dropletMark(obj, hits, data) {
    let mark = obj.userData.dropletMark;
    if (hits === null) {
      if (mark) mark.visible = false;
      return;
    }
    this.dropletTextures ??= [];
    const out = CONFIG.splashHits,
      texture = (this.dropletTextures[hits] ??= (() => {
        const c = document.createElement("canvas");
        c.width = 48 * out;
        c.height = 64;
        const cx = c.getContext("2d");
        for (let i = 0; i < out; i++) {
          const x = 24 + i * 48;
          cx.beginPath();
          cx.moveTo(x, 8);
          cx.bezierCurveTo(x + 18, 30, x + 16, 56, x, 56);
          cx.bezierCurveTo(x - 16, 56, x - 18, 30, x, 8);
          cx.lineWidth = 5;
          cx.strokeStyle = "#0e2a44";
          cx.fillStyle = i < hits ? "#46a8ff" : "#ffffff44";
          cx.fill();
          cx.stroke();
        }
        return new T.CanvasTexture(c);
      })());
    if (!mark) {
      mark = new T.Sprite(new T.SpriteMaterial({ transparent: true }));
      mark.scale.set(0.18 * out, 0.24, 1);
      obj.add(mark);
      obj.userData.dropletMark = mark;
    }
    if (mark.material.map !== texture) {
      mark.material.map = texture;
      mark.material.needsUpdate = true;
    }
    mark.material.opacity = 1;
    mark.position.y = eyeHeight(data) + 0.32;
    mark.visible = true;
  }
  // Each splash leaves a character a little darker and shinier. Materials
  // are this character's own; their dry colour is kept to go back to.
  soak(obj, hits) {
    if ((obj.userData.soaked || 0) === hits) return;
    obj.userData.soaked = hits;
    const wet = Math.min(1, hits / CONFIG.splashHits);
    obj.traverse((c) => {
      if (!c.isMesh || !c.material?.color || c.isSprite) return;
      if (!c.userData.dry) {
        // The GLB materials belong to this avatar. Legacy meshes can share one.
        if (!obj.userData.critter) c.material = c.material.clone();
        c.userData.dry = {
          color: c.material.color.clone(),
          roughness: c.material.roughness,
        };
      }
      const dry = c.userData.dry;
      c.material.color.copy(dry.color).multiplyScalar(1 - 0.35 * wet);
      if (dry.roughness !== undefined)
        c.material.roughness = dry.roughness * (1 - 0.6 * wet);
    });
  }
  // A bot's "?" (something caught its eye) or "!" (it has seen you), over
  // its head.
  alertMark(obj, alert, data) {
    let mark = obj.userData.alertMark;
    if (!alert) {
      if (mark) mark.visible = false;
      return;
    }
    this.alertTextures ??= {};
    const texture = (this.alertTextures[alert] ??= (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const cx = c.getContext("2d");
      cx.font = "bold 56px sans-serif";
      cx.textAlign = "center";
      cx.lineWidth = 8;
      cx.strokeStyle = "#151515";
      cx.fillStyle = alert === "!" ? "#ff4d4d" : "#ffc24a";
      cx.strokeText(alert, 32, 54);
      cx.fillText(alert, 32, 54);
      return new T.CanvasTexture(c);
    })());
    if (!mark) {
      mark = new T.Sprite(new T.SpriteMaterial({ transparent: true }));
      mark.scale.setScalar(0.45);
      obj.add(mark);
      obj.userData.alertMark = mark;
    }
    if (mark.material.map !== texture) {
      mark.material.map = texture;
      mark.material.needsUpdate = true;
    }
    mark.material.opacity = 1;
    mark.position.y =
      eyeHeight(data) + (obj.userData.dropletMark?.visible ? 0.7 : 0.6);
    mark.visible = true;
  }
  label(
    text,
    x,
    y,
    z,
    rotation = 0,
    width = 3,
    color = "#e2e2e2",
    bg = "#323232",
  ) {
    // A single letter (a district's A / B / C) gets a square board, the
    // letter filling it, rather than a wide board with a small letter.
    const letter = text.length === 1,
      c = document.createElement("canvas");
    c.width = letter ? 160 : 512;
    c.height = 160;
    if (letter) width = Math.min(width, 1.5);
    const cx = c.getContext("2d");
    cx.fillStyle = this.level ? areaColor(this.level.userData.id, x, z) : bg;
    cx.fillRect(0, 0, c.width, 160);
    cx.fillStyle = color;
    cx.font = letter ? "bold 132px monospace" : "bold 75px monospace";
    cx.textAlign = "center";
    cx.fillText(text, c.width / 2, letter ? 127 : 105, c.width - 32);
    // Separate front-facing planes keep text readable from either side.
    // A DoubleSide plane mirrors its texture when viewed from behind.
    const texture = new T.CanvasTexture(c),
      material = new T.MeshBasicMaterial({
        map: texture,
        side: T.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      geometry = new T.PlaneGeometry(width, (width * 160) / c.width),
      m = new T.Group(),
      front = new T.Mesh(geometry, material),
      back = new T.Mesh(geometry, material);
    front.position.z = 0.003;
    back.position.z = -0.003;
    back.rotation.y = Math.PI;
    m.add(front, back);
    m.position.set(x, y, z);
    m.rotation.y = rotation;
    (this.level || this.scene).add(m);
    return m;
  }
  // Repeating, seeded turf and gravel textures for Pier 9 only.
  pierSurface(grass) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = grass ? "#79bd4e" : "#d9bd89";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 19;
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 6500; i++) {
      const x = random() * 256,
        y = random() * 256;
      ctx.strokeStyle = grass
        ? ["#619e3e", "#92ce62", "#addb78"][i % 3]
        : ["#c5a977", "#e6d0a5", "#bda276"][i % 3];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 3, y - (grass ? 2 + random() * 5 : 1));
      ctx.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.pierTextures.push(texture);
    return new T.MeshStandardMaterial({ map: texture, roughness: 1 });
  }
  pierFoliage() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#356532";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 71;
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = ["#528c40", "#6ba44b", "#427936", "#82ac58"][i % 4];
      ctx.beginPath();
      ctx.ellipse(
        random() * 256,
        random() * 256,
        2 + random() * 3,
        1 + random() * 2,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    this.pierTextures.push(texture);
    return new T.MeshStandardMaterial({ map: texture, roughness: 1 });
  }
  pierLawn(x, y, z, w, d, material) {
    const geometry = new T.PlaneGeometry(w, d);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * w) / 3, (uv.getY(i) * d) / 3);
    const mesh = new T.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.level.add(mesh);
    return mesh;
  }
  build() {
    // Backyard: lawn-green ground, cream fence-board walls, sky-blue metal,
    // brown timber, a coral objective colour and sunny yellow trim.
    const concrete = this.material("#8ccf63"),
      wall = this.material("#efe2c2"),
      steel = this.material("#6fa8dc", 0.2),
      dark = this.material("#8a5a3b", 0.1),
      red = this.material("#ff6f4f", 0.15),
      yellow = this.material("#ffd84a");
    this.materials = { concrete, wall, steel, dark, red, yellow };
    // Trim and labels sit millimetres off a face; a depth offset keeps them
    // in front of it (and labels in front of trim) instead of flickering.
    this.trimBase = Object.assign(this.material("#ffffff"), {
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    // Light, 2 px outlines on every wall edge: a pillar's corners stay
    // visible against the wall behind it even when both faces are in shade.
    this.edgeMaterial = new LineMaterial({ color: "#fff6dc", linewidth: 2 });
    this.scene.add(new T.HemisphereLight("#cfeaff", "#5f8a3a", 1.7));
    const sun = new T.DirectionalLight("#fff0cc", 3.8);
    sun.position.set(-22, 35, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      near: 1,
      far: 90,
    });
    sun.shadow.radius = 2;
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    // A soft fill from the opposite side, so faces turned away from the sun
    // aren't all the same near-black.
    const fill = new T.DirectionalLight("#dceeff", 1.3);
    fill.position.set(24, 16, -18);
    this.scene.add(fill);
    this.box(0, -0.3, 0, 100, 0.4, 100, this.material("#7cc35a"));
    const grid = new T.GridHelper(100, 20, "#6aad4b", "#74b852");
    grid.position.y = -0.09;
    this.scene.add(grid);
    this.groundGrid = grid;
    this.preview = new T.Mesh(
      new T.SphereGeometry(0.12, 12, 8),
      new T.MeshBasicMaterial({
        color: "#e8e8e8",
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.scene.add(this.preview);
    this.preview.visible = false;
    // Placement ghost: the device as it would be placed, white where it can go
    // and red where it can't (same rules the server applies).
    this.ghostMaterial = new T.MeshBasicMaterial({
      color: "#f2f2f2",
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const ghostBox = (w, h, d) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), this.ghostMaterial);
      this.scene.add(m);
      return m;
    };
    this.ghost = {
      anchorA: ghostBox(0.14, 0.2, 0.1),
      anchorB: ghostBox(0.14, 0.2, 0.1),
      wire: new T.Mesh(
        new T.CylinderGeometry(0.018, 0.018, 1, 6),
        this.ghostMaterial,
      ),
      camera: ghostBox(0.35, 0.22, 0.48),
      sensor: ghostBox(0.25, 0.09, 0.25),
      ring: new T.Mesh(
        new T.RingGeometry(0.96, 1, 48),
        new T.MeshBasicMaterial({
          color: "#f2f2f2",
          transparent: true,
          opacity: 0.45,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      ),
    };
    this.ghost.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ghost.wire, this.ghost.ring);
    for (const part of Object.values(this.ghost)) part.visible = false;
    // What the ghost currently says, for the HUD prompt.
    this.placement = null;
    // Throw preview: one thick red arc along the flight path, plus a red
    // disc and ring the size of the effect where it lands.
    const aim = (opacity) =>
      new T.MeshBasicMaterial({
        color: RED,
        transparent: true,
        opacity,
        depthWrite: false,
        side: T.DoubleSide,
      });
    this.throwArc = new T.Mesh(new T.BufferGeometry(), aim(0.85));
    this.throwArc.frustumCulled = false;
    this.throwRing = new T.Group();
    const disc = new T.Mesh(new T.CircleGeometry(1, 48), aim(0.16)),
      ring = new T.Mesh(new T.RingGeometry(0.94, 1, 48), aim(0.9));
    disc.rotation.x = ring.rotation.x = -Math.PI / 2;
    this.throwRing.add(disc, ring);
    this.throwArc.visible = this.throwRing.visible = false;
    this.scene.add(this.throwArc, this.throwRing);
    // Before the round: a red line across the map marks how far your team
    // may go.
    this.buyLine = new T.Mesh(
      new T.BoxGeometry(37, 0.02, 0.14),
      new T.MeshBasicMaterial({ color: RED }),
    );
    this.buyLine.visible = false;
    this.scene.add(this.buyLine);
    // Before the round: the staging gate, a solid wall across the whole map
    // between the two sides, so neither can see the other. It opens (goes)
    // when infiltration starts.
    this.gate = new T.Group();
    const panel = new T.Mesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ color: "#a8754f", roughness: 0.9 }),
    );
    panel.name = "panel";
    const stripe = new T.Mesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({ color: RED }),
    );
    stripe.name = "stripe";
    this.gate.add(panel, stripe);
    this.gate.visible = false;
    this.scene.add(this.gate);
    this.debugGroup = new T.Group();
    this.scene.add(this.debugGroup);
    this.setLevel("compound");
  }
  boulderFence(map, x0, z0, x1, z1, material) {
    const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3));
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        x = x0 + (x1 - x0) * t,
        z = z0 + (z1 - z0) * t;
      const floor = groundAt(map, map.z0 - z);
      this.box(
        x,
        floor / 2,
        z,
        0.18,
        Math.max(0.05, floor),
        0.22,
        this.paint("#72964c"),
      );
      this.box(x, floor + 1.1, z, 0.16, 2.2, 0.14, material);
    }
  }
  dressBoulderNeighborhood(map) {
    const grass = this.paint("#79ad58"),
      cream = this.paint("#f4dfb2"),
      roof = this.paint("#a85e45"),
      trim = this.paint("#fff4d8"),
      glass = this.paint("#87bed0");
    const hill = (x, y, z, radius, height) => {
      const mesh = new T.Mesh(new T.SphereGeometry(radius, 24, 12), grass);
      mesh.position.set(x, y, z);
      mesh.scale.y = height / radius;
      this.level.add(mesh);
    };
    // Rolling lawns flank the dirt run; the house sits beyond the finish.
    for (const side of [-1, 1])
      for (let s = 0; s < map.length; s += 18)
        hill(side * 17, groundAt(map, s) - 8, zOf(map, s), 17, 10);
    const z = zOf(map, map.length + 28),
      y = map.rise + 4;
    hill(0, map.rise - 7, z - 2, 26, 11);
    this.box(0, y + 2.5, z, 9, 5, 7, cream);
    const cap = new T.Mesh(new T.CylinderGeometry(0, 7, 3.5, 4), roof);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(0, y + 6.5, z);
    cap.scale.z = 0.85;
    this.level.add(cap);
    this.box(0, y + 1.3, z + 3.54, 1.5, 2.6, 0.12, this.paint("#67918b"));
    for (const x of [-2.8, 2.8]) {
      this.box(x, y + 2.8, z + 3.55, 1.7, 1.8, 0.12, trim);
      this.box(x, y + 2.8, z + 3.63, 1.4, 1.5, 0.08, glass);
    }
    for (const side of [-1, 1])
      for (let s = 8; s < map.length + 20; s += 24) {
        const x = side * (12 + (s % 5)),
          z = zOf(map, s),
          y = groundAt(map, s);
        this.box(x, y + 1.5, z, 0.5, 3, 0.5, this.paint("#936c43"));
        const leaves = new T.Mesh(
          new T.IcosahedronGeometry(2.6, 1),
          this.paint("#548c47"),
        );
        leaves.position.set(x, y + 4, z);
        this.level.add(leaves);
      }
  }
  // Rebuild the map-specific geometry: solid boxes, the flag court, lamps,
  // signage and set dressing. Environment (lights, ground) stays.
  // `objectives` is the match's objective mode (plant & defend leaves some
  // terminals out; they stand there switched off).
  setLevel(id, objectives = "extract") {
    const map = useMap(id);
    useObjectives(objectives);
    if (
      this.level?.userData.id === id &&
      this.level.userData.objectives === objectives
    )
      return;
    if (this.level) {
      this.scene.remove(this.level);
      this.level.traverse((c) => {
        c.geometry?.dispose();
        if (
          !Object.values(this.materials).includes(c.material) &&
          c.material !== this.edgeMaterial
        )
          for (const material of [c.material].flat())
            if (!Object.values(this.materials).includes(material))
              material?.dispose?.();
      });
    }
    for (const texture of this.pierTextures || []) texture.dispose();
    this.pierTextures = [];
    this.paints = new Map();
    this.leafDoors = [];
    this.oneWayPanes = [];
    this.pickProxy = new T.MeshBasicMaterial({ visible: false });
    this.trimQueue = new Map();
    this.doors = [];
    this.doorScreens = [];
    this.level = new T.Group();
    this.level.userData.id = id;
    this.level.userData.objectives = objectives;
    this.scene.add(this.level);
    this.groundGrid.visible =
      !map.livewire && !map.sprinklers && !map.boulders && !map.breakout;
    const theme = mapTheme(id);
    this.scene.background.set(theme.sky);
    this.scene.fog.color.set(theme.sky);
    Object.assign(
      this.scene.fog,
      map.breakout || map.boulders
        ? { near: 90, far: 420 }
        : { near: 30, far: 90 },
    );
    this.sky = theme.sky;
    this.smothered = false;
    const pier = id === "docks";
    const { concrete, wall, steel, dark, red, yellow } = pier
      ? {
          concrete: this.material("#8fc964"),
          wall: this.material("#fff0d0"),
          steel: this.material("#7bc9df"),
          dark: this.material("#ba8658"),
          red: this.material("#ff887c"),
          yellow: this.material("#ffe88a"),
        }
      : this.materials;
    const lawn = pier ? this.pierSurface(true) : null;
    const path = pier ? this.pierSurface(false) : null;
    this.pierGrass = lawn;
    this.pierLeaves = pier || map.sprinklers ? this.pierFoliage() : null;
    // The concrete pad, with expansion joints, sized to this map.
    const { x: bx, z: bz } = BOUNDS,
      joint = this.material("#76b852");
    this.box(
      0,
      -0.08,
      0,
      bx * 2,
      0.1,
      bz * 2,
      map.boulders
        ? this.paint("#79ad58")
        : map.sprinklers
          ? this.paint("#70b94f")
          : map.breakout
            ? this.paint("#aa8956")
            : concrete,
    );
    if (map.sprinklers) this.dressSprinklerNeighborhood();
    if (pier) this.pierLawn(0, -0.022, 0, bx * 2, bz * 2, lawn);
    for (
      let z = -bz + 0.5;
      !pier && !map.sprinklers && !map.breakout && !map.boulders && z < bz;
      z += 4
    )
      this.box(0, -0.015, z, bx * 2, 0.012, 0.025, joint);
    for (
      let x = -bx + 0.5;
      !pier && !map.sprinklers && !map.breakout && !map.boulders && x < bx;
      x += 4
    )
      this.box(x, -0.01, 0, 0.025, 0.01, bz * 2, joint);
    // Broad colored paving connects each route to its walls and high ground.
    for (const zone of pier || map.breakout || map.sprinklers || map.boulders
      ? []
      : colorZones(id, BOUNDS)) {
      const paint = this.material(
        new T.Color(zone.color).lerp(new T.Color("#f4ecd2"), 0.2),
      );
      this.box(zone.x, 0.003, zone.z, zone.w, 0.008, zone.d, paint).castShadow =
        false;
    }
    if (pier) {
      // Narrow dirt routes leave the surrounding floor visibly grassy.
      for (const x of [-18, 0, 18]) this.pierLawn(x, 0.009, 5, 2.4, 51, path);
      for (const z of [28.5, -25.5])
        this.pierLawn(0, 0.011, z, bx * 2, 2.6, path);
      this.pierLawn(-11.5, 0.013, 4, 23, 2.5, path);
      this.pierLawn(10.5, 0.013, -4, 21, 2.5, path);
    }
    // Breakout: the exit, a glowing green line across the hallway with a
    // sign over it, and lines on the floor between the three lanes.
    if (map.breakout) {
      dressBreakoutOrchard(this, map);
      const exit = new T.MeshBasicMaterial({ color: "#3ee07a" }),
        { x, z } = map.finish;
      this.box(x, 0.012, z, HALF * 2, 0.012, 0.35, exit).castShadow = false;
      this.box(x, 3.3, z - 0.1, 1.6, 0.45, 0.08, exit).castShadow = false;
      const arrow = new T.MeshBasicMaterial({
        color: "#f2f2ea",
        transparent: true,
        opacity: 0.55,
      });
      const [a, b] = map.path.points;
      for (const side of [-0.5, 0.5])
        this.box(
          side * LANE,
          0.014,
          (a.z + b.z) / 2,
          0.08,
          0.006,
          Math.abs(a.z - b.z),
          arrow,
        ).castShadow = false;
    }
    // Boulder Dash: the finish line across the top, the dark portal the
    // boulders come out of, and each recess lit, with a stripe along its
    // mouth so you can pick it out from down the channel.
    if (map.boulders) {
      this.dressBoulderNeighborhood(map);
      const glow = (color) => new T.MeshBasicMaterial({ color }),
        across = CHANNEL + NOOK_DEPTH * 2,
        portalZ = zOf(map, map.length + 9);
      const finishZ = map.finish.z;
      const white = glow("#fff9e8");
      const navy = glow("#182539");
      const tile = across / 10;
      for (let col = 0; col < 10; col++) {
        for (let row = 0; row < 2; row++) {
          this.box(
            (col - 4.5) * tile,
            map.rise + 0.018,
            finishZ + (row - 0.5) * 0.45,
            tile,
            0.02,
            0.45,
            (col + row) % 2 ? navy : white,
          ).castShadow = false;
        }
      }
      const trim = glow("#40e88b");
      for (const side of [-1, 1]) {
        this.box(
          side * (across / 2 - 0.12),
          map.rise + 2.45,
          finishZ,
          0.24,
          4.9,
          0.24,
          trim,
        ).castShadow = false;
      }
      const finishArch = this.box(
        0,
        map.rise + 4.9,
        finishZ,
        across,
        1.25,
        0.24,
        trim,
      );
      finishArch.castShadow = false;
      const banner = document.createElement("canvas");
      banner.width = 768;
      banner.height = 144;
      const ctx = banner.getContext("2d");
      ctx.fillStyle = "#182539";
      ctx.fillRect(0, 0, banner.width, banner.height);
      ctx.fillStyle = "#fff9e8";
      ctx.font = "900 112px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FINISH", banner.width / 2, banner.height / 2);
      const bannerTexture = new T.CanvasTexture(banner);
      bannerTexture.colorSpace = T.SRGBColorSpace;
      const finishSign = new T.Mesh(
        new T.PlaneGeometry(across - 0.22, 1.04),
        new T.MeshBasicMaterial({ map: bannerTexture, toneMapped: false }),
      );
      finishSign.position.z = 0.125;
      finishArch.add(finishSign);
      this.box(
        0,
        map.rise + 2.1,
        portalZ + 0.05,
        CHANNEL - 0.2,
        4.2,
        0.1,
        glow("#141414"),
      ).castShadow = false;
      for (const x of [-1, 1])
        this.box(
          (x * (CHANNEL - 0.1)) / 2,
          map.rise + 2.1,
          portalZ + 0.08,
          0.14,
          4.3,
          0.12,
          glow("#f2c230"),
        ).castShadow = false;
      this.box(
        0,
        map.rise + 4.27,
        portalZ + 0.08,
        CHANNEL,
        0.14,
        0.12,
        glow("#f2c230"),
      ).castShadow = false;
      const lamp = glow("#ffb347"),
        mouth = glow("#f2c230"),
        tilt = Math.atan(PARTY.boulders.slope);
      for (const r of map.recesses) {
        const back = r.side * (CHANNEL / 2 + NOOK_DEPTH - 0.03);
        const inner = r.side * (CHANNEL / 2 + 0.1);
        const outer = r.side * (CHANNEL / 2 + NOOK_DEPTH + 0.1);
        // Complete the U-shaped enclosure, leaving its channel entrance open.
        for (const edge of [-1, 1]) {
          const z = r.z + (edge * NOOK) / 2;
          this.boulderFence(map, inner, z, outer, z, this.paint("#c69a65"));
          const y = groundAt(map, map.z0 - z);
          this.box(inner, y + 1.16, z, 0.24, 2.32, 0.24, this.paint("#fff1c9"));
        }
        const pad = this.box(
          r.x,
          r.y + 0.045,
          r.z,
          NOOK_DEPTH - 0.12,
          0.025,
          NOOK * Math.sqrt(1 + PARTY.boulders.slope ** 2),
          this.paint("#489f92"),
        );
        pad.rotation.x = tilt;
        pad.castShadow = false;
        // A pale inset marker reads from downhill even behind the pickets.
        this.box(
          back - r.side * 0.12,
          r.y + 1.5,
          r.z,
          0.08,
          0.5,
          0.8,
          this.paint("#fff1c9"),
        );

        this.box(
          back,
          r.y + 1.6,
          r.z,
          0.05,
          0.16,
          NOOK - 0.6,
          lamp,
        ).castShadow = false;
        const stripe = this.box(
          r.side * (CHANNEL / 2 + 0.06),
          r.y + 0.03,
          r.z,
          0.12,
          0.02,
          NOOK,
          mouth,
        );
        stripe.castShadow = false;
        stripe.rotation.x = tilt;
      }
    }
    // Beach Ball Dodge: a backyard pool with an inflatable float filling the
    // same square the server uses for footing.
    this.poolMat = null;
    this.lwRim = null;
    if (map.livewire) {
      const span = ARENA * 2;
      this.poolMat = new T.MeshStandardMaterial({
        color: "#39cce6",
        roughness: 0.24,
        metalness: 0.12,
      });
      this.box(0, -0.04, 0, 200, 0.06, 200, this.material("#83be68")).castShadow = false;
      // The pool deck the bots stand on, and its coping.
      this.box(0, 0.005, 0, span + 5, 0.04, span + 5, this.material("#f5dfb5"));
      const coping = this.material("#fffaf0");
      for (const side of [-1, 1]) {
        this.box(side * (ARENA + 0.15), 0.07, 0, 0.3, 0.1, span + 0.6, coping);
        this.box(0, 0.07, side * (ARENA + 0.15), span + 0.6, 0.1, 0.3, coping);
      }
      this.box(0, 0.06, 0, span, 0.04, span, this.poolMat).castShadow = false;
      // Lane lines on the pool floor, seen through the water.
      const tile = this.material("#2b9fc0");
      for (const x of [-4, 4]) this.box(x, 0.082, 0, 0.12, 0.005, span - 1.5, tile).castShadow = false;
      // Little pale ripples around the float.
      const ripple = this.material("#a8f2f6");
      for (let i = 0; i < 32; i++) {
        const x = -ARENA + 0.6 + ((i * 37) % Math.floor((span - 1.2) * 10)) / 10;
        const z = -ARENA + 0.6 + ((i * 63) % Math.floor((span - 1.2) * 10)) / 10;
        if (Math.abs(x) < PLAT + 0.4 && Math.abs(z) < PLAT + 0.4) continue;
        this.box(x, 0.09, z, 0.6, 0.01, 0.045, ripple).castShadow = false;
      }
      // An inflatable float: rounded vinyl sides, padded air chambers and a
      // contrasting rim. Its flat top matches collision height.
      const vinyl = new T.MeshStandardMaterial({ color: "#ffb347", roughness: 0.34 }),
        creamVinyl = new T.MeshStandardMaterial({ color: "#fff3da", roughness: 0.4 });
      const pillow = (x, y, z, w, h, d, radius, material) => {
        const mesh = new T.Mesh(new RoundedBoxGeometry(w, h, d, 6, radius), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.level.add(mesh);
        return mesh;
      };
      pillow(0, PLAT_H - 0.35, 0, PLAT * 2, 0.5, PLAT * 2, 0.24, vinyl);
      const inside = PLAT * 2 - 1.0,
        pitch = inside / 6;
      for (let i = 0; i < 6; i++)
        pillow(-inside / 2 + pitch * (i + 0.5), PLAT_H - 0.075, 0, pitch - 0.035, 0.15, inside, 0.07, i % 2 ? vinyl : creamVinyl);
      this.lwRim = new T.MeshStandardMaterial({ color: "#ff8a73", roughness: 0.35 });
      for (const [x, z, w, d] of [
        [0, PLAT - 0.22, PLAT * 2 - 0.25, 0.44],
        [0, -PLAT + 0.22, PLAT * 2 - 0.25, 0.44],
        [PLAT - 0.22, 0, 0.44, PLAT * 2 - 0.25],
        [-PLAT + 0.22, 0, 0.44, PLAT * 2 - 0.25],
      ])
        pillow(x, PLAT_H - 0.15, z, w, 0.3, d, 0.13, this.lwRim);
      // A cream cottage behind the pool, with a coral gable and blue windows.
      const cream = this.material("#fff2d1"),
        coral = this.material("#e88870"),
        blue = this.material("#74bed4"),
        white = this.material("#ffffff");
      this.box(0, 2.5, -ARENA - 7, 16, 5, 6, cream);
      for (const side of [-1, 1]) {
        const roof = this.box(0, 5.9, -ARENA - 7 + side * 1.5, 17, 0.18, 3.6, coral);
        roof.rotation.x = side * Math.atan2(1.8, 3);
      }
      for (const x of [-5.5, 5.5]) {
        this.box(x, 2.8, -ARENA - 3.96, 2.3, 2.1, 0.08, white);
        this.box(x, 2.8, -ARENA - 3.9, 1.9, 1.7, 0.08, blue);
        this.box(x, 2.8, -ARENA - 3.84, 0.08, 1.7, 0.08, white);
      }
      this.box(0, 1.65, -ARENA - 3.9, 2, 3.3, 0.12, this.material("#6fae9f"));
      // Picket fence, shrubs and striped pool towels.
      for (const side of [-1, 1]) {
        for (let z = -ARENA - 1; z < ARENA + 5; z += 0.65)
          this.box(side * (ARENA + 4.5), 1, z, 0.18, 2, 0.4, white);
        this.box(side * (ARENA + 4.5), 0.8, 1, 0.13, 0.12, span + 8, white);
        for (const z of [-7, 0, 7]) {
          const shrub = new T.Mesh(new T.SphereGeometry(1.1, 12, 8), this.material("#4c9858"));
          shrub.position.set(side * (ARENA + 6.5), 1, z);
          this.level.add(shrub);
        }
        for (const z of [-4.5, 4.5])
          this.box(side * (ARENA + 2.6), 0.03, z, 1.2, 0.02, 2.5, this.material(side < 0 ? "#ffb2c4" : "#a4a0ed"));
      }
    }
    // Pieces of one structure (stair steps, a split wall, a platform and its
    // stairs) share a shade and an outline, so they read as one piece.
    const groups = structureGroups(WALLS),
      edgePoints = structureEdges(
        WALLS.filter(
          (w) =>
            w.style !== "hedge" &&
            w.style !== "gardenFence" &&
            !(map.breakout && (isFarmFence(w) || w.breakout)),
        ),
      );
    WALLS.forEach((source, index) => {
      // A slim builder piece is drawn a little inside its collision box.
      const w = source.slim ? slimWall(source) : source,
        lead = WALLS[groups[index]];
      const mat =
        w.kind === "container"
          ? steel
          : ["cover", "platform", "stairs", "ramp"].includes(w.kind)
            ? concrete
            : wall;
      // A clearly different shade per structure, so ones that overlap in
      // view still read as separate surfaces.
      const tone =
          0.8 +
          ((Math.abs(Math.round(lead.x * 7 + lead.z * 13)) % 5) / 4) * 0.4,
        shaded = this.paint(
          w.color
            ? new T.Color(w.color)
            : w.kind === "crane"
              ? new T.Color("#d39a2c")
              : w.style === "crate"
                ? new T.Color("#a17b50")
                    .lerp(new T.Color(areaColor(id, lead.x, lead.z)), 0.18)
                    .multiplyScalar(tone)
                : new T.Color(areaColor(id, lead.x, lead.z)).multiplyScalar(
                    tone,
                  ),
          mat,
          w.opacity,
        );
      // Invisible barriers (the waterline) aren't drawn.
      // One-way glass is drawn by dressBunker (see-through from inside).
      if (w.hidden || w.kind === "glass" || (map.breakout && isFarmFence(w)))
        return;
      // Breakout's obstacles: a log to jump, or a stack of hay bales to go
      // around.
      if (map.breakout && w.breakout) {
        if (w.h > HURDLE_H) this.hayStack(w);
        else this.log(w);
        return;
      }
      if (w.style === "gardenFence") {
        // Side pieces can be shorter than their collision depth near a nook.
        // Their position, rather than aspect ratio, determines orientation.
        const alongX = w.x === 0;
        const x = alongX ? w.x : w.x - Math.sign(w.x) * (w.w / 2 - 0.1);
        this.boulderFence(
          map,
          x - (alongX ? w.w / 2 : 0),
          w.z - (alongX ? 0 : w.d / 2),
          x + (alongX ? w.w / 2 : 0),
          w.z + (alongX ? 0 : w.d / 2),
          shaded,
        );
        return;
      }
      if (w.style === "hedge") {
        // The dense body fills the exact server-side sight/collision box.
        this.box(w.x, w.h / 2, w.z, w.w, w.h, w.d, this.pierLeaves);
        for (let x = w.x - w.w / 2 + 0.25; x < w.x + w.w / 2; x += 0.55) {
          const leaf = new T.Mesh(new T.IcosahedronGeometry(0.48, 0), shaded);
          leaf.position.set(x, w.h - 0.14, w.z);
          leaf.scale.set(1, 0.65, w.d / 0.9);
          leaf.castShadow = true;
          this.level.add(leaf);
        }
        return;
      }
      if (w.style === "stairRail") {
        this.box(w.x, w.bottom + 0.48, w.z, 0.1, 0.96, 0.1, shaded);
        const rail = new T.Mesh(new T.BoxGeometry(0.12, 0.12, 0.73), shaded);
        rail.position.set(w.x, w.h - 0.08, w.z);
        rail.rotation.x = -Math.atan2(0.4, 0.6);
        this.level.add(rail);
        return;
      }
      if (w.style === "pool") {
        this.box(w.x, 0.08, w.z, w.w, 0.16, w.d, shaded);
        const water = this.paint("#39bfd4");
        this.box(w.x, 0.17, w.z, w.w - 0.8, 0.025, w.d - 0.8, water);
        const ripple = this.paint("#a2e8ed");
        for (let z = w.z - w.d / 2 + 0.7; z < w.z + w.d / 2 - 0.5; z += 0.65)
          this.box(w.x, 0.185, z, w.w - 1.1, 0.008, 0.025, ripple);
        return;
      }
      if (w.style === "poolFence") {
        const alongX = w.w > w.d,
          length = Math.max(w.w, w.d);
        const count = Math.ceil(length / 0.45);
        for (let i = 0; i <= count; i++) {
          const offset = -length / 2 + (length * i) / count;
          this.box(
            w.x + (alongX ? offset : 0),
            w.h / 2,
            w.z + (alongX ? 0 : offset),
            0.045,
            w.h,
            0.045,
            shaded,
          );
        }
        for (const y of [0.15, w.h - 0.08])
          this.box(w.x, y, w.z, w.w, 0.08, w.d, shaded);
        return;
      }
      if (w.style === "picketFence") {
        const alongX = w.w > w.d,
          length = Math.max(w.w, w.d);
        const count = Math.ceil(length / 0.28);
        for (let i = 0; i <= count; i++) {
          const offset = -length / 2 + (length * i) / count;
          const x = w.x + (alongX ? offset : 0),
            z = w.z + (alongX ? 0 : offset);
          this.box(
            x,
            0.5,
            z,
            alongX ? 0.16 : 0.1,
            1,
            alongX ? 0.1 : 0.16,
            shaded,
          );
          const tip = new T.Mesh(new T.ConeGeometry(0.115, 0.18, 4), shaded);
          tip.position.set(x, 1.09, z);
          tip.rotation.y = Math.PI / 4;
          this.level.add(tip);
        }
        for (const y of [0.3, 0.75])
          this.box(w.x, y, w.z, w.w, 0.1, w.d, shaded);
        return;
      }
      if (w.style === "estateGate") {
        const iron = this.paint("#304744"),
          stone = this.paint("#d7cbb5");
        for (const side of [-1, 1]) {
          this.box(w.x, 1.3, w.z + side * 2.75, 1.2, 2.6, 0.5, stone);
          this.box(
            w.x,
            2.7,
            w.z + side * 2.75,
            1.4,
            0.2,
            0.65,
            this.paint("#fff6e5"),
          );
        }
        for (const y of [0.35, 1.2, 2.6])
          this.box(w.x, y, w.z, 0.18, 0.14, 5.5, iron);
        for (let dz = -2.5; dz <= 2.5; dz += 0.25)
          this.box(w.x, 1.4, w.z + dz, 0.14, 2.8, 0.08, iron);
        this.box(w.x, 1.4, w.z, 0.25, 2.8, 0.16, iron);
        return;
      }
      if (w.style === "gardenFence") {
        const bottom = w.bottom || 0,
          height = w.h - bottom;
        this.box(w.x, bottom + height / 2, w.z, w.w, height, w.d, shaded);
        const fenceTrim = this.paint("#eee5d4");
        // Orient the same board detailing along either fence axis.
        const alongX = w.w > w.d,
          length = alongX ? w.w : w.d;
        for (
          let offset = -length / 2 + 0.12;
          offset < length / 2;
          offset += 0.22
        )
          for (const side of [-1, 1])
            this.box(
              w.x + (alongX ? offset : side * (w.w / 2 + 0.012)),
              bottom + height / 2,
              w.z + (alongX ? side * (w.d / 2 + 0.012) : offset),
              0.018,
              height,
              0.018,
              fenceTrim,
            );
        for (const y of [bottom + 0.2, w.h - 0.2])
          if (y > bottom && y < w.h)
            this.box(
              w.x,
              y,
              w.z,
              w.w + (alongX ? 0 : 0.08),
              0.1,
              w.d + (alongX ? 0.08 : 0),
              fenceTrim,
            );
        return;
      }
      // A ramp's columns are drawn once, as one smooth slope.
      if (w.ramp) {
        if (WALLS.find((o) => o.ramp === w.ramp) === source)
          edgePoints.push(
            ...this.dressRamp(
              w.slim ? slimRamp(w.ramp) : w.ramp,
              shaded,
              yellow,
              {
                pieceIndex: w.pieceIndex,
                pieceId: w.pieceId,
              },
            ),
          );
        return;
      }
      // Builder round pieces: a plain column from their base, pickable.
      if (w.shape === "cylinder" && Number.isInteger(w.pieceIndex)) {
        const bottom = w.bottom || 0,
          body = new T.Mesh(
            new T.CylinderGeometry(w.w / 2, w.w / 2, w.h - bottom, 32),
            shaded,
          );
        body.position.set(w.x, (bottom + w.h) / 2, w.z);
        body.castShadow = !w.opacity;
        body.receiveShadow = true;
        Object.assign(body.userData, {
          pieceIndex: w.pieceIndex,
          pieceId: w.pieceId,
        });
        this.level.add(body);
        return;
      }
      if (w.shape === "cylinder") {
        const radius = w.w / 2,
          body = new T.Mesh(
            new T.CylinderGeometry(radius, radius, w.h, 32),
            shaded,
          );
        body.position.set(w.x, w.h / 2, w.z);
        body.castShadow = body.receiveShadow = true;
        this.level.add(body);
        for (const y of [0.08, w.h - 0.08]) {
          const rim = new T.Mesh(
            new T.TorusGeometry(radius + 0.01, 0.025, 6, 32),
            dark,
          );
          rim.rotation.x = Math.PI / 2;
          rim.position.set(w.x, y, w.z);
          this.level.add(rim);
        }
        const stripe = new T.Mesh(
          new T.CylinderGeometry(radius + 0.008, radius + 0.008, 0.12, 32),
          this.paint(new T.Color(areaColor(id, w.x, w.z)).multiplyScalar(1.5)),
        );
        stripe.position.set(w.x, w.h * 0.65, w.z);
        stripe.castShadow = false;
        this.level.add(stripe);
        return;
      }
      // Paint the faces facing each route in that route's color. This also
      // distinguishes the two sides of a divider between neighboring lanes.
      const faces = [
        [w.x + w.w / 2 + 0.008, w.z, 0.014, w.d],
        [w.x - w.w / 2 - 0.008, w.z, 0.014, w.d],
        [w.x, w.z + w.d / 2 + 0.008, w.w, 0.014],
        [w.x, w.z - w.d / 2 - 0.008, w.w, 0.014],
      ];
      // A face pressed against another piece is inside the structure: skip it.
      const band = Math.min(1.45, w.h * 0.6),
        buried = (x, z) =>
          WALLS.some(
            (o) =>
              o !== source &&
              !o.shape &&
              band > (o.bottom || 0) &&
              band < o.h &&
              Math.abs(x - o.x) < o.w / 2 &&
              Math.abs(z - o.z) < o.d / 2,
          );
      const banded =
        !["container", "tank", "crane"].includes(w.kind) &&
        !["rack", "trailer"].includes(w.style);
      if (banded && !w.color && !w.opacity && !w.bottom && w.h >= 1.5)
        for (const [x, z, width, depth] of faces)
          if (!buried(x, z))
            this.trim(
              x,
              band,
              z,
              width,
              0.3,
              depth,
              new T.Color(areaColor(id, x, z)).multiplyScalar(1.3),
            );
      const bottom = w.bottom || 0,
        thickness = w.h - bottom,
        body = this.box(
          w.x,
          bottom + thickness / 2,
          w.z,
          w.w,
          thickness,
          w.d,
          shaded,
        );
      Object.assign(body.userData, {
        pieceIndex: w.pieceIndex,
        pieceId: w.pieceId,
      });
      // See-through pieces let light through too.
      if (w.opacity) body.castShadow = false;
      if (w.style === "crate") {
        const frame = "#554632";
        // Inset timber battens, metal caps and a seam on taller crate stacks.
        for (const sign of [-1, 1]) {
          this.trim(
            w.x + sign * (w.w / 2 - 0.07),
            w.h / 2,
            w.z,
            w.w > 0.3 ? 0.08 : 0.04,
            w.h + 0.02,
            w.d + 0.02,
            frame,
            true,
          );
          this.trim(
            w.x,
            w.h / 2,
            w.z + sign * (w.d / 2 - 0.07),
            w.w + 0.02,
            w.h + 0.02,
            0.08,
            frame,
            true,
          );
        }
        if (w.h > 1.5)
          this.trim(
            w.x,
            w.h / 2,
            w.z,
            w.w + 0.02,
            0.05,
            w.d + 0.02,
            frame,
            true,
          );
      }
      // Open containers: the roof dresses the whole shell once.
      if (w.shell && w.bottom)
        this.dressShell(
          w.shell,
          dark,
          new T.Color(areaColor(id, w.x, w.z)).multiplyScalar(0.62),
        );
      // (Builder containers are hollow and drawn plain.)
      if (
        w.kind === "container" &&
        !w.shell &&
        !Number.isInteger(w.pieceIndex)
      ) {
        // Corrugation down the long sides of each stacked tier, a cap on
        // each tier, and a stencil on the ground tier's end.
        const alongZ = w.d >= w.w,
          length = alongZ ? w.d : w.w,
          tiers = Math.max(1, Math.round(w.h / 2.6)),
          tier = w.h / tiers;
        for (let k = 0; k < tiers; k++) {
          const y = k * tier;
          for (let u = -length / 2 + 0.15; u < length / 2; u += 0.35)
            for (const side of [-1, 1])
              alongZ
                ? this.box(
                    w.x + side * (w.w / 2 + 0.025),
                    y + tier / 2 - 0.05,
                    w.z + u,
                    0.06,
                    tier - 0.2,
                    0.055,
                    dark,
                  )
                : this.box(
                    w.x + u,
                    y + tier / 2 - 0.05,
                    w.z + side * (w.d / 2 + 0.025),
                    0.055,
                    tier - 0.2,
                    0.06,
                    dark,
                  );
          this.box(w.x, y + tier + 0.03, w.z, w.w + 0.1, 0.06, w.d + 0.1, dark);
        }
      }
      if (w.style === "rack") {
        // Shelf boards and uprights.
        for (const y of [0.9, 1.8, 2.7])
          this.box(w.x, y, w.z, w.w + 0.08, 0.06, w.d + 0.04, dark);
        for (let u = -w.d / 2 + 0.05; u <= w.d / 2; u += 2)
          this.box(w.x, w.h / 2, w.z + u, w.w + 0.1, w.h, 0.08, steel);
      }
      if (w.style === "trailer") {
        // Chassis rail and a band of reflective tape.
        this.box(w.x, 0.35, w.z, w.w + 0.04, 0.3, w.d + 0.04, dark);
        this.box(w.x, 1.2, w.z, w.w + 0.03, 0.08, w.d + 0.03, red);
      }
      if (w.kind === "crane" && !w.bottom)
        // Cross-bracing rungs up each leg.
        for (let y = 2; y < w.h; y += 2)
          this.box(w.x, y, w.z, w.w + 0.12, 0.1, w.d + 0.12, dark);
      if (w.kind === "cover") {
        this.box(w.x, w.h + 0.02, w.z, w.w, 0.04, w.d, dark);
        for (let i = -w.w / 2 + 0.2; i < w.w / 2; i += 0.5)
          this.box(
            w.x + i,
            w.h - 0.12,
            w.z + w.d / 2 + 0.01,
            0.23,
            0.13,
            0.015,
            yellow,
          );
      }
      if (w.style === "backDeck") {
        // Narrow seams give the attached deck a timber plank surface.
        for (let z = w.z - w.d / 2 + 0.25; z < w.z + w.d / 2; z += 0.3)
          this.box(w.x, w.h + 0.005, z, w.w, 0.01, 0.018, dark);
      }
      if (
        pier &&
        w.style !== "backDeck" &&
        ["platform", "stairs"].includes(w.kind)
      )
        this.pierLawn(w.x, w.h + 0.075, w.z, w.w, w.d, lawn);
      if (w.kind === "platform" && !pier) {
        // A dark lip and a painted edge line mark high ground.
        this.box(w.x, w.h + 0.02, w.z, w.w + 0.06, 0.05, w.d + 0.06, shaded);
        this.box(
          w.x,
          w.h + 0.05,
          w.z + w.d / 2 - 0.12,
          w.w,
          0.01,
          0.08,
          yellow,
        );
        this.box(
          w.x,
          w.h + 0.05,
          w.z - w.d / 2 + 0.12,
          w.w,
          0.01,
          0.08,
          yellow,
        );
      }
      if (w.kind === "stairs" && !pier)
        this.box(w.x, w.h + 0.016, w.z, w.w, 0.03, w.d, shaded);
      if (w.kind === "building")
        this.box(w.x, w.h + 0.03, w.z, w.w + 0.12, 0.1, w.d + 0.12, dark);
    });
    for (const [x, z] of map.lamps || [
      [-17, 19],
      [16, 22],
      [17, -23],
      [-17, -23],
    ]) {
      this.box(x, 3, z, 0.12, 6, 0.12, dark);
      this.box(x, 6, z, 1.3, 0.16, 0.5, dark);
      const light = new T.PointLight("#ebebeb", 5, 10);
      light.position.set(x, 5, z);
      this.level.add(light);
    }
    // Painted thresholds make the openings discoverable.
    const tunnelTrim = new T.MeshBasicMaterial({ color: "#e8d7a6" });
    for (const p of map.passages || []) {
      if (p.container) continue; // Dressed as containers instead.
      const alongX = p.axis === "x";
      for (const sign of [-1, 1]) {
        const x = p.x + (alongX ? (sign * p.w) / 2 : 0),
          z = p.z + (alongX ? 0 : (sign * p.d) / 2);
        this.box(
          x,
          0.018,
          z,
          alongX ? 0.12 : p.w,
          0.02,
          alongX ? p.d : 0.12,
          tunnelTrim,
        ).castShadow = false;
      }
    }
    // Map railings (their collision is hidden): heavy end posts, posts about
    // every 1.2 m, a top rail, two mid rails and a kick plate, so a guarded
    // edge reads from across the map. Drop gaps get a hazard stripe.
    for (const w of WALLS.filter((w) => w.railing)) {
      if (pier) {
        const alongX = w.w > w.d,
          length = alongX ? w.w : w.d;
        const base = w.bottom || 0,
          h = w.h - base;
        const white = this.paint("#fffdf3");
        const at = (u, y, width, height, depth) =>
          this.box(
            w.x + (alongX ? u : 0),
            y,
            w.z + (alongX ? 0 : u),
            alongX ? width : depth,
            height,
            alongX ? depth : width,
            white,
          );
        const count = Math.max(1, Math.ceil(length / 0.24));
        for (let i = 0; i <= count; i++) {
          const u = -length / 2 + (length * i) / count;
          at(u, base + h * 0.45, 0.13, h * 0.9, 0.065);
          const cap = new T.Mesh(new T.ConeGeometry(0.092, h * 0.1, 4), white);
          cap.rotation.y = Math.PI / 4;
          cap.position.set(
            w.x + (alongX ? u : 0),
            base + h * 0.95,
            w.z + (alongX ? 0 : u),
          );
          this.level.add(cap);
        }
        for (const fraction of [0.25, 0.67])
          at(0, base + h * fraction, length, 0.09, 0.09);
        continue;
      }
      const alongX = w.w > w.d,
        length = alongX ? w.w : w.d,
        base = w.bottom || 0,
        h = w.h - base,
        n = Math.max(1, Math.round(length / 1.2)),
        at = (u, y, size, height, across = size) =>
          this.box(
            w.x + (alongX ? u : 0),
            y,
            w.z + (alongX ? 0 : u),
            alongX ? size : across,
            height,
            alongX ? across : size,
            steel,
          );
      for (let i = 0; i <= n; i++) {
        const end = i === 0 || i === n;
        at(-length / 2 + (length * i) / n, base + h / 2, end ? 0.1 : 0.06, h);
      }
      at(0, w.h - 0.03, length, 0.07, 0.08);
      for (const y of [0.4, 0.68]) at(0, base + h * y, length, 0.04, 0.04);
      at(0, base + 0.07, length, 0.14, 0.03).material = dark;
    }
    for (const d of map.drops || []) {
      const alongX = d.axis === "x";
      this.box(
        d.x,
        d.h + 0.012,
        d.z,
        alongX ? 1.3 : 0.5,
        0.02,
        alongX ? 0.5 : 1.3,
        yellow,
      ).castShadow = false;
    }
    // Builder pieces' drawn-only parts: curves, and the posts, rails, bars
    // and mesh of see-through fences (their collision is hidden in WALLS).
    for (const piece of map.decor || []) {
      const d = piece.slim
        ? { ...piece, parts: piece.parts.map((p) => slimPart(p, SLIM_INSET)) }
        : piece;
      // Like walls, an unpainted curve takes its area's color; fences are
      // metal-colored.
      const type = PIECE_TYPES[d.t],
        metal =
          type.see || ["ladder", "glass", "leafDoor"].includes(type.shape),
        [first] = d.parts,
        color =
          d.color ||
          (metal || type.soft
            ? TYPE_COLORS[d.t]
            : areaColor(id, first.cx ?? first.x0, first.cz ?? first.z0)),
        finish = metal ? steel : concrete,
        add = (parts, opacity) => {
          const geometry = partsGeometry(parts);
          if (!geometry) return;
          const mesh = new T.Mesh(
            geometry,
            this.paint(color, finish, Math.round(opacity * 100) / 100),
          );
          mesh.castShadow = opacity >= 1;
          mesh.receiveShadow = true;
          Object.assign(mesh.userData, {
            pieceIndex: d.pieceIndex,
            pieceId: d.pieceId,
          });
          this.level.add(mesh);
        };
      add(
        d.parts.filter((p) => !["panel", "leaf", "glass"].includes(p.role)),
        d.opacity || 1,
      );
      // A door's leaf swings about its hinge (see render).
      for (const leaf of d.parts.filter((p) => p.role === "leaf")) {
        const pivot = new T.Group(),
          mesh = new T.Mesh(
            partsGeometry([leaf], { x: leaf.hinge.x, y: 0, z: leaf.hinge.z }),
            this.paint(
              d.color || TYPE_COLORS[d.t],
              steel,
              Math.round((d.opacity || 1) * 100) / 100,
            ),
          );
        mesh.castShadow = mesh.receiveShadow = true;
        Object.assign(mesh.userData, {
          pieceIndex: d.pieceIndex,
          pieceId: d.pieceId,
        });
        pivot.position.set(leaf.hinge.x, 0, leaf.hinge.z);
        pivot.add(mesh);
        this.level.add(pivot);
        this.leafDoors.push({ pieceIndex: d.pieceIndex, pivot, swing: 0 });
      }
      // One-way glass: clear to the side that sees through, a dark mirror to
      // the other (see render).
      for (const pane of d.parts.filter((p) => p.role === "glass")) {
        const mesh = new T.Mesh(
          partsGeometry([pane]),
          new T.MeshStandardMaterial({
            color: "#9fc3cf",
            metalness: 0.6,
            roughness: 0.1,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        );
        Object.assign(mesh.userData, {
          pieceIndex: d.pieceIndex,
          pieceId: d.pieceId,
        });
        this.level.add(mesh);
        this.oneWayPanes.push({ mesh, team: type.oneWay });
      }
      add(
        d.parts.filter((p) => p.role === "panel"),
        (d.opacity || 1) * 0.3,
      );
      // Thin bars are hard to aim at: an invisible box over the whole run
      // lets the editor pick (and outline) a see-through piece.
      if (type.see || ["ladder", "glass"].includes(type.shape)) {
        const span = (key, f) => f(...d.parts.map((p) => p[key])),
          [x0, x1, y0, y1, z0, z1] = [
            span("x0", Math.min),
            span("x1", Math.max),
            span("y0", Math.min),
            span("y1", Math.max),
            span("z0", Math.min),
            span("z1", Math.max),
          ],
          proxy = new T.Mesh(
            new T.BoxGeometry(
              Math.max(x1 - x0, 0.02),
              y1 - y0,
              Math.max(z1 - z0, 0.02),
            ),
            this.pickProxy,
          );
        proxy.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        proxy.castShadow = proxy.receiveShadow = false;
        Object.assign(proxy.userData, {
          pieceIndex: d.pieceIndex,
          pieceId: d.pieceId,
        });
        this.level.add(proxy);
      }
    }
    this.flag = null;
    this.terminalBars = [];
    this.uplinks = [];
    if (OBJECTIVES[0]?.terminal)
      for (const t of OBJECTIVES) this.terminal(t, dark, yellow, red, steel);
    // A terminal this mode leaves out: still a console, but dead.
    for (const t of map.terminals || [])
      if (!OBJECTIVES.some((o) => o.id === t.id)) {
        this.box(t.x, 0.55, t.z, 1, 1.1, 0.7, dark);
        const screen = this.box(t.x, 1.12, t.z + 0.08, 0.9, 0.05, 0.6, steel);
        screen.rotation.x = 0.6;
      } else if (!pier) {
        // Flag court, raised slab, signal pole.
        this.box(OBJECTIVE.x, 0.04, OBJECTIVE.z, 5, 0.08, 5, dark);
        for (const dx of [-2.5, 2.5])
          this.box(
            OBJECTIVE.x + dx,
            0.095,
            OBJECTIVE.z,
            0.08,
            0.025,
            5,
            yellow,
          );
        for (const dz of [-2.5, 2.5])
          this.box(
            OBJECTIVE.x,
            0.095,
            OBJECTIVE.z + dz,
            5,
            0.025,
            0.08,
            yellow,
          );
        const pole = new T.Mesh(
          new T.CylinderGeometry(0.055, 0.07, 4.2, 12),
          steel,
        );
        pole.position.set(OBJECTIVE.x, 2.1, OBJECTIVE.z);
        this.level.add(pole);
        // Keep the objective red against the area colors.
        this.flag = this.box(
          OBJECTIVE.x + 0.65,
          1.1,
          OBJECTIVE.z,
          1.3,
          0.75,
          0.035,
          red,
        );
        this.box(OBJECTIVE.x, 0.2, OBJECTIVE.z, 0.5, 0.4, 0.5, dark);
      }
    this.flushTrim();
    const outline = new LineSegments2(
      new LineSegmentsGeometry().setPositions(edgePoints),
      this.edgeMaterial,
    );
    outline.frustumCulled = false;
    this.level.add(outline);
    if (id === "lanes") this.dressLanes();
    else if (id === "quad") this.dressQuad();
    else if (id === "monolith") this.dressMonolith();
    else if (id === "docks") this.dressDocks();
    else if (id === "relay") this.dressRelay();
    else if (id === "compound") this.dressCompound();
    this.dressBunker(MAPS[id]?.spawnRoom);
    this.mergeStatic();
  }
  dressCompound() {
    const { steel, dark, red } = this.materials;
    // Open warehouse roof beams preserve visual clarity and shadowed interiors.
    for (let z = -2; z < 17; z += 4) this.box(-12, 3.9, z, 12, 0.22, 0.2, dark);
    for (let z = 17; z > -18; z -= 3) {
      this.box(3, 0.012, z, 0.1, 0.02, 1.4, this.materials.yellow);
      this.box(17, 0.012, z, 0.1, 0.02, 1.4, this.materials.yellow);
    }
    this.box(0, 0.015, 21, 8, 0.025, 0.1, this.materials.yellow);
    this.label("B", -12, 2.7, 16.32, 0, 5);
    this.label("A", 18.45, 2, 13, -Math.PI / 2, 4);
    this.label("C", 10, 2.8, -21.45, 0, 5);
    // Industrial set dressing: ducts, pallets, electrical cabinets.
    for (const [x, z] of [
      [-17, 2],
      [-8, -1],
      [17, 5],
      [8, -20],
      [-16, -18],
    ]) {
      this.box(x, 0.65, z, 1.1, 1.3, 0.75, dark);
      this.box(x, 0.8, z + 0.39, 0.9, 0.025, 0.02, steel);
      this.box(x + 0.3, 1, z + 0.4, 0.08, 0.18, 0.02, red);
    }
    for (const [x, z] of [
      [-17, -8],
      [16, 13],
      [10, 16],
    ]) {
      for (let i = 0; i < 3; i++)
        this.box(x, 0.12 + i * 0.17, z, 1.6, 0.13, 1.2, this.paint("#7a7a7a"));
    }
  }
  dressLanes() {
    const { dark, red } = this.materials;
    this.label("A", -12.02, 2.6, 17.3, -Math.PI / 2, 3);
    this.label("B", -4.48, 2.6, 17.3, Math.PI / 2, 3);
    this.label("C", 9.02, 2.6, 16, Math.PI / 2, 3);
    // Electrical cabinets tucked into the nooks.
    for (const [x, z] of [
      [-18, 13],
      [-18, 3],
    ]) {
      this.box(x, 0.65, z, 0.75, 1.3, 1.1, dark);
      this.box(x + 0.39, 1, z + 0.3, 0.02, 0.18, 0.08, red);
    }
  }
  dressQuad() {
    const { dark, red } = this.materials;
    this.label("A", -12.02, 2.6, 17, -Math.PI / 2, 3);
    this.label("B", -6.98, 2.6, 17, Math.PI / 2, 3);
    this.label("C", 6.98, 2.6, 17, -Math.PI / 2, 3);
    this.label("D", 12.02, 2.6, 17, Math.PI / 2, 3);
    // Point both inner lanes at the shortcut through the central block.
    for (const [x, z, side] of [
      [-18, 4, 1],
      [-18, 13, 1],
      [18, 4, -1],
      [18, 13, -1],
    ]) {
      this.box(x, 0.65, z, 0.75, 1.3, 1.1, dark);
      this.box(x + side * 0.39, 1, z + 0.3, 0.02, 0.18, 0.08, red);
    }
  }
  dressMonolith() {
    const { dark, steel } = this.materials;
    this.label("A", -15.98, 1.3, -10, Math.PI / 2, 4);
    this.label("B", 0, 3.4, 16.42, 0, 4);
    this.label("C", 15.98, 1.3, 10, -Math.PI / 2, 4);
    // Pilasters up the high framing walls give the arena its scale.
    const frame = WALLS.find((w) => w.kind === "wall").h;
    for (let z = -33; z <= 33; z += 6)
      for (const x of [-25.96, 25.96])
        this.box(x, frame / 2, z, 0.06, frame, 0.9, dark);
    for (let x = -21; x <= 21; x += 6)
      if (Math.abs(x) > 6)
        for (const z of [-37.96, 37.96])
          this.box(x, frame / 2, z, 0.9, frame, 0.06, dark);
    // A steel cap band on each monolith and the south tower's wing.
    for (const [x, z, w, d] of [
      [0, 16, 5, 0.8],
      [-8, 12, 2, 6],
      [1.5, -15.5, 9, 0.8],
    ])
      this.box(x, 6.4, z, w + 0.06, 0.12, d + 0.06, steel);
    // Towers: a steel band every 4 m up the shaft.
    for (const w of WALLS.filter((w) => w.tower))
      for (let y = 4; y < w.h - 0.5; y += 4)
        this.box(w.x, y, w.z, w.w + 0.06, 0.14, w.d + 0.06, steel);
  }
  // A data terminal: a marked floor pad, a waist-high console with a lit
  // screen (its bar fills with the infiltrator's progress), and a mast with
  // a red light so it can be found from a distance.
  terminal(t, dark, yellow, red, steel) {
    const { x, z } = t;
    this.box(x, 0.03, z, 3.4, 0.06, 3.4, dark);
    for (const d of [-1.7, 1.7]) {
      this.box(x + d, 0.07, z, 0.08, 0.025, 3.4, yellow);
      this.box(x, 0.07, z + d, 3.4, 0.025, 0.08, yellow);
    }
    this.box(x, 0.55, z, 1, 1.1, 0.7, dark);
    // The screen leans back toward the south (the side you work it from).
    const screen = new T.Group();
    screen.position.set(x, 1.12, z + 0.08);
    screen.rotation.x = 0.6;
    this.level.add(screen);
    this.box(0, 0, 0, 0.9, 0.05, 0.6, steel, screen);
    const glow = new T.MeshBasicMaterial({ color: "#1d3a2c" });
    this.box(0, 0.03, 0, 0.78, 0.02, 0.46, glow, screen);
    const bar = this.box(
      0,
      0.045,
      0.12,
      0.7,
      0.02,
      0.08,
      new T.MeshBasicMaterial({ color: "#7cf0a6" }),
      screen,
    );
    bar.scale.x = 0.001;
    this.terminalBars.push({ id: t.id, mesh: bar });
    const mast = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 2.4, 10), steel);
    mast.position.set(x + 0.4, 1.2, z - 0.25);
    this.level.add(mast);
    this.box(x + 0.4, 2.45, z - 0.25, 0.16, 0.16, 0.16, red);
    // Plant & defend: the uplink, clamped to the console's side, with a
    // light that pulses while it transmits. Hidden until it's planted here.
    const uplink = new T.Group();
    uplink.position.set(x - 0.32, 1.1, z + 0.1);
    this.box(0, 0.11, 0, 0.3, 0.22, 0.3, steel, uplink);
    const antenna = new T.Mesh(
      new T.CylinderGeometry(0.015, 0.015, 0.5, 6),
      steel,
    );
    antenna.position.set(0.08, 0.47, 0.08);
    uplink.add(antenna);
    const light = new T.Mesh(
      new T.SphereGeometry(0.07, 12, 8),
      new T.MeshBasicMaterial({ color: "#ff3b30" }),
    );
    light.position.y = 0.28;
    uplink.add(light);
    uplink.visible = false;
    this.level.add(uplink);
    this.uplinks.push({ id: t.id, group: uplink, light });
  }
  // The infiltrators' spawn bunker: one long room whose north wall is
  // one-way glass. Each pane is a single-sided surface facing out: from
  // outside it's a dark mirror; from inside you look straight through it.
  // Glass doors sit in lane-coloured frames with a countdown screen above
  // each, a stripe in the lane's colour runs from the spawn to its door,
  // and the briefing table carries a map of the level, lined up with it.
  dressBunker(room) {
    if (!room || room.residential) return;
    const glow = (color) => new T.MeshBasicMaterial({ color }),
      light = glow("#f3efe2"),
      [main] = room.zone,
      spawn = MAPS[this.level.userData.id].spawns.attacker,
      ceiling = 2.96;
    // From outside: dark, faintly reflective.
    const outerGlass = new T.MeshStandardMaterial({
        color: "#1d2830",
        roughness: 0.08,
        metalness: 0.6,
        side: T.FrontSide,
      }),
      // From inside: frosted, so the view out is slightly blurred.
      innerTint = new T.MeshPhysicalMaterial({
        color: "#e3edf1",
        // Lets through ~3/4 of the light: a little milky as well as soft.
        transmission: 0.76,
        // Blur scales with roughness and ior (three.js transmission).
        roughness: 0.26,
        thickness: 0.1,
        ior: 1.5,
        side: T.FrontSide,
      });
    const pane = (x, y, w, h, z, parent = this.level) => {
      // Facing north (−z): seen from outside only.
      const out = new T.Mesh(new T.PlaneGeometry(w, h), outerGlass);
      out.position.set(x, y, z - 0.02);
      out.rotation.y = Math.PI;
      const tint = new T.Mesh(new T.PlaneGeometry(w, h), innerTint);
      tint.position.set(x, y, z + 0.02);
      parent.add(out, tint);
    };
    for (const w of room.windows)
      pane(w.x, ((w.bottom || 0) + w.h) / 2, w.w, w.h - (w.bottom || 0), w.z);
    // Ceiling light strips along the room, every 2 m.
    for (let z = main.z0 + 1.5; z < main.z1 - 1; z += 2)
      this.box(0, ceiling, z, main.x1 - main.x0 - 2, 0.04, 0.18, light);
    this.doors = [];
    this.doorScreens = [];
    for (const lane of room.lanes) {
      const color = glow(lane.color),
        d = lane.door;
      // The stripe: from the spawn, across the floor, to the door.
      const dx = d.x - spawn.x,
        dz = d.z + 0.6 - spawn.z,
        length = Math.hypot(dx, dz),
        stripe = this.box(
          (spawn.x + d.x) / 2,
          0.012,
          (spawn.z + d.z + 0.6) / 2,
          0.16,
          0.02,
          length,
          color,
        );
      stripe.rotation.y = Math.atan2(dx, dz);
      // The door: glass like the windows, in a lane-coloured frame.
      const group = new T.Group();
      pane(d.x, d.h / 2, d.w, d.h, d.z, group);
      for (const x of [d.x - d.w / 2, d.x + d.w / 2])
        this.box(x, d.h / 2, d.z, 0.12, d.h, 0.3, color, group);
      this.box(d.x, d.h - 0.06, d.z, d.w + 0.12, 0.12, 0.3, color, group);
      this.box(d.x, 0.04, d.z, d.w, 0.08, 0.3, color, group);
      this.level.add(group);
      this.doors.push(group);
      // A lane marker on the floor just inside, and the countdown screen
      // hanging above the door, facing into the room.
      this.box(d.x, 0.012, d.z + 0.9, d.w, 0.02, 0.5, color);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 128;
      const texture = new T.CanvasTexture(canvas),
        screen = new T.Mesh(
          new T.PlaneGeometry(1.05, 0.42),
          this.crisp(new T.MeshBasicMaterial({ map: texture })),
        );
      // Up against the ceiling, so it doesn't block the view out.
      screen.position.set(d.x, 2.76, d.z + 0.35);
      this.level.add(screen);
      this.doorScreens.push({
        canvas,
        texture,
        color: lane.color,
        name: lane.name,
        shown: null,
      });
    }
    // Locker doors: seams down the fronts of the locker banks.
    const seam = glow("#2b2b2b");
    for (const p of room.props.filter((p) => p.style === "locker"))
      for (let x = p.x - p.w / 2 + 0.6; x < p.x + p.w / 2 - 0.1; x += 0.6)
        this.box(
          x,
          p.h / 2,
          p.z - p.d / 2 - 0.005,
          0.03,
          p.h - 0.2,
          0.01,
          seam,
        );
    const table = room.props.find((p) => p.style === "maptable");
    if (table) this.levelMap(room, main, table);
  }
  // Canvas pictures (the bunker's map and screens) shown as drawn: tagged
  // sRGB and kept out of tone mapping, which would wash them out.
  crisp(material) {
    material.toneMapped = false;
    if (material.map) material.map.colorSpace = T.SRGBColorSpace;
    material.needsUpdate = true;
    return material;
  }
  // The level from above on the briefing table, lined up with the world
  // (north toward the doors): walls by height, the terminals, the
  // doors in their lane colours with a dashed line on to each lane, and
  // the bunker, marked YOU ARE HERE.
  levelMap(room, main, table) {
    const map = MAPS[this.level.userData.id],
      size = map.size || { x: 18.5, z: 26.5 },
      W = 640,
      H = Math.round((W * size.z) / size.x),
      c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const cx = c.getContext("2d"),
      px = (x) => ((x + size.x) / (size.x * 2)) * W,
      pz = (z) => ((z + size.z) / (size.z * 2)) * H,
      rect = (w) => [
        px(w.x - w.w / 2),
        pz(w.z - w.d / 2),
        (w.w / (size.x * 2)) * W,
        (w.d / (size.z * 2)) * H,
      ];
    cx.fillStyle = "#2b3134";
    cx.fillRect(0, 0, W, H);
    for (const w of map.walls) {
      if (w.hidden || ["roof", "crane", "glass"].includes(w.kind)) continue;
      const tall = (w.h || 0) - (w.bottom || 0);
      cx.fillStyle =
        w.style === "bunker"
          ? "#5a6066"
          : w.bottom
            ? "#3d4549"
            : tall > 3
              ? "#8b8f8f"
              : tall > 1.5
                ? "#6e7473"
                : "#55605c";
      cx.fillRect(...rect(w));
    }
    cx.fillStyle = "#d9d9d9";
    cx.fillRect(
      px(main.x0),
      pz(main.z0),
      px(main.x1) - px(main.x0),
      pz(main.z1) - pz(main.z0),
    );
    cx.fillStyle = "#1a1d1f";
    cx.font = "bold 24px monospace";
    cx.textAlign = "center";
    cx.fillText("YOU ARE HERE", px(0), (pz(main.z0) + pz(main.z1)) / 2 + 8);
    for (const lane of room.lanes) {
      const d = lane.door,
        to = lane.to || { x: d.x, z: 0 };
      cx.fillStyle = cx.strokeStyle = lane.color;
      cx.fillRect(
        px(d.x - d.w / 2),
        pz(d.z) - 6,
        px(d.x + d.w / 2) - px(d.x - d.w / 2),
        12,
      );
      cx.lineWidth = 6;
      cx.setLineDash([16, 12]);
      cx.beginPath();
      cx.moveTo(px(d.x), pz(d.z));
      cx.lineTo(px(to.x), pz(to.z));
      cx.stroke();
      cx.setLineDash([]);
      cx.font = "bold 26px monospace";
      cx.fillText(lane.name.toUpperCase(), px(to.x), pz(to.z) - 12);
    }
    for (const t of map.terminals || []) {
      cx.fillStyle = "#d42a2a";
      cx.fillRect(px(t.x) - 16, pz(t.z) - 16, 32, 32);
      cx.fillStyle = "#ffffff";
      cx.font = "bold 26px monospace";
      cx.fillText(t.id, px(t.x), pz(t.z) + 9);
    }
    cx.fillStyle = "#e9e9e9";
    cx.font = "bold 34px monospace";
    cx.textAlign = "left";
    cx.fillText(map.name.toUpperCase(), 18, 44);
    cx.font = "20px monospace";
    cx.fillText("N ↑ DOORS · PICK YOUR LANE", 18, 72);
    // Flat on the table, its top edge (north) toward the doors.
    const top = new T.Mesh(
      new T.PlaneGeometry(table.w - 0.06, table.d - 0.06),
      this.crisp(new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) })),
    );
    top.rotation.x = -Math.PI / 2;
    // Above the dark cap slab cover pieces get (to h + 0.06).
    top.position.set(table.x, table.h + 0.065, table.z);
    this.level.add(top);
  }
  // Countdown screens (framed in the lane's colour): what's left of the buy
  // phase or preparation, then GO.
  updateDoorScreens(state) {
    for (const s of this.doorScreens || []) {
      const text =
        state?.phase === "purchase"
          ? "BUY PHASE"
          : state?.phase === "prep"
            ? `OPENS ${Math.floor(Math.ceil(state.time) / 60)}:${String(Math.ceil(state.time) % 60).padStart(2, "0")}`
            : "GO";
      if (text === s.shown) continue;
      s.shown = text;
      const cx = s.canvas.getContext("2d");
      cx.fillStyle = "#101214";
      cx.fillRect(0, 0, 320, 128);
      cx.strokeStyle = s.color;
      cx.lineWidth = 6;
      cx.strokeRect(3, 3, 314, 122);
      cx.textAlign = "center";
      cx.fillStyle = text === "GO" ? "#7cf0a6" : "#e9e9e9";
      cx.font = "bold 52px monospace";
      cx.fillText(text, 160, 82, 296);
      s.texture.needsUpdate = true;
    }
  }
  dressDocks() {
    const map = MAPS.docks,
      white = this.paint("#fff6e5"),
      timber = this.paint("#9a704d"),
      glass = this.paint("#526f78"),
      leaf = this.paint("#477e3b");
    for (const house of map.houses) {
      const firstChild = this.level.children.length;
      const { x, w, d, id } = house;
      const z = house.team === "defender" ? 46 : house.z;
      // Fascia follows each home’s actual roof height.
      const fasciaY = house.singleStory ? 4.02 : 7.32;
      for (const side of [-1, 1]) {
        this.box(
          x + side * (w / 2 + 0.16),
          fasciaY,
          z,
          0.3,
          0.12,
          d + 0.6,
          white,
        );
        this.box(x, fasciaY, z + side * (d / 2 + 0.16), w, 0.12, 0.3, white);
      }
      // Frames follow the exact shell apertures, on both faces of the wall.
      const frame = (o, base = 0, wallPosition) => {
        const alongX = o.side.endsWith("z"),
          sign = o.side[0] === "+" ? 1 : -1;
        const fixed =
          wallPosition ?? (alongX ? z + (sign * d) / 2 : x + (sign * w) / 2);
        const bottom = base + (o.window ? (o.sill ?? 1) : 0);
        const top = base + (o.window ? (o.lintel ?? 2.1) : 2.6);
        const rail = 0.12;
        for (const face of [-1, 1]) {
          const at = fixed + face * 0.24;
          const box = (u, y, width, height) =>
            this.box(
              alongX ? u : at,
              y,
              alongX ? at : u,
              alongX ? width : 0.08,
              height,
              alongX ? 0.08 : width,
              white,
            );
          for (const edge of [-1, 1])
            box(
              o.at + edge * (o.w / 2 + rail / 2),
              (bottom + top) / 2,
              rail,
              top - bottom,
            );
          box(o.at, top + rail / 2, o.w + 2 * rail, rail);
          if (o.window) box(o.at, bottom - rail / 2, o.w + 2 * rail, rail);
        }
      };
      for (const o of house.openings) frame(o);
      for (const o of house.upperOpenings || []) frame(o, 3.9);
      for (const side of [-1, 1])
        this.box(x, 0.025, z + side * (d / 2 + 1.5), 3.8, 0.05, 2.5, white);
      if (house.spawn) {
        frame({ side: "+x", at: 46, w: 2.4 }, 0, -12); // interior garage doorway
        this.label("GARAGE", -18, 3.1, z - d / 2 - 0.24, Math.PI, 0.6);
      }
      this.label(
        id,
        x + 1.8,
        2,
        z + (house.spawn ? -1 : 1) * (d / 2 + 0.25),
        house.spawn ? Math.PI : 0,
        1,
      );
      // Siding lines above the doors, plus a contrasting roof edge.
      for (const y of [2.9, 3.2, 3.5])
        for (const side of [-1, 1])
          this.box(x, y, z + side * (d / 2 + 0.21), w, 0.025, 0.025, white);
      if (house.spawn) {
        // Solid interior finishes cover the turf, flush with the doorways.
        this.box(6.4, 0.005, z, 36.8, 0.03, d - 0.4, this.paint("#bf986f"));
        this.box(-18.4, 0.006, z, 12.8, 0.032, d - 0.4, this.paint("#bcb9b1"));
        // Raised garage door rests beneath the roof, leaving full headroom.
        this.box(-18, 3.45, 40, 6, 0.12, 4, white);
        if (house.team === "defender")
          for (const child of this.level.children.slice(firstChild)) {
            child.position.z *= -1;
            child.rotation.y += Math.PI;
          }
        continue;
      }
      // Finished floors sit above the lawn and paths, flush with door thresholds.
      this.box(x, 0.01, z, w - 0.4, 0.04, d - 0.4, this.paint("#bf986f"));
      // Garden table and planter details stay inside their solid footprints.
      this.box(x - 3.5, 1.13, -23, 2.5, 0.06, 1.5, timber);
      if (id !== "C") this.box(x + 3.5, 0.85, 12, 1.7, 0.25, 0.7, leaf);
    }
    for (const { x, z } of map.gardenGates) {
      // Leaves folded back alongside the fences: nothing spans the path.
      for (const side of [-1, 1]) {
        this.box(x, 1.45, z + side * 2.6, 0.5, 2.9, 0.5, white);
        this.box(x + side * 0.38, 1.15, z + side * 3.3, 0.12, 2.3, 1.2, timber);
      }
    }
    // Lawn between the front porch and a continuous neighborhood street.
    this.box(0, 0.015, 35, 50, 0.025, 6, this.paint("#7caa57"));
    this.box(0, 0.035, 35, 2.4, 0.04, 6, this.paint("#d5cbb9"));
    this.box(0, 0.018, 29.5, 132, 0.03, 5, this.paint("#63696c"));
    for (let x = -60; x <= 60; x += 6)
      this.box(x, 0.04, 29.5, 3, 0.015, 0.12, white);
    for (const z of [26.8, 32.2])
      this.box(0, 0.03, z, 132, 0.04, 0.5, this.paint("#d5cbb9"));
    for (const side of [-1, 1]) {
      this.box(-18, 0.04, 35 * side, 6, 0.04, 6, this.paint("#c2beb4"));
    }
    this.box(0, 0.015, -35, 50, 0.025, 6, this.paint("#7caa57"));
    this.box(0, 0.035, -35, 2.4, 0.04, 6, this.paint("#d5cbb9"));
    this.box(0, 0.018, -29.5, 132, 0.03, 5, this.paint("#63696c"));
    for (let x = -60; x <= 60; x += 6)
      this.box(x, 0.04, -29.5, 3, 0.015, 0.12, white);
    for (const z of [-26.8, -32.2])
      this.box(0, 0.03, z, 132, 0.04, 0.5, this.paint("#d5cbb9"));
    this.box(23, 0.035, 17.4, 3.4, 0.04, 18.4, this.paint("#c2beb4"));
    for (const x of [21.44, 24.56])
      this.box(x, 1.3, 8.24, 0.12, 2.6, 0.08, white);
    this.box(23, 2.66, 8.24, 3.24, 0.12, 0.08, white);
    this.label("GARAGE", 23, 2.9, 8.25, 0, 0.55);
    for (const car of map.parkedCars) {
      const alongX = car.w > car.d;
      const rubber = this.paint("#252a2c");
      // Windows sit on the collision cabin; wheels and lights identify the cover.
      this.box(
        car.x,
        1.33,
        car.z,
        car.w * 0.58 + 0.02,
        0.46,
        car.d * 0.68 + 0.02,
        glass,
      );
      this.box(
        car.x,
        1.67,
        car.z,
        car.w * 0.6,
        0.08,
        car.d * 0.7,
        this.paint(car.color),
      );
      for (const a of [-1, 1])
        for (const b of [-1, 1]) {
          this.box(
            car.x + a * car.w * (alongX ? 0.32 : 0.49),
            0.36,
            car.z + b * car.d * (alongX ? 0.49 : 0.32),
            alongX ? 0.65 : 0.22,
            0.65,
            alongX ? 0.22 : 0.65,
            rubber,
          );
          this.box(
            car.x + a * car.w * (alongX ? 0.505 : 0.32),
            0.72,
            car.z + b * car.d * (alongX ? 0.32 : 0.505),
            alongX ? 0.04 : 0.36,
            0.22,
            alongX ? 0.36 : 0.04,
            white,
          );
        }
    }
    // Scenery lives beyond the sealed perimeter; no interactive/collision bodies.
    const tree = (x, z, i) => {
      const h = 12 + (i % 4) * 1.7;
      this.box(x, h / 3, z, 0.65, (h * 2) / 3, 0.65, timber);
      for (let tier = 0; tier < 3; tier++) {
        const crown = new T.Mesh(
          new T.ConeGeometry(3.6 - tier * 0.7, h * 0.48, 9),
          this.paint(["#386a3b", "#477e3b", "#315d38"][i % 3]),
        );
        crown.position.set(x, h * (0.52 + tier * 0.17), z);
        this.level.add(crown);
      }
    };
    for (let i = 0; i < 15; i++)
      for (const side of [-1, 1])
        tree(side * (39 + (i % 3) * 2), -61 + i * 9, i);
    for (let i = 0; i < 7; i++)
      for (const side of [-1, 1]) tree(-27 + i * 9, side * 69, i + 1);
    // Back lane paving reads as a residential service path, not a dock.
  }
  // Relay Station: site boards over the main doors and on the hall's side
  // doors, and the uplink dish on site A's platform (out of reach, so it
  // has no collision).
  dressRelay() {
    const { dark, steel } = this.materials;
    this.label("A", -19.5, 4, -7.79, 0, 3.6);
    this.label("B", 19.5, 4, -7.79, 0, 3.6);
    this.label("A", -9.21, 3.6, -16, -Math.PI / 2, 2.4);
    this.label("B", 9.21, 3.6, -15.5, Math.PI / 2, 2.4);
    const mast = new T.Mesh(new T.CylinderGeometry(0.18, 0.25, 3.4, 12), steel);
    mast.position.set(-24.2, 1.6 + 1.7, -19.5);
    this.level.add(mast);
    const dish = new T.Mesh(
      new T.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2),
      new T.MeshStandardMaterial({
        color: "#d9dde0",
        roughness: 0.45,
        metalness: 0.2,
        side: T.DoubleSide,
      }),
    );
    // Facing up and toward the sky to the south-east.
    dish.position.set(-24.2, 6.6, -19.5);
    dish.rotation.set(Math.PI * 0.62, 0, Math.PI * 0.18);
    this.level.add(dish);
    const horn = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.6, 8), dark);
    horn.position.set(-24.2, 6.1, -18.8);
    horn.rotation.x = Math.PI * 0.3;
    this.level.add(horn);
    // Painted hazard lines across each site's main door and back gap.
    for (const [x, z, w] of [
      [-15, -7.3, 3],
      [15, -7.3, 3],
      [-13, -24.7, 4],
      [11.75, -24.7, 3.5],
    ])
      this.box(x, 0.012, z, w, 0.02, 0.1, this.materials.yellow);
  }
  // A ping: a red beam and a turning diamond, drawn through walls, and a
  // ring where it touches down.
  pingMarker() {
    const group = new T.Group(),
      overlay = (opacity) =>
        new T.MeshBasicMaterial({
          color: "#d42a2a",
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
        }),
      beam = new T.Mesh(
        new T.CylinderGeometry(0.02, 0.02, 2.4, 6),
        overlay(0.6),
      ),
      diamond = new T.Mesh(new T.OctahedronGeometry(0.2), overlay(0.95)),
      ring = new T.Mesh(new T.RingGeometry(0.3, 0.38, 24), overlay(0.8));
    beam.position.y = 1.2;
    diamond.position.y = 2.6;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    for (const m of [beam, diamond, ring]) m.renderOrder = 10;
    group.add(beam, diamond, ring);
    return group;
  }
  // Thrown canisters, told apart by shape: smoke is a tall pale grenade with
  // a dark cap and vent ring; a jammer is a squat dark box with an antenna
  // and an amber light (the same as the jammer once it lands); a flashbang
  // is a stubby black can with yellow bands and a spoon lever.
  // A water balloon: a squashed shiny sphere with a little knot.
  balloonMesh(color = "#3f9cff") {
    const group = new T.Group(),
      rubber = new T.MeshStandardMaterial({
        color,
        roughness: 0.25,
        metalness: 0.05,
      }),
      body = new T.Mesh(new T.SphereGeometry(0.075, 18, 14), rubber),
      knot = new T.Mesh(new T.ConeGeometry(0.018, 0.03, 8), rubber);
    body.scale.set(1, 1.12, 1);
    knot.position.y = -0.092;
    knot.rotation.x = Math.PI;
    group.add(body, knot);
    return group;
  }
  // Boulder Dash: full-width pumpkins and half-width watermelons.
  boulderMesh(b) {
    const group = new T.Group(),
      ball = new T.Group();
    const geometry = new T.SphereGeometry(b.r, 48, 32);
    let material;
    if (b.half) {
      const positions = geometry.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const rind = new T.Color("#79a640");
      const stripe = new T.Color("#285d2c");
      const color = new T.Color();
      for (let i = 0; i < positions.count; i++) {
        const angle = Math.atan2(positions.getZ(i), positions.getX(i));
        const height = positions.getY(i) / b.r;
        const band = Math.cos(
          angle * 8 + 0.7 * Math.sin(height * 10 + angle * 3),
        );
        const weight = T.MathUtils.smoothstep(band, 0.05, 0.65);
        color.copy(rind).lerp(stripe, weight * (1 - height ** 8));
        color.toArray(colors, i * 3);
      }
      geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
      material = new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
      });
    } else {
      // Radial ribs stay inside the gameplay sphere, preserving dodge clearance.
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        const angle = Math.atan2(z, x);
        const rib = 0.94 + 0.06 * Math.cos(angle * 10);
        positions.setXYZ(i, x * rib, y * 0.94, z * rib);
      }
      geometry.computeVertexNormals();
      material = this.material("#e47719", 0, 0.9);
    }
    const body = new T.Mesh(geometry, material);
    body.castShadow = body.receiveShadow = true;
    ball.add(body);
    if (!b.half) {
      const stem = new T.Mesh(
        new T.CylinderGeometry(b.r * 0.07, b.r * 0.11, b.r * 0.26, 8),
        this.material("#576334", 0, 1),
      );
      stem.position.y = b.r * 0.96;
      stem.rotation.z = 0.18;
      stem.castShadow = true;
      ball.add(stem);
    }
    group.add(ball);
    group.userData.ball = ball;
    return group;
  }
  // Rolling: carried on down between snapshots, eased onto where the
  // server has it, turning as it goes.
  updateBoulder(obj, b, state, dt) {
    const map = MAPS[state.map],
      u = obj.userData;
    u.s = u.s === undefined ? b.s : u.s - b.v * dt;
    u.s += (b.s - u.s) * Math.min(1, dt * 8);
    obj.position.set(b.x, groundAt(map, u.s) + b.r, zOf(map, u.s));
    u.ball.rotation.x += (b.v * dt) / b.r;
  }
  // A beach ball and the bot on the pool deck that throws it, with the
  // ball's path marked across the float while the bot holds it up.
  wireMesh(w) {
    const group = new T.Group(),
      along = w.axis === "x",
      ball = new T.Mesh(
        new T.SphereGeometry(BALL_R, 32, 20),
        new T.MeshStandardMaterial({ map: beachBallTexture(), roughness: 0.38 }),
      );
    ball.castShadow = true;
    const strip = new T.Mesh(
      new T.BoxGeometry(along ? PLAT * 2 : HIT_HALF * 2, 0.01, along ? HIT_HALF * 2 : PLAT * 2),
      new T.MeshBasicMaterial({ color: "#d81e5b", transparent: true, opacity: 0.5, depthWrite: false }),
    );
    const colors = ["#5cc8ff", "#ff7aa8", "#8ee06a", "#b38cff", "#ffd23c"],
      thrower = createRobot("defender", false);
    thrower.traverse((node) => {
      if (node.isMesh && ["ffb347", "5cc8ff"].includes(node.material.color?.getHexString())) {
        node.material = node.material.clone();
        node.material.color.set(colors[w.id % colors.length]);
      }
    });
    thrower.scale.setScalar(0.85);
    // Facing across the pool, the way it throws.
    thrower.rotation.y = along ? (-w.dir * Math.PI) / 2 : w.dir > 0 ? Math.PI : 0;
    group.add(ball, strip, thrower);
    group.userData = { ball, strip, thrower };
    return group;
  }
  updateWire(obj, w, dt) {
    const t = this.lwT ?? 0,
      at = wireAt(w, t),
      u = obj.userData,
      waiting = t < w.launch,
      along = w.axis === "x",
      put = (o, a, y, c) => (along ? o.position.set(a, y, c) : o.position.set(c, y, a)),
      // The bot stands on the deck behind the lane.
      home = -w.dir * (ARENA + 0.75);
    put(u.thrower, home, 0.03, w.lane);
    put(u.strip, 0, PLAT_H + 0.02, w.lane);
    // Held up over its head, wobbling, until it's thrown; then straight
    // across at one height, spinning the way it rolls.
    const hold = T.MathUtils.clamp((t - w.at) / 0.25, 0, 1),
      throwT = T.MathUtils.clamp((t - w.launch) / 0.18, 0, 1);
    if (waiting) {
      const lift = -w.dir * (ARENA + 0.6);
      put(u.ball, lift, 0.6 + hold * 1.0 + Math.sin(this.clock * 9) * 0.03, w.lane);
    } else {
      const y = T.MathUtils.lerp(1.6, BALL_Y, Math.min(1, throwT * 1.6));
      put(u.ball, at, y, w.lane);
      const spin = (w.speed * dt) / BALL_R;
      if (along) u.ball.rotation.z -= w.dir * spin;
      else u.ball.rotation.x += w.dir * spin;
    }
    // The path glows while the bot takes aim, and fades once the ball is past.
    const past = (at - w.dir * (PLAT + BALL_R)) * w.dir > 0;
    u.strip.visible = !past;
    u.strip.material.opacity = waiting ? 0.55 + Math.sin(this.clock * 12) * 0.15 : 0.4;
    // Arms up holding the ball, then swung forward in the throw.
    animateRobot(u.thrower, { moveSpeed: 0, grounded: true }, dt);
    const rig = u.thrower.userData.robot,
      raise = waiting ? hold : 1 - throwT;
    for (const [i, arm] of rig.arms.entries()) {
      const side = i ? 1 : -1;
      arm.rotation.x = waiting ? -2.9 * raise : T.MathUtils.lerp(-2.9, -1.1, throwT) * (t - w.launch < 0.6 ? 1 : 0);
      arm.rotation.z = side * (0.15 + 0.25 * raise);
    }
    rig.pivot.position.y = 0;
  }
  // A smiling spud, built from simple geometry so it needs no downloaded art.
  grenadeMesh() {
    const group = new T.Group();
    const body = new T.Mesh(
      new T.SphereGeometry(0.23, 24, 18),
      new T.MeshStandardMaterial({ color: "#dba65d", roughness: 0.9 }),
    );
    body.scale.set(1, 1.3, 0.85);
    group.add(body);
    for (const x of [-0.085, 0.085]) {
      const eye = new T.Mesh(
        new T.SphereGeometry(0.055, 12, 10),
        new T.MeshStandardMaterial({ color: "white" }),
      );
      eye.position.set(x, 0.075, 0.17);
      const pupil = new T.Mesh(
        new T.SphereGeometry(0.026, 10, 8),
        new T.MeshBasicMaterial({ color: "#34243b" }),
      );
      pupil.position.set(x, 0.075, 0.218);
      const shoe = new T.Mesh(
        new T.SphereGeometry(0.07, 12, 8),
        new T.MeshStandardMaterial({ color: "#7765d9" }),
      );
      shoe.scale.set(1, 0.6, 1.5);
      shoe.position.set(x, -0.27, 0.05);
      group.add(eye, pupil, shoe);
    }
    const smile = new T.Mesh(
      new T.TorusGeometry(0.065, 0.012, 6, 16, Math.PI),
      new T.MeshBasicMaterial({ color: "#683b34" }),
    );
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.035, 0.2);
    group.add(smile);
    group.userData.body = body;
    return group;
  }
  confettiMesh() {
    const group = new T.Group();
    group.userData.started = this.clock;
    const colors = ["#ff83ab", "#ffdb62", "#76d6be", "#8e91ff", "#79cfff"];
    for (let i = 0; i < 60; i++) {
      const piece = new T.Mesh(
        new T.PlaneGeometry(0.09, 0.16),
        new T.MeshBasicMaterial({
          color: colors[i % colors.length],
          side: T.DoubleSide,
          transparent: true,
        }),
      );
      const angle = i * 2.39996;
      piece.userData.velocity = new T.Vector3(
        Math.cos(angle) * (1 + (i % 4)),
        3 + (i % 5) * 0.4,
        Math.sin(angle) * (1 + (i % 4)),
      );
      group.add(piece);
    }
    return group;
  }
  canister(kind, color) {
    if (kind === "balloon") return this.balloonMesh(color);
    const group = new T.Group(),
      m = this.materials;
    if (baseOf(kind) === "noisemaker") {
      // A small orange can with a black speaker grille.
      const can = new T.Mesh(
        new T.CylinderGeometry(0.055, 0.055, 0.13, 14),
        new T.MeshStandardMaterial({ color: "#d0612a", roughness: 0.55 }),
      );
      const grille = new T.Mesh(
        new T.CylinderGeometry(0.045, 0.045, 0.01, 14),
        m.dark,
      );
      grille.position.y = 0.067;
      group.add(can, grille);
    } else if (kind === "pulse") {
      // A dark puck with a green emitter ring.
      const puck = new T.Mesh(
        new T.CylinderGeometry(0.075, 0.085, 0.05, 18),
        m.dark,
      );
      const ring = new T.Mesh(
        new T.TorusGeometry(0.06, 0.012, 6, 18),
        new T.MeshBasicMaterial({ color: "#7cf0a6" }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      group.add(puck, ring);
    } else if (baseOf(kind) === "flashbang") {
      // A stubby black can with yellow bands and a spoon lever.
      const can = new T.Mesh(
        new T.CylinderGeometry(0.05, 0.05, 0.15, 14),
        m.dark,
      );
      group.add(can);
      for (const y of [-0.045, 0.045]) {
        const band = new T.Mesh(
          new T.CylinderGeometry(0.052, 0.052, 0.018, 14),
          new T.MeshBasicMaterial({ color: "#e6c229" }),
        );
        band.position.y = y;
        group.add(band);
      }
      this.box(0.055, 0.02, 0, 0.012, 0.13, 0.03, m.steel, group);
    } else if (baseOf(kind) === "jammer") {
      this.box(0, 0, 0, 0.16, 0.08, 0.12, m.dark, group);
      this.box(0.05, 0.12, 0, 0.012, 0.18, 0.012, m.steel, group);
      const light = new T.Mesh(
        new T.SphereGeometry(0.022, 8, 6),
        new T.MeshBasicMaterial({ color: "#e8a33c" }),
      );
      light.position.set(-0.04, 0.045, 0.04);
      group.add(light);
    } else {
      const body = new T.Mesh(
        new T.CylinderGeometry(0.065, 0.065, 0.24, 14),
        new T.MeshStandardMaterial({ color: "#d9dcde", roughness: 0.6 }),
      );
      const cap = new T.Mesh(
        new T.CylinderGeometry(0.05, 0.068, 0.05, 14),
        m.dark,
      );
      cap.position.y = 0.145;
      const vents = new T.Mesh(
        new T.CylinderGeometry(0.069, 0.069, 0.025, 14),
        m.dark,
      );
      vents.position.y = -0.06;
      group.add(body, cap, vents);
    }
    return group;
  }
  // Over a glowing Splash opponent's head: a downward arrow, seen through
  // walls, bobbing in place.
  headMark() {
    const group = new T.Group(),
      overlay = new T.MeshBasicMaterial({
        color: "#ffd23c",
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      }),
      arrow = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 4), overlay),
      gem = new T.Mesh(new T.OctahedronGeometry(0.09), overlay);
    arrow.rotation.x = Math.PI;
    gem.position.y = 0.3;
    for (const m of [arrow, gem]) m.renderOrder = 21;
    group.add(arrow, gem);
    group.position.y = 2.3;
    group.userData.headMark = true;
    return group;
  }
  // A marked device: an amber diamond and ring, seen through walls.
  deviceMark() {
    const group = new T.Group(),
      overlay = (opacity) =>
        new T.MeshBasicMaterial({
          color: "#e8a33c",
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
        }),
      diamond = new T.Mesh(new T.OctahedronGeometry(0.14), overlay(0.95)),
      ring = new T.Mesh(new T.RingGeometry(0.24, 0.3, 4), overlay(0.8));
    ring.position.y = -0.3;
    for (const m of [diamond, ring]) m.renderOrder = 10;
    group.add(diamond, ring);
    return group;
  }
  // The home screen's flyover camera, `seconds` into its orbit.
  flyover(seconds) {
    const t = seconds * 0.015;
    // Orbit wide enough to take in the whole active map.
    const reach = Math.max(BOUNDS.x, BOUNDS.z) / 26.5;
    this.camera.position.set(
      30 * reach * Math.cos(t + 0.7),
      27 * reach,
      32 * reach * Math.sin(t + 0.7),
    );
    this.camera.lookAt(0, 0, -2);
  }
  // A map's flyover at its first frame, as a PNG data URL (the map
  // picker's thumbnails; see ?thumbs). Leaves that map loaded.
  snapshot(id, w = 640, h = 360) {
    this.setLevel(id);
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.edgeMaterial?.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.flyover(0);
    this.heldWeapons.visible = false;
    this.renderer.render(this.scene, this.camera);
    const png = this.renderer.domElement.toDataURL("image/png");
    this.heldWeapons.visible = true;
    this.renderer.setPixelRatio(ratio);
    this.resize();
    return png;
  }
  resize() {
    const el = this.renderer.domElement.parentElement;
    const w = el.clientWidth,
      h = el.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.edgeMaterial?.resolution.set(w, h);
    this.camera.updateProjectionMatrix();
  }
  device(g) {
    const group = new T.Group(),
      m = this.materials,
      base = baseOf(g.kind),
      tone = g.tone ?? 1,
      // Decoys come through with tone < 1: the same model, a shade darker.
      shade = (mat) => {
        if (tone === 1) return mat;
        const copy = mat.clone();
        copy.color.multiplyScalar(tone);
        return copy;
      },
      dark = shade(m.dark),
      steel = shade(m.steel);
    group.position.set(g.x, g.y, g.z);
    if (base === "shutter") {
      // A ribbed steel shutter across the doorway, with a red-striped bar.
      const box = shutterBox(g),
        floor = g.floor || 0,
        height = CONFIG.shutterHeight,
        alongX = box.w > box.d;
      group.position.set(box.x, floor, box.z);
      this.box(0, height / 2, 0, box.w, height, box.d, steel, group);
      for (let y = 0.3; y < height; y += 0.3)
        this.box(0, y, 0, box.w + 0.02, 0.04, box.d + 0.04, dark, group);
      // A red warning stripe flush across both faces.
      this.box(
        0,
        1.1,
        0,
        alongX ? box.w * 0.6 : box.w + 0.03,
        0.12,
        alongX ? box.d + 0.03 : box.d * 0.6,
        this.materials.red,
        group,
      );
      return group;
    }
    if (g.b) {
      const a = new T.Vector3(0, 0, 0),
        b = new T.Vector3(g.b.x - g.x, g.b.y - g.y, g.b.z - g.z);
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints([a, b]),
        new T.LineBasicMaterial({
          color: new T.Color("#747474").multiplyScalar(tone),
        }),
      );
      group.add(line);
      this.box(0, 0, 0, 0.14, 0.2, 0.1, dark, group);
      this.box(b.x, b.y, b.z, 0.14, 0.2, 0.1, dark, group);
    } else if (base === "camera") {
      this.box(0, 0, 0, 0.35, 0.22, 0.48, dark, group);
      this.box(0, 0, -0.25, 0.13, 0.13, 0.02, steel, group);
      group.rotation.y = g.yaw;
    } else {
      this.box(0, 0, 0, 0.25, 0.09, 0.25, dark, group);
      // A jammer keeps the antenna it was thrown with.
      if (base === "jammer")
        this.box(0.08, 0.14, 0.08, 0.014, 0.22, 0.014, steel, group);
      const diode = new T.Mesh(
        new T.SphereGeometry(0.018, 6, 6),
        new T.MeshBasicMaterial({
          color: new T.Color(
            base === "jammer" ? "#b8b8b8" : "#9c9c9c",
          ).multiplyScalar(tone),
        }),
      );
      diode.position.y = 0.06;
      group.add(diode);
    }
    if (base === "jammer") {
      // Electrical crackle: jagged bolts, regenerated every frame.
      // Mixed dark and bright bolts so it reads on pale concrete and in shade.
      const sparks = new T.LineSegments(
        new T.BufferGeometry(),
        new T.LineBasicMaterial({ vertexColors: true, transparent: true }),
      );
      sparks.position.y = 0.08;
      group.userData.sparks = sparks;
      group.add(sparks);
    }
    if (base === "sensor") {
      // Sonar-style pulse rolling out to the detection radius.
      const ring = new T.Mesh(
        new T.RingGeometry(0.94, 1, 48),
        new T.MeshBasicMaterial({
          color: "#ececec",
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      group.userData.pulse = ring;
      group.userData.radius = g.stats?.radius ?? CONFIG.sensorRadius;
      group.add(ring);
    }
    return group;
  }
  // Players and character decoys share the same avatar renderer.
  figure(team, state, avatar) {
    return createAvatar(team, avatar, state?.rule === "splash" && !state.party);
  }
  // A shower of sparks from a splashed character: bright bits flung out that
  // fall and fade over half a second or so.
  sparkBurst(at, height) {
    const group = new T.Group(),
      colors = ["#fff6a8", "#ffd23f", "#ff9f1c", "#ffffff"],
      geo = new T.BoxGeometry(0.03, 0.03, 0.09);
    group.position.set(at.x, at.y + height, at.z);
    for (let i = 0; i < 22; i++) {
      const spark = new T.Mesh(
        geo,
        new T.MeshBasicMaterial({ color: colors[i % 4], transparent: true }),
      );
      const a = Math.random() * Math.PI * 2,
        out = 1.2 + Math.random() * 2;
      spark.userData.v = new T.Vector3(
        Math.cos(a) * out,
        1 + Math.random() * 2.5,
        Math.sin(a) * out,
      );
      group.add(spark);
    }
    group.userData.life = 0.7;
    this.sparks ??= [];
    this.sparks.push(group);
    this.scene.add(group);
  }
  animateSparks(dt) {
    for (const group of this.sparks || []) {
      group.userData.life -= dt;
      const fade = Math.max(0, group.userData.life / 0.7);
      for (const s of group.children) {
        const v = s.userData.v;
        v.y -= 9.8 * dt;
        s.position.addScaledVector(v, dt);
        // Streak along the way it's flying.
        s.lookAt(s.position.clone().add(v));
        s.material.opacity = fade;
      }
    }
    for (const group of (this.sparks || []).filter(
      (g) => g.userData.life <= 0,
    )) {
      this.scene.remove(group);
      group.children[0]?.geometry.dispose();
      for (const s of group.children) s.material.dispose();
    }
    this.sparks = (this.sparks || []).filter((g) => g.userData.life > 0);
  }
  // Characters are astronauts: a bulky suit, a round helmet with a dark
  // visor, and a life-support pack. Sneakers (infiltrators) wear blue,
  // Seekers (sentinels) coral.
  // The model faces -z.
  astronaut(team) {
    const group = new T.Group(),
      dark = team === "defender",
      suit = this.material(dark ? "#ff9d80" : "#8cc2ff"),
      trim = this.material(dark ? "#d9533a" : "#2f74d8"),
      pack = this.material(dark ? "#ffb347" : "#ffd84a", 0.2),
      visor = new T.MeshStandardMaterial({
        color: "#0d0d0d",
        metalness: 0.9,
        roughness: 0.15,
      }),
      limb = (x, y, z, radius, length, mat) => {
        const mesh = new T.Mesh(
          new T.CapsuleGeometry(radius, length, 4, 10),
          mat,
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
      };
    // Legs and boots.
    limb(-0.14, 0.42, 0, 0.11, 0.42, suit);
    limb(0.14, 0.42, 0, 0.11, 0.42, suit);
    this.box(-0.14, 0.07, -0.03, 0.22, 0.14, 0.32, trim, group);
    this.box(0.14, 0.07, -0.03, 0.22, 0.14, 0.32, trim, group);
    // Torso, belt, chest control panel.
    const torso = new T.Mesh(new T.CapsuleGeometry(0.27, 0.34, 4, 12), suit);
    torso.position.y = 1;
    torso.scale.z = 0.72;
    torso.castShadow = true;
    group.add(torso);
    this.box(0, 0.73, 0, 0.56, 0.08, 0.4, trim, group);
    this.box(0, 1.05, -0.2, 0.24, 0.16, 0.05, trim, group);
    // Own material, not the shared red, so a cloak's fade can't touch the flag.
    this.box(0.06, 1.06, -0.23, 0.04, 0.04, 0.02, this.material(RED), group);
    // Arms and gloves.
    limb(-0.36, 0.98, 0, 0.085, 0.38, suit).rotation.z = 0.12;
    limb(0.36, 0.98, 0, 0.085, 0.38, suit).rotation.z = -0.12;
    for (const x of [-0.39, 0.39]) {
      const glove = new T.Mesh(new T.SphereGeometry(0.075, 10, 8), trim);
      glove.position.set(x, 0.7, 0);
      group.add(glove);
    }
    // Life-support backpack with two tanks.
    this.box(0, 1.06, 0.26, 0.44, 0.56, 0.2, pack, group);
    for (const x of [-0.1, 0.1]) {
      const tank = new T.Mesh(
        new T.CylinderGeometry(0.07, 0.07, 0.5, 10),
        trim,
      );
      tank.position.set(x, 1.08, 0.38);
      group.add(tank);
    }
    // Helmet, neck ring, visor, antenna.
    const ring = new T.Mesh(new T.TorusGeometry(0.17, 0.035, 8, 20), trim);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.33;
    group.add(ring);
    const helmet = new T.Mesh(new T.SphereGeometry(0.23, 18, 14), suit);
    helmet.position.y = 1.53;
    helmet.castShadow = true;
    group.add(helmet);
    const face = new T.Mesh(new T.SphereGeometry(0.19, 18, 14), visor);
    face.position.set(0, 1.54, -0.08);
    face.scale.set(1, 0.78, 0.9);
    group.add(face);
    this.box(0.15, 1.78, 0.08, 0.02, 0.18, 0.02, trim, group);
    return group;
  }
  // Opponent silhouette drawn through walls while a motion sensor reveals it.
  outline(team, state) {
    const robot = state?.rule === "splash";
    const actor = createRobot(team, robot && !state.party);
    actor.traverse((c) => {
      if (!c.isMesh) return;
      c.material.dispose();
      // Splash glows bright yellow so you can't miss anyone; the
      // sensor outline stays a faint red.
      c.material = new T.MeshBasicMaterial({
        color: robot ? "#ffd23c" : RED,
        transparent: true,
        opacity: robot ? 0.85 : 0.22,
        depthTest: false,
        depthWrite: false,
      });
      c.castShadow = c.receiveShadow = false;
      c.renderOrder = 20;
    });
    if (robot) actor.add(this.headMark());
    return actor;
  }
  animateDevice(obj) {
    const { sparks, pulse, radius } = obj.userData;
    if (sparks) {
      const points = [],
        colors = [];
      for (let bolt = 0; bolt < 8; bolt++) {
        const angle = Math.random() * Math.PI * 2,
          reach = 0.3 + Math.random() * 0.6,
          shade = bolt % 2 ? 0.08 : 1;
        let prev = new T.Vector3(0, 0, 0);
        for (let step = 1; step <= 5; step++) {
          const r = (reach * step) / 5,
            next = new T.Vector3(
              Math.cos(angle) * r + (Math.random() - 0.5) * 0.16,
              Math.random() * 0.35,
              Math.sin(angle) * r + (Math.random() - 0.5) * 0.16,
            );
          points.push(prev, next);
          colors.push(shade, shade, shade, shade, shade, shade);
          prev = next;
        }
      }
      sparks.geometry.setFromPoints(points);
      sparks.geometry.setAttribute(
        "color",
        new T.Float32BufferAttribute(colors, 3),
      );
      sparks.material.opacity = 0.35 + Math.random() * 0.65;
    }
    if (pulse) {
      const phase =
        (this.clock % CONFIG.sensorPulseSeconds) / CONFIG.sensorPulseSeconds;
      pulse.scale.setScalar(Math.max(0.01, phase * radius));
      pulse.material.opacity = (1 - phase) * 0.55;
    }
  }
  dressSprinklerNeighborhood() {
    const cream = this.paint("#fff0d7"),
      wood = this.paint("#91613f");
    this.box(0, -0.13, 0, 90, 0.12, 90, this.paint("#83b96b"));
    const fence = (x, z, length, alongX) => {
      for (let u = -length / 2; u <= length / 2; u += 0.4) {
        this.box(
          x + (alongX ? u : 0),
          0.55,
          z + (alongX ? 0 : u),
          0.13,
          1.1,
          0.13,
          cream,
        );
      }
      for (const y of [0.3, 0.8])
        this.box(
          x,
          y,
          z,
          alongX ? length : 0.12,
          0.1,
          alongX ? 0.12 : length,
          cream,
        );
    };
    // Neighboring lawns, patios, sheds and flower beds sit beyond the boundary.
    for (const side of [-1, 1]) {
      const x = side * 17;
      this.box(
        x,
        -0.03,
        -2,
        14,
        0.05,
        20,
        this.paint(side < 0 ? "#99c976" : "#73b563"),
      );
      fence(x, -12, 14, true);
      fence(x + side * 7, -2, 20, false);
      fence(x, 8, 14, true);
      this.box(x, 0.02, -8, 6, 0.12, 4, this.paint("#ddc9a1"));
      this.box(
        x + side * 3,
        1.25,
        -9,
        3.5,
        2.5,
        3,
        this.paint(side < 0 ? "#93b6bf" : "#e0b77c"),
      );
      this.box(x + side * 3, 2.6, -9, 4, 0.25, 3.6, this.paint("#715c55"));
      this.box(x - side * 2, 0.6, -8, 2.5, 0.18, 1.5, wood);
      for (const z of [-6, 0, 5]) {
        this.box(x + side * 5, 0.18, z, 1.1, 0.35, 2, wood);
        for (let i = 0; i < 5; i++) {
          const bloom = new T.Mesh(
            new T.IcosahedronGeometry(0.22, 0),
            this.paint(["#ffd76d", "#f28d97", "#c3a2e9"][i % 3]),
          );
          bloom.position.set(x + side * 5, 0.5, z - 0.8 + i * 0.4);
          this.level.add(bloom);
        }
      }
    }
    for (const [i, [x, z]] of [
      [-11, -13],
      [0, -16],
      [10, -14],
      [-26, 3],
      [26, 1],
      [-12, 10],
      [13, 11],
    ].entries()) {
      this.box(x, 1.6, z, 0.5, 3.2, 0.5, wood);
      for (let tier = 0; tier < 3; tier++) {
        const crown = new T.Mesh(
          new T.IcosahedronGeometry(1.7, 1),
          this.paint(["#448850", "#58964b", "#6ba454"][(i + tier) % 3]),
        );
        crown.position.set(x + (tier - 1) * 0.65, 3.2 + (tier % 2) * 0.8, z);
        crown.scale.set(1, 1.15, 1);
        crown.castShadow = true;
        this.level.add(crown);
      }
    }
  }
  updateSprinklers(state) {
    if (!this.sprinklerGroup) {
      this.sprinklerGroup = new T.Group();
      this.scene.add(this.sprinklerGroup);
      this.sprinklerMeshes = new Map();
    }
    const run =
      state?.party?.kind === "sprinklers" ? state.party.sprinklers : null;
    // Render permanent sites, rather than creating and removing a head for
    // each scheduled burst. Underground heads stay hidden.
    const heads =
      state?.party?.kind === "sprinklers"
        ? SPRINKLER_SITES.map((site, id) => {
            const active = run?.heads.find(
              (h) =>
                Math.abs(h.x - site.x) < 0.001 &&
                Math.abs(h.z - site.z) < 0.001 &&
                sprinklerStage(h, run.t) !== "hidden",
            );
            return { ...site, ...active, id, active: !!active };
          })
        : [];
    const live = new Set(heads.map((h) => h.id));
    for (const [id, g] of this.sprinklerMeshes)
      if (!live.has(id)) {
        g.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        this.sprinklerGroup.remove(g);
        this.sprinklerMeshes.delete(id);
      }
    for (const h of heads) {
      let g = this.sprinklerMeshes.get(h.id);
      if (!g) {
        g = new T.Group();
        g.position.set(h.x, 0, h.z);
        const head = new T.Mesh(
          new T.CylinderGeometry(0.11, 0.15, 0.32, 12),
          new T.MeshStandardMaterial({
            color: "#33483d",
            metalness: 0.6,
            roughness: 0.3,
          }),
        );
        head.name = "head";
        head.scale.setScalar(0.75);
        const light = new T.Mesh(
          new T.SphereGeometry(0.045, 12, 8),
          new T.MeshBasicMaterial({ color: "#51ff78" }),
        );
        light.name = "status-light";
        light.position.y = 0.17;
        head.add(light);
        g.add(head);
        const ring = new T.Mesh(
          new T.RingGeometry(
            PARTY.sprinklers.radius - 0.09,
            PARTY.sprinklers.radius,
            64,
          ),
          new T.MeshBasicMaterial({
            color: "#ffe65b",
            side: T.DoubleSide,
            transparent: true,
            opacity: 0.85,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.035;
        ring.name = "ring";
        g.add(ring);
        const water = new T.Group();
        water.name = "water";
        for (let i = 0; i < 20; i++) {
          const points = [];
          const a = (i * Math.PI) / 10;
          for (let j = 0; j <= 16; j++) {
            const u = j / 16;
            points.push(
              new T.Vector3(
                Math.cos(a) * PARTY.sprinklers.radius * u,
                0.4 + 2.8 * u * (1 - u) - 0.35 * u,
                Math.sin(a) * PARTY.sprinklers.radius * u,
              ),
            );
          }
          const jet = new T.Line(
            new T.BufferGeometry().setFromPoints(points),
            new T.LineBasicMaterial({
              color: "#b8f2ff",
              transparent: true,
              opacity: 0.8,
            }),
          );
          water.add(jet);
        }
        const disk = new T.Mesh(
          new T.CircleGeometry(PARTY.sprinklers.radius, 64),
          new T.MeshBasicMaterial({
            color: "#40c8ed",
            transparent: true,
            opacity: 0.22,
            side: T.DoubleSide,
          }),
        );
        disk.rotation.x = -Math.PI / 2;
        disk.position.y = 0.025;
        water.add(disk);
        g.add(water);
        this.sprinklerGroup.add(g);
        this.sprinklerMeshes.set(h.id, g);
      }
      // Head IDs are reused on rematches: always refresh the world position.
      g.position.set(h.x, 0, h.z);
      const stage = h.active ? sprinklerStage(h, run.t) : "hidden",
        spraying = stage === "spray";
      g.visible = stage !== "hidden";
      const up =
        stage === "hidden"
          ? 0
          : stage === "warning"
            ? Math.min(1, (run.t - h.at) / 0.5)
            : stage === "retract"
              ? Math.max(0, (h.end - run.t) / PARTY.sprinklers.retractSeconds)
              : 1;
      g.getObjectByName("head").position.y = -0.12 + 0.24 * up;
      g.getObjectByName("status-light").visible =
        Math.floor((run?.t ?? 0) * 4) % 2 === 0;
      g.getObjectByName("ring").visible = stage !== "hidden";
      g.getObjectByName("ring").material.color.set(
        spraying ? "#64e6ff" : "#ffe65b",
      );
      g.getObjectByName("ring").material.opacity =
        stage === "warning" ? 0.55 + 0.35 * Math.sin(run.t * 12) : 0.85;
      const water = g.getObjectByName("water");
      water.visible = spraying;
      water.rotation.y = (run?.t ?? 0) * 1.5;
    }
  }
  render(state, view, dt, debug) {
    this.clock += dt;
    this.animateSparks(dt);
    this.updateSprinklers(state);
    // Breakout has its own camera (below): high behind the runner.
    const me = state?.me,
      thirdPerson =
        skipsBackpack(state?.party?.kind) && state.party.kind !== "breakout",
      // Running Breakout, or watching the run (`watch` is the runner then;
      // before the go, when you can't see them yet, their start line).
      course = MAPS[state?.map],
      runner =
        this.watch ||
        (me?.team === "defender" && course?.breakout
          ? { ...course.spawns.attacker, y: 0, team: "attacker" }
          : me),
      breakoutCam =
        !!runner &&
        state.party?.kind === "breakout" &&
        !!course?.breakout &&
        ["prep", "active"].includes(state.phase) &&
        runner.team === "attacker";
    if (!breakoutCam) this.boCam = null;
    const sprinklerWet =
      state?.party?.kind === "sprinklers" &&
      !!state.party.sprinklers?.runners?.[me?.id]?.wet;
    this.sprinklerWetZoom = sprinklerWet
      ? Math.min(1, (this.sprinklerWetZoom || 0) + dt / 0.8)
      : 0;
    this.renderer.domElement.style.filter = sprinklerWet ? "grayscale(1)" : "";
    const chaseKey =
      thirdPerson && me && !me.camera && !me.mirror && !this.watch
        ? `${state.map}:${me.id}:${state.phase}`
        : null;
    if (!chaseKey) this.chaseAnchor = null;
    if (me) {
      const feed = state.gadgets.find((g) => g.id === me.camera && g.active);
      if (feed) {
        // You steer your own feed; `view` holds the pan you're applying.
        this.camera.position.set(feed.x, feed.y, feed.z);
        this.camera.rotation.set(view.pitch, view.yaw, 0);
      } else if (me.mirror) {
        // Mirror pole: view from its tip, extended along the facing it was
        // raised at and stopped short of walls. You still aim freely.
        const eye = { x: me.x, y: me.y + eyeHeight(me), z: me.z },
          reach = statValue(
            activeBuilds(state.tuningMode, me.gadgetStats, me.upgrades),
            "cameraPortable",
            "reach",
          ),
          tip = {
            x: eye.x - Math.sin(me.mirror.yaw) * reach,
            y: eye.y,
            z: eye.z - Math.cos(me.mirror.yaw) * reach,
          },
          hit = Math.min(1, ...WALLS.map((w) => segmentBox(eye, tip, w) ?? 1)),
          k = Math.max(0, hit - 0.1 / reach);
        this.camera.position.set(
          eye.x + (tip.x - eye.x) * k,
          eye.y,
          eye.z + (tip.z - eye.z) * k,
        );
        this.camera.rotation.set(view.pitch, view.yaw, 0);
      } else if (breakoutCam) {
        // Breakout: close behind the runner, centred on them, looking up
        // the hallway at the obstacles coming. Runner and watcher alike.
        this.watchYaw = null;
        const desired = new T.Vector3(runner.x, 2.9, runner.z + 5);
        if (!this.boCam) this.camera.position.copy(desired);
        this.boCam = true;
        this.camera.position.lerp(desired, Math.min(1, dt * 10));
        this.camera.lookAt(this.camera.position.x, 0.9, runner.z - 6);
      } else if (this.watch) {
        // Breakout: watching the runner through their eyes.
        // Their turns are eased, so a quick glance doesn't whip your view.
        const w = this.watch,
          desired = new T.Vector3(w.x, w.y + eyeHeight(w), w.z);
        this.camera.position.lerp(desired, Math.min(1, dt * 20));
        this.watchYaw ??= w.yaw;
        this.watchYaw +=
          Math.atan2(
            Math.sin(w.yaw - this.watchYaw),
            Math.cos(w.yaw - this.watchYaw),
          ) * Math.min(1, dt * 8);
        this.camera.rotation.set((w.pitch || 0) * 0.5, this.watchYaw, 0);
      } else if (
        state.party?.kind === "livewire" &&
        MAPS[state.map]?.livewire
      ) {
        // Livewire: a fixed camera high over the south wall looking down on
        // the whole arena, drifting a little after you.
        this.watchYaw = null;
        const fx = Math.max(-0.5, Math.min(0.5, me.x * 0.1)),
          fz = Math.max(-0.5, Math.min(0.5, me.z * 0.1)),
          // Fit the entire pool on wide and narrow screens.
          fit = Math.max(1, 0.85 / this.camera.aspect),
          desired = new T.Vector3(fx, PLAT_H + 13.5 * fit, fz + 9.5 * fit);
        if (!this.lwCam) this.camera.position.copy(desired);
        this.lwCam = true;
        this.camera.position.lerp(desired, Math.min(1, dt * 4));
        this.camera.lookAt(
          this.camera.position.x,
          PLAT_H - 0.5,
          this.camera.position.z - 9.5 * fit,
        );
      } else if (state.party?.kind === "sprinklers") {
        this.watchYaw = null;
        frameSprinklerYard(this.camera, MAPS.yard);
        if (this.sprinklerWetZoom > 0) {
          const blend =
            this.sprinklerWetZoom ** 2 * (3 - 2 * this.sprinklerWetZoom);
          const target = new T.Vector3(me.x, me.y + 0.9, me.z);
          const close = target.clone().add(new T.Vector3(0, 2.8, 4.3));
          const yardRotation = this.camera.quaternion.clone();
          this.camera.position.lerp(close, blend);
          this.camera.lookAt(target);
          this.camera.quaternion.slerpQuaternions(
            yardRotation,
            this.camera.quaternion.clone(),
            blend,
          );
        }
      } else if (thirdPerson) {
        this.watchYaw = null;
        const body = new T.Vector3(me.x, me.y, me.z);
        if (
          this.chaseKey !== chaseKey ||
          !this.chaseAnchor ||
          this.chaseAnchor.distanceTo(body) > 8
        )
          this.chaseAnchor = body.clone();
        this.chaseKey = chaseKey;
        this.chaseAnchor.lerp(body, 1 - Math.exp(-18 * dt));
        const target = this.chaseAnchor.clone();
        target.y += eyeHeight(me);
        const offset = new T.Vector3(0, 1.3, 3.5);
        offset.applyEuler(new T.Euler(view.pitch * 0.5, view.yaw, 0, "YXZ"));
        const end = target.clone().add(offset);
        const hit = Math.min(
          1,
          ...WALLS.map((w) => segmentBox(target, end, w) ?? 1),
        );
        this.camera.position
          .copy(target)
          .addScaledVector(offset, Math.max(0, hit - 0.08));
        this.camera.lookAt(target);
      } else {
        this.watchYaw = null;
        const desired = new T.Vector3(me.x, me.y + eyeHeight(me), me.z);
        this.camera.position.lerp(desired, Math.min(1, dt * 20));
        // Wall running: lean the view ~8° away from the wall.
        const lean = me.wallRun ? me.wallRun.side * 0.14 : 0;
        this.roll =
          (this.roll || 0) + (lean - (this.roll || 0)) * Math.min(1, dt * 10);
        this.camera.rotation.set(view.pitch, view.yaw, this.roll);
      }
    } else this.flyover(this.clock);
    const lw =
      state?.party?.kind === "livewire" && !!MAPS[state?.map]?.livewire;
    if (!lw || !me) this.lwCam = false;
    const lwRun = lw ? state.party.run : null;
    const entries = [];
    for (const p of state?.players || []) {
      // Your own body is hidden in first person, but shown when you're
      // watching a camera feed (it can see you like anyone else), or seen
      // from above in Livewire.
      if (
        !p.alive ||
        (p.id === me?.id && !me?.camera && !thirdPerson && !breakoutCam)
      )
        continue;
      if (lw) {
        // Facing the way they're going; in the lava, sinking out of sight.
        const r = lwRun?.runners[p.id];
        this.lwSink ??= {};
        this.lwSink[p.id] = r?.fell ? (this.lwSink[p.id] || 0) + dt : 0;
        const body = {
          ...p,
          yaw: r?.face ?? p.yaw,
          // A splash-out stays visible, bobbing in the pool.
          y: r?.fell
            ? 0.2 + Math.sin(this.clock * 3) * 0.08
            : p.grounded && onPlatform(p.x, p.z)
              ? PLAT_H + 0.025
              : p.y,
        };
        entries.push(["p" + p.id, body, "player"]);
        if (
          !r?.fell &&
          p.grounded &&
          onPlatform(p.x, p.z) &&
          p.y >= PLAT_H - 0.05
        )
          entries.push(["lr" + p.id, p, "lwring"]);
        continue;
      }
      // Nor the runner whose eyes you're watching through.
      if (p.id === this.watch?.id && !breakoutCam) continue;
      entries.push(["p" + p.id, p, "player"]);
    }
    // Beach Ball Dodge: the balls, eased along between snapshots on a local
    // clock.
    if (lwRun) {
      this.lwT =
        this.lwT === undefined || Math.abs(lwRun.t - this.lwT) > 0.5
          ? lwRun.t
          : this.lwT + dt + (lwRun.t - this.lwT) * Math.min(1, dt * 5);
      for (const w of lwRun.wires)
        entries.push(["lw" + w.id + ":" + w.launch, w, "wire"]);
      // The rim flashes when you're within 0.6 m of the edge.
      if (this.lwRim && me) {
        const edge = PLAT - Math.max(Math.abs(me.x), Math.abs(me.z)),
          close = state.phase === "active" && edge < 0.6 && me.y >= PLAT_H - 0.1;
        this.lwRim.color.set(
          close
            ? Math.sin(this.clock * 14) > 0
              ? "#ffe17c"
              : "#ff5a3c"
            : "#ff8a73",
        );
      }
    } else this.lwT = undefined;
    if (this.poolMat)
      this.poolMat.color.setHSL(
        0.53 + Math.sin(this.clock * 0.9) * 0.008,
        0.72,
        0.56 + Math.sin(this.clock * 1.7) * 0.025,
      );
    // Boulder Dash: the boulders rolling down.
    if (state?.party?.kind === "boulders" && course?.boulders)
      for (const b of state.party.race?.boulders || [])
        entries.push(["b" + state.map + ":" + b.id, b, "boulder"]);
    for (const d of state?.decoys || [])
      if (d.active) entries.push(["d" + d.id, d, "player"]);
    for (const g of state?.gadgets || [])
      if (g.active) {
        entries.push(["g" + g.id, g, "gadget"]);
        if (g.marked) entries.push(["m" + g.id, g, "mark"]);
      }
    for (const s of state?.smokes || []) entries.push(["s" + s.id, s, "smoke"]);
    for (const f of state?.flashes || [])
      entries.push(["f" + f.id, f, "flash"]);
    for (const g of state?.pulses || []) entries.push(["q" + g.id, g, "pulse"]);
    for (const n of state?.noises || []) entries.push(["n" + n.id, n, "noise"]);
    for (const id of state?.revealed || []) {
      const target =
        (state.players || []).find((p) => p.id === id && p.alive) ||
        (state.decoys || []).find((d) => d.id === id && d.active);
      if (target && id !== me?.id) entries.push(["r" + id, target, "reveal"]);
    }
    for (const t of state?.projectiles || [])
      entries.push(["t" + t.id, t, "projectile"]);
    // Hot Potato's grenades, but not the one in your own hand.
    for (const g of state?.party?.grenades || [])
      if (g.holder !== me?.id) entries.push(["h" + g.id, g, "potato"]);
    for (const k of state?.pings || []) entries.push(["k" + k.id, k, "ping"]);
    for (const w of state?.splashes || [])
      if (w.kind === "burst") entries.push(["w" + w.id, w, "splash"]);
    if (state?.party?.kind === "hotpotato" && state.party.boom)
      entries.push([
        "potato-confetti-" + state.party.half,
        state.party.boom,
        "confetti",
      ]);
    const active = new Set(entries.map((e) => e[0]));
    for (const [id, mesh] of this.cache)
      if (!active.has(id)) {
        this.dynamic.remove(mesh);
        if (mesh.userData.avatar) releaseAvatar(mesh);
        mesh.traverse((c) => {
          c.geometry?.dispose();
          if (!Object.values(this.materials).includes(c.material))
            c.material?.dispose();
        });
        this.cache.delete(id);
      }
    for (const [id, data, type] of entries) {
      let obj = this.cache.get(id);
      if (!obj) {
        obj = new T.Group();
        if (type === "player") obj = this.figure(data.team, state, data.avatar);
        else if (type === "gadget") obj = this.device(data);
        else if (type === "reveal") obj = this.outline(data.team, state);
        else if (type === "ping") obj = this.pingMarker();
        else if (type === "mark") obj = this.deviceMark();
        else if (type === "noise") obj = this.canister("noisemaker");
        else if (type === "potato") obj = this.grenadeMesh();
        else if (type === "confetti") obj = this.confettiMesh();
        else if (type === "boulder") obj = this.boulderMesh(data);
        else if (type === "wire") obj = this.wireMesh(data);
        else if (type === "lwring") {
          // A ring on the platform under each player, in their colour.
          const ring = new T.Mesh(
            new T.RingGeometry(0.36, 0.5, 32),
            new T.MeshBasicMaterial({
              color: data.team === "defender" ? "#e45a4a" : "#4f9cff",
              transparent: true,
              opacity: 0.85,
              side: T.DoubleSide,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          obj.add(ring);
        } else if (type === "flash") {
          // The burst: a white-hot ball. (No light: adding one at runtime
          // recompiles every material and would stutter right at the bang.)
          obj.add(
            new T.Mesh(
              new T.SphereGeometry(1, 16, 12),
              new T.MeshBasicMaterial({ color: "#ffffff", transparent: true }),
            ),
          );
        } else if (type === "pulse") {
          // The sweep: a flat ring racing out to the pulse radius.
          const ring = new T.Mesh(
            new T.RingGeometry(0.94, 1, 64),
            new T.MeshBasicMaterial({
              color: "#7cf0a6",
              transparent: true,
              side: T.DoubleSide,
              depthTest: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 5;
          obj.add(ring);
        } else if (type === "projectile")
          obj = this.canister(data.kind, data.color);
        else if (type === "splash") {
          // A burst balloon: a flat ring of water spreading out, and a
          // spray of droplets thrown up and falling back.
          const water = new T.MeshBasicMaterial({
            color: "#6cc0ff",
            transparent: true,
            side: T.DoubleSide,
          });
          const ring = new T.Mesh(new T.RingGeometry(0.6, 1, 40), water);
          ring.rotation.x = -Math.PI / 2;
          obj.add(ring);
          // Water, and a few scraps of the balloon in its colour.
          const scrap = new T.MeshBasicMaterial({
            color: data.color || "#6cc0ff",
            transparent: true,
          });
          for (let i = 0; i < 14; i++) {
            const drop = new T.Mesh(
              new T.SphereGeometry(0.035, 6, 5),
              i % 3 ? water : scrap,
            );
            const a = (i / 14) * Math.PI * 2;
            drop.userData.v = {
              x: Math.cos(a) * (1.2 + (i % 3) * 0.5),
              y: 1.6 + (i % 4) * 0.5,
              z: Math.sin(a) * (1.2 + (i % 3) * 0.5),
            };
            obj.add(drop);
          }
        } else {
          // A dense core you can't see through (it fills the same 4 m
          // column that blocks detection), inside a softer billowing shell.
          // Mostly self-lit, so it reads as soft vapour rather than lit,
          // faceted rock; smooth spheres, no shadows.
          // Grey, or (Seen rules) the colour the server gave this cloud.
          const tint = new T.Color(data.color || "#b9b9b9"),
            core = new T.MeshLambertMaterial({
              color: tint,
              emissive: tint.clone().multiplyScalar(0.68),
              transparent: true,
              opacity: 0.97,
            }),
            shell = new T.MeshLambertMaterial({
              color: tint.clone().lerp(new T.Color("#ffffff"), 0.15),
              emissive: tint.clone().multiplyScalar(0.72),
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
            });
          const puff = (radius, x, y, z, mat) => {
            const m = new T.Mesh(new T.SphereGeometry(radius, 24, 16), mat);
            m.position.set(x, y, z);
            obj.add(m);
          };
          puff(2.3, 0, 1.9, 0, core);
          for (let i = 0; i < 6; i++)
            puff(
              1.7,
              Math.sin(i * 1.05) * 1.6,
              1.3 + (i % 2) * 1.1,
              Math.cos(i * 1.05) * 1.6,
              core,
            );
          for (let i = 0; i < 12; i++)
            puff(
              1.5 + (i % 3) * 0.3,
              Math.sin(i * 2.4) * 2.6,
              0.8 + (i % 4) * 0.8,
              Math.cos(i * 2.4) * 2.6,
              shell,
            );
        }
        // Appear where they are, rather than sliding in from the origin.
        if (type === "player") {
          obj.position.set(data.x, data.y, data.z);
          obj.rotation.y = data.yaw;
        }
        this.cache.set(id, obj);
        this.dynamic.add(obj);
      }
      if (type === "player") {
        if (
          obj.userData.team !== data.team ||
          (data.avatar &&
            obj.userData.avatar !== JSON.stringify(avatarChoice(data.avatar)))
        ) {
          const replacement = this.figure(data.team, state, data.avatar);
          replacement.position.copy(obj.position);
          replacement.rotation.copy(obj.rotation);
          this.dynamic.remove(obj);
          disposeAvatar(obj);
          obj = replacement;
          this.cache.set(id, obj);
          this.dynamic.add(obj);
        }
        // Splashed: a shower of sparks alongside the hit reaction.
        const hits = data.hits || 0;
        if (hits > (obj.userData.lastHits ?? hits)) {
          this.sparkBurst(obj.position, eyeHeight(data) - 0.2);
        }
        obj.userData.lastHits = hits;
        obj.position.lerp(
          new T.Vector3(data.x, data.y, data.z),
          Math.min(1, dt * 18),
        );
        if (
          data.id === me?.id &&
          this.chaseAnchor &&
          chaseKey === this.chaseKey
        )
          obj.position.copy(this.chaseAnchor);
        obj.rotation.y +=
          Math.atan2(
            Math.sin(data.yaw - obj.rotation.y),
            Math.cos(data.yaw - obj.rotation.y),
          ) * Math.min(1, dt * 18);
        const result = state.result;
        const winner = result?.winnerId
          ? result.winnerId === data.id
          : result?.winner === data.team;
        const wetRunner = state.party?.sprinklers?.runners?.[data.id]?.wet;
        const outcome = id.startsWith("d")
          ? undefined
          : result?.winner
            ? winner
              ? "win"
              : "lose"
            : wetRunner
              ? "lose"
              : undefined;
        animateAvatar(obj, data, dt, outcome);

        // Cloaked: a faint, wavering shimmer instead of a solid figure.
        const cloaked = !!data.cloaked;
        if (cloaked || obj.userData.cloaked)
          obj.traverse((c) => {
            if (!c.material) return;
            c.material.transparent = cloaked;
            c.material.depthWrite = !cloaked;
            c.material.opacity = cloaked
              ? 0.07 + 0.05 * Math.sin(this.clock * 9 + c.id)
              : 1;
          });
        obj.userData.cloaked = cloaked;
        this.alertMark(obj, cloaked ? null : data.alert, data);
        const wet = wetRule(state?.rule);
        this.dropletMark(
          obj,
          state.rule === "splash" && !state.party && !cloaked
            ? data.hits || 0
            : null,
          data,
        );
        this.soak(obj, wet ? data.hits || 0 : 0);
      }
      if (type === "gadget") {
        this.animateDevice(obj);
        // Cameras turn as they're panned; hide the one you're looking
        // through, or its own body fills the view.
        if (baseOf(data.kind) === "camera") obj.rotation.y = data.yaw;
        obj.visible = id !== "g" + me?.camera;
      }
      if (type === "reveal") {
        obj.position.set(data.x, data.y, data.z);
        obj.rotation.y = data.yaw;
        if (obj.userData.robot) animateRobot(obj, data, dt);
        else {
          obj.scale.y = data.prone ? 0.18 : data.crouch ? 0.58 : 1;
          obj.scale.z = data.prone ? 3 : 1;
        }
        // Splash's glow is for finding people behind cover: anyone you can
        // already see directly (head or chest) doesn't glow.
        if (state?.rule === "splash") {
          const eye = this.camera.position,
            head = eyeHeight(data);
          obj.visible = ![head, head / 2].some((h) =>
            clearSight(
              eye,
              { x: data.x, y: data.y + h, z: data.z },
              state.smokes || [],
              me?.team,
            ),
          );
        }
        const mark = obj.children.find((c) => c.userData.headMark);
        if (mark) {
          // Grow with distance so it stays readable across the map, lifted
          // so the arrow's tip stays just over the head.
          const size = Math.max(
            1,
            this.camera.position.distanceTo(obj.position) / 10,
          );
          mark.scale.setScalar(size);
          mark.position.y =
            (data.prone ? 0.9 : data.crouch ? 1.7 : 2.3) +
            0.15 * (size - 1) +
            Math.sin(this.clock * 4) * 0.08;
          mark.rotation.y = this.clock * 2;
        }
      }
      if (type === "mark") {
        // Over the device (a wire's middle), turning slowly.
        obj.position.set(
          data.b ? (data.x + data.b.x) / 2 : data.x,
          (data.b ? (data.y + data.b.y) / 2 : data.y) + 0.55,
          data.b ? (data.z + data.b.z) / 2 : data.z,
        );
        obj.rotation.y = this.clock * 1.5;
      }
      if (type === "ping") {
        obj.position.set(data.x, data.y, data.z);
        obj.children[1].rotation.y = this.clock * 2;
        // Blink through its last two seconds.
        obj.visible = data.remaining > 2 || Math.sin(this.clock * 18) > 0;
      }
      if (type === "noise") {
        // On the ground, rattling.
        obj.position.set(data.x, (data.y || 0) + 0.05, data.z);
        obj.rotation.set(Math.PI / 2, Math.sin(this.clock * 40) * 0.25, 0);
      }
      if (type === "flash") {
        // Swells and fades over its 0.4 s. Kid-friendly, it's a glitter
        // popper: the ball flickers through bright colours.
        obj.children[0].material.color.setHSL((this.clock * 4) % 1, 0.9, 0.72);
        const t = Math.max(0, data.remaining) / 0.4;
        obj.position.set(data.x, data.y, data.z);
        obj.children[0].scale.setScalar(0.3 + (1 - t) * 1.6);
        obj.children[0].material.opacity = t;
      }
      if (type === "pulse") {
        // Out to the radius in the first half, then fades (0.8 s in all).
        const t = 1 - Math.max(0, data.remaining) / 0.8;
        obj.position.set(data.x, data.y, data.z);
        obj.children[0].scale.setScalar(
          Math.max(0.05, data.radius * Math.min(1, t * 2)),
        );
        obj.children[0].material.opacity = t < 0.5 ? 0.9 : (1 - t) * 1.8;
      }
      if (type === "boulder") this.updateBoulder(obj, data, state, dt);
      if (type === "wire") this.updateWire(obj, data, dt);
      if (type === "lwring") obj.position.set(data.x, PLAT_H + 0.068, data.z);
      if (type === "potato") {
        const warm = state.party.beep === data.id;
        obj.visible = !state.party.boom;
        obj.position.set(
          data.x,
          data.y + (data.holder || data.flying ? 0 : 0.34),
          data.z,
        );
        obj.rotation.set(
          data.flying ? this.clock * 5 : 0,
          data.flying
            ? 0
            : Math.atan2((me?.x ?? 0) - data.x, (me?.z ?? 0) - data.z),
          warm ? Math.sin(this.clock * 10) * 0.14 : 0,
        );
        obj.userData.body.material.color.set(warm ? "#f39b9f" : "#dba65d");
      }
      if (type === "confetti") {
        const t = this.clock - obj.userData.started;
        obj.position.set(data.x, data.y + 0.5, data.z);
        for (const piece of obj.children) {
          const v = piece.userData.velocity;
          piece.position.set(
            v.x * t,
            Math.max(-data.y - 0.45, v.y * t - 2.5 * t * t),
            v.z * t,
          );
          piece.rotation.set(t * 4, t * 3, t * 2);
          piece.material.opacity = Math.max(0, 1 - t / 3);
        }
      }
      if (type === "projectile") {
        obj.position.set(data.x, data.y, data.z);
        // A balloon wobbles; a canister tumbles.
        if (data.kind === "balloon")
          obj.rotation.set(Math.sin(this.clock * 14) * 0.3, 0, 0);
        else obj.rotation.set(this.clock * 9, 0, this.clock * 6);
      }
      if (type === "splash") {
        // Out to the splash radius and gone over its 0.8 s.
        const t = 1 - Math.max(0, data.remaining) / 0.8;
        obj.position.set(data.x, data.y + 0.03, data.z);
        const [ring, ...drops] = obj.children;
        ring.scale.setScalar(0.2 + CONFIG.splashRadius * Math.min(1, t * 2.5));
        ring.material.opacity = 0.85 * (1 - t);
        for (const d of drops) {
          const v = d.userData.v;
          d.position.set(v.x * t * 0.6, v.y * t - 4.9 * t * t, v.z * t * 0.6);
        }
      }
      if (type === "smoke") {
        obj.position.set(data.x, data.y || 0, data.z);
        obj.rotation.y = this.clock * 0.05;
        // Grow in, fade out, and match the (tunable) cloud radius.
        obj.scale.setScalar(
          Math.min(
            1,
            ((data.total || CONFIG.smokeSeconds) - data.remaining) * 2,
            data.remaining,
          ) *
            ((data.radius || CONFIG.smokeRadius) / CONFIG.smokeRadius),
        );
      }
    }
    // Any change of view angle eases in and out.
    const fov = CONFIG.fov;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
    // Inside a cloud (where it blocks sight), the view goes thick with its
    // colour (grey, or the cloud's own colour under Seen rules).
    const eye = this.camera.position,
      cloud = (state?.smokes || []).find(
        (s) =>
          eye.y < 4 &&
          Math.hypot(eye.x - s.x, eye.z - s.z) <
            (s.radius || CONFIG.smokeRadius) *
              Math.min(
                1,
                ((s.total || CONFIG.smokeSeconds) - s.remaining) * 2,
                s.remaining,
              ),
      ),
      smothered = cloud ? cloud.color || "#a9a9a9" : false,
      // Lights Out (set from main.js): 0 is normal, 1 is the guard's dark,
      // where black fog closes in to a couple of metres.
      dark = Math.round((this.darkness || 0) * 50) / 50;
    if (smothered !== this.smothered || dark !== this.dark) {
      this.smothered = smothered;
      this.dark = dark;
      const colour = new T.Color(smothered || this.sky || "#8fd3ff").lerp(
        new T.Color("#000000"),
        smothered ? 0 : dark,
      );
      Object.assign(this.scene.fog, {
        near: smothered ? 0.1 : 30 - 29.6 * dark,
        far: smothered ? 2.2 : 90 - 87 * dark,
      });
      this.scene.fog.color.copy(colour);
      this.scene.background.copy(colour);
      // The white outlines ignore fog normally; in the dark they mustn't
      // show the walls (or anyone) beyond it.
      if (this.edgeMaterial && this.edgeMaterial.fog !== dark > 0) {
        this.edgeMaterial.fog = dark > 0;
        this.edgeMaterial.needsUpdate = true;
      }
    }
    if (this.flag)
      this.flag.position.y =
        1.1 + ((me?.capture || 0) / CONFIG.captureSeconds) * 2.6;
    // Terminal screens fill as data comes off them (shown to whoever is
    // told the progress: the infiltrator, and everyone in training). A
    // spent one shows full to everyone.
    // Plant & defend: the planted terminal's screen fills as it transmits.
    const uplink = state?.uplink;
    for (const b of this.terminalBars || []) {
      const o = (state?.objectives || []).find((o) => o.id === b.id),
        done =
          uplink?.site === b.id
            ? (1 - uplink.remaining / CONFIG.uplinkSeconds) *
              CONFIG.terminalSeconds
            : o?.done
              ? CONFIG.terminalSeconds
              : o?.progress || 0;
      b.mesh.scale.x = Math.max(
        0.001,
        Math.min(1, done / CONFIG.terminalSeconds),
      );
      b.mesh.position.x = -0.35 * (1 - b.mesh.scale.x);
    }
    // The uplink's light pulses while it transmits, faster as time runs
    // out, and goes dark once it's pulled.
    const pulled = state?.result?.reason === "Uplink pulled";
    for (const u of this.uplinks || []) {
      u.group.visible = uplink?.site === u.id;
      if (!u.group.visible) continue;
      const rate = 4 + 10 * (1 - uplink.remaining / CONFIG.uplinkSeconds),
        on = !pulled && Math.sin(this.clock * rate) > -0.2;
      u.light.material.color.set(
        pulled ? "#2a2a2a" : on ? "#ff3b30" : "#5a1410",
      );
      u.light.scale.setScalar(on ? 1.15 : 1);
    }
    this.preview.visible = false;
    for (const part of Object.values(this.ghost)) part.visible = false;
    this.placement = null;
    const aiming =
        me &&
        ["prep", "active"].includes(state.phase) &&
        !me.camera &&
        !me.mirror,
      aim = me && { ...me, yaw: view.yaw, pitch: view.pitch };
    if (
      aiming &&
      me.equipped === "actorDecoy" &&
      me.inventory.actorDecoy &&
      state.phase === "active"
    ) {
      // Character decoy: the mark goes red where the decoy couldn't walk.
      const mark = raySurface(aim, CONFIG.decoyMarkRange),
        ok =
          !!mark && mark.normal.y === 1 && mark.y < 0.1 && freeDecoyPoint(mark);
      // Only on floors; aiming at a wall just turns the prompt red.
      if (mark && mark.normal.y === 1) {
        this.preview.visible = true;
        this.preview.position.set(mark.x, mark.y + 0.08, mark.z);
        this.preview.material.color.set(ok ? "#e8e8e8" : RED);
      }
      this.placement = {
        ok,
        reason: ok ? "" : "Aim at open ground within 40 m for the mark.",
      };
    }
    if (aiming && isPlaced(me.equipped) && me.inventory[me.equipped]) {
      const kind = me.equipped,
        base = baseOf(kind),
        builds = activeBuilds(state.tuningMode, me.gadgetStats, me.upgrades),
        check = placementCheck(aim, kind, {
          gadgets: state.gadgets,
          // The side it deploys for (in training, the gadget's own side).
          team:
            state.training && GADGETS[kind].team !== "both"
              ? GADGETS[kind].team
              : me.team,
          anchor: me.anchor,
          span: ["tripwire", "shutter"].includes(base)
            ? statValue(builds, statKind(kind), "span")
            : undefined,
        }),
        hit = check.hit,
        g = this.ghost;
      this.placement = check;
      this.ghostMaterial.color.set(check.ok ? "#f2f2f2" : RED);
      g.ring.material.color.set(check.ok ? "#f2f2f2" : RED);
      if (hit && ["tripwire", "shutter"].includes(base)) {
        const end = wireInset(hit);
        g.anchorB.visible = true;
        g.anchorB.position.set(end.x, end.y, end.z);
        if (me.anchor) {
          // Stretch the ghost wire from the first anchor to your aim.
          const start = wireInset(me.anchor),
            a = new T.Vector3(start.x, start.y, start.z),
            b = new T.Vector3(end.x, end.y, end.z),
            length = a.distanceTo(b);
          g.anchorA.visible = true;
          g.anchorA.position.copy(a);
          if (length > 0.01) {
            g.wire.visible = true;
            g.wire.position.copy(a).add(b).multiplyScalar(0.5);
            g.wire.scale.set(1, length, 1);
            g.wire.quaternion.setFromUnitVectors(
              new T.Vector3(0, 1, 0),
              b.clone().sub(a).normalize(),
            );
          }
        }
      } else if (hit && base === "camera") {
        g.camera.visible = true;
        g.camera.position.set(
          hit.x + hit.normal.x * 0.2,
          hit.y,
          hit.z + hit.normal.z * 0.2,
        );
        g.camera.rotation.set(0, Math.atan2(-hit.normal.x, -hit.normal.z), 0);
      } else if (hit && base === "sensor") {
        g.sensor.visible = true;
        g.sensor.position.set(hit.x, hit.y + 0.05, hit.z);
        // Show its reach, so you can see what it will cover.
        g.ring.visible = check.ok;
        g.ring.position.set(hit.x, hit.y + 0.04, hit.z);
        g.ring.scale.setScalar(statValue(builds, statKind(kind), "radius"));
      }
    }
    this.throwArc.visible = this.throwRing.visible = false;
    if (
      (this.aimingThrow || me?.equipped === "potato") &&
      me &&
      ["prep", "active"].includes(state.phase) &&
      !me.camera &&
      (THROWABLE.includes(me.equipped) ||
        ["balloon", "potato"].includes(me.equipped)) &&
      me.inventory[me.equipped]
    ) {
      const builds = activeBuilds(
          state.tuningMode,
          me.gadgetStats,
          me.upgrades,
        ),
        balloon = me.equipped === "balloon",
        potato = me.equipped === "potato",
        path = (potato ? potatoPath : throwPath)(
          { ...me, yaw: view.yaw, pitch: view.pitch },
          balloon
            ? CONFIG.balloonRange
            : potato
              ? PARTY.hotpotato.throwRange
              : statValue(builds, statKind(me.equipped), "throw"),
        ),
        // The ring shows the effect area; a noisemaker just marks its spot.
        radius = potato
          ? 0.5
          : balloon
            ? CONFIG.splashRadius
            : GADGET_STATS[statKind(me.equipped)]?.radius
              ? statValue(builds, statKind(me.equipped), "radius")
              : 0.6;
      // A smooth tube through the path, starting a little ahead of the
      // camera so it doesn't fill the view.
      const points = arcPoints(path).map((q) => new T.Vector3(q.x, q.y, q.z));
      this.throwArc.geometry.dispose();
      this.throwArc.geometry = new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        Math.min(96, points.length * 2),
        0.035,
        8,
      );
      this.throwRing.position.set(
        path.landing.x,
        path.landing.y + 0.03,
        path.landing.z,
      );
      this.throwRing.scale.setScalar(radius);
      this.throwArc.visible = this.throwRing.visible = true;
    }
    const map = MAPS[state?.map],
      line = me && map ? preRoundLine(map, me.team, state.phase) : null;
    // Hot Potato's court keeps its centre line all the time.
    this.buyLine.visible =
      !map?.breakout &&
      !map?.boulders &&
      !map?.livewire &&
      !map?.sprinklers &&
      ((line !== null && line !== undefined) || !!map?.court);
    if (this.buyLine.visible) {
      this.buyLine.position.set(0, 0.03, map?.court ? 0 : line);
      this.buyLine.scale.x = ((map.size?.x || 18.5) * 2) / 37;
    }
    const preRound = state?.phase === "purchase" || state?.phase === "prep";
    // A spawn room's doors stand until infiltration; maps without one use
    // the staging gate instead.
    for (const d of this.doors || []) d.visible = preRound;
    // Builder doors follow the match; their leaves swing a quarter turn.
    const open = new Set(state?.openDoors || []);
    if (this.leafDoors?.length) applyDoors(open);
    for (const d of this.leafDoors || []) {
      const target = open.has(d.pieceIndex) ? 1 : 0;
      d.swing += (target - d.swing) * Math.min(1, (dt || 0.016) * 10);
      d.pivot.rotation.y = (-d.swing * Math.PI) / 2;
    }
    for (const pane of this.oneWayPanes || []) {
      const clear = me?.team === pane.team;
      pane.mesh.material.opacity = clear ? 0.18 : 0.9;
      pane.mesh.material.color.set(clear ? "#cfe6ee" : "#5d7480");
    }
    this.updateDoorScreens(state);
    this.gate.visible =
      !!map &&
      !map.spawnRoom &&
      !map.court &&
      !map.breakout &&
      !map.boulders &&
      preRound;
    if (this.gate.visible) {
      const g = stagingGate(map);
      const panel = this.gate.getObjectByName("panel"),
        stripe = this.gate.getObjectByName("stripe");
      panel.scale.set(g.w, g.h, g.d);
      panel.position.set(g.x, g.h / 2, g.z);
      stripe.scale.set(g.w, 0.25, g.d + 0.04);
      stripe.position.set(g.x, 1.2, g.z);
    }
    this.updateDebug(state, debug);
    if (!this.weaponModels.potato && this.materials.dark) {
      const grenade = this.grenadeMesh();
      // Held close, so it reads at about a balloon's size in the hand.
      grenade.scale.setScalar(0.45);
      grenade.position.set(0.04, -0.12, -0.1);
      this.weaponModels.potato = grenade;
      this.heldWeapons.add(grenade);
    }
    if (this.weaponModels.potato) {
      const spud = this.weaponModels.potato,
        warm = !!state?.party?.beep;
      spud.userData.body.material.color.set(warm ? "#f39b9f" : "#dba65d");
      spud.rotation.z = warm ? Math.sin(this.clock * 10) * 0.1 : 0;
    }
    for (const [kind, model] of Object.entries(this.weaponModels))
      model.visible =
        !!me?.alive &&
        !me.camera &&
        !me.mirror &&
        me.equipped === kind &&
        ["prep", "active"].includes(state.phase);
    // The balloon in hand takes the colour of the next one you'll throw.
    const held = me?.balloonColor;
    if (held && held !== this.heldBalloonColor) {
      this.heldBalloonColor = held;
      this.weaponModels.balloon.traverse((c) => c.material?.color?.set(held));
    }
    this.heldWeapons.position.z = -0.48 + (me?.attackFlash > 0 ? 0.04 : 0);
    // A jammed camera loops: its feed keeps the last clean frame on screen
    // (the canvas keeps showing it while nothing new is drawn). Switching to
    // an already-jammed camera shows the scene empty of people.
    const feed =
      me && state.gadgets.find((g) => g.id === me.camera && g.active);
    if (feed?.jammed) {
      if (this.cleanFeed === feed.id) return;
      const people = [...this.cache].filter(([id]) => "pdr".includes(id[0]));
      for (const [, obj] of people) obj.visible = false;
      this.renderer.render(this.scene, this.camera);
      for (const [, obj] of people) obj.visible = true;
      this.cleanFeed = feed.id;
      return;
    }
    this.cleanFeed = feed?.id ?? null;
    this.renderer.render(this.scene, this.camera);
  }
  updateDebug(state, enabled) {
    while (this.debugGroup.children.length) {
      const c = this.debugGroup.children[0];
      this.debugGroup.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    if (!enabled || !state) return;
    const line = (pts, color) => {
      const m = new T.Line(
        new T.BufferGeometry().setFromPoints(
          pts.map((p) => new T.Vector3(...p)),
        ),
        new T.LineBasicMaterial({ color }),
      );
      this.debugGroup.add(m);
    };
    for (const d of state.players.filter(
      (p) => p.team === "defender" && state.rule !== "removed",
    )) {
      const ey = d.y + eyeHeight(d);
      for (const offset of [-CONFIG.detectionAngle, CONFIG.detectionAngle])
        line(
          [
            [d.x, ey, d.z],
            [
              d.x - Math.sin(d.yaw + offset) * CONFIG.detectionRange,
              ey,
              d.z - Math.cos(d.yaw + offset) * CONFIG.detectionRange,
            ],
          ],
          "#d42a2a",
        );
      for (const a of state.players.filter((p) => p.team === "attacker"))
        line(
          [
            [d.x, ey, d.z],
            [a.x, a.y + 1, a.z],
          ],
          "#d42a2a",
        );
    }
    const circle = (x, y, z, r, color) =>
      line(
        Array.from({ length: 49 }, (_, i) => [
          x + Math.sin((i / 48) * Math.PI * 2) * r,
          y,
          z + Math.cos((i / 48) * Math.PI * 2) * r,
        ]),
        color,
      );
    if (state.rule === "removed")
      for (const d of state.players.filter((p) => p.team === "defender"))
        circle(d.x, d.y + 0.1, d.z, CONFIG.captureDistance, "#d42a2a");
    for (const g of state.gadgets.filter((g) => g.active)) {
      if (baseOf(g.kind) === "sensor")
        circle(
          g.x,
          0.12,
          g.z,
          g.stats?.radius ?? CONFIG.sensorRadius,
          "#dbdbdb",
        );
      if (g.b)
        line(
          [
            [g.x, g.y, g.z],
            [g.b.x, g.b.y, g.b.z],
          ],
          "#d42a2a",
        );
      if (g.kind === "camera")
        for (const angle of [-0.6, 0.6])
          line(
            [
              [g.x, g.y, g.z],
              [
                g.x - Math.sin(g.yaw + angle) * 12,
                0.2,
                g.z - Math.cos(g.yaw + angle) * 12,
              ],
            ],
            "#c7c7c7",
          );
    }
    for (const s of state.smokes) circle(s.x, 0.2, s.z, s.radius, "#fafafa");
    if (state.me)
      circle(
        state.me.x,
        0.1,
        state.me.z,
        statValue(
          activeBuilds(
            state.tuningMode,
            state.me.gadgetStats,
            state.me.upgrades,
          ),
          "scanner",
          "range",
        ),
        "#a7a7a7",
      );
  }
}

// A beach ball's gores: six coloured stripes from pole to pole, white caps.
let beachBallMap = null;
function beachBallTexture() {
  if (beachBallMap) return beachBallMap;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d"),
    gores = ["#ff4b4b", "#ffffff", "#ffd23c", "#ffffff", "#3aa8ff", "#ffffff"];
  gores.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((i * 256) / gores.length, 0, 256 / gores.length + 1, 128);
  });
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 114, 256, 14);
  beachBallMap = new T.CanvasTexture(canvas);
  beachBallMap.colorSpace = T.SRGBColorSpace;
  return beachBallMap;
}
