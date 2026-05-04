import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        order: "order.html",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5176",
        changeOrigin: true,
      },
    },
  },
});

