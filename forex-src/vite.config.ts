import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Publicado em https://www.ddsinovacao.com.br/forex/ (GitHub Pages, pasta /forex do repositório do site).
export default defineConfig({
  base: "/forex/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"], vendor: ["react", "react-dom", "react-router-dom"] },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
