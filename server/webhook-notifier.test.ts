import assert from "node:assert/strict";
import test from "node:test";
import type { MonitorEvent } from "./monitor-event-store.js";
import {
  createWebhookNotifier,
  parseMonitorWebhookUrl,
} from "./webhook-notifier.js";

const unhealthyEvent: MonitorEvent = {
  url: "https://example.com/",
  checkedAt: "2026-10-14T00:00:00.000Z",
  outcome: "unhealthy",
  message: "HTTP 500 Internal Server Error",
};

test("Webhook URLの未設定を許可しHTTPS URLだけを受け付ける", () => {
  assert.equal(parseMonitorWebhookUrl(undefined), undefined);
  assert.equal(parseMonitorWebhookUrl("  "), undefined);
  assert.equal(
    parseMonitorWebhookUrl("https://hooks.example.com/monitor?token=secret")?.href,
    "https://hooks.example.com/monitor?token=secret",
  );

  for (const value of [
    "not-a-url",
    "http://hooks.example.com/monitor",
    "https://user:pass@hooks.example.com/monitor",
    "https://hooks.example.com/monitor#fragment",
  ]) {
    assert.throws(() => parseMonitorWebhookUrl(value));
  }
});

test("異常イベントをJSONでWebhookへ送信する", async () => {
  let calledUrl: string | undefined;
  let calledInit: RequestInit | undefined;
  const request = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calledUrl = input.toString();
    calledInit = init;
    return { ok: true, status: 204 } as Response;
  }) as typeof fetch;
  const notify = createWebhookNotifier(
    new URL("https://hooks.example.com/monitor"),
    request,
  );

  await notify(unhealthyEvent);

  assert.equal(calledUrl, "https://hooks.example.com/monitor");
  assert.equal(calledInit?.method, "POST");
  assert.equal(calledInit?.redirect, "error");
  assert.deepEqual(JSON.parse(String(calledInit?.body)), {
    event: "monitor.alert",
    source: "web-health-monitor",
    ...unhealthyEvent,
  });
  assert.ok(calledInit?.signal instanceof AbortSignal);
});

test("正常イベントとWebhook未設定時は送信しない", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    return { ok: true, status: 204 } as Response;
  }) as typeof fetch;

  await createWebhookNotifier(undefined, request)(unhealthyEvent);
  await createWebhookNotifier(
    new URL("https://hooks.example.com/monitor"),
    request,
  )({ ...unhealthyEvent, outcome: "healthy" });

  assert.equal(calls, 0);
});

test("Webhookが成功以外を返した場合はエラーにする", async () => {
  const request = (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch;
  const notify = createWebhookNotifier(
    new URL("https://hooks.example.com/monitor"),
    request,
  );

  await assert.rejects(notify(unhealthyEvent), /HTTP 503/);
});

test("通信エラーにWebhook URLを含めない", async () => {
  const request = (async () => {
    throw new Error("https://hooks.example.com/monitor?token=secretへの接続に失敗");
  }) as typeof fetch;
  const notify = createWebhookNotifier(
    new URL("https://hooks.example.com/monitor?token=secret"),
    request,
  );

  await assert.rejects(notify(unhealthyEvent), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Webhookへの通知に失敗しました。");
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});
