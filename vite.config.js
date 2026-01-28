import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // main: "./src/index.html",
      },
      output: {
        assetFileNames: (assetInfo) => {
          const ext = assetInfo.name ? assetInfo.name.split(".").pop() : "";

          if (ext === "css") return "assets/css/style.css";
          // 画像はvite-plugin-static-copyで処理するのでここでは除外
          if (/(woff2?|ttf|otf|eot)$/.test(ext))
            return "assets/fonts/[name][extname]";

          return "assets/[name][extname]";
        },
        entryFileNames: "assets/js/[name].js",
        chunkFileNames: "assets/js/[name].js",
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "sass:math";`,
      },
    },
  },
  server: {
    open: true,
    host: '0.0.0.0',
  },
  plugins: [
  ],
});
