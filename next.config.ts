import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The employee workspace runs as a second dev server on port 3001 so the
   * rehearsed demo on 3000 cannot be disturbed by it. Two Next processes in one
   * directory otherwise fight over `.next` and corrupt each other's build, so
   * the second one is started with its own:
   *
   *   NEXT_DIST_DIR=.next-workspace pnpm exec next dev -p 3001
   *
   * Unset — which is every other invocation, including `pnpm build` — this is
   * exactly the default.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
