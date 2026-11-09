// Shared tools for building extra critters from the purchased Chibi Critters
// pack (see tools/make_squirrel.mjs and tools/make_giraffe.mjs). New critters
// reuse the pack's parts, palette texture, shared skeleton and all 8
// animations, so they look and move like the rest. The pack's licence allows
// modified assets inside the game but not redistributing them, so outputs go
// to the gitignored pack folder and only these scripts are committed.
//
// Every pack mesh is rigid-skinned (one bone per vertex) and coloured by UVs
// pointing at the centre of one 8x8 cell of the 64x64 palette texture.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const glbDir = path.join(root, "ChibiCritters3D_v1.0/Models/GLB");

// The palette, row by row (Textures/critters_palette.png).
const PALETTE = [
  [
    "3a2317",
    "1f1a24",
    "ffffff",
    "f7e8cd",
    "efe6cf",
    "c2b28c",
    "f4f2f8",
    "c9c3d6",
  ],
  [
    "f08a3c",
    "c4612a",
    "ffb070",
    "f4b83a",
    "c97f1c",
    "ffe08a",
    "d9a066",
    "a86f3a",
  ],
  [
    "f2c99a",
    "9a5d32",
    "6a3b1f",
    "472512",
    "b0703f",
    "d9a070",
    "d63c3c",
    "8f1f2a",
  ],
  [
    "ff7b6b",
    "ff8fb8",
    "d9568a",
    "ffc9de",
    "ff9aa8",
    "8a4fd1",
    "5a2d93",
    "c9a2ff",
  ],
  [
    "3f7fe0",
    "274f9e",
    "8fb4ff",
    "7fd3f0",
    "2fb3a8",
    "1b7a72",
    "2fb36a",
    "1b7a45",
  ],
  [
    "8fd14f",
    "5a9a2a",
    "cdf59a",
    "7ed957",
    "9aa0a8",
    "5c636b",
    "3f454c",
    "c9d1d9",
  ],
  [
    "4a4458",
    "2e2a38",
    "7d7690",
    "f2f6f9",
    "8a8496",
    "5e586b",
    "b3adbf",
    "6b8f3a",
  ],
  [
    "ff6a2a",
    "ffd84a",
    "ff4a1c",
    "fff4b0",
    "4fa8e8",
    "2f6fb0",
    "b37845",
    "7a4a26",
  ],
];

/** UV of the palette cell holding `hex` (e.g. "#c97f1c"). */
export function color(hex) {
  const want = hex.replace("#", "").toLowerCase();
  for (let row = 0; row < 8; row++) {
    const col = PALETTE[row].indexOf(want);
    if (col >= 0) return [(col + 0.5) / 8, (row + 0.5) / 8];
  }
  throw new Error(`${hex} is not in the critter palette`);
}

/** Palette hex under a UV. */
export function hexAt([u, v]) {
  return `#${PALETTE[Math.floor(v * 8)][Math.floor(u * 8)]}`;
}

// ---------------------------------------------------------------- vectors
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const scale = (a, s) => a.map((x) => x * s);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export function normalize(v) {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export const smooth = (t) => t * t * (3 - 2 * t);
export function bezier(points, t) {
  let p = points;
  while (p.length > 1)
    p = p.slice(1).map((q, i) => q.map((x, k) => p[i][k] + (x - p[i][k]) * t));
  return p[0];
}

/** The pack's heads are close to this ellipsoid (from Bear.glb). */
export const HEAD = { centre: [0, 0.74, 0], radii: [0.33, 0.3, 0.3] };

/**
 * The front point of an ellipsoid at (x, y), with its outward normal and
 * two directions lying along the surface: for placing face details.
 */
export function onEllipsoid({ centre, radii }, x, y) {
  const u = (x - centre[0]) / radii[0];
  const w = (y - centre[1]) / radii[1];
  const z = centre[2] + radii[2] * Math.sqrt(Math.max(0, 1 - u * u - w * w));
  const n = normalize([
    (x - centre[0]) / radii[0] ** 2,
    (y - centre[1]) / radii[1] ** 2,
    (z - centre[2]) / radii[2] ** 2,
  ]);
  const across = normalize(cross([0, 1, 0], n));
  return { p: [x, y, z], n, across, up: cross(n, across) };
}

const signedPow = (x, e) => Math.sign(x) * Math.abs(x) ** e;

function roundedBoxNormal({ half, round: e }, local) {
  const k = 2 / e;
  return normalize(
    local.map(
      (x, i) => (Math.sign(x) * Math.abs(x / half[i]) ** (k - 1)) / half[i],
    ),
  );
}

/**
 * The front point of a rounded box (see Critter.addRoundedBox) at (x, y),
 * with its outward normal and two directions along the surface.
 */
export function onRoundedBox(box, x, y) {
  const { centre, half, round: e } = box;
  const k = 2 / e;
  const u = Math.abs((x - centre[0]) / half[0]) ** k;
  const w = Math.abs((y - centre[1]) / half[1]) ** k;
  const local = [
    x - centre[0],
    y - centre[1],
    half[2] * Math.max(0, 1 - u - w) ** (1 / k),
  ];
  const n = roundedBoxNormal(box, local);
  const across = normalize(cross([0, 1, 0], n));
  return { p: add(centre, local), n, across, up: cross(n, across) };
}

// ---------------------------------------------------------------- GLB I/O
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = {
  5126: Float32Array,
  5125: Uint32Array,
  5123: Uint16Array,
  5121: Uint8Array,
};

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString());
  const binLength = b.readUInt32LE(20 + jsonLength);
  const bin = b.subarray(28 + jsonLength, 28 + jsonLength + binLength);
  return { json, bin };
}

