import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { HOME_LINKS } from "./src/homeLinks.js";
import { escapeHtml, homeLinksPage } from "./tools/homeLinksPage.mjs";

// Pages build: one page per game at play/<id>/ (src/homeLinks.js). Each is
// the built index.html with the game's name, icon and its own manifest, plus
// <meta name="mini-games-pick"> so it opens on the character screen. Adding
// one to the iPad Home Screen makes a separate shortcut for that game.
// play/ lists them all.
function homeLinks() {
  let base = "/";
  return {
    name: "mini-games-home-links",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (!page) return;
      const html = String(page.source);
      for (const { id, name } of HOME_LINKS) {
        const icon = (size) => `${base}icons/games/${id}-${size}.png`;
        const title = escapeHtml(name);
        this.emitFile({
          type: "asset",
          fileName: `play/${id}/index.html`,
          source: html
            .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
            .replace(
              /(<meta name="apple-mobile-web-app-title" content=")[^"]*/,
              `$1${title}`,
            )
            .replace(
              /(<link rel="apple-touch-icon" href=")[^"]*/,
              `$1${icon(180)}`,
            )
            .replace(
              /<link rel="manifest" href="[^"]*"/,
              `<link rel="manifest" href="${base}play/${id}/manifest.webmanifest"`,
            )
            .replace(
              "</head>",
              `<meta name="mini-games-pick" content="${id}" />\n</head>`,
            ),
        });
        this.emitFile({
          type: "asset",
          fileName: `play/${id}/manifest.webmanifest`,
          source: JSON.stringify({
            id: `${base}play/${id}/`,
            name,
            short_name: name,
            start_url: `${base}play/${id}/`,
            scope: base,
            display: "standalone",
            theme_color: "#2a1641",
            background_color: "#2a1641",
            icons: [192, 512].map((size) => ({
              src: icon(size),
              sizes: `${size}x${size}`,
              type: "image/png",
            })),
          }),
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "play/index.html",
        source: homeLinksPage(base),
      });
      // The game list is the Home Screen launcher: its own manifest starts
      // there, full screen, as "Mini Games".
      this.emitFile({
        type: "asset",
        fileName: "play/manifest.webmanifest",
        source: JSON.stringify({
          id: `${base}play/`,
          name: "Mini Games",
          short_name: "Mini Games",
          start_url: `${base}play/`,
          scope: base,
          display: "standalone",
          theme_color: "#2a1641",
          background_color: "#2a1641",
          icons: [192, 512].map((size) => ({
            src: `${base}icons/icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
          })),
        }),
      });
    },
  };
}

// Dev server: the same play/ game list. Its
// per-game links (play/<id>/) open the menu with ?pick=<id>, which does the
// same as the built per-game pages.
function devHomeLinks() {
  return {
    name: "mini-games-dev-home-links",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0];
        if (path === "/play" || path === "/play/") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(homeLinksPage("/"));
          return;
        }
        const game = /^\/play\/([a-z0-9]+)\/?$/.exec(path);
        if (game) {
          res.writeHead(302, { location: `/?pick=${game[1]}` }).end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  return {
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __BUILD_COMMIT__: JSON.stringify(
        process.env.GITHUB_SHA?.slice(0, 7) ||
          execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
            encoding: "utf8",
          }).trim(),
      ),
    },
    base: mode === "pages" ? "/mini-games/" : "/",
    plugins: [
      ...(mode === "pages" ? [homeLinks()] : [devHomeLinks()]),
      VitePWA({
        disable: mode !== "pages",
        registerType: "prompt",
        injectRegister: false,
        manifest: {
          name: "Mini Games",
          short_name: "Mini Games",
          description:
            "Backyard games for practice, AI opponents and shared-device play.",
          start_url: "./",
          scope: "./",
          display: "standalone",
          theme_color: "#2a1641",
          background_color: "#2a1641",
          icons: [192, 512].map((size) => ({
            src: `icons/icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
          })),
        },
        workbox: {
          // Cache every emitted game asset, including lazy-loaded models and audio.
          globPatterns: ["**/*"],
          // The per-game 192 / 512 px icons are only fetched when installing.
          globIgnores: ["**/*.map", "icons/games/*-{192,512}.png"],
          maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: false,
          navigateFallback: "index.html",
          // The game list and per-game pages are their own pages: never
          // answer them with the main menu (e.g. a page newer than this
          // offline copy); go to the network instead.
          navigateFallbackDenylist: [/\/play\//],
          // Match saved pages whatever their query: the pages read it
          // themselves (?grown from the menu's GROWN-UPS button, ?pick,
          // ?game, ?all, ?refresh). Without this, play/?grown missed the
          // offline copy of play/ and failed with no connection.
          ignoreURLParametersMatching: [/.*/],
        },
      }),
    ],
    // The game icons (the menu's tiles) are in public-pages/ in every mode.
    publicDir: "public-pages",
    ...(mode !== "pages"
      ? {}
      : {
          resolve: {
            alias: {
              "./critterAssets.js": fileURLToPath(
                new URL("./src/publicCritterAssets.js", import.meta.url),
              ),
            },
          },
        }),
  };
});
