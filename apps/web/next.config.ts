import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @rido/pricing ships raw TypeScript source (packages/pricing/CLAUDE.md: zero build step,
  // consumed directly by Deno too) — Next only transpiles code inside apps/web by default, so
  // an npm-workspace package pointing at .ts source needs to be listed here explicitly.
  transpilePackages: ["@rido/pricing"],
  // `next dev` auto-injects a generic AI-agent-instructions block into CLAUDE.md files it finds.
  // Every CLAUDE.md in this repo is hand-curated and enforced under a line budget by
  // scripts/check-context.mjs — an auto-regenerating generic block fights that. Disabled.
  agentRules: false,
};

export default nextConfig;