function accessor(g, index) {
  const a = g.json.accessors[index];
  const view = g.json.bufferViews[a.bufferView];
  const Typed = ARRAYS[a.componentType];
  const n = COMPONENTS[a.type];
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = g.bin.subarray(
    start,
    start + a.count * n * Typed.BYTES_PER_ELEMENT,
  );
  return [
    ...new Typed(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ),
  ];
}

/** A pack critter as a triangle soup, each vertex tagged with its bone. */
export function loadCritter(name) {
  const g = readGlb(path.join(glbDir, `${name}.glb`));
  const prim = g.json.meshes[0].primitives[0];
  const joints = g.json.skins[0].joints.map((j) => g.json.nodes[j].name);
  const P = accessor(g, prim.attributes.POSITION);
  const N = accessor(g, prim.attributes.NORMAL);
  const U = accessor(g, prim.attributes.TEXCOORD_0);
  const J = accessor(g, prim.attributes.JOINTS_0);
  const W = accessor(g, prim.attributes.WEIGHTS_0);
  const I = accessor(g, prim.indices);
  const verts = [];
  for (let v = 0; v < P.length / 3; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (W[v * 4 + k] > W[v * 4 + best]) best = k;
    verts.push({
      p: P.slice(v * 3, v * 3 + 3),
      n: N.slice(v * 3, v * 3 + 3),
      uv: U.slice(v * 2, v * 2 + 2),
      bone: joints[J[v * 4 + best]],
    });
  }
  const tris = [];
  for (let i = 0; i < I.length; i += 3) tris.push([I[i], I[i + 1], I[i + 2]]);
  return { name, g, joints, verts, tris };
}

// ---------------------------------------------------------------- builder
export class Critter {
  constructor(name, rigFrom) {
    this.name = name;
    this.rig = rigFrom; // a loadCritter() result whose rig and clips we keep
    this.verts = [];
    this.tris = [];
  }

  /**
   * Copy the triangles of `src` whose vertices all pass `keep`. `recolor`
   * maps a source hex to a new UV; `transform` may move a cloned vertex.
   */
  addPart(src, keep, { recolor = {}, transform = (v) => v } = {}) {
    const remap = new Map();
    for (const tri of src.tris) {
      if (!tri.every((i) => keep(src.verts[i]))) continue;
      this.tris.push(
        tri.map((i) => {
          if (!remap.has(i)) {
            const v = transform(structuredClone(src.verts[i]));
            const hex = hexAt(v.uv);
            if (recolor[hex]) v.uv = recolor[hex];
            v.weights ??= [[v.bone, 1]];
            remap.set(i, this.verts.push(v) - 1);
          }
          return remap.get(i);
        }),
      );
    }
  }

