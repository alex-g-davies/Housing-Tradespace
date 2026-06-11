import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy map library in its own long-cacheable chunk so app
        // changes don't re-download it (005 R5).
        manualChunks: { maplibre: ["maplibre-gl"] },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the FastAPI backend so the frontend only ever talks to
    // its own origin — the Mapbox token never reaches the client (R5).
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
