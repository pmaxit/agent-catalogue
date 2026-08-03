import type { Writable } from "node:stream";

/**
 * Prevent proxies from closing an SSE response while an upstream agent is
 * creating or running without producing events.
 */
export function startSseHeartbeat(
  stream: Writable,
  intervalMs = 10_000,
): () => void {
  const timer = setInterval(() => {
    if (!stream.destroyed && !stream.writableEnded) {
      stream.write(": keep-alive\n\n");
    }
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
