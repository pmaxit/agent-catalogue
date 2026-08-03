import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { PipelineConfigSchema, type PipelineConfig } from "./types.js";

const ENV_PATTERN = /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g;

/** Load .env into process.env for keys not already set (local dev). */
export function loadDotEnv(
  path = resolve(process.cwd(), ".env"),
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
    }
  }
}

/** Expand ${VAR} and ${VAR:-default} using process.env. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(ENV_PATTERN, (_match, name: string, fallback?: string) => {
    const raw = env[name];
    if (raw !== undefined && raw !== "") return raw;
    return fallback ?? "";
  });
}

function walkExpand(node: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof node === "string") return expandEnv(node, env);
  if (Array.isArray(node)) return node.map((item) => walkExpand(item, env));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = walkExpand(v, env);
    }
    return out;
  }
  return node;
}

function coerceBooleans(config: PipelineConfig): PipelineConfig {
  const mockRaw = config.api.mock as boolean | string | undefined;
  let mock = false;
  if (typeof mockRaw === "boolean") mock = mockRaw;
  else if (typeof mockRaw === "string") {
    mock = ["1", "true", "yes", "on"].includes(mockRaw.toLowerCase());
  }
  return {
    ...config,
    api: { ...config.api, mock },
  };
}

export function loadConfig(path = resolve(process.cwd(), "config/agents.yaml")): PipelineConfig {
  loadDotEnv();
  const raw = readFileSync(path, "utf8");
  const parsed = yaml.load(raw);
  const expanded = walkExpand(parsed, process.env);
  const config = PipelineConfigSchema.parse(expanded);
  return coerceBooleans(config);
}

export function resolveApiKey(config: PipelineConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env[config.api.key_env]?.trim();
  return key || undefined;
}

export function isMockMode(config: PipelineConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  if (config.api.mock) return true;
  return !resolveApiKey(config, env);
}
