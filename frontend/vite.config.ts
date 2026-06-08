import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the FastAPI backend so the frontend only ever talks to
    // its own origin — the Mapbox token never reaches the client (R5).
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
