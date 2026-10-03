import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorRunner, classifyMonitorResult, parseMonitorInterval } from "./monitor-runner.js";
import type { SiteCheckResult } from "./check-site.js";
import type { MonitorEvent } from "./monitor-event-store.js";

const target = { url: "https://example.com/", registeredAt: "2026-10-03T00:00:00.000Z" };
const result: SiteCheckResult = {
  url: target.url, status: 200, statusText: "OK", responseTimeMs: 100,
  sslCertificate: null, checkedAt: "2026-10-03T00:00:00.000Z",
};

function harness(interval = 1_000) {
  const events: MonitorEvent[] = [];
  const saved: SiteCheckResult[] = [];
  const errors: unknown[] = [];
  const notified: MonitorEvent[] = [];
  const dependencies = {
    loadTargets: async () => [target],
    check: async (_url: URL) => result,
    saveResult: async (value: SiteCheckResult) => { saved.push(value); },
    saveEvent: async (value: MonitorEvent) => { events.push(value); },
    onEvent: (value: MonitorEvent) => { notified.push(value); },
    onError: (error: unknown) => { errors.push(error); },
  };
  return { dependencies, events, saved, errors, notified,
    create: () => createMonitorRunner(interval, dependencies) };
}

test("監視間隔の既定値・無効化・範囲を検証する", () => {
  assert.equal(parseMonitorInterval(undefined), 300_000);
  assert.equal(parseMonitorInterval("0"), 0);
  assert.equal(parseMonitorInterval("1000"), 1_000);
  for (const value of ["", "-1", "999", "1.5", "Infinity", "2147483648", "abc"]) {
    assert.throws(() => parseMonitorInterval(value));
  }
});

test("HTTPエラー・証明書エラー・残り30日以内を異常と判定する", () => {
  assert.equal(classifyMonitorResult(result).outcome, "healthy");
  assert.equal(classifyMonitorResult({ ...result, status: 302 }).outcome, "healthy");
  assert.equal(classifyMonitorResult({ ...result, status: 500 }).outcome, "unhealthy");
  const certificate = {
    expiresAt: "2026-11-03T00:00:00.000Z", daysRemaining: 31,
    valid: true, validationError: null,
  };
  assert.equal(classifyMonitorResult({ ...result, sslCertificate: certificate }).outcome, "healthy");
  for (const daysRemaining of [30, 0, -1]) {
    assert.equal(classifyMonitorResult({ ...result,
      sslCertificate: { ...certificate, daysRemaining } }).outcome, "unhealthy");
  }
  const event = classifyMonitorResult({ ...result,
    sslCertificate: { ...certificate, valid: false, validationError: "CERT_HAS_EXPIRED" } });
  assert.equal(event.outcome, "unhealthy");
  assert.match(event.message, /CERT_HAS_EXPIRED/);
});

test("登録対象を毎巡回読み込み成功結果と監視イベントを保存する", async () => {
  const h = harness();
  let calls = 0;
  h.dependencies.loadTargets = async () => ++calls === 1 ? [] : [target];
  const runner = h.create();
  await runner.run();
  await runner.run();
  assert.equal(calls, 2);
  assert.deepEqual(h.saved, [result]);
  assert.equal(h.events[0]?.outcome, "healthy");
  assert.deepEqual(h.notified, h.events);
  await runner.stop();
});

test("通信失敗を記録し次の対象の診断を続ける", async () => {
  const h = harness();
  h.dependencies.loadTargets = async () => [target, { ...target, url: "https://example.org/" }];
  h.dependencies.check = async (url) => {
    if (url.href === target.url) throw new Error("timeout");
    return { ...result, url: url.href };
  };
  await h.create().run();
  assert.deepEqual(h.events.map((event) => event.outcome), ["error", "healthy"]);
  assert.equal(h.events[0]?.message, "timeout");
  assert.equal(h.saved.length, 1);
  assert.equal(h.errors.length, 0);
});

test("保存された不正URLと認証情報付きURLにアクセスしない", async () => {
  const h = harness();
  h.dependencies.loadTargets = async () => ["ftp://example.com", "https://user:pass@example.com/"].map(url => ({ ...target, url }));
  h.dependencies.check = async () => { throw new Error("呼び出されてはいけない"); };
  await h.create().run();
  assert.equal(h.events.length, 2);
  assert.ok(h.events.every(event => event.outcome === "error" && event.message !== "呼び出されてはいけない"));
});

test("同時の巡回要求をまとめて対象を重複診断しない", async () => {
  const h = harness();
  let release!: (value: SiteCheckResult) => void;
  const check = new Promise<SiteCheckResult>(resolve => { release = resolve; });
  let calls = 0;
  h.dependencies.check = async () => { calls++; return check; };
  const runner = h.create();
  const first = runner.run();
  const second = runner.run();
  assert.equal(first, second);
  release(result);
  await first;
  assert.equal(calls, 1);
});

test("保存失敗を通信障害として記録せず次の対象を処理する", async () => {
  const h = harness();
  h.dependencies.loadTargets = async () => [target, target];
  let saves = 0;
  h.dependencies.saveResult = async () => { if (++saves === 1) throw new Error("disk full"); };
  await h.create().run();
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.events.map(event => event.outcome), ["healthy"]);
  assert.equal(saves, 2);
});

test("対象一覧の読み込み失敗後も次の巡回で復旧する", async () => {
  const h = harness();
  let calls = 0;
  h.dependencies.loadTargets = async () => {
    if (++calls === 1) throw new Error("invalid storage");
    return [target];
  };
  const runner = h.create();
  await runner.run();
  await runner.run();
  assert.equal(h.errors.length, 1);
  assert.equal(h.saved.length, 1);
});

test("起動時と巡回完了後に実行し停止後は再実行しない", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  const runner = h.create();
  runner.start();
  runner.start();
  await runner.run();
  assert.equal(h.saved.length, 1);
  context.mock.timers.tick(999);
  assert.equal(h.saved.length, 1);
  context.mock.timers.tick(1);
  await runner.run();
  assert.equal(h.saved.length, 2);
  await runner.stop();
  context.mock.timers.tick(10_000);
  runner.start();
  await runner.run();
  assert.equal(h.saved.length, 2);
});

test("無効化時は起動しても診断しない", async () => {
  const h = harness(0);
  const runner = h.create();
  runner.start();
  await runner.stop();
  assert.equal(h.saved.length, 0);
});

test("停止時は実行中の保存を待ち残りの対象にアクセスしない", async () => {
  const h = harness();
  h.dependencies.loadTargets = async () => [target, target];
  let release!: (value: SiteCheckResult) => void;
  h.dependencies.check = () => new Promise(resolve => { release = resolve; });
  const runner = h.create();
  const running = runner.run();
  await Promise.resolve();
  const stopping = runner.stop();
  release(result);
  await Promise.all([running, stopping]);
  assert.equal(h.saved.length, 1);
});
