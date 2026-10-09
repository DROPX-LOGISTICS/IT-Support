import test from "node:test";
import assert from "node:assert/strict";
import { anyGithubToken, ownerTokenName, tokenForRepo } from "./github-token.ts";

test("owner token names", () => {
  assert.equal(ownerTokenName("nisar-dropx/dropx-hrms"), "GITHUB_TOKEN_NISAR_DROPX");
  assert.equal(ownerTokenName("DROPX-LOGISTICS/ops-worker"), "GITHUB_TOKEN_DROPX_LOGISTICS");
});
test("a repo uses its owner's token, then the shared one, else none", () => {
  const env = { GITHUB_TOKEN: "shared", GITHUB_TOKEN_NISAR_DROPX: "nisar" };
  assert.equal(tokenForRepo("nisar-dropx/dropx-hrms", env), "nisar");
  assert.equal(tokenForRepo("DROPX-LOGISTICS/ops-worker", env), "shared");
  assert.equal(tokenForRepo("DROPX-LOGISTICS/ops-worker", { GITHUB_TOKEN_NISAR_DROPX: "nisar" }), null);
  assert.equal(tokenForRepo("a/b", { GITHUB_TOKEN: "  " }), null);
});
test("configured when any token is set", () => {
  assert.equal(anyGithubToken({}), false);
  assert.equal(anyGithubToken({ GITHUB_TOKEN_DROPX_LOGISTICS: "x" }), true);
  assert.equal(anyGithubToken({ GITHUB_TOKENX: "x" }), false);
});
