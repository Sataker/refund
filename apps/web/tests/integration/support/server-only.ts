// Vitest alias target for `server-only` (vitest.config.ts): the real package throws outside the
// react-server condition, which plain Node tests do not set. Next keeps enforcing it in the build.
export {};
