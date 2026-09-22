import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const workingSetProxyTarget = process.env.WORKING_SET_PROXY_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Vite 6 rejects unknown Host headers. A leading dot allows this tailnet
    // suffix and every MagicDNS name under it (Tailscale Serve, future K3s).
    allowedHosts: [".tail21f530.ts.net"],
    proxy: workingSetProxyTarget
      ? {
          "/working-set": {
            target: workingSetProxyTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/working-set/, "") || "/",
          },
        }
      : undefined,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
