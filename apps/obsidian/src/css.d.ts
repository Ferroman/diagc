// esbuild bundles CSS side-effect imports (see esbuild.config.mjs); there is no
// bundler-provided ambient type for that here (no vite/client, unlike the other
// apps), so declare it directly.
declare module '*.css';
