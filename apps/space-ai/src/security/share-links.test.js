import test from "node:test";
import assert from "node:assert/strict";
import { resolveShareLinks } from "./share-links.js";

const token = "a".repeat(43);

test("share links resolve against the active Preview hostname", () => {
  const result = resolveShareLinks(
    { url: "/share/" + token, jsonUrl: "/share/" + token + ".json" },
    "https://preview-space.example.workers.dev"
  );
  assert.equal(result.url, "https://preview-space.example.workers.dev/share/" + token);
  assert.equal(result.jsonUrl, result.url + ".json");
});

test("share links resolve against the Production hostname", () => {
  const result = resolveShareLinks(
    { url: "/share/" + token, jsonUrl: "/share/" + token + ".json" },
    "https://space-ai.yyouki.workers.dev"
  );
  assert.equal(result.url, "https://space-ai.yyouki.workers.dev/share/" + token);
});

test("share links reject a different origin", () => {
  assert.throws(() => resolveShareLinks(
    { url: "https://other.example/share/" + token, jsonUrl: "https://other.example/share/" + token + ".json" },
    "https://space-ai.yyouki.workers.dev"
  ), /invalid/i);
});

test("share links reject malformed paths and query strings", () => {
  assert.throws(() => resolveShareLinks(
    { url: "/not-a-share/" + token, jsonUrl: "/not-a-share/" + token + ".json" },
    "https://space-ai.yyouki.workers.dev"
  ), /invalid/i);
  assert.throws(() => resolveShareLinks(
    { url: "/share/" + token + "?redirect=elsewhere", jsonUrl: "/share/" + token + ".json" },
    "https://space-ai.yyouki.workers.dev"
  ), /invalid/i);
});
