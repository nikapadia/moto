import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/moto-api/",
  plugins: [react(), tailwindcss()],
  build: {
    // Committed and shipped with the Python package, so installing Moto never needs Node
    outDir: "../moto/moto_server/dashboard",
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: { "/moto-api/data.json": "http://localhost:5000" },
  },
});