  /**
   * An ellipsoid. `radii` run along `basis` (default x, y, z), so it can be
   * tilted. `bone` is a bone name or a [[bone, weight], ...] list.
   */
  addEllipsoid(center, radii, uv, bone, opts = {}) {
    const {
      basis = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      seg = 8,
      rows = 6,
    } = opts;
    const weights = typeof bone === "string" ? [[bone, 1]] : bone;
    const first = this.verts.length;
    for (let r = 0; r <= rows; r++) {
      const phi = (r / rows) * Math.PI;
      for (let s = 0; s < seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        const unit = [
          Math.sin(phi) * Math.cos(th),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(th),
        ];
        let p = center;
        let n = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          p = add(p, scale(basis[k], unit[k] * radii[k]));
          n = add(n, scale(basis[k], unit[k] / radii[k]));
        }
        this.verts.push({
          p,
          n: normalize(n),
          uv,
          bone: weights[0][0],
          weights,
        });
      }
    }
    for (let r = 0; r < rows; r++)
      for (let s = 0; s < seg; s++) {
        const a = first + r * seg + s;
        const b = first + r * seg + ((s + 1) % seg);
        this.tris.push([a, b, a + seg], [b, b + seg, a + seg]);
      }
  }

  /**
   * A rounded box (a superellipsoid): `box.half` are its half sizes and
   * `box.round` runs from 1 (an ellipsoid) down towards 0 (a sharp box).
   */
  addRoundedBox(box, uv, bone, { seg = 36, rows = 26 } = {}) {
    const weights = typeof bone === "string" ? [[bone, 1]] : bone;
    const { centre, half, round: e } = box;
    const first = this.verts.length;
    for (let r = 0; r <= rows; r++) {
      const phi = (r / rows) * Math.PI;
      for (let s = 0; s < seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        const ring = signedPow(Math.sin(phi), e);
        const local = [
          half[0] * ring * signedPow(Math.cos(th), e),
          half[1] * signedPow(Math.cos(phi), e),
          half[2] * ring * signedPow(Math.sin(th), e),
        ];
        this.verts.push({
          p: add(centre, local),
          n: roundedBoxNormal(box, local),
          uv,
          bone: weights[0][0],
          weights,
        });
      }
    }
    for (let r = 0; r < rows; r++)
      for (let s = 0; s < seg; s++) {
        const a = first + r * seg + s;
        const b = first + r * seg + ((s + 1) % seg);
        this.tris.push([a, b, a + seg], [b, b + seg, a + seg]);
      }
  }

  /**
   * A round tube swept along a bezier `spine`, with rounded end caps.
   * `radius(t)` and `weights(t)` take 0..1 along the spine; `flatten`
   * squashes the cross-section side to side.
   */
  addTube(spine, radius, uv, weights, opts = {}) {
    const { rings: RINGS = 22, sides: SIDES = 14, flatten = 1 } = opts;
    const weightAt = typeof weights === "function" ? weights : () => weights;
    const rings = [];
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS;
      const c = bezier(spine, t);
      const ahead = bezier(spine, Math.min(1, t + 0.01));
      const behind = bezier(spine, Math.max(0, t - 0.01));
      const tangent = normalize(sub(ahead, behind));
      const d = tangent[0];
      const side = normalize([
        1 - d * tangent[0],
        -d * tangent[1],
        -d * tangent[2],
      ]);
      const up = cross(tangent, side);
      const rad = radius(t);
      const w = weightAt(t);
      const ring = [];
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        const dir = add(
          scale(side, Math.cos(a) * flatten),
          scale(up, Math.sin(a)),
        );
        ring.push(
          this.verts.push({
            p: add(c, scale(dir, rad)),
            n: normalize(dir),
            uv,
            bone: w[0][0],
            weights: w,
          }) - 1,
        );
      }
      rings.push({ ring, c, tangent, rad, w });
    }
    for (let r = 0; r < RINGS; r++)
      for (let s = 0; s < SIDES; s++) {
        const a = rings[r].ring[s];
        const b = rings[r].ring[(s + 1) % SIDES];
        const c = rings[r + 1].ring[s];
        const d = rings[r + 1].ring[(s + 1) % SIDES];
        this.tris.push([a, c, b], [b, c, d]);
      }
    for (const [end, dir] of [
      [rings[0], -1],
      [rings[RINGS], 1],
    ]) {
      const tip = add(end.c, scale(end.tangent, dir * end.rad * 0.6));
      const pole =
        this.verts.push({
          p: tip,
          n: scale(end.tangent, dir),
          uv,
          bone: end.w[0][0],
          weights: end.w,
        }) - 1;
      for (let s = 0; s < SIDES; s++) {
        const a = end.ring[s];
        const b = end.ring[(s + 1) % SIDES];
        this.tris.push(dir > 0 ? [a, b, pole] : [a, pole, b]);
      }
    }
  }

  /**
   * A closed round tube through `points` (a loop, like a helmet rim).
   * `axis` is roughly the loop's facing direction.
   */
  addLoop(points, radius, uv, bone, axis, { sides = 10 } = {}) {
    const weights = typeof bone === "string" ? [[bone, 1]] : bone;
    const n = points.length;
    const first = this.verts.length;
    for (let i = 0; i < n; i++) {
      const tangent = normalize(
        sub(points[(i + 1) % n], points[(i + n - 1) % n]),
      );
      const side = normalize(cross(tangent, axis));
      const up = cross(side, tangent);
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const dir = add(scale(side, Math.cos(a)), scale(up, Math.sin(a)));
        this.verts.push({
          p: add(points[i], scale(dir, radius)),
          n: dir,
          uv,
          bone: weights[0][0],
          weights,
        });
      }
    }
    for (let i = 0; i < n; i++)
      for (let s = 0; s < sides; s++) {
        const a = first + i * sides + s;
        const b = first + i * sides + ((s + 1) % sides);
        const c = first + ((i + 1) % n) * sides + s;
        const d = first + ((i + 1) % n) * sides + ((s + 1) % sides);
        this.tris.push([a, c, b], [b, c, d]);
      }
  }

  /** Write ChibiCritters3D_v1.0/Models/GLB/<name>.glb. */
  write() {
    const src = this.rig;
    const json = structuredClone(src.g.json);
    const prim = json.meshes[0].primitives[0];
    const jointIndex = Object.fromEntries(src.joints.map((n, i) => [n, i]));
    const count = this.verts.length;
    const data = {
      [prim.attributes.POSITION]: new Float32Array(
        this.verts.flatMap((v) => v.p),
      ),
      [prim.attributes.NORMAL]: new Float32Array(
        this.verts.flatMap((v) => v.n),
      ),
      [prim.attributes.TEXCOORD_0]: new Float32Array(
        this.verts.flatMap((v) => v.uv),
      ),
      [prim.attributes.JOINTS_0]: new Uint8Array(
        this.verts.flatMap((v) =>
          [0, 1, 2, 3].map((k) =>
            v.weights[k] ? jointIndex[v.weights[k][0]] : 0,
          ),
        ),
      ),
      [prim.attributes.WEIGHTS_0]: new Float32Array(
        this.verts.flatMap((v) =>
          [0, 1, 2, 3].map((k) => v.weights[k]?.[1] ?? 0),
        ),
      ),
      [prim.indices]: new ARRAYS[json.accessors[prim.indices].componentType](
        this.tris.flat(),
      ),
    };
    for (const v of this.verts)
      if (![...v.p, ...v.n, ...v.uv].every(Number.isFinite))
        throw new Error(`${this.name}: non-finite vertex`);
    const position = json.accessors[prim.attributes.POSITION];
    position.min = [0, 1, 2].map((k) =>
      Math.min(...this.verts.map((v) => v.p[k])),
    );
    position.max = [0, 1, 2].map((k) =>
      Math.max(...this.verts.map((v) => v.p[k])),
    );
    for (const index of Object.keys(data))
      json.accessors[index].count =
        index == prim.indices ? this.tris.length * 3 : count;

    // Re-pack every buffer view, swapping in the new mesh data.
    const viewData = json.bufferViews.map((view) =>
      src.g.bin.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      ),
    );
    for (const [index, array] of Object.entries(data)) {
      const a = json.accessors[index];
      if (a.byteOffset) throw new Error("unexpected interleaved accessor");
      viewData[a.bufferView] = Buffer.from(array.buffer);
    }
    const chunks = [];
    let offset = 0;
    json.bufferViews.forEach((view, i) => {
      view.byteOffset = offset;
      view.byteLength = viewData[i].length;
      chunks.push(viewData[i]);
      offset += viewData[i].length;
      const pad = (4 - (offset % 4)) % 4;
      if (pad) (chunks.push(Buffer.alloc(pad)), (offset += pad));
    });
    json.buffers = [{ byteLength: offset }];

    // Rename the mesh, skin and armature nodes.
    const from = new RegExp(`^${src.name}`);
    for (const node of json.nodes)
      node.name = node.name.replace(from, this.name);
    json.meshes[0].name = this.name;
    json.skins[0].name = `${this.name}_Rig`;

    const pad4 = (buf, fill) =>
      Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
    const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
    const binChunk = pad4(Buffer.concat(chunks), 0);
    const chunkHeader = (length, type) => {
      const h = Buffer.alloc(8);
      h.writeUInt32LE(length, 0);
      h.writeUInt32LE(type, 4);
      return h;
    };
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
    const file = path.join(glbDir, `${this.name}.glb`);
    fs.writeFileSync(
      file,
      Buffer.concat([
        header,
        chunkHeader(jsonChunk.length, 0x4e4f534a),
        jsonChunk,
        chunkHeader(binChunk.length, 0x004e4942),
        binChunk,
      ]),
    );
    console.log(
      `Wrote ${path.relative(root, file)}: ${count} verts, ${this.tris.length} triangles`,
    );
  }
}
