import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { startSseHeartbeat } from "../src/sse.js";

test("keeps an open SSE response active while upstream work is silent", async () => {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString()));

  const stop = startSseHeartbeat(stream, 5);
  await new Promise((resolve) => setTimeout(resolve, 16));
  stop();

  assert.ok(
    chunks.some((chunk) => chunk === ": keep-alive\n\n"),
    "writes SSE comment heartbeats",
  );
});
