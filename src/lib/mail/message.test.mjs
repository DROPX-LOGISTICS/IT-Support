import test from "node:test";
import assert from "node:assert/strict";
import { buildRawMessage, escapeHtml, formatFrom, renderEmail } from "./message.ts";

const decode = (raw) => Buffer.from(raw, "base64url").toString("utf8");
const part = (mime, type) => {
  const seg = mime.split(/--b_?\w*\r\n/).find((s) => s.includes(`Content-Type: ${type}`));
  const body = seg.split("\r\n\r\n")[1].split("\r\n--")[0];
  return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
};

test("escapes user text in HTML", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  const { html, text } = renderEmail({ heading: "BUG-001 <b>", paragraphs: ["Hi <script>alert(1)</script>"], link: { label: "Open", url: "https://s.example/t" } });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(text.includes("https://s.example/t"));
});
test("refuses non-http links", () => {
  const { html } = renderEmail({ heading: "x", paragraphs: [], link: { label: "Open", url: "javascript:alert(1)" } });
  assert.ok(!html.includes("javascript:"));
});
test("From uses the default display name when none is set", () => {
  assert.equal(formatFrom("tech@dropxlogistics.com").header, "DropX IT Support <tech@dropxlogistics.com>");
  assert.equal(formatFrom('"Custom Name" <tech@dropxlogistics.com>').header, "Custom Name <tech@dropxlogistics.com>");
  assert.equal(formatFrom("not-an-address"), null);
});
test("builds multipart text + HTML with base64url output", () => {
  const raw = buildRawMessage({ from: "tech@dropxlogistics.com", to: ["a@dropxlogistics.com"], subject: "BUG-001 raised", text: "plain body", html: "<p>html body</p>" }, "b_test");
  assert.ok(!/[+/=]/.test(raw));
  const mime = decode(raw);
  assert.ok(mime.includes("multipart/alternative"));
  assert.equal(part(mime, "text/plain"), "plain body");
  assert.equal(part(mime, "text/html"), "<p>html body</p>");
});
test("header injection through subject or recipient is neutralised", () => {
  const mime = decode(buildRawMessage({ from: "tech@dropxlogistics.com", to: ["a@x.com", "b@x.com\r\nBcc: evil@x.com"], subject: "Hi\r\nBcc: evil@x.com", text: "t", html: "h" }, "b_t"));
  assert.ok(!/^Bcc:/m.test(mime));
  assert.match(mime, /^To: a@x\.com\r$/m);
});
test("non-ASCII subjects are encoded and no recipient is an error", () => {
  const mime = decode(buildRawMessage({ from: "tech@dropxlogistics.com", to: ["a@x.com"], subject: "टिकट BUG-001", text: "t", html: "h" }, "b_t"));
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.throws(() => buildRawMessage({ from: "tech@dropxlogistics.com", to: ["bad"], subject: "s", text: "t", html: "h" }));
});
