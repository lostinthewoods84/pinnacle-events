import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("refreshes the Cloudflare catalog every 15 minutes", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")) as {
    triggers?: { crons?: string[] };
  };

  assert.deepEqual(config.triggers?.crons, ["*/15 * * * *"]);
});
