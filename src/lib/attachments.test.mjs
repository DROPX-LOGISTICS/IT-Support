import test from "node:test";
import assert from "node:assert/strict";
import { safeFileName, sniffMime, storagePath, validateFiles } from "./attachments.ts";

const f = (name, type, size) => ({ name, type, size });
test("allows up to five images or PDFs of at most 5 MB", () => {
  assert.equal(validateFiles([f("a.png", "image/png", 1000), f("b.pdf", "application/pdf", 5 * 1024 * 1024)]), null);
});
test("refuses a sixth file, big files, empty files and other types", () => {
  assert.ok(validateFiles(Array.from({ length: 6 }, () => f("a.png", "image/png", 10))));
  assert.ok(validateFiles([f("a.png", "image/png", 5 * 1024 * 1024 + 1)]));
  assert.ok(validateFiles([f("a.png", "image/png", 0)]));
  assert.ok(validateFiles([f("a.exe", "application/x-msdownload", 10)]));
  assert.ok(validateFiles([f("a.svg", "image/svg+xml", 10)]));
});
test("detects the real file type from its first bytes", () => {
  assert.equal(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), "application/pdf");
  assert.equal(sniffMime(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffMime(new TextEncoder().encode("MZ executable")), null);
});
test("file names cannot escape the ticket folder", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("my shot (1).png"), "my_shot_1_.png");
  assert.equal(storagePath("t1", "u1", "../x.png"), "t1/u1-x.png");
});
