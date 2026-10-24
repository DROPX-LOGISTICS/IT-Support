import test from "node:test";
import assert from "node:assert/strict";
import {
  GeminiRequestError, classifyGeminiFailure, geminiFailureFromHttp, geminiFailureMessage, geminiTextFromResponse, isGeminiFailureCode,
} from "./gemini-errors.ts";

test("Gemini HTTP failures become safe actionable categories", () => {
  assert.equal(geminiFailureFromHttp(401, "UNAUTHENTICATED", "API key not valid").code, "invalid_key");
  assert.equal(geminiFailureFromHttp(403, "PERMISSION_DENIED", "API key was reported as leaked").code, "blocked_key");
  assert.equal(geminiFailureFromHttp(400, "FAILED_PRECONDITION", "Free tier is unavailable; enable billing").code, "billing");
  assert.equal(geminiFailureFromHttp(404, "NOT_FOUND", "model not found").code, "model");
  assert.equal(geminiFailureFromHttp(429, "RESOURCE_EXHAUSTED", "quota").code, "quota");
  assert.equal(geminiFailureFromHttp(429, "RESOURCE_EXHAUSTED", "current billing tier quota").code, "quota");
  assert.equal(geminiFailureFromHttp(503, "UNAVAILABLE", "busy").code, "provider");
});

test("Gemini runtime failures preserve only safe diagnostics", () => {
  assert.deepEqual(classifyGeminiFailure(new GeminiRequestError("model", "raw provider detail", 404, "NOT_FOUND")), {
    code: "model", status: 404, providerCode: "NOT_FOUND",
  });
  assert.equal(classifyGeminiFailure(Object.assign(new Error("timed out"), { name: "TimeoutError" })).code, "timeout");
  assert.equal(isGeminiFailureCode("quota"), true);
  assert.equal(isGeminiFailureCode("secret-provider-message"), false);
  assert.match(geminiFailureMessage("invalid_key"), /Replace it/i);
});

test("Gemini response parsing ignores thought summaries and explains blocked or exhausted output", () => {
  assert.equal(geminiTextFromResponse({ candidates: [{ content: { parts: [
    { text: "internal summary", thought: true }, { text: "• Fixed uploads." },
  ] }, finishReason: "STOP" }] }), "• Fixed uploads.");
  assert.throws(() => geminiTextFromResponse({ promptFeedback: { blockReason: "SAFETY" } }), { code: "content_blocked" });
  assert.throws(() => geminiTextFromResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] }), { code: "output_limit" });
  assert.throws(() => geminiTextFromResponse({ candidates: [{ content: { parts: [{ text: "thought", thought: true }] } }] }), { code: "response_format" });
});
