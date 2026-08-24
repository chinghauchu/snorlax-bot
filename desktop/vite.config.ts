import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "SNORLAX_"],
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
});
