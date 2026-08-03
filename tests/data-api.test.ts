import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RAILWAY_DATA_API_BASE,
  isRailwayRuntime,
  resolveDataApiBase,
  usesRemoteDataApi,
} from "../src/data-api.js";
import { resolveDbPath } from "../src/db.js";

test("local runtime uses Railway data API by default", () => {
  const env = { PATH: "/usr/bin" };
  assert.equal(isRailwayRuntime(env), false);
  assert.equal(resolveDataApiBase(env), DEFAULT_RAILWAY_DATA_API_BASE);
  assert.equal(usesRemoteDataApi(env), true);
  assert.equal(resolveDbPath(env), ":memory:");
});

test("Railway runtime uses same-origin durable SQLite", () => {
  const env = {
    RAILWAY_ENVIRONMENT: "production",
    SQLITE_PATH: "/data/quill.db",
  };
  assert.equal(isRailwayRuntime(env), true);
  assert.equal(resolveDataApiBase(env), "");
  assert.equal(usesRemoteDataApi(env), false);
  assert.equal(resolveDbPath(env), "/data/quill.db");
});

test("QUILL_DATA_API_BASE overrides remote target", () => {
  const env = { QUILL_DATA_API_BASE: "https://example.up.railway.app/" };
  assert.equal(resolveDataApiBase(env), "https://example.up.railway.app");
});
