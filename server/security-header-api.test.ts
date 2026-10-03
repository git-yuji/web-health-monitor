import assert from "node:assert/strict";
import test from "node:test";
import { requestSiteCheck, requestSiteCheckHistory } from "../src/site-check-api.js";
import { analyzeSecurityHeaders } from "./security-headers.js";

const result = { url: "https://example.com/", status: 200, statusText: "OK", responseTimeMs: 100,
  sslCertificate: null, checkedAt: "2026-10-03T00:00:00.000Z" };

test("診断APIのセキュリティヘッダー結果を検証して返す", async context => {
  const checked = { ...result, securityHeaders: analyzeSecurityHeaders({ "x-frame-options": "DENY" }, true) };
  context.mock.method(globalThis, "fetch", async () => Response.json(checked));
  assert.deepEqual(await requestSiteCheck(result.url), checked);
});

test("ヘッダー情報のない旧診断履歴も読み込める", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ results: [result] }));
  assert.deepEqual(await requestSiteCheckHistory(), [result]);
});

test("診断APIと履歴APIの不正なヘッダー情報を拒否する", async context => {
  let response: unknown = { ...result, securityHeaders: [] };
  context.mock.method(globalThis, "fetch", async () => Response.json(response));
  await assert.rejects(requestSiteCheck(result.url), /不正なレスポンス/);
  response = { results: [{ ...result, securityHeaders: null }] };
  await assert.rejects(requestSiteCheckHistory(), /不正なレスポンス/);
});
