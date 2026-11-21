// Optional browser harness: npm install --no-save playwright, then node tools/test-pwa.mjs.
// Run npm run build:pages first. Uses an isolated browser context and local server.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd() + "/dist";
let version = 1;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};
const server = http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith("/mini-games/")) {
        res.writeHead(404).end();
        return;
      }
      const file = path.join(
        root,
        pathname.slice("/mini-games/".length) || "index.html",
      );
      let data = await readFile(file);
      if (file.endsWith("/sw.js"))
        data = Buffer.concat([
          data,
          Buffer.from(`\n// deployment ${version}\n`),
        ]);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(4179, "127.0.0.1");
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext();
  // Cache/lifecycle checks do not need continuous 3D rendering in headless Chrome.
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4179/mini-games/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const result = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.includes("precache")));
    const requests = await cache.keys();
    for (const request of requests) {
      const response = await fetch(
        request.url.replace(/([?&])__WB_REVISION__=[^&]+/, ""),
      );
      if (!response.ok) throw Error(request.url);
    }
    return {
      count: requests.length,
      scope: (await navigator.serviceWorker.ready).scope,
      models: requests.filter((r) => r.url.includes(".glb")).length,
    };
  });
  assert.equal(result.scope, "http://127.0.0.1:4179/mini-games/");
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const required = files.filter(
    (file) =>
      file.isFile() &&
      !file.name.endsWith(".map") &&
      file.name !== "sw.js" &&
      !(file.parentPath === root && file.name.startsWith("workbox-")),
  );
  assert.equal(
    result.count,
    required.length,
    "Every emitted app file must be precached",
  );
  console.log("Online cache verified");
  await context.setOffline(true);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const c = await caches.open(key);
      for (const r of await c.keys()) {
        const response = await fetch(
          r.url.replace(/([?&])__WB_REVISION__=[^&]+/, ""),
        );
        if (!response.ok) throw Error(r.url);
      }
    }
  });
  console.log("Offline assets verified");
  await page.reload();
  await page.waitForSelector("#deploy", { state: "attached" });
  await page.close();
  page = await context.newPage();
  await page.goto("http://127.0.0.1:4179/mini-games/");
  await page.waitForSelector("#deploy", { state: "attached" });
  await context.setOffline(false);
  version = 2;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await r.update();
  });
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
  );
  assert.equal(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    true,
  );
  await page.close();
  page = await context.newPage();
  await page.goto("http://127.0.0.1:4179/mini-games/");
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r?.active && !r.waiting;
  });
  console.log(
    JSON.stringify(
      {
        passed: true,
        ...result,
        errors,
        scenarios: [
          "initial caching",
          "all precached URLs readable",
          "offline reload",
          "offline new window",
          "update waits during play",
          "update activates after close",
        ],
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
