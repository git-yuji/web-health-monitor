import assert from "node:assert/strict";
import test from "node:test";
import { validateTargetUrl } from "../src/url-validation.js";

test("HTTPとHTTPSのURLを許可する", () => {
  assert.equal(validateTargetUrl("https://example.com").valid, true);
  assert.equal(validateTargetUrl("http://example.com/path").valid, true);
});

test("空欄とURLではない文字列を拒否する", () => {
  assert.equal(validateTargetUrl("").valid, false);
  assert.equal(validateTargetUrl("example.com").valid, false);
});

test("HTTPとHTTPS以外のURLを拒否する", () => {
  assert.equal(validateTargetUrl("ftp://example.com").valid, false);
});

test("HTTPリクエストに送信されないフラグメントを除外する", () => {
  const firstResult = validateTargetUrl("https://example.com/path#one");
  const secondResult = validateTargetUrl("https://example.com/path#two");

  assert.equal(firstResult.valid, true);
  assert.equal(secondResult.valid, true);

  if (!firstResult.valid || !secondResult.valid) {
    return;
  }

  assert.equal(firstResult.url.href, "https://example.com/path");
  assert.equal(secondResult.url.href, firstResult.url.href);
});
