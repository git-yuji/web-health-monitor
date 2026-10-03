import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http, { type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { checkSite } from "./check-site.js";

test("診断レスポンスのヘッダーを判定結果に含め本文を読み込まない", async context => {
  let destroyed = false;
  context.mock.method(http, "request", (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    assert.equal(url.href, "http://8.8.8.8/");
    assert.equal(options.method, "GET");
    const request = new EventEmitter() as ClientRequest;
    request.end = (() => {
      queueMicrotask(() => callback({
        statusCode: 302, statusMessage: "Found",
        headers: { "x-content-type-options": "nosniff", "content-security-policy-report-only": "default-src 'self'" },
        destroy: () => { destroyed = true; },
      } as unknown as IncomingMessage));
      return request;
    }) as ClientRequest["end"];
    return request;
  });
  syncBuiltinESMExports();
  context.after(() => { context.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await checkSite(new URL("http://8.8.8.8/"));
  assert.equal(result.status, 302);
  assert.equal(result.securityHeaders?.find(item => item.id === "hsts")?.status, "not-applicable");
  assert.equal(result.securityHeaders?.find(item => item.id === "content-type-options")?.status, "configured");
  assert.equal(result.securityHeaders?.find(item => item.id === "csp")?.status, "review");
  assert.equal(destroyed, true);
});
