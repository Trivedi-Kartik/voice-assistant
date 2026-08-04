import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // must match the hardcoded dev URL in main/window.ts
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
});
