import assert from "node:assert/strict";
import test from "node:test";
import { requestMonitorEvents } from "../src/site-check-api.js";

const event = { url: "https://example.com/", checkedAt: "2026-10-03T00:00:00.000Z", outcome: "error", message: "timeout" };

test("監視イベントAPIの応答を検証して返す", async context => {
  context.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    assert.equal(input, "/api/monitor-events");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ events: [event] });
  });
  assert.deepEqual(await requestMonitorEvents(), [event]);
});

test("監視イベント未保存時の空配列を許可する", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ events: [] }));
  assert.deepEqual(await requestMonitorEvents(), []);
});

test("APIエラーメッセージを表示用エラーとして返す", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ message: "監視イベントを読み込めませんでした。" }, { status: 500 }));
  await assert.rejects(requestMonitorEvents(), /監視イベントを読み込めませんでした/);
});

test("JSONではないレスポンスを拒否する", async context => {
  context.mock.method(globalThis, "fetch", async () => new Response("not JSON"));
  await assert.rejects(requestMonitorEvents(), /読み取れないレスポンス/);
});

test("不正な判定・日時・応答構造を拒否する", async context => {
  let body: unknown;
  context.mock.method(globalThis, "fetch", async () => Response.json(body));
  for (body of [null, {}, { events: {} }, { events: [{ ...event, outcome: "unknown" }] },
    { events: [{ ...event, checkedAt: "invalid" }] }, { events: [{ ...event, url: 123 }] }]) {
    await assert.rejects(requestMonitorEvents(), /不正なレスポンス/);
  }
});
