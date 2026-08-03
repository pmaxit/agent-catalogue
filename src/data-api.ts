/**
 * Where Quill persists books/chapters/articles.
 * On Railway: same-origin SQLite volume.
 * Locally: never write ./data/quill.db — use the Railway app API instead.
 */

/** Public Railway app URL used as the default remote data API. */
export const DEFAULT_RAILWAY_DATA_API_BASE =
  "https://writing-agent-production-b61f.up.railway.app";

export function isRailwayRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.RAILWAY_ENVIRONMENT ||
      env.RAILWAY_ENVIRONMENT_ID ||
      env.RAILWAY_VOLUME_MOUNT_PATH ||
      (env.SQLITE_PATH || "").startsWith("/data"),
  );
}

/**
 * Base URL for studio persistence (books/chapters/articles).
 * Empty string = same origin (Railway production).
 */
export function resolveDataApiBase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = (env.QUILL_DATA_API_BASE || env.QUILL_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit === "" || explicit === "same" || explicit === "local") {
    // Explicit empty only wins on Railway; local always needs a remote base.
    if (isRailwayRuntime(env)) return "";
  }
  if (explicit && explicit !== "same" && explicit !== "local") {
    return explicit;
  }
  if (isRailwayRuntime(env)) return "";
  return DEFAULT_RAILWAY_DATA_API_BASE;
}

/** True when this process should not own durable SQLite (local / proxy mode). */
export function usesRemoteDataApi(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolveDataApiBase(env));
}
