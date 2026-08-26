import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @rido/pricing ships raw TypeScript with explicit `.ts` extensions on its relative imports, so
// Deno can consume it without a build step (packages/pricing/CLAUDE.md). Vite resolves the
// workspace symlink fine, but needs telling that a `.ts` suffix in an import is not a mistake.
export default defineConfig({
  plugins: [react()],
  resolve: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  server: { port: 5273, open: false },
});
