import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  return {
    base: mode === "pages" ? "/mini-games/" : "/",
    plugins: [
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
          globIgnores: ["**/*.map"],
          maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: false,
          navigateFallback: "index.html",
        },
      }),
    ],
    ...(mode !== "pages"
      ? {}
      : {
          publicDir: "public-pages",
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
