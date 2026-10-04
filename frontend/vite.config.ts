import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
const backendPort = Number(process.env.RK_BACKEND_PORT ?? 8000);
const frontendPort = Number(process.env.RK_FRONTEND_PORT ?? 5173);
for (const port of [backendPort, frontendPort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Local server port must be an integer from 1 to 65535");
}
export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
      "/health": `http://127.0.0.1:${backendPort}`,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    css: false,
  },
});
