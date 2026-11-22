// Makes the Home Screen icons for the per-game links (src/homeLinks.js):
// a centered square crop of each game's menu screenshot, at 180 px (Apple
// touch icon) and 192 / 512 px (manifest), in public-pages/icons/games/.
// A game with no image gets the Mini Games icon.
//
//   node tools/make_home_icons.mjs
//
// Uses macOS `sips` (and Quick Look's `qlmanage` to draw SVGs).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_LINKS } from "../src/homeLinks.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "public-pages/icons/games");
mkdirSync(out, { recursive: true });
const sips = (...args) =>
  execFileSync("sips", args, { encoding: "utf8" }).toString();

for (const { id, image } of HOME_LINKS) {
  if (!image) {
    for (const size of [180, 192, 512])
      copyFileSync(
        join(root, `public-pages/icons/icon-${size}.png`),
        join(out, `${id}-${size}.png`),
      );
    console.log(`icons/games/${id}-*.png (Mini Games icon)`);
    continue;
  }
  let src = join(root, image);
  if (src.endsWith(".svg")) {
    execFileSync("qlmanage", ["-t", "-s", "1024", "-o", tmpdir(), src], {
      stdio: "ignore",
    });
    src = join(tmpdir(), `${basename(src)}.png`);
  }
  const [w, h] = ["pixelWidth", "pixelHeight"].map((key) =>
    Number(sips("-g", key, src).match(new RegExp(`${key}: (\\d+)`))[1]),
  );
  const side = Math.min(w, h);
  const square = join(tmpdir(), `home-icon-${id}.png`);
  copyFileSync(src, square);
  sips("-s", "format", "png", "-c", String(side), String(side), square);
  for (const size of [180, 192, 512]) {
    const dest = join(out, `${id}-${size}.png`);
    copyFileSync(square, dest);
    sips("-z", String(size), String(size), dest);
  }
  rmSync(square);
  console.log(`icons/games/${id}-{180,192,512}.png`);
}
