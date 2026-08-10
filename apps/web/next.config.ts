import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime Docker image can drop
  // node_modules entirely.
  output: 'standalone',
  // The repo root, so tracing picks up the workspace-linked packages.
  outputFileTracingRoot: __dirname + '/../..',
  reactStrictMode: true,
};

export default nextConfig;
