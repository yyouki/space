import test from "node:test";
import assert from "node:assert/strict";
import {
  describeConnectionHealth,
  describeConnectionNetworkFailure
} from "./connection-diagnosis.js";

test("health success distinguishes a healthy Worker from a broken live channel", () => {
  const result = describeConnectionHealth(200);
  assert.equal(result.kind, "websocket-unavailable");
  assert.match(result.message, /Worker/);
});

test("expired sessions are not mislabeled as internet failures", () => {
  const result = describeConnectionHealth(401);
  assert.equal(result.kind, "unauthenticated");
});

test("origin rejection is diagnosed separately", () => {
  const result = describeConnectionHealth(403);
  assert.equal(result.kind, "forbidden");
});

test("Worker or Durable Object failures are diagnosed as workspace unavailable", () => {
  assert.equal(describeConnectionHealth(503).kind, "workspace-unavailable");
  assert.equal(describeConnectionHealth(502).kind, "workspace-unavailable");
});

test("unexpected non-success responses remain recoverable", () => {
  assert.equal(describeConnectionHealth(404).kind, "websocket-unavailable");
});

test("network failures use a safe generic message", () => {
  const result = describeConnectionNetworkFailure();
  assert.equal(result.kind, "network");
  assert.doesNotMatch(result.message, /cookie|token|secret/i);
});
