import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  if (mode !== "pages") return {};
  return {
    publicDir: "public-pages",
    resolve: {
      alias: {
        "./critterAssets.js": fileURLToPath(
          new URL("./src/publicCritterAssets.js", import.meta.url),
        ),
      },
    },
  };
});
