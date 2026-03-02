type Logger = {
  child: (options?: unknown) => Logger;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

// Minimal browser-safe shim for pino.
// @aztec/bb.js imports `{ pino }` from "pino" in its browser logger module.
// The real pino package is CommonJS with a `browser` field, which doesn't expose a named export `pino`
// in Vite's native ESM dev pipeline. bb.js only needs a logger with `.child()` + `.debug()`.
export function pino(_options?: unknown): Logger {
  const base: Logger = {
    child: () => base,
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };

  return base;
}

export default pino;

